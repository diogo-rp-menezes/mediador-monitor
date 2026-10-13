import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
export async function validarLimitesCancelamentoControlado(browser){
 for(const mode of ['limites','cancelamento','recuperacao']){
  const context=await browser.newContext();let release;
  try{
   const page=await context.newPage();let outage=true,delivered,posts=0;
   await page.route('http://limits.test/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/api/auth/sessao')return route.fulfill({json:{csrf:'csrf-limits',usuario:{nome:'Administrador',email:'admin@example.invalid'},contextos:{escritorios:[{id:1,nome:'A',membro:true},{id:2,nome:'B',membro:true}],clientes:[]}}});
    if(path==='/api/auth/contexto')return route.fulfill({json:{contexto:{tipo:'escritorio',escritorio_id:request.postDataJSON()?.id??1,cliente_id:null,papel:'administrador'}}});
    if(path==='/api/contexto/limites-monitoramento'&&request.method()==='GET')return outage?route.fulfill({status:503,json:{erro:'Consulta de limites indisponível.'}}):route.fulfill({json:{configurados:{limite_hora:null,duracao_segundos:null,volume_mib:null},tetos:{limite_hora:20,duracao_segundos:900,volume_mib:200},efetivos:{limite_hora:20,duracao_segundos:900,volume_mib:200}}});
    if(path==='/api/contexto/execucoes')return route.fulfill({json:[{id:9,status:'executando',cancelavel:true,recuperavel:true,cancelamento_solicitado:false,iniciada_em:new Date().toISOString(),concluida_em:null}]});
    if((path==='/api/contexto/limites-monitoramento'&&request.method()==='PUT')||path==='/api/contexto/execucoes/9/cancelar'||path==='/api/contexto/execucoes/9/recuperar'){
     posts++;assert.equal(request.headers()['x-csrf-token'],'csrf-limits');assert.equal(request.headers()['x-context-id'],'1');assert.deepEqual(request.postDataJSON(),mode==='limites'?{limite_hora:null,duracao_segundos:10,volume_mib:1}:mode==='recuperacao'?{justificativa:'Processo anterior encerrado',consumidor_encerrado:true}:{});await new Promise(resolve=>{release=resolve;});await route.fulfill({json:{ok:true}});delivered?.();return;
    }
    if(path.startsWith('/api/contexto/'))return route.fulfill({json:[]});const asset=path==='/app/'?'index.html':path.slice(5);return route.fulfill({body:readFileSync(resolve('web/vue',asset)),contentType:extname(asset)==='.js'?'text/javascript':extname(asset)==='.css'?'text/css':'text/html'});
   });
   await page.goto('http://limits.test/app/');await page.getByLabel('Seu espaço de trabalho').selectOption('0');await page.getByRole('button',{name:'Monitoramento',exact:true}).click();let dialog;
   if(mode==='limites'){
    await page.getByRole('button',{name:'Limites de coleta',exact:true}).click();dialog=page.getByRole('dialog',{name:'Limites de coleta',exact:true});await dialog.getByText('Consulta de limites indisponível.',{exact:true}).waitFor();outage=false;await dialog.getByRole('button',{name:'Tentar novamente',exact:true}).click();await dialog.getByLabel('Duração por execução (segundos)',{exact:true}).fill('9');assert.equal(await dialog.getByRole('button',{name:'Salvar limites',exact:true}).isDisabled(),true);await dialog.getByLabel('Duração por execução (segundos)',{exact:true}).fill('10');await dialog.getByLabel('Volume por execução (MiB)',{exact:true}).fill('1');await dialog.getByRole('button',{name:'Salvar limites',exact:true}).click();
   }else if(mode==='cancelamento'){
    await page.getByRole('button',{name:'Ver execução 9',exact:true}).click();dialog=page.getByRole('dialog',{name:'Detalhes da execução',exact:true});await dialog.getByLabel('Confirmo o pedido de cancelamento desta execução').check();await dialog.getByRole('button',{name:'Solicitar cancelamento',exact:true}).click();
   }else{
    await page.getByRole('button',{name:'Ver execução 9',exact:true}).click();dialog=page.getByRole('dialog',{name:'Detalhes da execução',exact:true});await dialog.getByLabel('Justificativa da recuperação').fill('Processo anterior encerrado');assert.equal(await dialog.getByRole('button',{name:'Confirmar recuperação',exact:true}).isDisabled(),true);await dialog.getByLabel('Confirmo que o consumidor anterior foi encerrado').check();await dialog.getByRole('button',{name:'Confirmar recuperação',exact:true}).click();
   }
   await page.waitForFunction(()=>document.querySelector('dialog').getAttribute('aria-busy')==='true');assert.equal(posts,1);assert.equal(await dialog.getByRole('button',{name:'Fechar modal'}).isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);await page.getByLabel('Seu espaço de trabalho').selectOption('1');await dialog.waitFor({state:'hidden'});const done=new Promise(resolve=>{delivered=resolve;});release();await done;assert.equal(await page.getByText(/Limites salvos\.|Pedido de cancelamento registrado\.|Recuperação registrada\./).count(),0);
  }finally{release?.();await context.close();}
 }
 console.log('OK: limites/cancelamento/recuperação Vue — falha GET/retry, validação, herança/contrato/CSRF, busy/Escape e respostas antigas descartadas.');
}
