// Synthetic provider settings only; no provider calls or operational database.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
let settings={ativo:false,base_url:'https://example.invalid/v1',modelo:'modelo-teste',tem_chave:true,versao:1},conflict=false,delayed=false,release;
const tests=[];let probeOk=true;
const writes=[];
const queued=[];
let orphan=true;const orphanRecoveries=[];
let attempt={id:1,numero_registro:'DF999980/2026',status:'executando'};const recoveries=[];
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end('<section id="ia-plataforma" hidden></section><script src="/ia-plataforma-ui.js"></script>');return;}
  if(req.url==='/ia-plataforma-ui.js'){res.setHeader('content-type','application/javascript; charset=utf-8');res.end(readFileSync('web/ia-plataforma-ui.js'));return;}
  res.setHeader('content-type','application/json');
  if(req.url==='/api/plataforma/ia/testar'){
    assert.equal(req.method,'POST');assert.equal(req.headers['x-csrf-token'],'synthetic-csrf');let raw='';for await(const chunk of req)raw+=chunk;tests.push(JSON.parse(raw));res.end(JSON.stringify({ok:probeOk,ms:12,mensagem:probeOk?'Conexão e resposta do modelo confirmadas.':'O provedor recusou a autenticação.'}));return;
  }
  if(req.url==='/api/plataforma/ia/solicitacoes/99/recuperar'){
    assert.equal(req.method,'POST');assert.equal(req.headers['x-csrf-token'],'synthetic-csrf');let body='';for await(const chunk of req)body+=chunk;orphanRecoveries.push(JSON.parse(body));orphan=false;res.end('{}');return;
  }
  if(req.url==='/api/plataforma/ia/solicitacoes'){
    if(req.method==='POST'){assert.equal(req.headers['x-csrf-token'],'synthetic-csrf');let body='';for await(const chunk of req)body+=chunk;queued.push(JSON.parse(body));res.statusCode=202;res.end('{}');return;}
    res.end(JSON.stringify([...queued.map((item,index)=>({...item,id:index+1,status:'solicitada'})),{id:99,numero_registro:'DF999981/2026',status:orphan?'executando':'falhou',tentativa_id:null}]));return;
  }
  if(req.url==='/api/plataforma/ia/tentativas'){res.end(JSON.stringify([attempt]));return;}
  if(req.url==='/api/plataforma/ia/tentativas/1/recuperar'){
    assert.equal(req.method,'POST');assert.equal(req.headers['x-csrf-token'],'synthetic-csrf');assert.equal(req.headers['x-context-id'],undefined);
    let raw='';for await(const chunk of req)raw+=chunk;recoveries.push(JSON.parse(raw));attempt={...attempt,status:'falhou'};res.end('{}');return;
  }
  if(req.url!=='/api/plataforma/ia'){res.statusCode=404;res.end('{}');return;}
  assert.equal(req.headers['x-context-id'],undefined);
  if(req.method==='PUT'){
    assert.equal(req.headers['x-csrf-token'],'synthetic-csrf');let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);writes.push(body);
    if(conflict){res.statusCode=409;res.end('{}');return;}
    settings={ativo:body.ativo,base_url:body.base_url,modelo:body.modelo,tem_chave:body.limpar_chave?false:!!body.api_key||settings.tem_chave,versao:settings.versao+1};
  }else if(delayed)await new Promise(resolve=>{release=resolve;});
  res.end(JSON.stringify(settings));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const session=(role='administrador_plataforma',cap=true)=>page.evaluate(({role,cap})=>window.dispatchEvent(new CustomEvent('mediador:sessao',{detail:{usuario:{papel_plataforma:role},csrf:'synthetic-csrf',capacidades:{ia_plataforma:cap}}})),{role,cap});
  await session('suporte');assert.equal(await page.locator('#ia-plataforma').isVisible(),false);
  await session('administrador_plataforma',false);assert.equal(await page.locator('#ia-plataforma').isVisible(),false);
  await session();await page.getByText('Chave armazenada.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Nova chave de IA',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Testar conexão de IA',exact:true}).click();
  await page.getByText('Conexão e resposta do modelo confirmadas. (12 ms)',{exact:true}).waitFor();
  assert.deepEqual(tests[0],{versao:1});assert.equal(writes.length,0);
  probeOk=false;await page.getByRole('button',{name:'Testar conexão de IA',exact:true}).click();
  await page.getByText('O provedor recusou a autenticação.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Editar configuração de IA',exact:true}).click();
  await page.getByLabel('Habilitar IA',{exact:true}).check();await page.getByRole('button',{name:'Salvar configuração de IA',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ia-chave')?.closest('form')?.dataset.versao==='2');assert.deepEqual(writes[0],{ativo:true,base_url:settings.base_url,modelo:settings.modelo,versao:1});
  await page.getByRole('button',{name:'Editar configuração de IA',exact:true}).click();
  await page.getByLabel('Nova chave de IA',{exact:true}).fill('synthetic-key');await page.getByLabel('Remover chave armazenada',{exact:true}).check();
  await page.getByRole('button',{name:'Salvar configuração de IA',exact:true}).click();await page.getByText('Escolha entre substituir ou remover a chave.',{exact:true}).waitFor();assert.equal(writes.length,1);
  await page.getByLabel('Remover chave armazenada',{exact:true}).uncheck();await page.getByRole('button',{name:'Salvar configuração de IA',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ia-chave')?.closest('form')?.dataset.versao==='3');assert.equal(writes[1].api_key,'synthetic-key');assert.equal(await page.getByLabel('Nova chave de IA',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Editar configuração de IA',exact:true}).click();
  await page.getByLabel('Remover chave armazenada',{exact:true}).check();await page.getByRole('button',{name:'Salvar configuração de IA',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ia-chave')?.closest('form')?.dataset.versao==='4');await page.getByText('Nenhuma chave armazenada.',{exact:true}).waitFor();assert.equal(writes[2].limpar_chave,true);
  await page.getByText('Recuperar extração interrompida',{exact:true}).click();
  await page.getByLabel('Justificativa da recuperação',{exact:true}).fill('Processo encerrado e conferido');
  await page.getByRole('button',{name:'Encerrar tentativa interrompida',exact:true}).click();assert.equal(recoveries.length,0);
  await page.getByLabel('Confirmo que o processo de extração anterior foi encerrado e verificado.',{exact:true}).check();
  await page.getByRole('button',{name:'Encerrar tentativa interrompida',exact:true}).click();
  await page.getByText('#1 · DF999980/2026 · Falhou',{exact:true}).waitFor();
  assert.deepEqual(recoveries[0],{justificativa:'Processo encerrado e conferido',consumidor_encerrado:true});
  await page.getByText('Recuperar solicitação #99 sem tentativa',{exact:true}).click();
  await page.getByLabel('Justificativa para solicitação interrompida',{exact:true}).fill('Consumidor encerrado e conferido');
  await page.getByRole('button',{name:'Encerrar solicitação interrompida',exact:true}).click();assert.equal(orphanRecoveries.length,0);
  await page.getByLabel('Confirmo que o consumidor da fila IA foi encerrado e verificado.',{exact:true}).check();
  await page.getByRole('button',{name:'Encerrar solicitação interrompida',exact:true}).click();
  await page.getByText('Solicitação #99 · DF999981/2026 · falhou',{exact:true}).waitFor();assert.deepEqual(orphanRecoveries[0],{justificativa:'Consumidor encerrado e conferido',consumidor_encerrado:true});
  await page.getByRole('button',{name:'Nova análise de documento',exact:true}).click();
  await page.getByLabel('Número do registro para análise',{exact:true}).fill('DF999980/2026');
  await page.getByLabel('Confirmo nova análise se o documento já foi analisado.',{exact:true}).check();
  await page.getByRole('button',{name:'Solicitar análise de documento',exact:true}).click();
  await page.getByText('Solicitação #1 · DF999980/2026 · solicitada',{exact:true}).waitFor();assert.deepEqual(queued[0],{numero_registro:'DF999980/2026',confirmar_reanalise:true});
  await page.getByRole('button',{name:'Editar configuração de IA',exact:true}).click();
  conflict=true;await page.getByLabel('Nova chave de IA',{exact:true}).fill('synthetic-conflict');await page.getByRole('button',{name:'Salvar configuração de IA',exact:true}).click();
  await page.getByText('A configuração foi alterada por outro administrador. Feche esta janela e recarregue antes de editar novamente.',{exact:true}).waitFor();assert.equal(writes.length,4);assert.equal(await page.getByLabel('Nova chave de IA',{exact:true}).inputValue(),'');
  await page.keyboard.press('Escape');
  delayed=true;const pending= new Promise(resolve=>server.once('request',resolve));await page.getByRole('button',{name:'Recarregar configuração de IA',exact:true}).click();await pending;
  while(!release)await new Promise(resolve=>setTimeout(resolve,10));await session('suporte');release();await page.waitForTimeout(100);assert.equal(await page.locator('#ia-plataforma').isVisible(),false);
  console.log('IA UI: permissões, chave omitida/substituída/removida, recuperação com confirmação, CSRF, conflito e resposta atrasada validados.');
}finally{release?.();await browser?.close();await new Promise(resolve=>server.close(resolve));}
