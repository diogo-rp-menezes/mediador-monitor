import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],posts=[];
 page.setDefaultTimeout(5000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
 const html=readFileSync('web/acesso.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 let pending=true;
 const doc={numero_registro:'DF000525/2026',tipo:'Convenção Coletiva',original_disponivel:false,clientes_ids:[1]};
 await page.route('http://documentos.test/**',async route=>{
  const u=new URL(route.request().url()),path=u.pathname;let data=[];
  if(!path.startsWith('/api/'))return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/html',body:path.endsWith('.css')?readFileSync(resolve('web',path.slice(1)),'utf8'):html});
  if(route.request().method()==='POST'){posts.push({path,body:route.request().postDataJSON(),headers:route.request().headers()});if(path.endsWith('/revisoes'))pending=false;}
  if(path==='/api/contexto/usuarios')data={funcionarios:[],representantes:[]};
  if(path==='/api/contexto/escritorio')data={nome:'Gescon',usuarios:[],convites:[]};
  if(path==='/api/contexto/smtp')data={configurado:false};
  if(path==='/api/contexto/clientes')data=[{id:1,razao_social:'Empresa teste',nome_fantasia:'Posto Monumental'}];
  if(path==='/api/contexto/interpretacoes')data=u.searchParams.has('numero')?{...doc,analise_status:'analisado',analise:{campos:{piso:'R$ 2.000'}},analise_visao:{versao:'1.0.0',secoes:[{titulo:'1. Identificação e metadados',grupos:[{titulo:'Instrumento',campos:[{id:'s01_numero',rotulo:'Número do registro no MTE',valor:'DF000525/2026',clausula:'Cláusula 1ª',citacao:'Registro DF000525/2026.'},{id:'s01_vigencia',rotulo:'Vigência',valor:'Não consta na CCT'}]}]},{titulo:'2. Cláusulas econômicas',grupos:[{titulo:'Piso',campos:[{id:'s02_piso',rotulo:'Piso geral',valor:'R$ 2.000'}]}]}]}}:u.searchParams.has('base')?{versao:'versao-segura-123',desatualizado:false,vinculos:[],revisoes:[],historico:[],resultado:{padrao:{campos:{piso:'R$ 2.000'}},pendencias:pending?['piso']:[],historico:{piso:pending?[{aplicada:false,instrumento:'DF000526/2026',citacao:'Novo piso R$ 2.100'}]:[]}}}:{documentos:[doc],vinculos:[]};
  if(path==='/api/contexto/publicacoes/auditoria')data=[{criado_em:'2026-10-11',evento:'abertura',ator_id:1,ip:'127.0.0.1',resultado:'sucesso'}];
  return route.fulfill({json:data});
 });
 await page.goto('http://documentos.test/');await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 for(const file of ['workspace-ui.js','gestao-ui.js','publicacoes-ui.js'])await page.addScriptTag({path:resolve('web',file)});
 await page.evaluate(()=>{const sessao={csrf:'csrf-teste',usuario:{nome:'Teste'},capacidades:{}};window.dispatchEvent(new CustomEvent('mediador:contexto',{detail:{sessao,contexto:{tipo:'escritorio',papel:'administrador',escritorio_id:7}}}));});
 await page.getByRole('button',{name:'Documentos e revisões',exact:true}).click();
 await page.getByRole('button',{name:'Abrir ficha de DF000525/2026'}).waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0);
 mkdirSync('data',{recursive:true});await page.screenshot({path:'data/ui-documentos-v2-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Abrir ficha de DF000525/2026'}).click();
 const sheet=page.locator('.document-sheet');
 await sheet.getByRole('button',{name:'Clientes',exact:true}).click();await sheet.getByText('Posto Monumental',{exact:true}).waitFor();
 await sheet.getByRole('button',{name:'Análise',exact:true}).click();await sheet.getByText('Análise estruturada da CCT',{exact:true}).waitFor();await sheet.getByText('DF000525/2026',{exact:true}).last().waitFor();await sheet.getByRole('button',{name:'Ver evidência',exact:true}).click();await page.getByRole('dialog',{name:'Evidência: Número do registro no MTE'}).waitFor();await page.getByRole('dialog',{name:'Evidência: Número do registro no MTE'}).getByRole('button',{name:'Fechar',exact:true}).click();await sheet.getByRole('button',{name:/Cláusulas econômicas/}).click();await sheet.getByText('R$ 2.000',{exact:true}).waitFor();
 await sheet.getByRole('button',{name:'Consolidação',exact:true}).click();
 await sheet.getByRole('button',{name:'Revisar Piso',exact:true}).click();
 const review=page.locator('dialog[open]').last();await review.getByLabel('Justificativa da revisão').fill('Conferido no documento original.');await review.getByRole('button',{name:'Registrar revisão'}).click();
 await sheet.getByRole('button',{name:'Baixar relatório PDF'}).waitFor();
 assert.equal(posts[0].body.versao,'versao-segura-123');assert.equal(posts[0].headers['x-context-id'],'7');assert.equal(posts[0].headers['x-csrf-token'],'csrf-teste');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Publicações',exact:true}).click();await page.getByRole('button',{name:'Nova publicação',exact:true}).click();
 await page.locator('#pub-client').selectOption('1');await page.locator('#pub-base').selectOption(doc.numero_registro);await page.waitForFunction(()=>!document.querySelector('#pub-base').form.querySelector('[type=submit]').disabled);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Acessos e ciência',exact:true}).click();await page.getByRole('button',{name:'Consultar eventos de auditoria'}).click();await page.getByRole('table',{name:'Auditoria de publicações'}).waitFor();assert.equal(await page.getByRole('button',{name:'Nova publicação',exact:true}).isVisible(),false);
 await page.getByRole('button',{name:'Instrumentos',exact:true}).click();await page.getByRole('button',{name:'Abrir ficha de DF000525/2026'}).click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'data/ui-documentos-v2-mobile.png',fullPage:true});
 await page.evaluate(()=>window.dispatchEvent(new Event('mediador:limpar')));assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
 console.log('OK: catálogo, ficha, clientes, análise, revisão versionada, publicação, auditoria, mobile e limpeza do contexto.');
}finally{await browser.close();}






