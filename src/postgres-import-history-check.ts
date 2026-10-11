import Database from 'better-sqlite3';
import type {Pool} from 'pg';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {openSync,closeSync,rmSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {consolidarInterpretacaoPostgres,revisarInterpretacaoPostgres,vistaInterpretacaoPostgres} from './postgres-consolidacao.js';
import {validarRevisaoImportadaUi} from './postgres-import-review-ui-check.js';
import {dirname,join,resolve} from 'node:path';
import {criarPoolPostgres,criarPoolPostgresRuntime} from './postgres.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {CAMPOS_CCT,NAO_CONSTA_CCT,validarExtracaoCct} from './cct-template.js';
import {aplicarAlteracoes,renderizarConsolidadoMarkdown} from './consolidacao-core.js';
import {migratePostgres} from './postgres-migrations.js';
import {importarNucleoIsoladoPostgres} from './postgres-import-core.js';
import {criarPlanosIdsIsolados,remapearReferenciasIdentidade} from './postgres-import-references.js';

/** Populates empty historical chains only in a disposable SQLite copy and PostgreSQL database. */
export async function validarCadeiasHistoricasImportacao(admin:Pool,source:string,key:Buffer){
  const database='mediador_import_test_'+randomUUID().replaceAll('-','');
  const copy=join(dirname(resolve(source)),'.history-validation-'+randomUUID()+'.db');
  let copyCreated=false,created=false,target:Pool|undefined;
  try{
    closeSync(openSync(copy,'wx'));copyCreated=true;
    const original=new Database(resolve(source),{readonly:true,fileMustExist:true});
    try{await original.backup(copy);}finally{original.close();}
    const db=new Database(copy);let plans,fixture;
    try{
      db.pragma('foreign_keys=ON');
      const customer=db.prepare('SELECT id,escritorio_id FROM clientes ORDER BY id LIMIT 1').get() as {id:number;escritorio_id:number}|undefined;
      const user=db.prepare('SELECT id FROM usuarios ORDER BY id LIMIT 1').get() as {id:number}|undefined;
      const document=db.prepare('SELECT numero_registro FROM registros ORDER BY numero_registro LIMIT 1').get() as {numero_registro:string}|undefined;
      if(!customer||!user||!document)throw new Error('Validação histórica exige cliente, usuário e documento na cópia.');
      const version='validacao-'+randomUUID(),pdf=Buffer.from('%PDF-1.4\nDocumento sintético de validação.');
      const publication=Number(db.prepare(`INSERT INTO publicacoes_documentos(escritorio_id,cliente_id,base,versao,hash_pdf,relatorio_json,pdf,ator_id)
        VALUES(?,?,?,?,?,'{}',?,?)`).run(customer.escritorio_id,customer.id,document.numero_registro,version,createHash('sha256').update(pdf).digest('hex'),pdf,user.id).lastInsertRowid);
      const notice=Number(db.prepare(`INSERT INTO notificacoes_publicacoes(publicacao_id,escritorio_id,cliente_id,usuario_id,destino)
        VALUES(?,?,?,?,?)`).run(publication,customer.escritorio_id,customer.id,user.id,'fixture@example.test').lastInsertRowid);
      const access=Number(db.prepare(`INSERT INTO auditoria_acessos_publicacoes(escritorio_id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,ip)
        VALUES(?,?,?,?,?,'download_servido','sucesso','127.0.0.1')`).run(customer.escritorio_id,customer.id,publication,version,user.id).lastInsertRowid);
      const field=CAMPOS_CCT.find(c=>/piso geral/i.test(c.rotulo))?.id??CAMPOS_CCT[0].id;
      const pattern=validarExtracaoCct({campos:Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,NAO_CONSTA_CCT]))});
      pattern.campos[field]='R$ 1.500,00';
      const previous=aplicarAlteracoes(pattern,document.numero_registro,[]);
      const result=aplicarAlteracoes(pattern,document.numero_registro,[{numero:'DF999979/2026',data:'2026-01-01',alteracoes:[{campo:field,acao:'substituir',valor:'R$ 1.700,00',clausula:'Cláusula 1',citacao:'O piso geral passa a R$ 1.700,00.'}]}]);
      const revisions=[{campo:field,aditivo:'DF999979/2026',acao:'manter',valor:'',justificativa:'Revisão sintética preservada na migração',revisor:'Revisor sintético'}];
      const inputHash=createHash('sha256').update('entrada-sintetica').digest('hex');
      const oldVersion=version+'-anterior';
      const oldInterpretation=Number(db.prepare(`INSERT INTO versoes_interpretacao(escritorio_id,base,versao,resultado_json,ator_id) VALUES(?,?,?,?,?)`)
        .run(customer.escritorio_id,document.numero_registro,oldVersion,JSON.stringify(previous),user.id).lastInsertRowid);
      const interpretation=Number(db.prepare(`INSERT INTO versoes_interpretacao(escritorio_id,base,versao,resultado_json,ator_id)
        VALUES(?,?,?,?,?)`).run(customer.escritorio_id,document.numero_registro,version,JSON.stringify(result),user.id).lastInsertRowid);
      db.prepare(`INSERT INTO interpretacoes_escritorio(escritorio_id,base,entrada_hash,resultado_json,revisoes_json,versao) VALUES(?,?,?,?,?,?)
        ON CONFLICT(escritorio_id,base) DO UPDATE SET entrada_hash=excluded.entrada_hash,resultado_json=excluded.resultado_json,revisoes_json=excluded.revisoes_json,versao=excluded.versao`)
        .run(customer.escritorio_id,document.numero_registro,inputHash,JSON.stringify(result),JSON.stringify(revisions),version);
      const execution=Number(db.prepare(`INSERT INTO execucoes_escritorio(escritorio_id,solicitada_por,status) VALUES(?,?,'concluida')`).run(customer.escritorio_id,user.id).lastInsertRowid);
      plans=criarPlanosIdsIsolados(db,true);
      fixture={publication,notice,access,interpretation,oldInterpretation,previous,result,revisions,inputHash,document,execution,customer,user,pdf,version,oldVersion};
    }finally{db.close();}
    await admin.query(`CREATE DATABASE "${database}"`);created=true;
    target=criarPoolPostgres({...process.env,PGDATABASE:database});await migratePostgres(target);
    await target.query('CREATE UNIQUE INDEX validacao_indice_desconhecido ON clientes(razao_social)');
    await assert.rejects(importarNucleoIsoladoPostgres(target,copy,{credentialsKey:key,identityPlans:plans}),/restrições únicas sem plano/);
    assert.equal((await target.query('SELECT count(*)::integer total FROM usuarios')).rows[0].total,0);
    await target.query('DROP INDEX validacao_indice_desconhecido');
    await importarNucleoIsoladoPostgres(target,copy,{credentialsKey:key,identityPlans:plans});
    const mapped=(table:string,id:number)=>remapearReferenciasIdentidade({id},[{coluna:'id',tabela:table}],plans).id;
    const publication=mapped('publicacoes_documentos',fixture.publication),office=mapped('escritorios',fixture.customer.escritorio_id),
      customer=mapped('clientes',fixture.customer.id),user=mapped('usuarios',fixture.user.id);
    const row=(await target.query('SELECT escritorio_id,cliente_id,ator_id,pdf,versao FROM publicacoes_documentos WHERE id=$1',[publication])).rows[0];
    assert.deepEqual(row,{escritorio_id:office,cliente_id:customer,ator_id:user,pdf:fixture.pdf,versao:fixture.version});
    const notice=(await target.query('SELECT publicacao_id::text,escritorio_id,cliente_id,usuario_id,estado FROM notificacoes_publicacoes WHERE id=$1',[mapped('notificacoes_publicacoes',fixture.notice)])).rows[0];
    assert.deepEqual(notice,{publicacao_id:String(publication),escritorio_id:office,cliente_id:customer,usuario_id:user,estado:'cancelado'});
    const access=(await target.query('SELECT publicacao_id::text,escritorio_id,cliente_id,ator_id,ip FROM auditoria_acessos_publicacoes WHERE id=$1',[mapped('auditoria_acessos_publicacoes',fixture.access)])).rows[0];
    assert.deepEqual(access,{publicacao_id:String(publication),escritorio_id:office,cliente_id:customer,ator_id:user,ip:'127.0.0.1'});
    assert.deepEqual((await target.query('SELECT escritorio_id,ator_id FROM versoes_interpretacao WHERE id=$1',[mapped('versoes_interpretacao',fixture.interpretation)])).rows[0],{escritorio_id:office,ator_id:user});
    assert.deepEqual((await target.query('SELECT escritorio_id,solicitada_por FROM execucoes_escritorio WHERE id=$1',[mapped('execucoes_escritorio',fixture.execution)])).rows[0],{escritorio_id:office,solicitada_por:user});
    assert.equal((await importarNucleoIsoladoPostgres(target,copy,{credentialsKey:key,identityPlans:plans})).checkpoint.retomado,true);
    const current=(await target.query('SELECT entrada_hash,resultado_json,revisoes_json,versao FROM interpretacoes_escritorio WHERE escritorio_id=$1 AND base=$2',[office,fixture.document.numero_registro])).rows[0];
    assert.deepEqual(current,{entrada_hash:fixture.inputHash,resultado_json:fixture.result,revisoes_json:fixture.revisions,versao:fixture.version});
    assert.equal(renderizarConsolidadoMarkdown(current.resultado_json),renderizarConsolidadoMarkdown(fixture.result));
    const history=(await target.query('SELECT versao,resultado_json,ator_id FROM versoes_interpretacao WHERE id=ANY($1::bigint[]) ORDER BY versao',[[mapped('versoes_interpretacao',fixture.oldInterpretation),mapped('versoes_interpretacao',fixture.interpretation)]])).rows;
    assert.equal(history.length,2);assert.ok(history.every(row=>row.ator_id===user));
    assert.deepEqual(history.find(row=>row.versao===fixture.oldVersion)?.resultado_json,fixture.previous);
    assert.deepEqual(history.find(row=>row.versao===fixture.version)?.resultado_json,fixture.result);
    const role=process.env.PGAPPUSER??'';if(!/^[a-z][a-z0-9_]{2,62}$/.test(role))throw new Error('Papel runtime inválido.');
    await target.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await target.query(`GRANT SELECT ON interpretacoes_escritorio,versoes_interpretacao TO "${role}"`);
    const runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database,PGPOOL_MAX:'1'});
    try{
      assert.equal((await runtime.query('SELECT * FROM interpretacoes_escritorio')).rowCount,0);
      const scoped=await withPostgresOfficeTransaction(runtime,Number(office),async client=>(await client.query('SELECT resultado_json,revisoes_json FROM interpretacoes_escritorio WHERE base=$1',[fixture.document.numero_registro])).rows);
      assert.deepEqual(scoped,[{resultado_json:fixture.result,revisoes_json:fixture.revisions}]);
      const other=(await target.query('SELECT id FROM escritorios WHERE id<>$1 LIMIT 1',[office])).rows[0];
      if(!other)throw new Error('Ensaio histórico exige segundo escritório.');
      assert.equal(await withPostgresOfficeTransaction(runtime,other.id,async client=>(await client.query('SELECT * FROM interpretacoes_escritorio WHERE base=$1',[fixture.document.numero_registro])).rowCount),0);
      assert.equal((await runtime.query('SELECT * FROM versoes_interpretacao')).rowCount,0);
      // New decision after import, with imported identity/customer and synthetic originals only.
      await target.query(`GRANT INSERT,UPDATE ON interpretacoes_escritorio TO "${role}"`);
      await target.query(`GRANT INSERT ON versoes_interpretacao,auditoria_seguranca TO "${role}"`);
      await target.query(`GRANT SELECT ON registros,clientes_documentos,vinculos_escritorio TO "${role}"`);
      await target.query(`GRANT UPDATE ON registros,vinculos_escritorio TO "${role}"`);
      await target.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
      const folder=mkdtempSync(join('data','revisao-importada-')),base='DF999977/2026',aditivo='DF999978/2026',field=CAMPOS_CCT.find(c=>/piso geral/i.test(c.rotulo))!.id;
      const files=[join(folder,'base.doc'),join(folder,'aditivo.doc')];
      try{
        const citation='O piso geral passa a R$ 1.900,00.';
        const pattern=validarExtracaoCct({campos:Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,NAO_CONSTA_CCT]))});pattern.campos[field]='R$ 1.500,00';
        for(const [index,number] of [base,aditivo].entries()){
          const bytes=Buffer.from(`<html><body>NÚMERO DE REGISTRO NO MTE: ${number}<br>${citation}</body></html>`);writeFileSync(files[index],bytes);
          const extraction=index?{topicos:{},aditivo:{versao:'1.0',alteracoes:[{campo:field,acao:'revisar',valor:'R$ 1.900,00',clausula:'Cláusula 1',citacao:citation}]}}:{topicos:{},padrao:pattern};
          await target.query("INSERT INTO registros(numero_registro,watch,tipo,arquivo_path,arquivo_hash,analise_status,extracao_json) VALUES($1,'Ensaio público',$2,$3,$4,'analisado',$5::jsonb)",[number,index?'Termo Aditivo de Convenção Coletiva':'Convenção Coletiva',files[index],createHash('sha256').update(bytes).digest('hex'),JSON.stringify(extraction)]);
          await target.query("INSERT INTO clientes_documentos(cliente_id,numero_registro,escritorio_id,motivo,contexto_hash) VALUES($1,$2,$3,'Ensaio','sintetico')",[customer,number,office]);
        }
        await target.query("INSERT INTO vinculos_escritorio(escritorio_id,aditivo,base,justificativa,ator_id) VALUES($1,$2,$3,'Ensaio de revisão importada',$4)",[office,aditivo,base,user]);
        await assert.rejects(()=>consolidarInterpretacaoPostgres(runtime,Number(office),base,Number(user),async()=>{throw new Error('audit');}));
        assert.equal((await target.query('SELECT * FROM interpretacoes_escritorio WHERE base=$1',[base])).rowCount,0);
        const version=await consolidarInterpretacaoPostgres(runtime,Number(office),base,Number(user));
        const decision={base,campo:field,aditivo,acao:'manual',valor:'R$ 1.800,00',justificativa:'Decisão sintética após importação',versao:version};
        await assert.rejects(()=>revisarInterpretacaoPostgres(runtime,Number(office),{usuario_id:Number(user),nome:'Revisor importado'},decision,async()=>{throw new Error('audit');}));
        assert.equal((await vistaInterpretacaoPostgres(runtime,Number(office),base)).versao,version);
        assert.equal((await target.query('SELECT * FROM versoes_interpretacao WHERE base=$1',[base])).rowCount,1);
        const reviewed=await revisarInterpretacaoPostgres(runtime,Number(office),{usuario_id:Number(user),nome:'Revisor importado'},decision,async(client,details)=>{
          await client.query("INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json) VALUES($1,'INTERPRETACAO_REVISADA',$2,$3,'','ensaio','revisao-importada',$4::jsonb)",[user,office,Date.now(),JSON.stringify(details)]);
        });
        assert.notEqual(reviewed.versao,version);const view=await vistaInterpretacaoPostgres(runtime,Number(office),base);
        assert.equal((view.resultado as {padrao:{campos:Record<string,string>}}).padrao.campos[field],'R$ 1.800,00');
        assert.equal(view.historico.length,2);
        await assert.rejects(()=>revisarInterpretacaoPostgres(runtime,Number(office),{usuario_id:Number(user),nome:'Revisor importado'},decision),/desatualizada/);
        await assert.rejects(()=>vistaInterpretacaoPostgres(runtime,other.id,base));
        await validarRevisaoImportadaUi(target,runtime,{office:Number(office),other:other.id,base,field});
      }finally{for(const file of files)try{unlinkSync(file);}catch{}rmdirSync(folder);}
    }finally{await runtime.end();}
    return {publicacao_aviso_acesso:true,versao_e_execucao:true,pdf_e_ator_preservados:true,aviso_pendente_cancelado:true,checkpoint_reutilizado:true,indice_desconhecido_bloqueado:true,
      consolidacao_json_markdown:true,revisoes_json_preservadas:true,duas_versoes_com_ator_remapeado:true,interpretacao_isolada_runtime:true,nova_revisao_pos_importacao:true,rollback_auditoria_revisao_consolidacao:true,versao_obsoleta_recusada:true,revisao_chromium_http_real:true};
  }finally{
    try{
      await target?.end();
      if(created){
        for(let i=0;i<40;i++){
          if(!Number((await admin.query('SELECT count(*) total FROM pg_stat_activity WHERE datname=$1',[database])).rows[0].total))break;
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        await admin.query(`DROP DATABASE "${database}"`);
      }
    }finally{if(copyCreated)rmSync(copy,{force:true});}
  }
}


