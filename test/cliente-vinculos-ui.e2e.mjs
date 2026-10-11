import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.setContent('<input id="cliente-uf" value="DF"><input id="cliente-municipio" value="Brasília"><select multiple id="cliente-contatos"><option value="1" selected>Contato A</option></select><select multiple id="cliente-sindicatos"><option value="10" selected>Sindicato A</option><option value="20" selected>Sindicato B</option></select><select id="monitoramento-tipos"><option>Convenção Coletiva</option><option>Acordo Coletivo</option></select>');
  await page.addScriptTag({path:resolve('web/uf-ui.js')});
  await page.addScriptTag({path:resolve('web/cliente-vinculos-ui.js')});
  await page.evaluate(()=>{window.editor=window.criarEditorVinculosCliente();editor.reset({contatos:[{contato_id:1,funcao:'Antiga',receber_email:false,tipos:['Acordo Coletivo']}],sindicatos:[]},[]);});
  assert.equal(await page.locator('#cliente-vinculo-contatos-1-email').isChecked(),false);
  assert.equal(await page.locator('#cliente-uf').evaluate(node=>node.tagName),'SELECT');
  assert.equal(await page.locator('#cliente-uf option').count(),28);
  assert.equal(await page.locator('#cliente-uf').inputValue(),'DF');
  await page.locator('#cliente-vinculo-sindicatos-10-uf').selectOption('GO');
  assert.equal((await page.evaluate(()=>editor.read('sindicatos'))).find(link=>link.sindicato_id===10).uf,'GO');
  await page.locator('#cliente-vinculo-contatos-1-funcao').fill('Nova função');
  await page.locator('#cliente-vinculo-sindicatos-10-principal').check();
  await page.locator('#cliente-vinculo-sindicatos-20-principal').check();
  assert.equal(await page.locator('#cliente-vinculo-sindicatos-10-principal').isChecked(),false);
  await page.locator('#cliente-vinculo-contatos-1-vincular').uncheck();assert.deepEqual(await page.evaluate(()=>editor.read('contatos')),[]);
  await page.locator('#cliente-vinculo-contatos-1-vincular').check();assert.equal(await page.locator('#cliente-vinculo-contatos-1-funcao').inputValue(),'Nova função');
  assert.deepEqual(await page.evaluate(()=>editor.read('contatos')[0].tipos),['Acordo Coletivo']);
  assert.equal((await page.evaluate(()=>editor.read('sindicatos'))).filter(link=>link.principal).length,1);
  await page.evaluate(()=>editor.reset(null,[]));assert.equal(await page.locator('#cliente-vinculo-contatos-1-funcao').inputValue(),'');
  assert.equal(await page.locator('#cliente-vinculo-contatos-1-email').isChecked(),true);
  console.log('OK: preferências preservadas na edição, remoção/reseleção, principal único e estado limpo ao trocar cliente.');
}finally{await browser.close();}
