import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/** Runs only inside the disposable database created by postgres-https.integration. */
export async function validarDocumentosVue(setup,page,origin,{office,customer,base,amendment,publication}){
  assert.match((await setup.query('SELECT current_database() nome')).rows[0].nome,/^mediador_https_test_[a-f0-9]{32}$/);
  await page.goto(origin+'/app/');
  await page.getByLabel('Seu espaço de trabalho').selectOption({label:'Escritório · Escritório jornada MVP'});
  await page.getByRole('button',{name:'Documentos',exact:true}).click();
  await page.getByRole('button',{name:'Abrir ficha de '+base}).click();
  const sheet=page.getByRole('dialog',{name:'Ficha do documento'});
  await sheet.getByRole('button',{name:'Análise',exact:true}).click();
  await sheet.getByRole('button',{name:'Consolidação',exact:true}).click();
  await sheet.getByLabel('Cliente do relatório').selectOption(String(customer));
  const report=page.waitForEvent('download');
  await sheet.getByRole('button',{name:'Baixar relatório MD'}).click();
  assert.ok(readFileSync(await (await report).path(),'utf8').length>100);
  await sheet.getByRole('button',{name:'Fechar modal'}).click();
  await page.getByRole('button',{name:'Publicações',exact:true}).click();
  await page.getByRole('button',{name:'Ver publicação '+publication.id}).click();
  await page.getByRole('dialog',{name:'Detalhes da publicação'}).getByText(base,{exact:true}).waitFor();
  await page.getByRole('button',{name:'Fechar modal'}).click();
  await page.getByRole('button',{name:'Acessos e ciência',exact:true}).click();
  await page.getByRole('table',{name:'Auditoria de publicações'}).getByText('ciencia_confirmada',{exact:true}).waitFor();
  const csv=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar auditoria CSV'}).click();
  assert.ok(readFileSync(await (await csv).path(),'utf8').includes('127.0.0.1'));
  await page.getByRole('button',{name:'Instrumentos',exact:true}).click();
  await page.getByRole('button',{name:'Gerenciar vínculos de aditivos'}).click();
  const dialog=page.getByRole('dialog',{name:'Gerenciar vínculos de aditivos'});
  await dialog.getByRole('combobox',{name:/^Aditivo/}).selectOption(amendment);
  await dialog.getByText('Vinculado à CCT '+base,{exact:true}).waitFor();
  // A concurrent database writer advances the revision after the form is opened.
  await setup.query('UPDATE vinculos_escritorio SET revisao=revisao+1 WHERE escritorio_id=$1 AND aditivo=$2',[office,amendment]);
  await dialog.getByLabel('Justificativa da decisão').fill('Conferência Vue contra PostgreSQL real.');
  const conflict=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/contexto/vinculos'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Salvar decisão'}).click();assert.equal((await conflict).status(),409);
  assert.equal(await dialog.getByLabel('Justificativa da decisão').inputValue(),'Conferência Vue contra PostgreSQL real.');
  await dialog.getByRole('button',{name:'Fechar modal'}).click();
  await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
  await page.getByRole('button',{name:'Gerenciar vínculos de aditivos'}).click();
  await dialog.getByRole('combobox',{name:/^Aditivo/}).selectOption(amendment);
  await dialog.getByLabel('Justificativa da decisão').fill('Conferência Vue contra PostgreSQL real.');
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/contexto/vinculos'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Salvar decisão'}).click();assert.equal((await saved).status(),200);
  await dialog.waitFor({state:'hidden'});
  const stored=(await setup.query('SELECT base,justificativa FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2',[office,amendment])).rows[0];
  assert.equal(stored.base,base);assert.equal(stored.justificativa,'Conferência Vue contra PostgreSQL real.');
  console.log('OK: Documentos Vue com PostgreSQL/HTTPS real: ficha, relatório MD, publicação, auditoria CSV e vínculo com conflito/persistência.');
}
