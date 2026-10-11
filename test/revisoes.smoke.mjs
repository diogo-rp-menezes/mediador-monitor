import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { CAMPOS_CCT } from '../dist-historico/cct-template.js';
const root=new URL('../',import.meta.url);
const base='DF001000/2026',aditivo='DF001050/2026';
const campo=CAMPOS_CCT.find(c=>/insalubridade/i.test(c.rotulo)).id;
const original='Convenção coletiva. Cláusula 12: A insalubridade será calculada sobre a base X.';
const termo='Termo aditivo. Cláusula 7: O adicional de insalubridade segue novo parâmetro Y somente para cargos específicos.';
let response;
const fixture=mkdtempSync(join(tmpdir(),'cct-review-'));
const modfile=join(fixture,'revisoes.mjs');
let js=readFileSync(new URL('../dist-historico/revisoes.js',import.meta.url),'utf8');
js=js.replace("import { lerLlm } from './db.js';","const lerLlm=()=>({ativo:true,model:'mock'});")
  .replace("import { chat } from './extract.js';", "const chat=async()=>JSON.stringify(globalThis.__revisao_mock_response);")
  .replace("import { lerDocumento } from './documento.js';","const lerDocumento=async(path)=>(await import('node:fs')).readFileSync(path,'utf8');")
  .replace("import { CAMPOS_CCT } from './cct-template.js';",`import { CAMPOS_CCT } from '${new URL('../dist-historico/cct-template.js',import.meta.url).href}';`);
writeFileSync(modfile,js);
const mod=await import(pathToFileURL(modfile).href);
function ambiente(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  db.exec(`CREATE TABLE registros (numero_registro TEXT PRIMARY KEY,arquivo_path TEXT);
  CREATE TABLE consolidacoes_cct(base_registro TEXT PRIMARY KEY,status TEXT,resultado_json TEXT);`);
  // Executa literalmente o schema de migração da v0.3.9.
  const source=readFileSync(new URL('../src/db.ts',import.meta.url),'utf8');
  const ddl=source.match(/\/\/ v0\.3\.9[^]*?db\.exec\(`([^]*?)`\);/)[1];
  db.exec(ddl);
  db.transaction=fn=>()=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
  const src=join(fixture,'original.txt'),ad=join(fixture,'aditivo.txt');writeFileSync(src,original);writeFileSync(ad,termo);
  db.prepare('INSERT INTO registros(numero_registro,arquivo_path) VALUES (?,?)').run(base,src);
  db.prepare('INSERT INTO registros(numero_registro,arquivo_path) VALUES (?,?)').run(aditivo,ad);
  const res={versao:'1.0',base,aditivos:[aditivo],criadoEm:'2026-10-08',
    padrao:{versao:'1.0',campos:{[campo]:'Base X'},evidencias:{[campo]:{clausula:'12',citacao:'A insalubridade será calculada sobre a base X.'}}},
    fontes:{[campo]:base},historico:{[campo]:[{campo,instrumento:aditivo,acao:'revisar',valor:'Parâmetro Y só para cargos específicos',clausula:'7',citacao:'O adicional de insalubridade segue novo parâmetro Y somente para cargos específicos.',anterior:'Base X',posterior:'Base X',aplicada:false}]},
    pendencias:[`${campo}: conferir ${aditivo} (alteração ambígua/parcial).`],observacao:'Consolidação documental'};
  db.prepare("INSERT INTO consolidacoes_cct(base_registro,status,resultado_json) VALUES (?,'consolidado',?)").run(base,JSON.stringify(res));
  return{db,res,close:()=>db.close()};
}
const sugerido={recomendacao:'aplicar_aditivo',valor_proposto:'Parâmetro Y para os cargos especificados; base X nos demais',
  justificativa:'O trecho restringe a nova regra a cargos específicos, não se presume revogação geral.',
  evidencias:[{instrumento:aditivo,citacao:'O adicional de insalubridade segue novo parâmetro Y somente para cargos específicos.'}]};
test('validação de sugestão exige citação literal e registro de origem',()=>{
  assert.equal(mod.validarSugestao(sugerido,termo,original,aditivo,base).recomendacao,'aplicar_aditivo');
  assert.throws(()=>mod.validarSugestao({...sugerido,evidencias:[{instrumento:aditivo,citacao:'texto absolutamente inventado'}]},termo,original,aditivo,base),/não existe/);
  assert.throws(()=>mod.validarSugestao({...sugerido,evidencias:[{instrumento:'DF999999/2026',citacao:'O adicional de insalubridade segue novo parâmetro Y somente para cargos específicos.'}]},termo,original,aditivo,base),/não existe/);
});
test('sugestão assíncrona bloqueia duplicata e mantém comprovantes',async()=>{
  const e=ambiente();try{
    assert.equal(mod.reservarSugestao(e.db,base,campo,aditivo),true);
    assert.equal(mod.reservarSugestao(e.db,base,campo,aditivo),false);
    globalThis.__revisao_mock_response=sugerido;
    await mod.solicitarSugestao(e.db,base,campo,aditivo);
    const r=mod.pendenciasComDecisoes(e.db,e.res).pendenciasDetalhadas[0];
    assert.equal(r.sugestao_estado,'pronta');assert.equal(r.sugestao.recomendacao,'aplicar_aditivo');
  }finally{e.close()}
});
test('decisão manual preserva original e cria auditoria',()=>{
  const e=ambiente();try{
    mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'manual',valor:'Regra acordada na revisão jurídica',justificativa:'Conforme cotejo entre cláusulas 12 e 7',revisor:'Analista RH'});
    const consolidado=mod.pendenciasComDecisoes(e.db,e.res);
    assert.equal(consolidado.padrao.campos[campo],'Regra acordada na revisão jurídica');
    assert.equal(e.res.padrao.campos[campo],'Base X');
    assert.equal(consolidado.pendencias.length,0);
    assert.equal(mod.historicoRevisao(e.db,base,campo,aditivo).length,1);
    mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'manter',justificativa:'Efeito temporal incerto, preservar base X',revisor:'Revisora RH'});
    assert.equal(mod.pendenciasComDecisoes(e.db,e.res).padrao.campos[campo],'Base X');
    assert.equal(mod.historicoRevisao(e.db,base,campo,aditivo).length,2);
  }finally{e.close()}
});
test('aplicar sugestão exige validação da IA e aprovação humana',async()=>{
  const e=ambiente();try{
    assert.throws(()=>mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'aplicar_sugestao',justificativa:'Aprovado após revisão das cláusulas',revisor:'Pessoa'}),/Solicite/);
    mod.reservarSugestao(e.db,base,campo,aditivo);globalThis.__revisao_mock_response=sugerido;await mod.solicitarSugestao(e.db,base,campo,aditivo);
    mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'aplicar_sugestao',justificativa:'Conferi o escopo da cláusula sete',revisor:'Analista'});
    assert.equal(mod.pendenciasComDecisoes(e.db,e.res).padrao.campos[campo],sugerido.valor_proposto);
  }finally{e.close()}
});
test('mudança na fonte invalida decisão sem apagar trilha auditável',()=>{
  const e=ambiente();try{
    mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'manual',valor:'Interpretação A',justificativa:'Documento revisado por RH',revisor:'RH'});
    const novo=structuredClone(e.res);novo.historico[campo][0].citacao+=' Alteração posterior';
    const n=mod.pendenciasComDecisoes(e.db,novo);
    assert.equal(n.pendencias.length,1);assert.equal(n.pendenciasDetalhadas[0].decisao,null);
    assert.equal(mod.historicoRevisao(e.db,base,campo,aditivo).length,1);
  }finally{e.close()}
});
test('conflitos entre vários aditivos impedem precedência presumida',()=>{
  const e=ambiente();try{
    const segundo='DF001099/2026';e.db.prepare('INSERT INTO registros(numero_registro,arquivo_path) VALUES (?,?)').run(segundo,'');
    const r=structuredClone(e.res);r.aditivos.push(segundo);r.historico[campo].push({...r.historico[campo][0],instrumento:segundo});
    e.db.prepare('UPDATE consolidacoes_cct SET resultado_json=? WHERE base_registro=?').run(JSON.stringify(r),base);
    assert.throws(()=>mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'manual',valor:'Valor A',justificativa:'Decisão após revisão',revisor:'RH'}),/Mais de um aditivo/);
    assert.equal(mod.pendenciasComDecisoes(e.db,r).pendencias.length,2);
  }finally{e.close()}
});
test('UI oferece comparação, sugestão, decisão, histórico e botão por pendência',()=>{
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  for(const s of ['dlg-revisao','review-compare','Solicitar sugestão da IA','review-save','/api/pendencias/decidir','/api/pendencias/historico','data-act="abrir-pendencia"'])assert.ok(html.includes(s),s);
});
test.after(()=>rmSync(fixture,{recursive:true,force:true}));

test('selecionar trecho literal do aditivo funciona sem sugestão da IA e preserva auditoria',()=>{
  const e=ambiente();try{
    const p=mod.pendenciasComDecisoes(e.db,e.res).pendenciasDetalhadas[0];
    assert.equal(p.sugestao_estado,'nao_solicitada');
    mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'aplicar_aditivo',justificativa:'Conferi o trecho e as condições no documento integral',revisor:'Revisora RH'});
    const consolidado=mod.pendenciasComDecisoes(e.db,e.res);
    assert.equal(consolidado.padrao.campos[campo],termo.split('Cláusula 7: ')[1]);
    assert.match(consolidado.fontes[campo],/Trecho literal escolhido por revisão humana/);
    assert.equal(e.res.padrao.campos[campo],'Base X');
    assert.equal(consolidado.pendencias.length,0);
    const audit=mod.historicoRevisao(e.db,base,campo,aditivo);
    assert.equal(JSON.parse(audit[0].decisao_json).acao,'aplicar_aditivo');
  } finally {e.close()}
});
test('redação clicável da UI distingue original, aditivo, IA e opção personalizada',()=>{
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  for(const marker of ['review-select','data-choice="manter"','data-choice="aplicar_aditivo"','data-choice="aplicar_sugestao"','value="manual"','reviewDraft','Adotar trecho literal do aditivo'])
    assert.ok(html.includes(marker),marker);
  assert.ok(html.includes("acao==='aplicar_aditivo'&&!confirm"),'confirmação humana específica');
});
test('trecho do aditivo não pode ser aplicado quando está vazio ou não fundamentado',()=>{
  const e=ambiente();try {
    const r=structuredClone(e.res);r.historico[campo][0].citacao='';
    e.db.prepare('UPDATE consolidacoes_cct SET resultado_json=? WHERE base_registro=?').run(JSON.stringify(r),base);
    assert.throws(()=>mod.salvarDecisao(e.db,{base,campo,aditivo,acao:'aplicar_aditivo',justificativa:'Conferi integralmente o documento',revisor:'RH'}),/Trecho do aditivo inválido/);
  } finally {e.close()}
});

