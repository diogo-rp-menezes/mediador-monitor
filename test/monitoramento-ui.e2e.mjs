// Browser verification with synthetic HTTP data; no database, MTE or email calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const requests=[];let execution={id:1,monitoramento_id:2,status:'executando',iniciada_em:'2026-10-09T12:00:00Z'},delayed=false,release,failLimits=false;
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end('<p id="auth-mensagem"></p><section id="monitoramento-contexto" hidden></section><script src="/monitoramento-ui.js"></script>');return;}
  if(req.url==='/monitoramento-ui.js'){res.setHeader('content-type','application/javascript');res.end(readFileSync('web/monitoramento-ui.js'));return;}
  res.setHeader('content-type','application/json');
  const office=req.headers['x-context-id'];assert.ok(['3','4'].includes(office));
  if(req.method==='POST'||req.method==='PUT'){
    assert.equal(req.headers['x-csrf-token'],'synthetic-csrf');let body='';for await(const chunk of req)body+=chunk;
    const data=JSON.parse(body);if(failLimits&&req.url==='/api/contexto/limites-monitoramento'){res.statusCode=409;res.end(JSON.stringify({erro:'Limites alterados. Atualize antes de salvar.'}));return;}requests.push({office,path:req.url,data});
    if(req.url.endsWith('/recuperar'))execution={...execution,status:'falhou'};
    else if(req.url.endsWith('/cancelar'))execution={...execution,cancelamento_solicitado:true};
    res.end('{}');return;
  }
  if(req.url==='/api/contexto/monitoramentos'){res.end(JSON.stringify(office==='3'?[{id:2,nome:'Filtro A',ativo:true}]:[]));return;}
  if(req.url==='/api/contexto/agendas'){res.end(JSON.stringify(office==='3'?[{monitoramento_id:2,nome:'Agenda A',monitoramento_ativo:true,ativa:false,intervalo_minutos:60}]:[]));return;}
  if(req.url==='/api/contexto/limites-monitoramento'){res.end(JSON.stringify({configurados:{limite_hora:null,duracao_segundos:null,volume_mib:null},tetos:{limite_hora:20,duracao_segundos:900,volume_mib:200},efetivos:{limite_hora:20,duracao_segundos:900,volume_mib:200}}));return;}
  if(delayed&&office==='3')await new Promise(resolve=>{release=resolve;});
  res.end(JSON.stringify(office==='3'?[execution]:[]));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const context=async(papel='administrador',office=3)=>page.evaluate(({papel,office})=>{
    window.dispatchEvent(new Event('mediador:limpar'));
    window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{contexto:{tipo:'escritorio',escritorio_id:office,papel},sessao:{csrf:'synthetic-csrf',capacidades:{monitoramento_execucoes:true}}}}));
  },{papel,office});
  await context();await page.getByText('#1 · Filtro A · Em execução',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Configurar limites',exact:true}).click();
  await page.getByLabel('Inícios por hora',{exact:true}).fill('5');
  failLimits=true;
  await page.getByRole('button',{name:'Salvar limites',exact:true}).click();
  await page.getByRole('dialog',{name:'Limites de coleta',exact:true}).getByRole('alert').waitFor();
  assert.equal(requests.filter(r=>r.path==='/api/contexto/limites-monitoramento').length,0);
  failLimits=false;
  await page.getByRole('button',{name:'Salvar limites',exact:true}).click();
  await page.locator('#auth-mensagem').filter({hasText:'Limites de coleta salvos.'}).waitFor();
  await page.getByText('#1 · Filtro A · Em execução',{exact:true}).waitFor();
  assert.deepEqual(requests.find(r=>r.path==='/api/contexto/limites-monitoramento').data,{limite_hora:5,duracao_segundos:null,volume_mib:null});
  await page.getByRole('button',{name:'Editar agenda',exact:true}).click();
  await page.getByLabel('Intervalo em minutos',{exact:true}).fill('120');await page.getByLabel('Agenda ativa',{exact:true}).check();
  await page.getByRole('button',{name:'Salvar agenda',exact:true}).click();
  await page.getByText('#1 · Filtro A · Em execução',{exact:true}).waitFor();
  assert.deepEqual(requests.find(r=>r.path==='/api/contexto/agendas/2').data,{ativa:true,intervalo_minutos:120,semanal:null});
  await page.getByRole('button',{name:'Solicitar coleta',exact:true}).click();
  await page.locator('#auth-mensagem').filter({hasText:'Coleta adicionada à fila.'}).waitFor();
  await page.getByRole('button',{name:'Solicitar cancelamento',exact:true}).click();
  await page.getByText('Cancelamento solicitado; aguardando encerramento do consumidor.',{exact:true}).waitFor();
  await page.getByText('Recuperar execução interrompida',{exact:true}).click();
  await page.getByLabel('Justificativa',{exact:true}).fill('Processo sintético encerrado');
  await page.getByRole('button',{name:'Recuperar como falha'}).click();assert.equal(requests.filter(r=>r.path.endsWith('/recuperar')).length,0);
  await page.getByLabel('Confirmo que o consumidor anterior foi encerrado e verificado.').check();
  await page.getByRole('button',{name:'Recuperar como falha'}).click();await page.getByText('#1 · Filtro A · Falhou',{exact:true}).waitFor();
  assert.deepEqual(requests.find(r=>r.path.endsWith('/recuperar')).data,{justificativa:'Processo sintético encerrado',consumidor_encerrado:true});
  await context('suporte');await page.getByText('#1 · Filtro A · Falhou',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Solicitar coleta',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Salvar agenda',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Salvar limites',exact:true}).count(),0);
  delayed=true;await context();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent==='Carregando…');
  while(!release)await new Promise(resolve=>setTimeout(resolve,10));
  await context('administrador',4);await page.getByText('Nenhuma execução neste escritório.',{exact:true}).waitFor();release();
  await page.waitForTimeout(100);assert.equal(await page.getByText('#1 · Filtro A · Falhou',{exact:true}).count(),0);
  console.log('UI sintética: solicitação, cancelamento, recuperação com confirmação, suporte somente leitura e resposta atrasada de outro escritório validados.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
