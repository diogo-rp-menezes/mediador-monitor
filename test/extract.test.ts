import { afterEach, describe, expect, it, vi } from 'vitest';
import { extrairClausulas, normalizarExtracao, paraVisao } from '../src/extract.js';
import { CAMPOS_CCT, NAO_CONSTA_CCT } from '../src/cct-template.js';
const cfg={ativo:true,baseUrl:'http://x/v1',apiKey:'',model:'m'};
afterEach(()=>vi.unstubAllGlobals());
describe('extração IA v1',()=>{
 it('aplica o template sem preencher vigência usando apenas contexto externo do portal',async()=>{
  const campos=Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,NAO_CONSTA_CCT]));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({campos})}}]}))));
  const e=await extrairClausulas('Documento',cfg,{vigencia:'01/05/2026 - 30/04/2028'});
  expect(e?.padrao?.campos[CAMPOS_CCT.find(c=>c.rotulo==='Vigência')!.id]).toBe(NAO_CONSTA_CCT);
 });
 it('continua exibindo o formato legado',()=>{
  const e=normalizarExtracao({pisoSalarial:'R$ 1.750,68',reajusteSalarialPercentual:'4,5%',observacoes:'ok'});
  const v=paraVisao(e)!;
  expect(v.itens.find(i=>i.id==='reajuste')).toMatchObject({resumo:'4,5%'});
  expect(v.observacoes).toEqual(['ok']);
 });
});
