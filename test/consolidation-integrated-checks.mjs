import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {validarRelatoriosPublicacoes} from './reports-publications-integrated-checks.mjs';
import {CAMPOS_CCT,NAO_CONSTA_CCT} from '../dist/cct-template.js';

export async function validarConsolidacaoIntegrada(page,setup,{office,other,customer,users}){
  assert.match((await setup.query('SELECT current_database() nome')).rows[0].nome,/^mediador_https_test_[a-f0-9]{32}$/);
  const base='DF999981/2026',aditivo='DF999982/2026',root=resolve('data'),dir=mkdtempSync(join(root,'ui-consolidation-test-'));
  const fields=CAMPOS_CCT.filter(f=>!f.id.startsWith('s01_')).slice(0,3),label=id=>{const text=id.replace(/^s\d+_/,'').replaceAll('_',' ');return text.charAt(0).toUpperCase()+text.slice(1);};
  const changes=fields.map((f,i)=>({campo:f.id,acao:'revisar',valor:'Regra proposta '+i,clausula:'Cláusula '+(i+1),citacao:'Trecho literal para conferir a regra '+i+'.'}));
  const pattern={versao:'1.0.0',campos:{...Object.fromEntries(CAMPOS_CCT.map(f=>[f.id,NAO_CONSTA_CCT])),...Object.fromEntries(fields.map((f,i)=>[f.id,'Regra anterior '+i]))}};
  async function api(path,body,officeId=office){return page.evaluate(async({path,body,officeId})=>{const session=await (await fetch('/api/auth/sessao')).json();const res=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-csrf-token':session.csrf,'x-context-type':'escritorio','x-context-id':String(officeId)},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};},{path,body,officeId});}
  const panel=page.locator('.consolidation-panel');
  const read=async()=>(await setup.query('SELECT * FROM interpretacoes_escritorio WHERE escritorio_id=$1 AND base=$2',[office,base])).rows[0];
  const modal=page.getByRole('dialog',{name:/^Revisar /});
  async function open(index){await panel.getByRole('button',{name:'Revisar '+label(fields[index].id),exact:true}).click();}
  async function save(){await modal.getByRole('button',{name:'Registrar revisão',exact:true}).click();await modal.waitFor({state:'hidden'});await panel.getByRole('button',{name:'Consolidar neste escritório',exact:true}).waitFor();}
  async function capture(name){
    if(!process.env.MEDIADOR_UI_VISUAL_DIR)return;
    const out=resolve(process.env.MEDIADOR_UI_VISUAL_DIR);mkdirSync(out,{recursive:true});const theme=await page.evaluate(()=>document.documentElement.dataset.theme),viewport=page.viewportSize();
    for(const variant of ['light','dark'])for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,variant);if(name==='conflito')await modal.getByRole('button',{name:'Consultar versão atual',exact:true}).scrollIntoViewIfNeeded();else await panel.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,`consolidacao-${name}-${variant}-${width}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    await page.setViewportSize(viewport);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  }
  try{
    for(const [number,type,extraction,text] of [[base,'Convenção Coletiva',{padrao:pattern},'CCT original sintética.'],[aditivo,'Termo Aditivo de Convenção Coletiva',{aditivo:{versao:'1.0',alteracoes:changes}},changes.map(c=>c.citacao).join('\n')]]){
      const file=join(dir,number===base?'base.doc':'aditivo.doc'),bytes=Buffer.from('<html><head><meta charset="utf-8"></head><body><p>'+text+'</p></body></html>');writeFileSync(file,bytes);
      await setup.query("INSERT INTO registros(numero_registro,watch,tipo,vigencia,arquivo_path,arquivo_hash,extracao_json,analise_status,analise_concluida_em) VALUES($1,'fixture-consolidacao',$2,'',$3,$4,$5::jsonb,'analisado',now())",[number,type,file,createHash('sha256').update(bytes).digest('hex'),JSON.stringify(extraction)]);
      await setup.query("INSERT INTO clientes_documentos(escritorio_id,cliente_id,numero_registro,status,motivo,contexto_hash) VALUES($1,$2,$3,'confirmado','Fixture consolidação',$4)",[office,customer,number,'a'.repeat(64)]);
    }
    await setup.query('INSERT INTO vinculos_escritorio(escritorio_id,aditivo,base,justificativa,ator_id) VALUES($1,$2,$3,$4,$5)',[office,aditivo,base,'Vínculo conferido para consolidação.',users.admin.id]);
    const originals=(await setup.query('SELECT * FROM registros WHERE numero_registro=ANY($1::text[]) ORDER BY numero_registro',[[base,aditivo]])).rows;
    await page.getByRole('button',{name:'Documentos',exact:true}).click();await page.getByRole('button',{name:'Revisões',exact:true}).click();await page.getByRole('combobox',{name:/^CCT para revisão/}).selectOption(base);
    await panel.getByText('Não gerada',{exact:true}).waitFor();await panel.getByRole('button',{name:'Consolidar neste escritório',exact:true}).click();await panel.getByText('Há pendências que impedem os relatórios finais e a publicação.',{exact:true}).waitFor();
    assert.equal((await api('/api/contexto/publicacoes',{cliente_id:customer,base})).status,409);
    for(const format of ['pdf','md'])assert.equal((await api('/api/contexto/relatorio?base='+encodeURIComponent(base)+'&cliente='+customer+'&formato='+format)).status,409);
    let row=await read();assert.equal(row.resultado_json.pendencias.length,3);const version0=row.versao;await capture('pendencias');
    assert.equal(await panel.getByRole('button',{name:'Baixar relatório MD',exact:true}).count(),0);
    await open(0);await modal.getByLabel('Justificativa da revisão').fill('        ');assert.equal(await modal.getByRole('button',{name:'Registrar revisão',exact:true}).isDisabled(),true);
    await modal.getByLabel('Justificativa da revisão').fill('Manter a regra original após conferir.');await save();row=await read();assert.equal(row.resultado_json.pendencias.length,2);assert.equal(row.resultado_json.padrao.campos[fields[0].id],'Regra anterior 0');assert.notEqual(row.versao,version0);
    // Open a draft on one version; a concurrent client resolves a different field.
    await open(1);await modal.getByRole('combobox',{name:/^Decisão/}).selectOption('manual');await modal.getByLabel('Texto da regra revisada').fill('   ');await modal.getByLabel('Justificativa da revisão').fill('Texto revisto após conferir o original.');assert.equal(await modal.getByRole('button',{name:'Registrar revisão',exact:true}).isDisabled(),true);
    await modal.getByLabel('Texto da regra revisada').fill('  Regra manual conferida.  ');
    const concurrent=await api('/api/contexto/revisoes',{base,campo:fields[2].id,aditivo,acao:'aplicar_aditivo',valor:'',justificativa:'Aplicar a regra extraída após conferir.',versao:row.versao});assert.equal(concurrent.status,200);
    const afterConcurrent=await read();assert.equal(afterConcurrent.resultado_json.pendencias.length,1);assert.equal(afterConcurrent.resultado_json.padrao.campos[fields[2].id],'Regra proposta 2');
    await modal.getByRole('button',{name:'Registrar revisão',exact:true}).click();await modal.getByRole('alert').getByText('Consolidação desatualizada. Atualize antes de revisar.',{exact:true}).waitFor();
    assert.equal(await modal.getByLabel('Texto da regra revisada').inputValue(),'  Regra manual conferida.  ');assert.equal(await modal.getByRole('button',{name:'Registrar revisão',exact:true}).isDisabled(),true);assert.deepEqual(await read(),afterConcurrent);await capture('conflito');
    await modal.getByRole('button',{name:'Consultar versão atual',exact:true}).click();await modal.waitFor({state:'hidden'});await open(1);
    await modal.getByRole('combobox',{name:/^Decisão/}).selectOption('manual');await modal.getByLabel('Texto da regra revisada').fill('  Regra manual conferida.  ');await modal.getByLabel('Justificativa da revisão').fill('  Texto revisto na versão atual.  ');await save();
    row=await read();assert.equal(row.resultado_json.pendencias.length,0);assert.equal(row.resultado_json.padrao.campos[fields[1].id],'Regra manual conferida.');assert.deepEqual(row.revisoes_json.map(r=>r.acao).sort(),['aplicar_aditivo','manter','manual']);assert.ok(row.revisoes_json.every(r=>r.ator_id===users.admin.id));
    await panel.getByRole('button',{name:'Baixar relatório MD',exact:true}).waitFor();await capture('decidida');
    const finalVersion=row.versao;await page.reload();await page.getByRole('button',{name:'Revisões',exact:true}).click();await page.getByRole('combobox',{name:/^CCT para revisão/}).selectOption(base);await panel.getByRole('button',{name:'Baixar relatório MD',exact:true}).waitFor();assert.equal((await read()).versao,finalVersion);
    assert.equal((await setup.query('SELECT count(*)::int n FROM versoes_interpretacao WHERE escritorio_id=$1 AND base=$2',[office,base])).rows[0].n,4);
    await validarRelatoriosPublicacoes(page,setup,{office,other,customer,base,aditivo,version:finalVersion});
    assert.equal((await api('/api/contexto/interpretacoes?base='+encodeURIComponent(base),undefined,other)).status,404);
    await setup.query('UPDATE vinculos_escritorio SET revisao=revisao+1 WHERE escritorio_id=$1 AND aditivo=$2',[office,aditivo]);await panel.getByRole('button',{name:'Atualizar versão',exact:true}).click();await panel.getByText('A consolidação está desatualizada. Atualize antes de revisar ou exportar.',{exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:/^Revisar /}).count(),0);assert.equal(await panel.getByRole('button',{name:'Baixar relatório MD',exact:true}).count(),0);
    assert.equal((await api('/api/contexto/revisoes',{base,campo:fields[0].id,aditivo,acao:'manter',valor:'',justificativa:'Revisão antiga deve ser recusada.',versao:finalVersion})).status,409);assert.equal((await read()).versao,finalVersion);
    assert.deepEqual((await setup.query('SELECT * FROM registros WHERE numero_registro=ANY($1::text[]) ORDER BY numero_registro',[[base,aditivo]])).rows,originals);
    await page.getByRole('button',{name:'Cadastros',exact:true}).click();
    console.log('OK: consolidação real — manter/aplicar/manual, pendências 3→2→1→0, versões/histórico/ator persistidos, 409 sem sobrescrita, recarga, alteração de vínculo bloqueia revisão/relatório e originais inalterados.');
  }finally{
    // Publication snapshots and their append-only audit remain until this disposable database is dropped.
    await setup.query('DELETE FROM versoes_interpretacao WHERE escritorio_id=$1 AND base=$2',[office,base]);await setup.query('DELETE FROM interpretacoes_escritorio WHERE escritorio_id=$1 AND base=$2',[office,base]);await setup.query('DELETE FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2',[office,aditivo]);await setup.query('DELETE FROM clientes_documentos WHERE numero_registro=ANY($1::text[])',[[base,aditivo]]);await setup.query('DELETE FROM registros WHERE numero_registro=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM publicacoes_documentos p WHERE p.base=registros.numero_registro)',[[base,aditivo]]);
    assert.equal(resolve(dir).startsWith(root+sep),true);assert.match(dir.split(sep).at(-1),/^ui-consolidation-test-/);rmSync(dir,{recursive:true,force:true});
  }
}
