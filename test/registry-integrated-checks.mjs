import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';

async function capture(page,label){
  if(!process.env.MEDIADOR_UI_VISUAL_DIR)return;
  const directory=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(directory,{recursive:true});
  const theme=await page.evaluate(()=>document.documentElement.dataset.theme),viewport=page.viewportSize();
  for(const variant of ['light','dark']){
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},variant);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:width===390?844:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:join(directory,`${variant}-${width}-${label}.png`),fullPage:true});
    }
  }
  await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
  await page.setViewportSize(viewport);
}

/** CRUD and filters against the disposable, authenticated PostgreSQL fixture. */
export async function validarListasCadastros(page){
  const name='Contato de conferência';
  await page.getByLabel('Buscar cadastro',{exact:true}).fill('11.222.333/0001-81');
  await page.getByText('Empresa HTTPS A',{exact:true}).waitFor();
  await page.getByLabel('Buscar cadastro',{exact:true}).fill('empresa inexistente');
  await page.getByText('Nenhum resultado para esta busca.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
  await page.getByRole('button',{name:'Ver ficha de Empresa HTTPS A',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Ficha do cliente',exact:true});
  await sheet.getByRole('heading',{name:'Dados e envio',exact:true}).waitFor();
  await capture(page,'ficha-cliente');
  await sheet.getByRole('button',{name:'Fechar modal',exact:true}).click();
  await page.getByRole('button',{name:'Excluir Empresa HTTPS A',exact:true}).click();
  const deletion=page.getByRole('dialog',{name:'Excluir cliente',exact:true});
  await deletion.getByRole('button',{name:'Excluir cliente',exact:true}).click();
  await deletion.getByRole('alert').filter({hasText:'Inative-o'}).waitFor();
  await deletion.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Editar Empresa HTTPS A',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Editar cliente',exact:true});
  await editor.waitFor();
  await editor.getByLabel('Situação do cliente').waitFor();
  await editor.getByLabel('Situação do cliente').selectOption('false');
  await editor.getByRole('button',{name:'Salvar cliente',exact:true}).click();
  await editor.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('table').waitFor();
  await page.getByLabel('Situação').selectOption('true');
  await page.getByText('Nenhum resultado para esta busca.',{exact:true}).waitFor();
  await page.getByLabel('Situação').selectOption('false');
  await page.getByText('Empresa HTTPS A',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Editar Empresa HTTPS A',exact:true}).click();
  await editor.getByLabel('Situação do cliente').selectOption('true');
  await editor.getByRole('button',{name:'Salvar cliente',exact:true}).click();await editor.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
  await page.getByRole('button',{name:'Contatos',exact:true}).click();
  await page.getByRole('button',{name:'Novo contato',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Novo contato',exact:true});
  await form.getByLabel('Nome do contato',{exact:true}).fill(name);
  await form.getByLabel('E-mail do contato',{exact:true}).fill('conferencia@example.invalid');
  await form.getByLabel('Cargo',{exact:true}).fill('Operações');
  await form.getByRole('button',{name:'Salvar contato',exact:true}).click();await form.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Contatos',exact:true}).click();
  await page.getByText(name,{exact:true}).waitFor();
  await capture(page,'contatos');
  await page.getByLabel('Buscar cadastro',{exact:true}).fill('operacoes');
  await page.getByText(name,{exact:true}).waitFor();
  await page.getByRole('button',{name:`Editar ${name}`,exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Editar contato',exact:true});
  await edit.getByLabel('Situação do contato').selectOption('false');
  await edit.getByRole('button',{name:'Salvar contato',exact:true}).click();await edit.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Contatos',exact:true}).click();
  await page.getByLabel('Situação').selectOption('false');
  await page.getByText(name,{exact:true}).waitFor();
  await page.getByRole('button',{name:`Excluir ${name}`,exact:true}).click();
  const remove=page.getByRole('dialog',{name:'Excluir contato',exact:true});
  await remove.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByText(name,{exact:true}).waitFor();
  await page.getByRole('button',{name:`Excluir ${name}`,exact:true}).click();
  await remove.getByRole('button',{name:'Excluir contato',exact:true}).click();await remove.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Contatos',exact:true}).click();
  await page.getByText('Ainda não há cadastros neste escritório.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Clientes',exact:true}).click();await page.getByText('Empresa HTTPS A',{exact:true}).waitFor();
  console.log('OK: listas reais — busca/CNPJ/acentos, filtros, ficha, cliente inativado/restaurado, exclusão bloqueada por histórico, contato criado/editado/inativado/excluído após recargas.');
}

export async function validarEditorCliente(page){
  await page.getByRole('button',{name:'Novo cliente',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Novo cliente',exact:true});
  await form.getByLabel('Razão social').fill('Rascunho preservado');
  await form.getByLabel('CNPJ',{exact:true}).fill('11.222.333/0001-82');
  await form.getByRole('button',{name:'Salvar cliente',exact:true}).click();
  await form.getByRole('alert').waitFor();
  assert.equal(await form.getByLabel('Razão social').inputValue(),'Rascunho preservado');
  await form.getByLabel('CNPJ',{exact:true}).fill('11444777000161');
  await form.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();
  await form.locator('.cnpj-lookup [role=alert]').waitFor();
  assert.equal(await form.getByLabel('Razão social').inputValue(),'Rascunho preservado');
  await form.getByLabel('CNPJ',{exact:true}).fill('04.252.011/0001-10');
  await form.getByRole('button',{name:'Consultar CNPJ',exact:true}).click();
  await form.getByRole('button',{name:'Usar dados no cadastro',exact:true}).waitFor();
  assert.equal(await form.getByLabel('Razão social').inputValue(),'Rascunho preservado');
  await form.getByText('Dados cadastrais completos',{exact:true}).click();
  await capture(page,'consulta-cnpj');
  await form.getByRole('button',{name:'Usar dados no cadastro',exact:true}).click();
  assert.equal(await form.getByLabel('Razão social').inputValue(),'Empresa Alfa Comércio Ltda');
  assert.equal(await form.getByLabel('Município',{exact:true}).inputValue(),'Brasília');
  await form.getByLabel('Nome fantasia').fill('Nome conferido');
  await form.getByLabel('Modo de envio').selectOption('automatico');
  await form.getByRole('button',{name:'Salvar cliente',exact:true}).click();await form.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Editar Empresa Alfa Comércio Ltda',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Editar cliente',exact:true});
  await edit.getByLabel('Razão social').waitFor();
  assert.equal(await edit.getByLabel('Nome fantasia').inputValue(),'Nome conferido');
  assert.equal(await edit.getByLabel('Modo de envio').inputValue(),'automatico');
  assert.equal(await edit.getByLabel('CNPJ',{exact:true}).inputValue(),'04252011000110');
  assert.equal(await edit.getByLabel('Município',{exact:true}).inputValue(),'Brasília');
  assert.equal(await edit.getByLabel('UF').inputValue(),'DF');
  const saved=await page.evaluate(async()=>{
    const current=JSON.parse(sessionStorage.getItem('mediador_contexto'));
    const headers={'x-context-type':'escritorio','x-context-id':String(current.escritorio_id)};
    const list=await (await fetch('/api/contexto/clientes',{headers})).json();
    const entry=list.find(item=>item.cnpj==='04252011000110');
    return (await fetch('/api/contexto/clientes/'+entry.id,{headers})).json();
  });
  assert.equal(saved.dados_cnpj_json.cnpj,'04252011000110');
  assert.ok(saved.dados_cnpj_json.fonte);
  assert.ok(saved.dados_cnpj_json.cnae_principal.codigo);
  assert.ok(Object.keys(saved.dados_cnpj_json.endereco).length);
  await edit.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Excluir Empresa Alfa Comércio Ltda',exact:true}).click();
  await page.getByRole('dialog',{name:'Excluir cliente',exact:true}).getByRole('button',{name:'Excluir cliente',exact:true}).click();
  await page.getByRole('dialog',{name:'Excluir cliente',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Novo cliente',exact:true}).click();
  await form.getByLabel('Razão social').fill('Empresa alfanumérica');
  await form.getByLabel('CNPJ',{exact:true}).fill('12.ABC.345/01DE-35');
  await form.getByRole('button',{name:'Salvar cliente',exact:true}).click();await form.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Editar Empresa alfanumérica',exact:true}).click();
  await edit.getByLabel('CNPJ',{exact:true}).waitFor();
  assert.equal(await edit.getByLabel('CNPJ',{exact:true}).inputValue(),'12ABC34501DE35');
  await edit.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Excluir Empresa alfanumérica',exact:true}).click();
  await page.getByRole('dialog',{name:'Excluir cliente',exact:true}).getByRole('button',{name:'Excluir cliente',exact:true}).click();
  await page.getByRole('dialog',{name:'Excluir cliente',exact:true}).waitFor({state:'hidden'});
  console.log('OK: editor real — validação preserva rascunho, consulta indisponível, aplicação explícita, campos persistidos, CNPJ numérico e alfanumérico com recarga.');
}
