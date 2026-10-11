import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.setContent('<form id="cliente-contexto-form"><input id="cliente-cnpj" value="11222333000181"><input id="cliente-razao" value="Manual"><input id="cliente-fantasia"><input id="cliente-uf"><input id="cliente-municipio"></form>');
  await page.addScriptTag({path:resolve('web/cliente-cnpj-ui.js')});
  await page.evaluate(()=>{window.pending=[];window.editor=criarConsultaCnpjCliente(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),()=>{});editor.reset(null);window.sample={cnpj:'11222333000181',razao_social:'<img src=x onerror=alert(1)> Empresa',nome_fantasia:'Fantasia',municipio:'Brasília',uf:'DF',fonte:'BrasilAPI / Minha Receita',consultado_em:'2026-10-11T12:00:00Z',endereco:{},cnae_principal:{},cnaes_secundarios:[]};});
  await page.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();
  await page.evaluate(()=>pending[0].resolve(sample));await page.getByRole('button',{name:'Usar dados no cadastro'}).waitFor();
  assert.equal(await page.locator('#cliente-razao').inputValue(),'Manual');assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>editor.read()),null);
  await page.getByRole('button',{name:'Usar dados no cadastro'}).click();assert.equal(await page.locator('#cliente-uf').inputValue(),'DF');assert.equal((await page.evaluate(()=>editor.read())).cnpj,'11222333000181');
  await page.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();await page.locator('#cliente-cnpj').fill('11444777000161');
  await page.evaluate(()=>pending[1].resolve(sample));assert.equal(await page.evaluate(()=>editor.read()),null);assert.equal(await page.locator('#cliente-aplicar-cnpj').count(),0);
  await page.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();await page.evaluate(()=>document.getElementById('cliente-contexto-form').hidden=true);
  await page.evaluate(()=>pending[2].resolve(sample));assert.equal(await page.locator('#cliente-cnpj-resultado').evaluate(node=>node.hidden),true);
  await page.evaluate(()=>{document.getElementById('cliente-contexto-form').hidden=false;editor.reset(null);});
  await page.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();await page.evaluate(()=>pending[3].reject(new Error('Serviço indisponível.')));
  await page.getByText('Serviço indisponível.',{exact:true}).waitFor();assert.equal(await page.locator('#cliente-razao').inputValue(),'<img src=x onerror=alert(1)> Empresa');
  console.log('OK: consulta exige aceite, escapa conteúdo, descarta respostas obsoletas e mantém preenchimento manual após falha.');
}finally{await browser.close();}
