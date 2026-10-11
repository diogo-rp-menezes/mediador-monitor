import Database from 'better-sqlite3';
import type {Pool} from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {criarPoolPostgres,criarPoolPostgresRuntime} from './postgres.js';
import {migratePostgres} from './postgres-migrations.js';
import {importarNucleoIsoladoPostgres} from './postgres-import-core.js';
import {identificarDestinoImportacao} from './postgres-import-checkpoint.js';
import {withPostgresGlobalTransaction,withPostgresOfficeTransaction} from './postgres-transaction.js';

/** Real occupied PostgreSQL fixture. Never opens the application's destination for writes. */
export async function validarConciliacaoDestinoOcupado(admin:Pool,source:string,key:Buffer,invalidSource:string){
  const database='mediador_import_test_'+randomUUID().replaceAll('-','');
  let target:Pool|undefined,runtime:Pool|undefined,created=false;
  const db=new Database(source,{readonly:true,fileMustExist:true});
  let sourceUser:{email:string},sourceDocument:{numero_registro:string};
  try{
    sourceUser=db.prepare('SELECT email FROM usuarios ORDER BY id LIMIT 1').get() as typeof sourceUser;
    sourceDocument=db.prepare('SELECT numero_registro FROM registros ORDER BY numero_registro LIMIT 1').get() as typeof sourceDocument;
    if(!sourceUser||!sourceDocument)throw new Error('Validação ocupada exige usuário e documento na origem.');
  }finally{db.close();}
  try{
    await admin.query(`CREATE DATABASE "${database}"`);created=true;
    target=criarPoolPostgres({...process.env,PGDATABASE:database});await migratePostgres(target);
    const email='fixture-'+randomUUID()+'@example.test',document='fixture-'+randomUUID();
    await target.query("INSERT INTO usuarios(id,nome,email) VALUES(1,'Usuário preexistente',$1)",[email]);
    await target.query("INSERT INTO clientes(id,escritorio_id,razao_social,cnpj) VALUES(1,1,'Cliente preexistente',$1)",['fixture-'+randomUUID()]);
    await target.query("INSERT INTO contatos(id,escritorio_id,nome,email) VALUES(1,1,'Contato preexistente',$1)",[email]);
    await target.query("INSERT INTO sindicatos(id,nome) VALUES(1,'Sindicato preexistente')");
    await target.query("INSERT INTO monitoramentos_escritorios(id,escritorio_id,sindicato_id,nome,tipos_json) VALUES(1,1,1,'Monitoramento preexistente','[]')");
    await target.query("INSERT INTO registros(numero_registro,watch) VALUES($1,'fixture')",[document]);
    await target.query("INSERT INTO envios_clientes(id,escritorio_id,cliente_id,contato_id,numero_registro,versao,status) VALUES(1,1,1,1,$1,'fixture','cancelado')",[document]);
    await target.query("INSERT INTO tentativas_envio(id,envio_id,escritorio_id,resultado) VALUES(1,1,1,'fixture')");
    await target.query("INSERT INTO auditoria_seguranca(id,ator_id,escritorio_id,cliente_id,acao,criado_em,ip,user_agent,request_id) VALUES(1,1,1,1,'fixture',1,'127.0.0.1','fixture','fixture')");
    await target.query("INSERT INTO auditoria_clientes(id,escritorio_id,entidade,entidade_id,acao,detalhes_json) VALUES(1,1,'cliente','1','fixture','{}')");
    await target.query("INSERT INTO limites_autenticacao(chave,janela_em,contador) VALUES('fixture',1,1)");
    await target.query("INSERT INTO ajustes_plataforma(chave,valor_json) VALUES('fixture','{\"preservar\":true}')");
    await target.query("SELECT setval('usuarios_id_seq',9000,false)");
    const digest=()=>withPostgresGlobalTransaction(target!,identificarDestinoImportacao);
    const before=await digest();
    // Default import still refuses an occupied database.
    await assert.rejects(importarNucleoIsoladoPostgres(target,source,{credentialsKey:key}),/não vazio|não iniciais/);
    await target.query('UPDATE usuarios SET email=$1 WHERE id=1',[sourceUser.email]);
    await assert.rejects(importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,conciliarDestino:true}),/revisão de identidades/);
    await target.query('UPDATE usuarios SET email=$1 WHERE id=1',[email]);
    await target.query("INSERT INTO registros(numero_registro,watch,arquivo_hash) VALUES($1,'fixture',$2)",[sourceDocument.numero_registro,'f'.repeat(64)]);
    await assert.rejects(importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,conciliarDestino:true}),/revisão de chaves/);
    await target.query('DELETE FROM registros WHERE numero_registro=$1',[sourceDocument.numero_registro]);
    assert.equal(await digest(),before);
    // Invalid configuration fails only after the core rows have been inserted.
    await assert.rejects(importarNucleoIsoladoPostgres(target,invalidSource,{credentialsKey:key,conciliarDestino:true}),/Configuração legada sem conversão/);
    assert.equal(await digest(),before);
    const result=await importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,conciliarDestino:true});
    assert.equal(result.destino_preexistente_preservado,true);
    assert.deepEqual((await target.query('SELECT last_value::text valor,is_called FROM usuarios_id_seq')).rows[0],{valor:'9000',is_called:false});
    assert.equal((await target.query('SELECT count(*)::integer total FROM auditoria_seguranca WHERE id=1 AND acao=\'fixture\'')).rows[0].total,1);
    assert.equal((await target.query("SELECT count(*)::integer total FROM auditoria_clientes WHERE id=1 AND acao='fixture'")).rows[0].total,1);
    const existing=(await target.query("SELECT valor_json FROM ajustes_plataforma WHERE chave='fixture'")).rows[0].valor_json;
    assert.deepEqual(existing,{preservar:true});
    const concurrent=await Promise.all([1,2].map(()=>importarNucleoIsoladoPostgres(target!,source,{credentialsKey:key,conciliarDestino:true})));
    assert.ok(concurrent.every(report=>report.checkpoint.retomado));
    await assert.rejects(importarNucleoIsoladoPostgres(target,source,{credentialsKey:key}),/Modo diverge/);
    const role=process.env.PGAPPUSER;if(!role||!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role))throw new Error('Papel runtime inválido.');
    await target.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);await target.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
    runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database,PGPOOL_MAX:'1'});
    assert.equal((await runtime.query("SELECT has_schema_privilege(current_user,'importacao_privada','USAGE') permitido")).rows[0].permitido,false);
    for(const table of ['clientes','contatos','envios_clientes','tentativas_envio','auditoria_seguranca','auditoria_clientes']){
      assert.equal((await runtime.query(`SELECT count(*)::integer total FROM ${table}`)).rows[0].total,0);
      for(const office of (await target.query('SELECT id FROM escritorios ORDER BY id')).rows){
        const expected:number=(await target.query(`SELECT count(*)::integer total FROM ${table} WHERE escritorio_id=$1`,[office.id])).rows[0].total;
        assert.equal(await withPostgresOfficeTransaction(runtime,office.id,async client=>(await client.query(`SELECT count(*)::integer total FROM ${table}`)).rows[0].total),expected);
      }
    }
    return {registros_preexistentes_preservados:true,auditoria_preservada:true,colisoes_remapeadas:true,revisoes_bloqueadas:true,
      rollback_validado:true,retomadas_concorrentes_sem_duplicacao:true,rls_validado:true,modo_vinculado_ao_checkpoint:true,sequencias_sem_retrocesso:true,
      tabelas:result.tabelas.length,linhas_importadas:result.tabelas.reduce((sum,table)=>sum+table.linhas,0)};
  }finally{
    await runtime?.end();await target?.end();
    if(created){
      for(let i=0;i<40;i++){
        if(!Number((await admin.query('SELECT count(*) total FROM pg_stat_activity WHERE datname=$1',[database])).rows[0].total))break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      await admin.query(`DROP DATABASE "${database}"`);
    }
  }
}

