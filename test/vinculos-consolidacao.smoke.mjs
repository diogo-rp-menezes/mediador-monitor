import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CAMPOS_CCT, NAO_CONSTA_CCT, validarExtracaoCct } from '../dist-historico/cct-template.js';

const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const baseURL=new URL('../dist-historico/', import.meta.url);
const loader=file=>readFileSync(new URL(file,baseURL),'utf8');
const resolverImports=source=>source.replace(/from (['"])(\.\/[^'"]+)\1/g,(_match,quote,path)=>`from ${quote}${new URL(path,baseURL).href}${quote}`);
const vinculosJs=loader('vinculos.js').replace("import { lerDocumento } from './documento.js';", "const lerDocumento=async(path)=>(await import('node:fs')).readFileSync(path,'utf8');");
const vinculos=await import(uri(vinculosJs));
let dbJs=loader('db.js').replace('import Database from "better-sqlite3";', `import Database from '${new URL('./fixtures/sqlite-smoke.mjs',import.meta.url).href}';`)
  .replace('import { env } from "./config.js";', `const env={llm:{apiKey:'',baseUrl:'http://localhost/v1',model:'mock'}};`)
  .replace("import { ErroCadastro, migrarCadastros } from './cadastros.js';", `import { ErroCadastro, migrarCadastros } from '${new URL('../dist-historico/cadastros.js',import.meta.url).href}';`)
  .replace("import { migrarOrganizacoes } from './organizacoes.js';", `import { migrarOrganizacoes } from '${new URL('../dist-historico/organizacoes.js',import.meta.url).href}';`)
  .replace("import { migrarAutenticacao } from './autenticacao.js';", `import { migrarAutenticacao } from '${new URL('../dist-historico/autenticacao.js',import.meta.url).href}';`)
  .replace("import { migrarContatosPorEscritorio } from './migracao-contatos.js';", `import { migrarContatosPorEscritorio } from '${new URL('../dist-historico/migracao-contatos.js',import.meta.url).href}';`)
  .replace("import { migrarMonitoramentosEscritorio } from './monitoramentos-escritorio.js';", `import { migrarMonitoramentosEscritorio } from '${new URL('../dist-historico/monitoramentos-escritorio.js',import.meta.url).href}';`)
  .replace("import { migrarInterpretacoes } from './migracao-interpretacoes.js';", `import { migrarInterpretacoes } from '${new URL('../dist-historico/migracao-interpretacoes.js',import.meta.url).href}';`)
  .replace("import { migrarOperacoesEscritorio } from './operacoes-escritorio.js';", `import { migrarOperacoesEscritorio } from '${new URL('../dist-historico/operacoes-escritorio.js',import.meta.url).href}';`)
  .replace('import { normalizarTipos } from "./instrumentos.js";', `import { normalizarTipos } from '${new URL('../dist-historico/instrumentos.js',import.meta.url).href}';`);
const dbApi=await import(uri(resolverImports(dbJs)));
const consJs=loader('consolidacao.js')
  .replace("import { lerLlm } from './db.js';", "const lerLlm=()=>({ativo:true,model:'mock',baseUrl:'http://localhost/v1',apiKey:''});")
  .replace("import { lerDocumento, extrairCabecalho } from './documento.js';", "const lerDocumento=async(path)=>(await import('node:fs')).readFileSync(path,'utf8'); const extrairCabecalho=text=>({dataRegistro:text.match(/DATA DE REGISTRO NO MTE: (\\d{2}\\/\\d{2}\\/\\d{4})/)?.[1]});")
  .replace("import { chat, extrairClausulas, normalizarExtracao } from './extract.js';", `import { chat, extrairClausulas, normalizarExtracao } from '${new URL('../dist-historico/extract.js',import.meta.url).href}';`)
  .replace("import { CAMPOS_CCT, NAO_CONSTA_CCT, renderizarCctMarkdown } from './cct-template.js';", `import { CAMPOS_CCT, NAO_CONSTA_CCT, renderizarCctMarkdown } from '${new URL('../dist-historico/cct-template.js',import.meta.url).href}';`)
  .replace("import { ehCct, invalidarConsolidacao } from './vinculos.js';", `const ehCct=${vinculos.ehCct.toString()}; const invalidarConsolidacao=${vinculos.invalidarConsolidacao.toString()};`)
  .replace("import { pendenciasComDecisoes } from './revisoes.js';", "const pendenciasComDecisoes=(_db,r)=>r;");
const cons=await import(uri(resolverImports(consJs)));
function ambiente(){const pasta=mkdtempSync(join(tmpdir(),'mte-cct-rel-'));const db=dbApi.openDb(join(pasta,'db.sqlite'));
  const inserir=(numero,tipo,arquivo=null,ext=null)=>db.prepare('INSERT INTO registros(numero_registro,watch,tipo,arquivo_path,extracao_json) VALUES (?,?,?,?,?)').run(numero,'SIND',tipo,arquivo,ext&&JSON.stringify(ext));
  return{db,pasta,inserir,close(){db.close();rmSync(pasta,{recursive:true,force:true});}};
}
const cct='DF001234/2026', termo='DF002345/2026', outro='DF003456/2026';
const textoAditivo='TERMO ADITIVO DE CONVENÇÃO COLETIVA\nA CONVENÇÃO COLETIVA DE TRABALHO registrada sob o número DF001234/2026 é aditada.\nCláusula 3ª O reajuste passa a ser de 6,5% a partir de 01/05/2026.';
const id=CAMPOS_CCT.find(x=>x.rotulo==='Percentual de Reajuste').id;
const vazio=()=>Object.fromEntries(CAMPOS_CCT.map(x=>[x.id,NAO_CONSTA_CCT]));

test('referência explícita vincula; cabeçalho próprio não confunde',()=>{
 assert.deepEqual(vinculos.referenciasExplicitas(textoAditivo,termo).map(x=>x.numero),[cct]);
 assert.equal(vinculos.referenciasExplicitas('TERMO ADITIVO À CONVENÇÃO COLETIVA DE TRABALHO\nNÚMERO DE REGISTRO NO MTE: DF002345/2026',termo).length,0);
 assert.equal(vinculos.referenciasExplicitas('SINDICATO EXEMPLO\nVigência 2026-2027',termo).length,0);
});
test('registro base ausente cria pendência; chegada posterior vincula automaticamente',()=>{
 const e=ambiente();try{
 e.inserir(termo,'Termo Aditivo de Convenção Coletiva');
 assert.equal(vinculos.indexarVinculo(e.db,termo,textoAditivo).status,'pendente');
 e.inserir(cct,'Convenção Coletiva');
 assert.equal(vinculos.resolverReferenciasPendentes(e.db),1);
 assert.equal(e.db.prepare('SELECT base_registro FROM vinculos_aditivos WHERE aditivo_registro=?').get(termo).base_registro,cct);
 }finally{e.close()}
});
test('sem prova explícita não inventa relação mesmo com sindicato igual',()=>{
 const e=ambiente();try{e.inserir(cct,'Convenção Coletiva');e.inserir(termo,'Termo Aditivo de Convenção Coletiva');
 const v=vinculos.indexarVinculo(e.db,termo,'Mesmas partes e mesma vigência, sem número da CCT');
 assert.equal(v.status,'pendente');assert.equal(v.base_registro,null);
 }finally{e.close()}
});
test('edição manual prevalece e invalida consolidação anterior',()=>{
 const e=ambiente();try{e.inserir(cct,'Convenção Coletiva');e.inserir(outro,'Convenção Coletiva');e.inserir(termo,'Termo Aditivo de Convenção Coletiva');
 vinculos.indexarVinculo(e.db,termo,textoAditivo);
 e.db.prepare(`INSERT INTO consolidacoes_cct(base_registro,status) VALUES (?,'consolidado')`).run(cct);
 vinculos.definirVinculo(e.db,termo,outro);
 assert.equal(e.db.prepare('SELECT status FROM consolidacoes_cct WHERE base_registro=?').get(cct).status,'desatualizado');
 assert.equal(vinculos.indexarVinculo(e.db,termo,textoAditivo).base_registro,outro);
 assert.throws(()=>vinculos.definirVinculo(e.db,termo,termo),/CCT original válida/);
 }finally{e.close()}
});
test('citação não presente no original rejeita alteração inventada',()=>{
 assert.throws(()=>cons.validarAlteracoes({alteracoes:[{campo:id,acao:'substituir',valor:'15%',clausula:'Cláusula 3ª',citacao:'passa a ser de 15%'}]},textoAditivo),/não localizada/);
 assert.throws(()=>cons.validarAlteracoes({alteracoes:[{campo:'foo',acao:'substituir',valor:'6,5%',clausula:'3',citacao:'reajuste passa a ser de 6,5%'}]},textoAditivo),/ID de campo inválido/);
});
test('consolidação registra origem sem apagar a análise da CCT',()=>{
 const padrao=validarExtracaoCct({campos:{...vazio(),[id]:'5,0%'}});
 const a={campo:id,acao:'substituir',valor:'6,5%',clausula:'Cláusula 3ª',citacao:'reajuste passa a ser de 6,5%'};
 const res=cons.aplicarAlteracoes(padrao,cct,[{numero:termo,data:'07/10/2026',alteracoes:[a]}]);
 assert.equal(res.padrao.campos[id],'6,5%');assert.equal(res.fontes[id],termo);
 assert.equal(res.historico[id][0].anterior,'5,0%');assert.equal(padrao.campos[id],'5,0%');
 assert.equal(res.pendencias.length,0);
 assert.match(cons.renderizarConsolidadoMarkdown(res),/Rastreabilidade por campo/);
});
test('duas alterações sem ordem documental verificada não sobrescrevem a base',()=>{
 const padrao=validarExtracaoCct({campos:{...vazio(),[id]:'5,0%'}});
 const f=(numero)=>({numero,data:null,alteracoes:[{campo:id,acao:'substituir',valor:'6,5%',clausula:'Cláusula 3ª',citacao:'reajuste passa a ser de 6,5%'}]});
 const res=cons.aplicarAlteracoes(padrao,cct,[f(termo),f(outro)]);
 assert.equal(res.padrao.campos[id],'5,0%');assert.equal(res.pendencias.length,2);
});
test('execução com LLM simulado persiste fonte e resultado separado',async()=>{
 const e=ambiente();const origFetch=globalThis.fetch;
 try {
  const src=join(e.pasta,'base.txt'),aditivo=join(e.pasta,'aditivo.txt');
  writeFileSync(src,'CONVENÇÃO COLETIVA DE TRABALHO. Cláusula 2ª reajuste de 5,0%.');
  writeFileSync(aditivo,`DATA DE REGISTRO NO MTE: 07/10/2026\n${textoAditivo}`);
  e.inserir(cct,'Convenção Coletiva',src,{padrao:validarExtracaoCct({campos:{...vazio(),[id]:'5,0%'}}),topicos:{}});
  e.inserir(termo,'Termo Aditivo de Convenção Coletiva',aditivo);
  vinculos.indexarVinculo(e.db,termo,textoAditivo);
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({alteracoes:[{campo:id,acao:'substituir',valor:'6,5%',clausula:'Cláusula 3ª',citacao:'reajuste passa a ser de 6,5%'}]})}}]}),{status:200});
  const res=await cons.consolidarCct(e.db,cct);
  assert.equal(res.padrao.campos[id],'6,5%');
  assert.equal(e.db.prepare('SELECT status FROM consolidacoes_cct WHERE base_registro=?').get(cct).status,'consolidado');
  assert.equal(JSON.parse(e.db.prepare('SELECT extracao_json FROM registros WHERE numero_registro=?').get(cct).extracao_json).padrao.campos[id],'5,0%');
  assert.equal(cons.lerConsolidacao(e.db,cct).status,'consolidado');
 }finally{globalThis.fetch=origFetch;e.close()}
});

test('acréscimo preserva regra anterior; revogação registra instrumento; revisão não aplica',()=>{
 const base=validarExtracaoCct({campos:{...vazio(),[id]:'5,0%'}});
 const campo2=CAMPOS_CCT.find(c=>c.rotulo==='Piso Geral').id;
 const res=cons.aplicarAlteracoes(base,cct,[{numero:termo,data:'07/10/2026',alteracoes:[
  {campo:id,acao:'acrescentar',valor:'Regra específica para novos admitidos',clausula:'Cláusula 4ª',citacao:'Regra específica para novos admitidos'},
  {campo:campo2,acao:'revogar',valor:'',clausula:'Cláusula 5ª',citacao:'A cláusula de piso geral fica expressamente revogada'}
 ]}]);
 assert.match(res.padrao.campos[id],/5,0%/);
 assert.match(res.padrao.campos[id],/Regra específica/);
 assert.match(res.padrao.campos[campo2],/Revogado expressamente/);
 assert.equal(base.campos[campo2],NAO_CONSTA_CCT);
 const r=cons.aplicarAlteracoes(base,cct,[{numero:termo,data:null,alteracoes:[
  {campo:id,acao:'revisar',valor:'nova redação incompleta',clausula:'Cláusula 3ª',citacao:'passa a ser de 6,5%'}
 ]}]);
 assert.equal(r.padrao.campos[id],'5,0%');assert.equal(r.pendencias.length,1);
});
test('identificadores do registro original são imutáveis na consolidação',()=>{
 const reg='s01_numero_do_registro_no_mte';const p=validarExtracaoCct({campos:{...vazio(),[reg]:cct}});
 const res=cons.aplicarAlteracoes(p,cct,[{numero:termo,data:null,alteracoes:[
  {campo:reg,acao:'substituir',valor:termo,clausula:'Cláusula 1ª',citacao:'texto original'}
 ]}]);
 assert.equal(res.padrao.campos[reg],cct);assert.match(res.pendencias[0],/imutável/);
});
test('UI renderiza vínculo, consolidado e status desatualizado sem exportação',async()=>{
 const vm=(await import('node:vm')).default;
 const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const start=script.indexOf('const ehCct=r=>'),end=script.indexOf('\nfunction viewRegistros()',start);
 const ctx={};vm.runInNewContext(`const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=s=>s||'—'; const S={reg:[]}; ${script.slice(start,end)}\nthis.preview=detalhe`,ctx);
 const r={numero_registro:cct,watch:'Sindicato',tipo:'Convenção Coletiva',primeira_vez:'2026-01-01',
  aditivos:[{numero:termo,status:'automatico',arquivo_path:'a.doc'}],consolidacao:{status:'desatualizado',resultado:{
    historico:{[id]:[{instrumento:termo,acao:'substituir',valor:'6,5%',citacao:'de 6,5%',clausula:'Cláusula 3ª',aplicada:true}]},
    fontes:{[id]:termo},padrao:{campos:{[id]:'6,5%'}},pendencias:[],observacao:''}},
  analise_status:'sem_analise'};
 const mark=ctx.preview(r);
 assert.match(mark,/Desatualizado/);assert.match(mark,/Consolidar com IA/);assert.match(mark,/DF002345\/2026/);
 assert.doesNotMatch(mark,/href="\/api\/consolidado\//);
 const ad=ctx.preview({...r,numero_registro:termo,tipo:'Termo Aditivo de Convenção Coletiva',aditivos:[],consolidacao:null,vinculo:{base_registro:cct,status:'automatico'}});
 assert.match(ad,/Confirmar vínculo/);assert.match(ad,/Abrir CCT/);
});



