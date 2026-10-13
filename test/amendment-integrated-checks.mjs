import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

export async function validarAditivosIntegrados(page,setup,{office,other,customer,otherCustomer,users}){
  assert.match((await setup.query('SELECT current_database() nome')).rows[0].nome,/^mediador_https_test_[a-f0-9]{32}$/);
  const base='DF000001/2026',aditivo='DF999971/2026',second='DF999972/2026',foreign='DF999973/2026',accord='DF999974/2026';
  const numbers=[aditivo,second,foreign,accord];
  const before=(await setup.query('SELECT * FROM registros WHERE numero_registro=$1',[base])).rows;
  try{
    for(const [number,type] of [[aditivo,'Termo Aditivo de Convenção Coletiva'],[second,'Convenção Coletiva'],[foreign,'Convenção Coletiva'],[accord,'Acordo Coletivo']])await setup.query("INSERT INTO registros(numero_registro,watch,tipo,vigencia) VALUES($1,'fixture-aditivos',$2,'')",[number,type]);
    for(const [officeId,clientId,number] of [[office,customer,aditivo],[office,customer,second],[office,customer,accord],[other,otherCustomer,aditivo],[other,otherCustomer,foreign]])await setup.query("INSERT INTO clientes_documentos(escritorio_id,cliente_id,numero_registro,status,motivo,contexto_hash) VALUES($1,$2,$3,'confirmado','Fixture aditivos',$4)",[officeId,clientId,number,'a'.repeat(64)]);
    await setup.query('INSERT INTO vinculos_escritorio(escritorio_id,aditivo,base,justificativa,ator_id) VALUES($1,$2,$3,$4,$5)',[other,aditivo,foreign,'Decisão independente do escritório B.',users.admin.id]);
    const isolated=(await setup.query('SELECT * FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2',[other,aditivo])).rows;
    await page.getByRole('button',{name:'Documentos',exact:true}).click();
    const manager=page.getByRole('button',{name:'Gerenciar vínculos de aditivos',exact:true});
    const modal=page.getByRole('dialog',{name:'Gerenciar vínculos de aditivos',exact:true});
    async function open(){await manager.click();await modal.getByRole('combobox',{name:/^Aditivo/}).selectOption(aditivo);}
    async function capture(name){
      if(!process.env.MEDIADOR_UI_VISUAL_DIR)return;
      const dir=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(dir,{recursive:true});
      const previous=await page.evaluate(()=>document.documentElement.dataset.theme),viewport=page.viewportSize();
      for(const theme of ['light','dark'])for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);if(name==='conflito')await modal.getByRole('button',{name:'Atualizar decisão registrada',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(dir,`aditivos-${name}-${theme}-${width}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
      await page.setViewportSize(viewport);await page.evaluate(t=>document.documentElement.dataset.theme=t,previous);
    }
    const post=async body=>page.evaluate(async({office,body})=>{
      const session=await (await fetch('/api/auth/sessao')).json();const result=await fetch('/api/contexto/vinculos',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf,'x-context-type':'escritorio','x-context-id':String(office)},body:JSON.stringify(body)});return {status:result.status,body:await result.json()};
    },{office,body});
    await open();assert.equal(await modal.getByRole('combobox',{name:/^Aditivo/}).locator('option').count(),2);
    const target=modal.getByLabel('CCT de destino'),reason=modal.getByLabel('Justificativa da decisão'),save=modal.getByRole('button',{name:'Salvar decisão',exact:true});
    assert.deepEqual(await target.locator('option').evaluateAll(items=>items.map(i=>i.value).sort()),['',base,second].sort());
    await target.selectOption(base);await reason.fill('       ');assert.equal(await save.isDisabled(),true);
    await reason.fill('  Conferido no original do aditivo.  ');await capture('decisao');
    await save.click();await modal.waitFor({state:'hidden'});
    let row=(await setup.query('SELECT * FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2',[office,aditivo])).rows[0];
    assert.equal(row.base,base);assert.equal(row.revisao,1);assert.equal(row.justificativa,'Conferido no original do aditivo.');assert.equal(row.ator_id,users.admin.id);
    await open();await modal.getByText('Revisão 1',{exact:true}).waitFor();await modal.getByText(row.justificativa,{exact:true}).waitFor();
    await reason.fill('Rascunho mantido após conferência.');
    assert.equal((await post({aditivo,base:second,justificativa:'Decisão concorrente confirmada.',revisao:1})).status,200);
    await save.click();await modal.getByRole('alert').getByText('Vínculo alterado em outra aba. Atualize antes de decidir.',{exact:true}).waitFor();
    assert.equal(await save.isDisabled(),true);assert.equal(await reason.inputValue(),'Rascunho mantido após conferência.');assert.equal(await target.inputValue(),base);
    row=(await setup.query('SELECT * FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2',[office,aditivo])).rows[0];assert.equal(row.base,second);assert.equal(row.revisao,2);await capture('conflito');
    await modal.getByRole('button',{name:'Atualizar decisão registrada',exact:true}).click();await modal.getByRole('status').waitFor();await modal.getByText('Revisão 2',{exact:true}).waitFor();
    await modal.getByText('Vinculado à CCT '+second,{exact:true}).waitFor();assert.equal(await reason.inputValue(),'Rascunho mantido após conferência.');assert.equal(await target.inputValue(),base);
    await save.click();await modal.waitFor({state:'hidden'});await page.reload();await manager.waitFor();await open();
    await modal.getByText('Revisão 3',{exact:true}).waitFor();await modal.getByText('Rascunho mantido após conferência.',{exact:true}).waitFor();
    await target.selectOption('');await reason.fill('Remoção do vínculo após revisão do original.');await save.click();await modal.waitFor({state:'hidden'});await open();await modal.getByText('Não vinculado',{exact:true}).waitFor();await modal.getByText('Revisão 4',{exact:true}).waitFor();await modal.getByLabel('Fechar modal').click();
    // Validation cannot use documents outside the office or swap base/amendment types.
    assert.equal((await post({aditivo,base:foreign,justificativa:'Destino de outro escritório.',revisao:4})).status,404);
    assert.equal((await post({aditivo:base,base:second,justificativa:'Tipo incorreto na origem.',revisao:0})).status,400);
    assert.equal((await post({aditivo,base:accord,justificativa:'Tipo incorreto no destino.',revisao:4})).status,400);
    assert.equal((await post({aditivo,base,justificativa:'       ',revisao:4})).status,400);
    row=(await setup.query('SELECT * FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2',[office,aditivo])).rows[0];assert.equal(row.base,null);assert.equal(row.revisao,4);
    assert.deepEqual((await setup.query('SELECT * FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2',[other,aditivo])).rows,isolated);
    assert.deepEqual((await setup.query('SELECT * FROM registros WHERE numero_registro=$1',[base])).rows,before);
    await page.getByRole('button',{name:'Cadastros',exact:true}).click();
    console.log('OK: aditivo real — vínculo/reabertura/remoção, justificativa/revisões/ator persistidos, conflito sem sobrescrita, atualização preserva rascunho, tipos/escopo e escritório B inalterado.');
  }finally{
    await setup.query('DELETE FROM vinculos_escritorio WHERE aditivo=$1',[aditivo]);
    await setup.query('DELETE FROM clientes_documentos WHERE numero_registro=ANY($1::text[])',[numbers]);
    await setup.query('DELETE FROM registros WHERE numero_registro=ANY($1::text[])',[numbers]);
  }
}

export async function validarPapelAditivos(page,key,office){
  await page.getByRole('button',{name:'Documentos',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Gerenciar vínculos de aditivos',exact:true}).count(),key==='support'?0:1);
  const status=await page.evaluate(async office=>{const session=await (await fetch('/api/auth/sessao')).json(),current=JSON.parse(sessionStorage.getItem('mediador_contexto'));return (await fetch('/api/contexto/vinculos',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrf,'x-context-type':'escritorio','x-context-id':String(office),...(current.concessao?{'x-support-grant':current.concessao}:{})},body:'{}'})).status;},office);
  // Read-only support must be rejected with its actual validated grant.
  assert.equal(status,key==='support'?403:400);
  await page.getByRole('button',{name:'Cadastros',exact:true}).click();
}
