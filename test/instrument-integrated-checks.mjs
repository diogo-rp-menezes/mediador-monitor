import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';

export async function validarOriginaisIntegrados(page,setup,fixture){
  assert.match((await setup.query('SELECT current_database() nome')).rows[0].nome,/^mediador_https_test_[a-f0-9]{32}$/);
  const base='DF000001/2026',root=resolve('data'),dir=mkdtempSync(join(root,'ui-original-test-'));
  const file=join(dir,'original.pdf'),bytes=Buffer.from('%PDF-1.4\nOriginal exclusivo do ensaio de instrumentos.');
  const original=(await setup.query('SELECT arquivo_path,arquivo_hash FROM registros WHERE numero_registro=$1',[base])).rows[0];
  try{
    writeFileSync(file,bytes);
    await page.getByRole('button',{name:'Documentos',exact:true}).click();
    await page.getByRole('button',{name:'Abrir ficha de '+base,exact:true}).click();
    let modal=page.getByRole('dialog',{name:'Ficha do documento',exact:true});
    await modal.getByRole('button',{name:'Original',exact:true}).click();await modal.getByText('Original ainda não disponível.',{exact:true}).waitFor();
    await modal.getByRole('button',{name:'Clientes',exact:true}).click();await modal.getByRole('heading',{name:'Clientes relacionados'}).waitFor();assert.match(await modal.innerText(),/Empresa HTTPS A/);
    await modal.getByLabel('Fechar modal').click();
    await setup.query('UPDATE registros SET arquivo_path=$2,arquivo_hash=$3 WHERE numero_registro=$1',[base,file,createHash('sha256').update(bytes).digest('hex')]);
    await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();await page.getByRole('table').getByText('Disponível',{exact:true}).waitFor();
    await page.getByRole('combobox',{name:/^Cliente relacionado/}).selectOption(String(fixture.customer));
    await page.getByRole('combobox',{name:/^Documento original/}).selectOption('disponivel');await page.getByText('1 de 1 instrumentos',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Abrir ficha de '+base,exact:true}).click();modal=page.getByRole('dialog',{name:'Ficha do documento',exact:true});
    const event=page.waitForEvent('download');await modal.getByRole('button',{name:'Baixar original',exact:true}).click();assert.deepEqual(readFileSync(await (await event).path()),bytes);
    const security=await page.evaluate(async({office,other,customer,otherCustomer,base})=>{
      const path='/api/contexto/clientes/'+customer+'/documentos/original?numero='+encodeURIComponent(base);
      const headers={'x-context-type':'escritorio','x-context-id':String(office)};
      const own=await fetch(path,{headers});
      return {own:own.status,cache:own.headers.get('cache-control'),foreign:(await fetch(path,{headers:{...headers,'x-context-id':String(other)}})).status,wrongClient:(await fetch(path.replace('/'+customer+'/', '/'+otherCustomer+'/'),{headers})).status,anonymous:(await fetch(path)).status};
    },{...fixture,users:undefined,base});
    assert.equal(security.own,200);assert.match(security.cache,/no-store/);assert.equal(security.foreign,404);assert.equal(security.wrongClient,404);assert.notEqual(security.anonymous,200);
    await setup.query('UPDATE registros SET arquivo_hash=$2 WHERE numero_registro=$1',[base,'0'.repeat(64)]);
    await modal.getByRole('button',{name:'Baixar original',exact:true}).click();await modal.getByRole('alert').getByText('Original sem integridade confirmada. Atualize o documento.').waitFor();
    await setup.query('UPDATE registros SET arquivo_path=NULL,arquivo_hash=NULL WHERE numero_registro=$1',[base]);
    await modal.getByRole('button',{name:'Baixar original',exact:true}).click();await modal.getByRole('alert').getByText('Original não localizado.').waitFor();
    await modal.getByLabel('Fechar modal').click();
    await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
    await page.getByRole('button',{name:'Cadastros',exact:true}).click();
    console.log('OK: original real autenticado, bytes e no-store, ausência/integridade visíveis, clientes relacionados e isolamento escritório/cliente.');
  }finally{
    await setup.query('UPDATE registros SET arquivo_path=$2,arquivo_hash=$3 WHERE numero_registro=$1',[base,original.arquivo_path,original.arquivo_hash]);
    assert.equal(resolve(dir).startsWith(root+sep),true);assert.match(dir.split(sep).at(-1),/^ui-original-test-/);rmSync(dir,{recursive:true,force:true});
  }
}
