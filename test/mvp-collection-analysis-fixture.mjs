import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {criarPoolPostgresRuntime} from '../dist/postgres.js';
import {withPostgresGlobalTransaction} from '../dist/postgres-transaction.js';
import {criarTrabalhoColetaPostgres} from '../dist/postgres-monitoring-collection.js';
import {criarPersistenciaColetaPostgres} from '../dist/postgres-monitoring-persistence.js';
import {executarCicloMonitoramentoPostgres} from '../dist/postgres-monitoring-worker.js';
import {salvarIaPostgres} from '../dist/postgres-ia-settings.js';
import {executarSolicitacaoIaPostgres} from '../dist/postgres-ia-worker.js';
import {verificarAmbienteLocal} from '../dist/local-preflight.js';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

/** Real HTTP queues and runtime workers; only MTE and model boundaries are controlled. */
export async function validarColetaAnaliseMvp(setup,page,{office,customer,originals}){
  const database=(await setup.query('SELECT current_database() nome')).rows[0].nome;
  assert.match(database,/^mediador_https_test_[a-f0-9]{32}$/);
  const runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database,PGPOOL_MAX:'5'});
  try{
    const attributes=(await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.equal(attributes.rolsuper,false);assert.equal(attributes.rolbypassrls,false);
    const readiness=await verificarAmbienteLocal(runtime,{...process.env,AUTH_PUBLIC_URL:new URL(page.url()).origin},setup);
    assert.equal(readiness.pronto,true);
    execFileSync(process.execPath,['dist/local-cli.js','verificar'],{windowsHide:true,stdio:'pipe',timeout:20000,env:{...process.env,PGDATABASE:database,AUTH_PUBLIC_URL:new URL(page.url()).origin}});
    const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const localPort=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const localOrigin=`http://127.0.0.1:${localPort}`;
    const local=spawn(process.execPath,['dist/local-cli.js','iniciar'],{windowsHide:true,stdio:'ignore',env:{...process.env,PGDATABASE:database,UI_PORT:String(localPort),AUTH_PUBLIC_URL:localOrigin,APP_POSTGRES_CONTEXT:'0'}});
    const closed=new Promise(resolve=>{local.once('exit',resolve);local.once('error',resolve);});
    try{
      let ready=false;
      for(let i=0;i<200;i++){
        assert.equal(local.exitCode,null);
        try{if((await fetch(localOrigin+'/api/auth/estado')).status===200){ready=true;break;}}catch{}
        await delay(50);
      }
      assert.ok(ready,'local:iniciar deve selecionar PostgreSQL mesmo se o ambiente indicar legado.');
      assert.equal((await fetch(localOrigin+'/api/clientes')).status,404);
    }finally{if(local.exitCode===null)local.kill();await closed;}
    const sindicato=(await setup.query("INSERT INTO sindicatos(nome) VALUES('Sindicato jornada MVP') RETURNING id")).rows[0].id;
    await setup.query(`INSERT INTO monitoramentos_escritorios(escritorio_id,sindicato_id,nome,categoria,tipos_json)
      VALUES($1,$2,'Coleta jornada MVP','Teste','["Convenção Coletiva","Termo Aditivo de Convenção Coletiva"]'::jsonb)`,[office,sindicato]);
    // Reload the selected context so the actual UI discovers the new monitoring.
    await page.reload();
    await page.locator('#contexto-selecionado').filter({hasText:'Contexto selecionado'}).waitFor();
    await page.getByRole('button',{name:'Monitoramento',exact:true}).click();
    const submitted=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/contexto/execucoes'&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Solicitar coleta',exact:true}).click();assert.equal((await submitted).status(),202);
    let calls=0;
    const work=criarTrabalhoColetaPostgres(criarPersistenciaColetaPostgres(runtime),{baixarOriginais:false},{
      abrir:async()=>({}),fechar:async()=>{},consultar:async(_session,host,_path,watch)=>{
        assert.equal(host,'https://mediador.trabalho.gov.br/');calls++;
        const sample=originals.find(doc=>/aditivo/i.test(doc.type)===/aditivo/i.test(watch.tipo));assert.ok(sample);
        return {registros:[{numeroRegistro:sample.number,numeroSolicitacao:'MRMVP',tipo:watch.tipo,vigencia:'2026',partes:'Partes de ensaio',indice:0}],
          arquivos:new Map([[sample.number,sample.file]]),erros:[]};
      }
    });
    assert.equal((await executarCicloMonitoramentoPostgres(runtime,office,{work})).resultado_solicitado,'concluida');assert.equal(calls,2);
    assert.equal((await executarCicloMonitoramentoPostgres(runtime,office,{work})).reservada,false);assert.equal(calls,2);
    await page.getByRole('button',{name:'Atualizar execuções',exact:true}).click();
    await page.locator('.monitor-indicators dd').nth(2).filter({hasText:'1'}).waitFor();
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:resolve('data/ui-monitoramento-postgres.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:resolve('data/ui-monitoramento-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1280,height:900});

    assert.equal((await setup.query('SELECT count(*)::integer n FROM publicacoes_documentos WHERE escritorio_id=$1',[office])).rows[0].n,0);
    for(const sample of originals){
      const collected=(await setup.query('SELECT arquivo_hash,analise_status FROM registros WHERE numero_registro=$1',[sample.number])).rows[0];
      assert.equal(collected.arquivo_hash,sample.file.hash);assert.notEqual(collected.analise_status,'analisado');
    }
    await withPostgresGlobalTransaction(setup,tx=>salvarIaPostgres(tx,{ativo:true,base_url:'http://127.0.0.1:1',modelo:'modelo-controlado-mvp',api_key:'segredo-sintetico-mvp',versao:0}));
    let modelCalls=0;
    for(const sample of originals){
      const status=await page.evaluate(async number=>{
        const session=await (await fetch('/api/auth/sessao')).json();
        return (await fetch('/api/plataforma/ia/solicitacoes',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf},body:JSON.stringify({numero_registro:number})})).status;
      },sample.number);assert.equal(status,202);
      const result=await executarSolicitacaoIaPostgres(runtime,{gerar:async(text,type)=>{
        modelCalls++;
        assert.ok(text.includes(sample.number));assert.ok(type);
        return sample.analysis.padrao??sample.analysis.aditivo;
      }});assert.equal(result.status,'concluida');
      await setup.query("INSERT INTO clientes_documentos(escritorio_id,cliente_id,numero_registro,status,motivo,contexto_hash) VALUES($1,$2,$3,'confirmado','Associação de ensaio',$4)",[office,customer,sample.number,'a'.repeat(64)]);
    }
    assert.equal((await executarSolicitacaoIaPostgres(runtime)).reservada,false);assert.equal(modelCalls,2);
    await page.reload();
    await page.locator('#contexto-selecionado').filter({hasText:'Contexto selecionado'}).waitFor();
    await page.getByRole('button',{name:'Documentos e revisões',exact:true}).click();
    console.log('OK: solicitação UI, coleta/persistência por runtime RLS e fila IA concluídas sem repetir trabalho.');
  }finally{await runtime.end();}
}
