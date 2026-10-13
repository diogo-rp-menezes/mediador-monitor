import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
export async function validarSolicitacaoControlada(browser){
  const context=await browser.newContext();
  try{
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));let queries=[],outage=true,posts=0,release,finished;const executions=[];
    await page.route('http://collect.test/**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(path==='/api/auth/sessao')return route.fulfill({json:{csrf:'csrf-collect',usuario:{nome:'Operador',email:'operador@example.invalid'},contextos:{escritorios:[{id:1,nome:'A',membro:true},{id:2,nome:'B',membro:true}],clientes:[]}}});
      if(path==='/api/auth/contexto')return route.fulfill({json:{contexto:{tipo:'escritorio',escritorio_id:request.postDataJSON()?.id??1,cliente_id:null,papel:'operador'}}});
      if(path==='/api/contexto/monitoramentos')return outage?route.fulfill({status:503,json:{erro:'Consultas indisponíveis.'}}):route.fulfill({json:queries});
      if(path==='/api/contexto/execucoes'){
        if(request.method()==='GET')return route.fulfill({json:executions});
        posts++;assert.deepEqual(request.postDataJSON(),{monitoramento_id:7});assert.equal(request.headers()['x-context-id'],'1');assert.equal(request.headers()['x-csrf-token'],'csrf-collect');await new Promise(resolve=>{release=resolve;});
        await route.fulfill({status:202,json:{id:40+posts,status:'solicitada'}});finished?.();return;
      }
      if(path.startsWith('/api/contexto/'))return route.fulfill({json:[]});
      const asset=path==='/app/'?'index.html':path.slice(5);return route.fulfill({body:readFileSync(resolve('web/vue',asset)),contentType:extname(asset)==='.js'?'text/javascript':extname(asset)==='.css'?'text/css':'text/html'});
    });
    await page.goto('http://collect.test/app/');await page.getByLabel('Seu espaço de trabalho').selectOption('0');await page.getByRole('button',{name:'Monitoramento',exact:true}).click();await page.getByRole('button',{name:'Solicitar coleta',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Solicitar coleta',exact:true});await dialog.getByText('Consultas indisponíveis.',{exact:true}).waitFor();outage=false;await dialog.getByRole('button',{name:'Atualizar consultas'}).click();await dialog.getByText('Ainda não há consultas neste escritório. Configure uma consulta em Cadastros → Sindicatos.',{exact:true}).waitFor();
    const row={id:7,nome:'Consulta válida',ativo:true,cnpj_filtro:'',categoria:'Comércio',uf:'DF',titulo:'Piso',vigencia:'Vigentes',tipos:['Convenção Coletiva']};queries=[row,{...row,id:8,nome:'Sem filtro',categoria:'',titulo:''},{...row,id:9,nome:'Sem tipos',tipos:[]},{...row,id:10,nome:'Vigência incompatível',vigencia:'2026'}];await dialog.getByRole('button',{name:'Atualizar consultas'}).click();
    for(const id of [8,9,10]){await dialog.getByLabel('Consulta para coleta').selectOption(String(id));assert.equal(await dialog.getByRole('checkbox').isDisabled(),true);assert.equal(await dialog.getByRole('button',{name:'Confirmar solicitação'}).isDisabled(),true);}assert.equal(posts,0);
    await dialog.getByLabel('Consulta para coleta').selectOption('7');await dialog.getByRole('checkbox').check();await dialog.getByLabel('Consulta para coleta').selectOption('8');assert.equal(await dialog.getByRole('checkbox').isChecked(),false);await dialog.getByLabel('Consulta para coleta').selectOption('7');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirmar solicitação'}).click();await page.waitForFunction(()=>document.querySelector('dialog[aria-label="Solicitar coleta"]').getAttribute('aria-busy')==='true');assert.equal(posts,1);assert.equal(await dialog.getByRole('button',{name:'Fechar modal'}).isDisabled(),true);assert.equal(await dialog.getByLabel('Consulta para coleta').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);release();await dialog.waitFor({state:'hidden'});await page.getByText('Execução #41 solicitada. Acompanhe sua situação no histórico.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Solicitar coleta',exact:true}).click();await dialog.getByLabel('Consulta para coleta').selectOption('7');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirmar solicitação'}).click();await page.waitForFunction(()=>document.querySelector('dialog[aria-label="Solicitar coleta"]').getAttribute('aria-busy')==='true');await page.getByLabel('Seu espaço de trabalho').selectOption('1');await dialog.waitFor({state:'hidden'});const delivered=new Promise(resolve=>{finished=resolve;});release();await delivered;assert.equal(await page.getByText(/Execução #4[12] solicitada/).count(),0);assert.equal(posts,2);assert.deepEqual(errors,[]);
    console.log('OK: solicitação Vue — carregamento/erro/vazio/retry, filtros obrigatórios, confirmação renovada, contrato/CSRF, busy/Escape e sucesso antigo descartado na troca de contexto.');
  }finally{await context.close();}
}
