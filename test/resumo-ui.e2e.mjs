import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();await page.setContent('<section id="resumo-escritorio" hidden></section>');
  await page.evaluate(()=>{window.pending=[];window.activities=[];window.fetch=(url,options)=>new Promise(resolve=>(url.endsWith('/execucoes')?window.activities:window.pending).push({url,options,resolve}));});
  await page.addScriptTag({path:resolve('web/resumo-ui.js')});
  const context=async id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{contexto:{tipo:'escritorio',escritorio_id:id},sessao:{capacidades:{monitoramento_execucoes:true}}}})),id);
  await context(1);await context(2);
  await page.evaluate(()=>{
    const data=n=>({clientes_ativos:n,monitoramentos_ativos:0,envios_revisao:0,envios_fila:0,envios_atencao:0});
    window.pending[1].resolve({ok:true,json:async()=>data(2)});
  });
  await page.waitForSelector('.resumo-indicadores');assert.equal(await page.locator('dd').first().textContent(),'2');
  assert.equal(await page.locator('.overview-hero h3').textContent(),'Acompanhe os sindicatos dos seus clientes.');
  await page.evaluate(()=>window.addEventListener('mediador:navegar',event=>window.lastArea=event.detail.area));
  await page.getByRole('button',{name:'Configurar sindicatos',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastArea),'cadastros');
  await page.evaluate(()=>window.pending[0].resolve({ok:true,json:async()=>({clientes_ativos:99})}));
  await page.waitForTimeout(30);assert.equal(await page.locator('dd').first().textContent(),'2');
  assert.equal(await page.evaluate(()=>window.pending[1].options.headers['x-context-id']),'2');
  assert.equal(await page.evaluate(()=>window.activities[0].options.headers['x-context-id']),'2');
  await page.evaluate(()=>window.dispatchEvent(new Event('mediador:limpar')));
  assert.equal(await page.locator('#resumo-escritorio').isVisible(),false);assert.equal(await page.locator('dd').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{contexto:{tipo:'cliente'},sessao:{capacidades:{monitoramento_execucoes:true}}}})));
  assert.equal(await page.evaluate(()=>window.pending.length),2);
  await context(3);await page.evaluate(()=>window.pending[2].resolve({ok:true,json:async()=>({clientes_ativos:0,monitoramentos_ativos:0,envios_revisao:0,envios_fila:0,envios_atencao:0})}));
  await page.getByRole('heading',{name:'Seu escritório começa aqui.',exact:true}).waitFor();
  assert.equal(await page.locator('dd').first().textContent(),'0');
  await page.evaluate(()=>window.activities[1].resolve({ok:true,json:async()=>[]}));
  await page.getByText('Ainda não há execuções neste escritório.',{exact:true}).waitFor();
  await page.evaluate(()=>window.activities[0].resolve({ok:true,json:async()=>[{id:99,status:'falhou',iniciada_em:'2026-10-10T12:00:00Z'}]}));
  await page.waitForTimeout(30);assert.equal(await page.locator('.overview-activity-list li').count(),0);

  await context(4);await page.evaluate(()=>window.pending[3].resolve({ok:true,json:async()=>({clientes_ativos:1,monitoramentos_ativos:1,envios_revisao:2,envios_fila:0,envios_atencao:3})}));
  await page.getByRole('heading',{name:'Alguns envios precisam da sua atenção.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Conferir envios',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastArea),'envios');
  await page.evaluate(()=>window.activities[2].resolve({ok:true,json:async()=>[{id:1,status:'solicitada',iniciada_em:'2026-10-10T12:00:00Z'},{id:2,status:'concluida',iniciada_em:'2026-10-11T12:00:00Z'}]}));
  await page.getByText('Coleta concluída',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('.overview-activity-list strong').allTextContents(),['Coleta concluída','Coleta na fila']);
  await page.getByRole('button',{name:'Ver histórico de execuções',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastArea),'monitoramento');

  console.log('OK: resumo contextual, resposta atrasada descartada, limpeza e empresa sem indicadores internos.');
}finally{await browser.close();}
