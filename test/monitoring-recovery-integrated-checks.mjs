import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {criarPoolPostgresRuntime} from '../dist/postgres.js';
import {comExclusividadeMonitoramentoPostgres} from '../dist/postgres-monitoring-lock.js';

export async function validarRecuperacaoMonitoramento(page,setup,{office,other,users},role){
  const database=(await setup.query('SELECT current_database() nome')).rows[0].nome;
  assert.match(database,/^mediador_https_test_[a-f0-9]{32}$/);
  const ids=[];let runtime,release,holder,union,monitor;
  const detail=page.getByRole('dialog',{name:'Detalhes da execução',exact:true});
  async function api(path,method='GET',body){return page.evaluate(async({path,method,body})=>{
    const context=JSON.parse(sessionStorage.getItem('mediador_contexto'));
    const session=await (await fetch('/api/auth/sessao')).json();
    const response=await fetch('/api/contexto/'+path,{method,headers:{'content-type':'application/json','x-context-type':'escritorio','x-context-id':String(context.escritorio_id),'x-csrf-token':session.csrf,...(context.concessao?{'x-support-grant':context.concessao}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  },{path,method,body});}
  async function execution(scope,status='executando'){
    const id=(await setup.query(`INSERT INTO execucoes_escritorio(escritorio_id,solicitada_por,status,detalhes_json)
      VALUES($1,$2,$3,$4::jsonb) RETURNING id`,[scope,users[role].id,status,JSON.stringify({formato:'monitoramento-execucao-v1',monitoramento_id:monitor,reserva_token:'11111111-1111-1111-1111-111111111111',worker_iniciado_em:new Date().toISOString()})])).rows[0].id;
    ids.push(id);return id;
  }
  async function open(id){await page.getByRole('button',{name:'Atualizar execuções',exact:true}).click();await page.getByRole('button',{name:`Ver execução ${id}`,exact:true}).click();}
  async function capture(name){if(role!=='admin'||!process.env.MEDIADOR_UI_VISUAL_DIR)return;const directory=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(directory,{recursive:true});const theme=await page.evaluate(()=>document.documentElement.dataset.theme);for(const variant of ['light','dark'])for(const width of [1440,390]){await page.evaluate(value=>document.documentElement.dataset.theme=value,variant);await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(directory,`recuperacao-${name}-${variant}-${width}.png`)});}await page.setViewportSize({width:1440,height:1000});await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);}
  try{
    await page.getByRole('button',{name:'Monitoramento',exact:true}).click();await page.getByRole('button',{name:'Pausar atualização',exact:true}).click();
    union=(await setup.query('INSERT INTO sindicatos(nome) VALUES($1) RETURNING id',[`Recuperação ${role}`])).rows[0].id;
    monitor=(await setup.query(`INSERT INTO monitoramentos_escritorios(escritorio_id,sindicato_id,nome,categoria,tipos_json)
      VALUES($1,$2,$3,'Comércio','["Convenção Coletiva"]') RETURNING id`,[office,union,`Recuperação ${role}`])).rows[0].id;
    const active=await execution(office),foreign=await execution(other);
    await open(active);
    if(!['admin','platform'].includes(role)){
      assert.equal(await detail.getByRole('button',{name:'Confirmar recuperação',exact:true}).count(),0);
      assert.equal((await api(`execucoes/${active}/recuperar`,'POST',{justificativa:'Consumidor encerrado antes da recuperação',consumidor_encerrado:true})).status,403);
      await detail.getByRole('button',{name:'Fechar modal'}).click();
      console.log(`OK: recuperação ${role} somente leitura; POST recusado com 403.`);return;
    }
    assert.equal(await detail.getByRole('button',{name:'Confirmar recuperação',exact:true}).isDisabled(),true);
    await detail.getByLabel('Justificativa da recuperação').fill('curta');
    await detail.getByText('Informe ao menos 8 caracteres na justificativa.',{exact:true}).waitFor();
    await detail.getByLabel('Justificativa da recuperação').fill('Consumidor anterior encerrado após interrupção controlada');
    await detail.getByLabel('Confirmo que o consumidor anterior foi encerrado').check();
    await capture('formulario');
    runtime=criarPoolPostgresRuntime({...process.env,PGDATABASE:database});
    let started;const held=new Promise(resolve=>{release=resolve;}),locked=new Promise(resolve=>{started=resolve;});
    holder=comExclusividadeMonitoramentoPostgres(runtime,office,async()=>{started();await held;});await locked;
    await detail.getByRole('button',{name:'Confirmar recuperação',exact:true}).click();
    await detail.getByText(/Consumidor do escritório ainda mantém exclusividade\. Encerre-o antes de recuperar\./).waitFor();
    assert.equal(await detail.getByLabel('Justificativa da recuperação').inputValue(),'Consumidor anterior encerrado após interrupção controlada');
    assert.equal((await setup.query('SELECT status,detalhes_json FROM execucoes_escritorio WHERE id=$1',[active])).rows[0].status,'executando');
    release();await holder;holder=undefined;release=undefined;
    await detail.getByRole('button',{name:'Confirmar recuperação',exact:true}).click();
    await detail.getByText('Recuperação registrada. A reserva anterior foi invalidada e a execução foi marcada como falhou.',{exact:true}).waitFor();
    await detail.getByText('Falhou',{exact:true}).waitFor();await detail.getByRole('button',{name:'Confirmar recuperação',exact:true}).waitFor({state:'hidden'});await capture('confirmacao');
    const recovered=(await setup.query('SELECT status,concluida_em,detalhes_json FROM execucoes_escritorio WHERE id=$1',[active])).rows[0];
    assert.equal(recovered.status,'falhou');assert.notEqual(recovered.concluida_em,null);assert.equal(recovered.detalhes_json.reserva_token,undefined);assert.equal(recovered.detalhes_json.recuperacao_administrativa,true);
    assert.equal(Number((await setup.query("SELECT count(*) quantidade FROM execucoes_escritorio WHERE escritorio_id=$1 AND detalhes_json->>'monitoramento_id'=$2",[office,String(monitor)])).rows[0].quantidade),1);
    assert.equal((await api(`execucoes/${foreign}/recuperar`,'POST',{justificativa:'Consumidor encerrado antes da recuperação',consumidor_encerrado:true})).status,409);
    assert.equal((await api(`execucoes/${active}/recuperar`,'POST',{justificativa:'Consumidor encerrado antes da recuperação',consumidor_encerrado:true})).status,409);
    assert.equal((await api(`execucoes/${active}/recuperar`,'POST',{justificativa:'sem confirmação'})).status,400);
    await detail.getByRole('button',{name:'Fechar modal'}).click();
    const stale=await execution(office);await open(stale);await detail.getByLabel('Justificativa da recuperação').fill('Consumidor anterior já foi encerrado');await detail.getByLabel('Confirmo que o consumidor anterior foi encerrado').check();await setup.query("UPDATE execucoes_escritorio SET status='concluida',concluida_em=now() WHERE id=$1",[stale]);await detail.getByRole('button',{name:'Confirmar recuperação',exact:true}).click();await detail.getByRole('alert').waitFor();await detail.getByText('Concluída',{exact:true}).waitFor();await detail.getByRole('button',{name:'Confirmar recuperação',exact:true}).waitFor({state:'hidden'});await detail.getByRole('button',{name:'Fechar modal'}).click();
    const audits=(await setup.query("SELECT ator_id,detalhes_json FROM auditoria_seguranca WHERE acao='MONITORAMENTO_EXECUCAO_RECUPERADA' AND detalhes_json->>'execucao_id'=$1",[String(active)])).rows;
    assert.equal(audits.length,1);assert.equal(audits[0].ator_id,users[role].id);assert.equal(audits[0].detalhes_json.consumidor_encerrado,true);
    console.log(`OK: recuperação ${role} — justificativa/confirmação, exclusividade, token invalidado, auditoria, conflito, recarga e sem duplicação.`);
  }finally{
    release?.();await holder?.catch(()=>{});await runtime?.end();await page.evaluate(()=>document.querySelectorAll('dialog').forEach(element=>element.close()));await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Cadastros',exact:true}).click();await setup.query('DELETE FROM execucoes_escritorio WHERE id=ANY($1::int[])',[ids]);if(monitor)await setup.query('DELETE FROM monitoramentos_escritorios WHERE id=$1',[monitor]);if(union)await setup.query('DELETE FROM sindicatos WHERE id=$1',[union]);
  }
}
