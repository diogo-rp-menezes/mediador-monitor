import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const a=js.indexOf('function rgAnaliseEstado('),b=js.indexOf('/* ---------- Sindicatos (CRUD) ---------- */',a);
assert.ok(a>0&&b>a);
const ctx={};
const helpers=`const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const D=s=>new Date(s.replace(' ','T')+'Z');const fmt=s=>s||'—';
const S={reg:[],q:'',watch:'',tipo:'',estado:'',periodo:'',ordenacao:'recentes',regTab:'geral',open:null};
const ehCct=r=>/conven[çc][ãa]o coletiva/i.test(r.tipo||'')&&!/termo aditivo/i.test(r.tipo||'');
const ehAditivo=r=>/termo aditivo/i.test(r.tipo||'')&&/conven[çc][ãa]o coletiva/i.test(r.tipo||'');
function painelRelacoes(r){return '<div>Vínculo '+esc(r.numero_registro)+'</div>'};`;
vm.runInNewContext(helpers+'\n'+js.slice(a,b)+'\nthis.api={S,viewRegistros,rgEstado,rgPendencias,rgDetalhe,rgAcaoAnalise}',ctx);
const {S,viewRegistros,rgEstado,rgPendencias,rgDetalhe,rgAcaoAnalise}=ctx.api;
const cct=(n,extras={})=>({numero_registro:n,numero_solicitacao:'MR01234/2026',tipo:'Convenção Coletiva',watch:'Consulta DF',partes:'Sindicato dos Trabalhadores',vigencia:'01/03/2026 - 28/02/2028',primeira_vez:'2026-10-08 01:30:00',arquivo_path:'/tmp/a.doc',analise_status:'sem_analise',...extras});

test('nova UI não usa tabela expansível; renderiza master/detail e cinco áreas',()=>{
  S.reg=[cct('DF000490/2026')];const out=viewRegistros();
  assert.match(out,/rg-list-scroll/);assert.match(out,/rg-detail/);assert.doesNotMatch(out,/tr class="item"/);
  for(const text of ['Visão geral','Documento original','Análise por IA','CCT e termos aditivos','Pendências de revisão'])assert.ok(out.includes(text),text);
});
test('KPI calcula números da resposta da API, sem dados de demonstração',()=>{
  S.reg=[cct('DF000490/2026'),cct('DF000491/2026',{analise_status:'analisado'}),cct('DF000492/2026',{analise_status:'analisado',consolidacao:{status:'consolidado',resultado:{pendenciasDetalhadas:[]}}})];
  const out=viewRegistros();assert.match(out,/Total carregado<\/small><strong>3<\/strong>/);
  assert.match(out,/Com análise por IA<\/small><strong>2<\/strong>/);
  assert.match(out,/Consolidados<\/small><strong>1<\/strong>/);
  assert.doesNotMatch(out,/>248</);
});
test('a busca, filtro de análise e período limitam a lista',()=>{
  S.reg=[cct('DF000490/2026'),cct('DF000491/2026',{analise_status:'analisado',partes:'Outro sindicato'})];
  S.q='Outro sindicato';S.estado='analisado';assert.match(viewRegistros(),/1 registro\(s\)/);
  S.q='';S.estado='sem_analise';assert.match(viewRegistros(),/1 registro\(s\)/);
  S.estado='';S.periodo='7';S.reg=S.reg.map(r=>({...r,primeira_vez:'2020-01-01 00:00:00'}));assert.match(viewRegistros(),/0 registro\(s\)/);
  S.periodo='';
});
test('escapa dados do registro antes de gerar HTML',()=>{
  S.reg=[cct('DF000490/2026',{partes:'<img src=x onerror=alert(1)>'})];const out=viewRegistros();
  assert.match(out,/&lt;img/);assert.doesNotMatch(out,/<img src=x/);
});
test('análise em andamento bloqueia botão e não falsifica conclusão',()=>{
  const r=cct('DF000490/2026',{analise_status:'analisando'});
  assert.match(rgAcaoAnalise(r),/disabled/);assert.match(rgAcaoAnalise(r),/Analisando…/);
  assert.equal(rgEstado(r)[0],'Analisando');
});
test('sem arquivo bloqueia análise e oferece estado de download pendente',()=>{
  const r=cct('DF000490/2026',{arquivo_path:null});
  assert.match(rgAcaoAnalise(r),/disabled/);assert.equal(rgEstado(r)[0],'Arquivo pendente');
});
test('revisões contabilizam apenas conflitos ainda não resolvidos',()=>{
  const r=cct('DF000490/2026',{consolidacao:{status:'consolidado',resultado:{pendenciasDetalhadas:[{campo:'a'},{campo:'b',decisao:'manter'}]}}});
  assert.equal(rgPendencias(r).length,1);assert.match(rgDetalhe(r),/Revisão pendente/);
  S.regTab='pendencias';assert.match(rgDetalhe(r),/Revisar conflito/);assert.match(rgDetalhe(r),/Ver decisão/);
  S.regTab='geral';
});
test('aditivo mantém navegação para vínculo sem aba de pendências de CCT',()=>{
  const r=cct('DF001234/2026',{tipo:'Termo Aditivo de Convenção Coletiva'});
  assert.match(rgDetalhe(r),/Vínculo da CCT/);assert.doesNotMatch(rgDetalhe(r),/data-rgt="pendencias" class=/);
});
test('ações existentes continuam disponíveis nas abas próprias',()=>{
  const r=cct('DF000490/2026',{analise_status:'analisado',extracao:{secoes:[]},consolidacao:{status:'consolidado',resultado:{pendenciasDetalhadas:[],historico:{}}}});
  S.regTab='analise';assert.match(rgDetalhe(r),/data-act="reanalisar"/);assert.match(rgDetalhe(r),/api\/relatorio/);
  S.regTab='geral';assert.match(rgDetalhe(r),/api\/arquivo/);assert.match(rgDetalhe(r),/api\/consolidado/);
});
