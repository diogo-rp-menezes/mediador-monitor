import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const html=readFileSync('web/acesso.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 await page.route('http://cadastros.test/**',route=>{const path=new URL(route.request().url()).pathname;route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/html',body:path.endsWith('.css')?readFileSync(resolve('web',path.slice(1)),'utf8'):html});});
 await page.goto('http://cadastros.test/');
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 for(const file of ['workspace-ui.js','cadastros-ui.js'])await page.addScriptTag({path:resolve('web',file)});
 await page.evaluate(()=>{
  const sessao={usuario:{nome:'Teste',papel_plataforma:null},capacidades:{monitoramento_execucoes:true}};
  window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{contexto:{tipo:'escritorio',papel:'administrador'},sessao}}));
  document.getElementById('cadastros-escritorio').hidden=false;
  const list=document.getElementById('lista-clientes-contexto');
  for(const [name,active]of [['Posto Monumental','true'],['Café Aurora','false']]){const row=document.createElement('tr');row.dataset.nome=name;row.dataset.active=active;for(const text of [name,'05.454.390/0001-93','Brasília / DF','Com revisão',active==='true'?'Ativo':'Inativo','Editar']){const td=document.createElement('td');td.textContent=text;row.append(td);}list.append(row);}
  window.dispatchEvent(new CustomEvent('mediador:cadastros',{detail:{clientes:[{ativo:true,modo_envio:'revisao'},{ativo:false,modo_envio:'revisao'}],contatos:[],monitoramentos:[]}}));
 });
 await page.getByRole('button',{name:'Cadastros',exact:true}).click();
 const card=key=>page.locator('#lista-'+key+'-contexto').locator('xpath=ancestor::article');
 assert.equal(await card('clientes').isVisible(),true);assert.equal(await card('contatos').isVisible(),false);
 await page.locator('[data-cadastro="contatos"]').click();assert.equal(await card('contatos').isVisible(),true);assert.equal(await card('clientes').isVisible(),false);
 await page.locator('[data-cadastro="sindicatos"]').click();assert.equal(await card('monitoramentos').isVisible(),true);
 await page.locator('[data-cadastro="clientes"]').click();
 await page.getByLabel('Filtrar situação de clientes',{exact:true}).selectOption('true');assert.equal(await page.locator('#lista-clientes-contexto tr:visible').count(),1);
 await page.getByLabel('Filtrar situação de clientes',{exact:true}).selectOption('todas');await page.getByLabel('Ordenar clientes',{exact:true}).selectOption('desc');assert.equal(await page.locator('#lista-clientes-contexto tr').first().getAttribute('data-nome'),'Posto Monumental');
 mkdirSync('data',{recursive:true});await page.screenshot({path:'data/ui-cadastros-v2-desktop.png',fullPage:true});
 await page.evaluate(()=>{document.getElementById('cliente-contexto-form').hidden=false;window.dispatchEvent(new CustomEvent('mediador:cadastro-editar',{detail:{tipo:'cliente'}}));});
 await page.getByRole('button',{name:'Contatos e envio',exact:true}).click();assert.equal(await page.locator('#cliente-modo').isVisible(),true);assert.equal(await page.locator('#cliente-razao').isVisible(),false);
 await page.keyboard.press('Escape');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('mediador:cliente-ficha',{detail:{cliente:{razao_social:'Empresa teste',nome_fantasia:'Posto teste',cnpj:'05.454.390/0001-93',ativo:true,contatos:[],sindicatos:[]},editar:null,documentos:()=>{}}})));
 assert.equal(await page.getByRole('dialog',{name:'Posto teste',exact:true}).isVisible(),true);assert.equal(await page.locator('.registry-ficha').getByRole('button',{name:'Editar cliente'}).count(),0);
 await page.evaluate(()=>window.dispatchEvent(new Event('mediador:limpar')));assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('.registry-ficha-grid').textContent(),'');
  await page.evaluate(()=>{window.deleteAnswer=undefined;window.confirmarExclusaoCadastro('Excluir registro de teste?').then(result=>window.deleteAnswer=result);});
  await page.getByRole('alertdialog',{name:'Excluir cadastro',exact:true}).waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.deleteAnswer===false);
  await page.evaluate(()=>{window.deleteAnswer=undefined;window.confirmarExclusaoCadastro('Excluir registro de teste?').then(result=>window.deleteAnswer=result);});
  await page.getByRole('alertdialog').getByRole('button',{name:'Excluir cadastro',exact:true}).click();await page.waitForFunction(()=>window.deleteAnswer===true);
  await page.evaluate(()=>{window.deleteAnswer=undefined;window.confirmarExclusaoCadastro('Excluir registro de teste?').then(result=>window.deleteAnswer=result);window.dispatchEvent(new Event('mediador:limpar'));});await page.waitForFunction(()=>window.deleteAnswer===false);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('OK: cadastro único visível, filtros/ordenação, seções, ficha sem edição indevida e limpeza de contexto.');
}finally{await browser.close();}
