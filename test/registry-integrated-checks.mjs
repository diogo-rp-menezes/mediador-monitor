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
