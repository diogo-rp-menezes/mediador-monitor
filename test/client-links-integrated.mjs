import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

export async function validarVinculosCliente(page,setup,{office,customer}){
  const people=[];const unions=[];
  for(const suffix of ['A','B']){
    people.push((await setup.query('INSERT INTO contatos(escritorio_id,nome,email) VALUES($1,$2,$3) RETURNING id',[office,`Pessoa vínculo ${suffix}`,`vinculo-${suffix.toLowerCase()}@example.invalid`])).rows[0].id);
    const id=(await setup.query('INSERT INTO sindicatos(nome) VALUES($1) RETURNING id',[`Sindicato vínculo ${suffix}`])).rows[0].id;unions.push(id);
    await setup.query("INSERT INTO monitoramentos_escritorios(escritorio_id,sindicato_id,nome,tipos_json) VALUES($1,$2,$3,'[]')",[office,id,`Consulta ${suffix}`]);
  }
  async function open(){await page.getByRole('button',{name:'Editar Empresa HTTPS A',exact:true}).click();await form.getByLabel('Razão social').waitFor();}
  const form=page.getByRole('dialog',{name:'Editar cliente',exact:true});
  const person=()=>form.locator('fieldset.instrument-types').filter({has:page.locator('legend',{hasText:'Pessoa vínculo A'})});
  const union=index=>form.locator('fieldset.instrument-types').filter({has:page.locator('legend',{hasText:`Sindicato vínculo ${index?'B':'A'}`})});
  async function save(){await form.getByRole('button',{name:'Salvar cliente',exact:true}).click();await form.waitFor({state:'hidden'});await page.reload();await page.getByRole('table').waitFor();}
  async function capture(label){
    if(!process.env.MEDIADOR_UI_VISUAL_DIR)return;
    const dir=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(dir,{recursive:true});
    const theme=await page.evaluate(()=>document.documentElement.dataset.theme),viewport=page.viewportSize();
    for(const variant of ['light','dark'])for(const width of [1440,390]){
      await page.evaluate(value=>{document.documentElement.dataset.theme=value;},variant);await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:join(dir,`${variant}-${width}-${label}.png`)});
    }
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);await page.setViewportSize(viewport);
  }
  await open();await form.getByRole('button',{name:'Contatos',exact:true}).click();
  await person().getByLabel('Vincular contato').check();
  await person().getByLabel('Função neste cliente').fill('Responsável financeiro');
  await person().getByLabel('Receber documentos por e-mail').uncheck();
  await person().getByText('Tipos de documento',{exact:true}).click();
  await person().getByLabel('Convenção Coletiva',{exact:true}).check();
  await capture('vinculos-contatos');
  await form.getByRole('button',{name:'Sindicatos',exact:true}).click();
  for(const index of [0,1]){
    await union(index).getByLabel('Vincular sindicato').check();
    await union(index).getByLabel('Categoria do cliente').fill(index?'Serviços':'Comércio');
    await union(index).getByLabel('UF do enquadramento').selectOption('DF');
    await union(index).getByLabel('Município do enquadramento').fill('Brasília');
    await union(index).getByLabel('Enquadramento conferido pelo escritório').check();
    await union(index).getByLabel('Sindicato principal').check();
  }
  assert.equal(await union(0).getByLabel('Sindicato principal').isChecked(),false);
  await capture('vinculos-sindicatos');
  await save();await open();await form.getByRole('button',{name:'Contatos',exact:true}).click();
  assert.equal(await person().getByLabel('Função neste cliente').inputValue(),'Responsável financeiro');
  assert.equal(await person().getByLabel('Receber documentos por e-mail').isChecked(),false);
  await person().getByText('Tipos de documento',{exact:true}).click();
  assert.equal(await person().getByLabel('Convenção Coletiva',{exact:true}).isChecked(),true);
  const links=(await setup.query('SELECT * FROM clientes_sindicatos WHERE cliente_id=$1 ORDER BY sindicato_id',[customer])).rows;
  assert.equal(links.length,2);assert.equal(links.filter(link=>link.principal).length,1);
  assert.equal(links[1].sindicato_id,unions[1]);assert.equal(links[1].principal,true);
  assert.equal(links[0].categoria,'Comércio');assert.equal(links[0].uf,'DF');assert.equal(links[0].municipio,'Brasília');assert.equal(links[0].enquadramento_confirmado,true);
  const contactBefore=(await setup.query('SELECT contato_id,funcao,receber_email,tipos_json FROM clientes_contatos WHERE cliente_id=$1',[customer])).rows;
  assert.deepEqual(contactBefore,[{contato_id:people[0],funcao:'Responsável financeiro',receber_email:false,tipos_json:['Convenção Coletiva']}]);
  // An unrelated field save must preserve every linked preference, and never add the unchecked contact.
  await form.getByRole('button',{name:'Dados e envio',exact:true}).click();await form.getByLabel('Nome fantasia').fill('');await save();
  assert.equal((await setup.query('SELECT count(*)::int n FROM clientes_contatos WHERE cliente_id=$1',[customer])).rows[0].n,1);
  assert.deepEqual((await setup.query('SELECT contato_id,funcao,receber_email,tipos_json FROM clientes_contatos WHERE cliente_id=$1',[customer])).rows,contactBefore);
  assert.deepEqual((await setup.query('SELECT * FROM clientes_sindicatos WHERE cliente_id=$1 ORDER BY sindicato_id',[customer])).rows,links);
  await open();await form.getByRole('button',{name:'Contatos',exact:true}).click();await person().getByLabel('Vincular contato').uncheck();
  await form.getByRole('button',{name:'Sindicatos',exact:true}).click();await form.getByRole('button',{name:'Sem sindicato principal',exact:true}).click();
  for(const index of [0,1])assert.equal(await union(index).getByLabel('Sindicato principal').isChecked(),false);
  await save();assert.equal((await setup.query('SELECT count(*)::int n FROM clientes_contatos WHERE cliente_id=$1',[customer])).rows[0].n,0);
  assert.equal((await setup.query('SELECT count(*)::int n FROM clientes_sindicatos WHERE cliente_id=$1 AND principal',[customer])).rows[0].n,0);
  await open();await form.getByRole('button',{name:'Sindicatos',exact:true}).click();for(const index of [0,1])await union(index).getByLabel('Vincular sindicato').uncheck();await save();
  assert.equal((await setup.query('SELECT count(*)::int n FROM clientes_sindicatos WHERE cliente_id=$1',[customer])).rows[0].n,0);
  console.log('OK: vínculos reais — IDs, função/recebimento/tipos e enquadramento persistem; único principal, edição independente e desvinculação conferidos após recarga.');
}
