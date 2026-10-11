import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,openSync,closeSync,rmSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {criarPoolPostgres,criarPoolPostgresRuntime} from './postgres.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {migratePostgres} from './postgres-migrations.js';
import {importarNucleoIsoladoPostgres} from './postgres-import-core.js';
import {validarHttpImportacaoIsolada} from './postgres-import-http-check.js';
import Database from 'better-sqlite3';
import {criarPlanosIdsIsolados,type PlanoIdentidade} from './postgres-import-references.js';
import assert from 'node:assert/strict';
import {validarCadeiasHistoricasImportacao} from './postgres-import-history-check.js';
import {validarConciliacaoDestinoOcupado} from './postgres-import-occupied-check.js';
import {validarAnalisesImportadas} from './postgres-import-analysis-check.js';
import {validarNavegadorImportacaoIsolada} from './postgres-import-browser-check.js';

const args=process.argv.slice(2),source=args[args.indexOf('--source')+1],output=args[args.indexOf('--report')+1];
if(!args.includes('--source')||!args.includes('--report')||!source||!output)throw new Error('Uso: postgres:validar-importacao -- --source <sqlite.db> --report <relatorio.json>');
const database='mediador_import_test_'+randomUUID().replaceAll('-',''),admin=criarPoolPostgres();
let target:ReturnType<typeof criarPoolPostgres>|undefined,created=false,checkpointSource:string|undefined;
try{
  await admin.query(`CREATE DATABASE "${database}"`);created=true;
  target=criarPoolPostgres({...process.env,PGDATABASE:database});
  await migratePostgres(target);
  const key=process.env.CREDENTIALS_MASTER_KEY?Buffer.from(process.env.CREDENTIALS_MASTER_KEY,'base64'):randomBytes(32);
  let identityPlans:PlanoIdentidade[]|undefined;
  if(args.includes('--exercise-remap')){
    const db=new Database(resolve(source),{readonly:true,fileMustExist:true});
    try{
      db.exec('BEGIN');
      identityPlans=criarPlanosIdsIsolados(db,true);
    }finally{db.close();}
  }
  // Fail late using a disposable SQLite copy; the original is never changed.
  const candidate=join(dirname(resolve(source)),'.checkpoint-validation-'+randomUUID()+'.db');
  closeSync(openSync(candidate,'wx'));checkpointSource=candidate;
  const original=new Database(resolve(source),{readonly:true,fileMustExist:true});
  try{await original.backup(checkpointSource);}finally{original.close();}
  const faulty=new Database(checkpointSource);
  try{faulty.prepare('INSERT INTO ajustes(chave,valor) VALUES(?,?)').run('checkpoint_invalido','{}');}finally{faulty.close();}
  await assert.rejects(importarNucleoIsoladoPostgres(target,checkpointSource,{credentialsKey:key,identityPlans}),/Configuração legada sem conversão/);
  assert.deepEqual((await target.query('SELECT id,nome FROM escritorios')).rows,[{id:1,nome:'Escritório inicial'}]);
  assert.equal((await target.query('SELECT count(*)::integer total FROM usuarios')).rows[0].total,0);
  assert.equal((await target.query("SELECT to_regnamespace('importacao_privada') existe")).rows[0].existe,null);
  const occupiedCheck=args.includes('--exercise-occupied')?await validarConciliacaoDestinoOcupado(admin,source,key,checkpointSource):null;
  const report=await importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,identityPlans});
  // Repeating a committed stage must reuse the receipt, not insert histories again.
  const resumed=await importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,identityPlans});
  assert.equal(resumed.checkpoint.retomado,true);
  assert.deepEqual(resumed.tabelas,report.tabelas);
  assert.deepEqual(resumed.arquivadas,report.arquivadas);
  const changed=new Database(checkpointSource);
  try{
    changed.prepare('DELETE FROM ajustes WHERE chave=?').run('checkpoint_invalido');
    changed.exec("UPDATE usuarios SET nome=nome||' alterado' WHERE id=(SELECT min(id) FROM usuarios)");
  }finally{changed.close();}
  await assert.rejects(importarNucleoIsoladoPostgres(target,checkpointSource,{credentialsKey:key,identityPlans}),/Origem alterada/);
  await assert.rejects(importarNucleoIsoladoPostgres(target,source,{credentialsKey:randomBytes(32),identityPlans}),/divergem do checkpoint/);
  const officeBefore=(await target.query('SELECT id,nome FROM escritorios ORDER BY id LIMIT 1')).rows[0];
  try{
    await target.query('UPDATE escritorios SET nome=$1 WHERE id=$2',[officeBefore.nome+' — alteração de validação',officeBefore.id]);
    await assert.rejects(importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,identityPlans}),/Destino alterado/);
  }finally{await target.query('UPDATE escritorios SET nome=$1 WHERE id=$2',[officeBefore.nome,officeBefore.id]);}
  assert.equal((await importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,identityPlans})).checkpoint.retomado,true);
  const archiveBefore=(await target.query('SELECT tabela,ordinal,hash FROM importacao_privada.linhas ORDER BY tabela,ordinal LIMIT 1')).rows[0];
  if(archiveBefore){
    try{
      await target.query("UPDATE importacao_privada.linhas SET hash='alterado' WHERE tabela=$1 AND ordinal=$2",[archiveBefore.tabela,archiveBefore.ordinal]);
      await assert.rejects(importarNucleoIsoladoPostgres(target,source,{credentialsKey:key,identityPlans}),/Destino alterado/);
    }finally{await target.query('UPDATE importacao_privada.linhas SET hash=$1 WHERE tabela=$2 AND ordinal=$3',[archiveBefore.hash,archiveBefore.tabela,archiveBefore.ordinal]);}
  }
  const concurrent=await Promise.all([1,2].map(()=>importarNucleoIsoladoPostgres(target!,source,{credentialsKey:key,identityPlans})));
  assert.ok(concurrent.every(result=>result.checkpoint.retomado));
  assert.equal((await target.query('SELECT count(*)::integer total FROM importacao_privada.lotes')).rows[0].total,1);
  const historyCheck=identityPlans?await validarCadeiasHistoricasImportacao(admin,source,key):null;
  if(!process.env.PGAPPUSER)throw new Error('Defina o papel runtime para validar o isolamento do arquivo.');
  const access=(await target.query("SELECT has_schema_privilege($1,'importacao_privada','USAGE') acesso",[process.env.PGAPPUSER])).rows[0].acesso;
  if(access)throw new Error('O papel runtime não pode acessar o arquivo privado da importação.');
  for(const table of ['sessoes_usuarios','recuperacoes_acesso','concessoes_suporte']){
    if(Number((await target.query(`SELECT count(*) total FROM ${table}`)).rows[0].total)!==0)throw new Error('Dados operacionais foram reativados indevidamente.');
  }
  if(Number((await target.query("SELECT count(*) total FROM envios_clientes WHERE status IN ('preparando','revisao','na_fila','enviando')")).rows[0].total))throw new Error('Fila importada contém envios ativos.');
  if(Number((await target.query("SELECT count(*) total FROM notificacoes_publicacoes WHERE estado IN ('pendente','enviando')")).rows[0].total))throw new Error('Fila importada contém notificações ativas.');
  const role=process.env.PGAPPUSER;
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role))throw new Error('Papel runtime inválido.');
  await target.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await target.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
  await target.query(`GRANT INSERT,UPDATE ON sessoes_usuarios,limites_autenticacao TO "${role}"`);
  await target.query(`GRANT DELETE ON limites_autenticacao TO "${role}"`);
  await target.query(`GRANT UPDATE ON usuarios,credenciais_usuarios TO "${role}"`);
  await target.query(`GRANT INSERT ON auditoria_seguranca TO "${role}"`);
  await target.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
  const runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database,PGPOOL_MAX:'1'});
  let http,analyses;
  try{
    const attributes=(await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    if(attributes.rolsuper||attributes.rolbypassrls)throw new Error('Papel runtime não aplica RLS.');
    for(const table of ['clientes','contatos','clientes_documentos','auditoria_clientes','envios_clientes','tentativas_envio']){
      if(Number((await runtime.query(`SELECT count(*) total FROM ${table}`)).rows[0].total)!==0)throw new Error('Dado privado visível sem contexto.');
      for(const office of (await target.query('SELECT id FROM escritorios ORDER BY id')).rows){
        const expected=(await target.query(`SELECT count(*) total FROM ${table} WHERE escritorio_id=$1`,[office.id])).rows[0].total;
        const actual=await withPostgresOfficeTransaction(runtime,office.id,async client=>(await client.query(`SELECT count(*) total FROM ${table}`)).rows[0].total);
        if(actual!==expected)throw new Error('Isolamento dos dados importados divergiu.');
      }
      if(Number((await runtime.query(`SELECT count(*) total FROM ${table}`)).rows[0].total)!==0)throw new Error('Contexto herdado após reutilizar conexão.');
    }
    analyses=await validarAnalisesImportadas(source,target,runtime);
    http=await validarHttpImportacaoIsolada(target,runtime);
  }finally{await runtime.end();}
  const browserCheck=args.includes('--browser')?await validarNavegadorImportacaoIsolada(target):null;
  const path=resolve(output);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({...report,navegador_validado:browserCheck,analises_validadas:analyses,isolamento_runtime_validado:true,http_validado:http,remapeamento_identidades_exercitado:!!identityPlans,historicos_sinteticos_validados:historyCheck,destino_ocupado_validado:occupiedCheck,
    checkpoint_validado:{repeticao_sem_duplicacao:true,chave_divergente_bloqueada:true,destino_alterado_bloqueado:true,
      origem_alterada_bloqueada:true,arquivo_privado_alterado_bloqueado:!!archiveBefore,rollback_integral_validado:true,retomadas_concorrentes_validadas:true}},null,2)+'\n',{flag:'wx'});
  console.log(`Núcleo validado: ${report.tabelas.length} tabelas, ${report.tabelas.reduce((sum,table)=>sum+table.linhas,0)} linhas. Relatório: ${path}`);
  console.log(`Arquivo privado conferido: ${report.arquivadas.length} tabelas, ${report.arquivadas.reduce((sum,table)=>sum+table.linhas,0)} linhas, sem reativar dados operacionais.`);
  console.log('Importação integral ainda pendente; banco temporário será removido.');
}catch(error){console.error('Falha na validação isolada:',(error as {code?:string}).code??'conversao_ou_equivalencia');
  const location=(error as Error).stack?.split('\n').find(line=>/postgres-import-(?:core|browser-check|validation-cli|(?:http|history|occupied|analysis)-check)\.ts:/.test(line));
  if(location)console.error(location.trim());
  process.exitCode=1;}
finally{
  await target?.end();
  try{
    if(created){
      for(let i=0;i<40;i++){
        if(!Number((await admin.query('SELECT count(*) total FROM pg_stat_activity WHERE datname=$1',[database])).rows[0].total))break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      await admin.query(`DROP DATABASE "${database}"`);
    }
  }finally{try{await admin.end();}finally{if(checkpointSource)rmSync(checkpointSource,{force:true});}}
}

