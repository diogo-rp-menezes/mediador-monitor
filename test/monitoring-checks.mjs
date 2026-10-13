import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
export async function validarPollingMonitoramento(browser){
  const context=await browser.newContext();
  try{
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let calls=0,offline=false,delay=false,release,delivered;
    const execution=(id,status='solicitada')=>({id,monitoramento_id:'12',solicitada_por:1,status,iniciada_em:'2026-10-12T10:00:00Z',concluida_em:null,cancelamento_solicitado:false,limite_duracao_excedido:false,limite_volume_excedido:false});
    await page.route('http://monitor.test/**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(path==='/api/auth/sessao')return route.fulfill({json:{csrf:'token',usuario:{nome:'Leitor',email:'leitor@example.invalid'},contextos:{escritorios:[{id:1,nome:'A',membro:true},{id:2,nome:'B',membro:true}],clientes:[]}}});
      if(path==='/api/auth/contexto')return route.fulfill({json:{contexto:{tipo:'escritorio',escritorio_id:request.postDataJSON()?.id??1,cliente_id:null,papel:'operador'}}});
      if(path==='/api/contexto/execucoes'){
        assert.equal(request.method(),'GET');calls++;const office=request.headers()['x-context-id'];
        if(delay){delay=false;await new Promise(resolve=>{release=resolve;});try{await route.fulfill({json:[execution(999)]});}catch{}delivered?.();return;}
        if(offline)return route.fulfill({status:503,json:{erro:'Sem conexão com o histórico.'}});
        return route.fulfill({json:[execution(Number(office),calls===1?'solicitada':'concluida')]});
      }
      if(path.startsWith('/api/contexto/'))return route.fulfill({json:[]});
      const asset=path==='/app/'?'index.html':path.slice(5);return route.fulfill({body:readFileSync(resolve('web/vue',asset)),contentType:extname(asset)==='.js'?'text/javascript':extname(asset)==='.css'?'text/css':'text/html'});
    });
    await page.clock.install();await page.goto('http://monitor.test/app/');await page.getByLabel('Seu espaço de trabalho').selectOption('0');await page.getByRole('button',{name:'Monitoramento',exact:true}).click();await page.getByRole('button',{name:'Ver execução 1',exact:true}).waitFor();await page.getByRole('cell',{name:'Solicitada',exact:true}).waitFor();
    offline=true;await page.clock.runFor(10001);await page.getByRole('alert').getByText('Sem conexão com o histórico.',{exact:true}).waitFor();offline=false;await page.clock.runFor(10001);await page.getByRole('alert').waitFor({state:'hidden'});await page.getByRole('cell',{name:'Concluída',exact:true}).waitFor();assert.equal(calls,3);
    await page.getByRole('button',{name:'Pausar atualização',exact:true}).click();await page.clock.runFor(30001);assert.equal(calls,3);await page.getByRole('button',{name:'Retomar atualização',exact:true}).click();await page.getByRole('button',{name:'Atualizar execuções',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('section[aria-label="Execuções de monitoramento"] button').disabled);assert.equal(calls,4);
    delay=true;await page.getByRole('button',{name:'Atualizar execuções',exact:true}).click();await page.waitForFunction(()=>document.querySelector('section[aria-label="Execuções de monitoramento"] button').disabled);await page.getByLabel('Seu espaço de trabalho').selectOption('1');await page.getByRole('button',{name:'Ver execução 2',exact:true}).waitFor();const finished=new Promise(resolve=>{delivered=resolve;});release();await finished;assert.equal(await page.getByRole('button',{name:'Ver execução 999',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Ver execução 1',exact:true}).count(),0);
    await page.getByRole('button',{name:'Minha conta',exact:true}).click();const before=calls;await page.clock.runFor(30001);assert.equal(calls,before);assert.deepEqual(errors,[]);
    console.log('OK: polling Vue — ciclo automático, falha/reconexão, pausa/retomada, resposta atrasada na troca de contexto e interrupção ao sair.');
  }finally{await context.close();}
}
