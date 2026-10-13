import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

export async function validarConsultasSindicais(page,setup,{office,other,customer}){
  const entry=(await setup.query("SELECT id,sindicato_id FROM monitoramentos_escritorios WHERE escritorio_id=$1 AND nome='Consulta A'",[office])).rows[0];
  const catalogBefore=(await setup.query('SELECT * FROM sindicatos WHERE id=$1',[entry.sindicato_id])).rows;
  await setup.query("INSERT INTO monitoramentos_escritorios(escritorio_id,sindicato_id,nome,categoria,tipos_json) VALUES($1,$2,'Consulta isolada B','Serviços','[\"Acordo Coletivo\"]')",[other,entry.sindicato_id]);
  await page.getByRole('button',{name:'Sindicatos',exact:true}).click();
  await page.getByRole('button',{name:'Editar Consulta A',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Editar configuração',exact:true});
  await form.getByLabel('Nome da consulta').fill('Consulta conferida A');
  await form.getByLabel('Filtro de CNPJ').fill('11.222.333/0001-81');
  await form.getByLabel('Filtro de categoria').fill('Comércio');
  await form.getByLabel('Filtro de UF').selectOption('DF');
  await form.getByLabel('Palavra no título').fill('Piso salarial');
  await form.getByLabel('Filtro de vigência').fill('2026');
  await form.getByLabel('Acordo Coletivo',{exact:true}).check();
  await form.getByLabel('Convenção Coletiva',{exact:true}).check();
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
  await capture('consulta-sindical-editor');
  await form.getByRole('button',{name:'Salvar configuração',exact:true}).click();await form.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Sindicatos',exact:true}).click();
  await page.getByText('Consulta conferida A',{exact:true}).waitFor();
  await page.getByLabel('Buscar sindicato ou consulta').fill('comercio');
  await page.getByText('Consulta conferida A',{exact:true}).waitFor();
  await capture('consultas-sindicais');
  const stored=(await setup.query('SELECT * FROM monitoramentos_escritorios WHERE id=$1',[entry.id])).rows[0];
  assert.equal(stored.escritorio_id,office);assert.equal(stored.cnpj_filtro,'11222333000181');
  assert.equal(stored.categoria,'Comércio');assert.equal(stored.uf,'DF');assert.equal(stored.titulo,'Piso salarial');assert.equal(stored.vigencia,'2026');
  assert.deepEqual([...stored.tipos_json].sort(),['Acordo Coletivo','Convenção Coletiva'].sort());
  await setup.query('INSERT INTO clientes_sindicatos(cliente_id,sindicato_id) VALUES($1,$2)',[customer,entry.sindicato_id]);
  await page.getByRole('button',{name:'Excluir Consulta conferida A',exact:true}).click();
  const deletion=page.getByRole('dialog',{name:'Excluir configuração',exact:true});
  await deletion.getByRole('button',{name:'Excluir configuração',exact:true}).click();
  await deletion.getByRole('alert').filter({hasText:'Inative'}).waitFor();await deletion.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Editar Consulta conferida A',exact:true}).click();
  await form.getByLabel('Situação da configuração').selectOption('false');
  await form.getByRole('button',{name:'Salvar configuração',exact:true}).click();await form.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Sindicatos',exact:true}).click();
  await page.getByLabel('Situação').selectOption('false');await page.getByText('Consulta conferida A',{exact:true}).waitFor();
  const selector=page.getByLabel('Seu espaço de trabalho');await selector.selectOption({label:'Escritório · Escritório HTTPS B'});
  await page.getByRole('button',{name:'Sindicatos',exact:true}).click();await page.getByText('Consulta isolada B',{exact:true}).waitFor();
  assert.equal(await page.getByText('Consulta conferida A',{exact:true}).count(),0);
  await selector.selectOption({label:'Escritório · Escritório HTTPS A'});await page.getByRole('button',{name:'Sindicatos',exact:true}).click();
  await page.getByText('Consulta conferida A',{exact:true}).waitFor();
  await setup.query('DELETE FROM clientes_sindicatos WHERE cliente_id=$1 AND sindicato_id=$2',[customer,entry.sindicato_id]);
  await page.getByRole('button',{name:'Excluir Consulta conferida A',exact:true}).click();
  await deletion.getByRole('button',{name:'Excluir configuração',exact:true}).click();await deletion.waitFor({state:'hidden'});
  assert.equal((await setup.query('SELECT id FROM monitoramentos_escritorios WHERE id=$1',[entry.id])).rowCount,0);
  assert.deepEqual((await setup.query('SELECT * FROM sindicatos WHERE id=$1',[entry.sindicato_id])).rows,catalogBefore);
  assert.equal((await setup.query('SELECT nome FROM monitoramentos_escritorios WHERE escritorio_id=$1 AND sindicato_id=$2',[other,entry.sindicato_id])).rows[0].nome,'Consulta isolada B');
  await page.getByRole('button',{name:'Clientes',exact:true}).click();await page.getByText('Empresa HTTPS A',{exact:true}).waitFor();
  console.log('OK: consultas sindicais reais — filtros/tipos e inativação persistem, exclusão com vínculo recusada, escritórios isolados e catálogo inalterado.');
}
