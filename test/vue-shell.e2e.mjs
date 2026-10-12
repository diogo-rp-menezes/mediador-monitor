import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://vue.test/**',async route=>{
  const url=new URL(route.request().url());let data;
  if(url.pathname==='/api/auth/sessao')data={csrf:'test-token',usuario:{nome:'Operador',email:'teste@example.invalid'},contextos:{escritorios:[{id:1,nome:'Gescon',membro:true},{id:2,nome:'Gconta',membro:true}],clientes:[]}};
  else if(url.pathname==='/api/auth/contexto'){const body=route.request().postDataJSON();data={contexto:{tipo:'escritorio',escritorio_id:body.id,cliente_id:null,papel:'operador'}};assert.equal(route.request().headers()['x-csrf-token'],'test-token');}
  else if(url.pathname.startsWith('/api/contexto/')){const office=route.request().headers()['x-context-id'];assert.equal(route.request().headers()['x-context-type'],'escritorio');data=office==='1'?[{id:1,razao_social:'Empresa Gescon',cnpj:'11222333000181',ativo:true}]:[];}
  else{const path=url.pathname==='/app/'?'index.html':url.pathname.slice(5);return route.fulfill({body:readFileSync(resolve('web/vue',path)),contentType:extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html'});}
  return route.fulfill({json:data});
 });
 await page.goto('http://vue.test/app/');const select=page.getByRole('combobox',{name:'Seu espaço de trabalho'});await select.selectOption('0');await page.getByRole('status').waitFor();assert.equal(await select.inputValue(),'0');await page.getByRole('button',{name:'Cadastros',exact:true}).click();await page.getByText('Empresa Gescon',{exact:true}).waitFor();await select.selectOption('1');await page.getByText('Ainda não há cadastros neste escritório.',{exact:true}).waitFor();assert.equal(await page.getByText('Empresa Gescon',{exact:true}).count(),0);await page.getByRole('button',{name:'Alternar tema'}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('OK: Vue, seleção estável, CSRF, headers de contexto, cadastros isolados, tema e mobile.');
}finally{await browser.close();}
