/** Teste sem dependências npm: node --test test/template-cct.smoke.mjs (após build). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_CCT, SECOES_CCT, NAO_CONSTA_CCT, validarExtracaoCct, renderizarCctMarkdown } from '../dist/cct-template.js';
import { extrairClausulas, normalizarExtracao, paraVisao } from '../dist/extract.js';

const campo = nome => CAMPOS_CCT.find(x=>x.rotulo===nome)?.id;
const vazio = ()=>Object.fromEntries(CAMPOS_CCT.map(x=>[x.id,NAO_CONSTA_CCT]));
const llm = {ativo:true, model:'mock',baseUrl:'http://localhost/v1',apiKey:''};

test('template possui 9 seções, 60 campos sem duplicatas',()=>{
 assert.equal(SECOES_CCT.length,9);
 assert.equal(CAMPOS_CCT.length,60);
 assert.equal(new Set(CAMPOS_CCT.map(c=>c.id)).size,60);
});
test('não inventa dados omitidos pelo modelo',()=>{
 assert.throws(()=>validarExtracaoCct({campos:{}}),/60 campo\(s\) ausente/);
});
test('mantém valores textuais e ausência literal no relatório',()=>{
 const campos=vazio();campos[campo('Piso Geral')]='R$ 1.750,68';campos[campo('Pisos por Função / Cargo')]='Atendente: R$ 1.820,00\nGerente: R$ 2.400,00';
 const a=validarExtracaoCct({campos});
 const md=renderizarCctMarkdown(a);
 assert.match(md,/Piso Geral:\*\* R\$ 1.750,68/);
 assert.match(md,/  - Atendente: R\$ 1.820,00/);
 assert.match(md,/  - Gerente: R\$ 2.400,00/);
 assert.match(md,/Foro \/ Solução de Conflitos:\*\* Não consta na CCT/);
 assert.equal((md.match(/^## /gm)||[]).length,9);
 assert.equal((md.match(/^- \*\*/gm)||[]).length,60);
});
test('LLM compatível OpenAI: parse JSON, exibição e exportação',async()=>{
 const oldFetch=globalThis.fetch;
 const campos=vazio();campos[campo('Percentual de Reajuste')]='5,2%';
 globalThis.fetch=async (_url,opt)=>{
  const req=JSON.parse(opt.body); assert.match(req.messages[0].content,/60 campos/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({campos,evidencias:{[campo('Percentual de Reajuste')]:{clausula:'Cláusula 3ª',citacao:'5,2%'}}})}}]}),{status:200});
 };
 try {
  const ext=await extrairClausulas('TEXTO ORIGINAL DA CCT',llm,{vigencia:'injetada pelo portal'});
  assert.equal(ext.padrao.campos[campo('Percentual de Reajuste')],'5,2%');
  assert.equal(ext.padrao.campos[campo('Vigência')],NAO_CONSTA_CCT);
  assert.equal(ext.padrao.evidencias[campo('Percentual de Reajuste')].clausula,'Cláusula 3ª');
  const view=paraVisao(normalizarExtracao(ext));
  assert.equal(view.secoes.length,9);
 } finally {globalThis.fetch=oldFetch;}
});
test('documentos longos são rejeitados sem truncamento silencioso',async()=>{
 await assert.rejects(extrairClausulas('a'.repeat(150001),llm),/excede/);
});
test('dados legados continuam disponíveis',()=>{
 const old=normalizarExtracao({pisoSalarial:'R$ 1.750,68',observacoes:'conferir'});
 assert.equal(paraVisao(old).itens.find(x=>x.id==='pisoSalarial').resumo,'R$ 1.750,68');
});
