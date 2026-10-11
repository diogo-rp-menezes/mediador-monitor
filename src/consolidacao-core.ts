import {CAMPOS_CCT,NAO_CONSTA_CCT,renderizarCctMarkdown,type PadraoCct} from './cct-template.js';
export type Acao = 'substituir'|'acrescentar'|'revogar'|'revisar';
export interface Alteracao {
  campo: string; acao: Acao; valor: string; clausula: string; citacao: string;
}
export interface HistoricoCampo extends Alteracao {
  instrumento: string; anterior: string; posterior: string; aplicada: boolean;
}
export interface ResultadoConsolidado {
  versao: '1.0'; base: string; aditivos: string[]; criadoEm: string;
  padrao: PadraoCct;
  fontes: Record<string,string>;
  historico: Record<string,HistoricoCampo[]>;
  pendencias: string[];
  observacao: string;
}

const apenasTexto=(x:unknown):x is string=>typeof x==='string' && !!x.trim();
const compact=(x:string)=>x.replace(/\s+/g,' ').trim().toLowerCase();

/** Uma referência de fonte textual não pode ser fabricada pela IA. */
export function validarAlteracoes(raw:unknown,texto:string):Alteracao[] {
  if(!raw || typeof raw!=='object') throw new Error('Resposta do aditivo não contém JSON.');
  const arr=(raw as {alteracoes?:unknown}).alteracoes;
  if(!Array.isArray(arr) || arr.length===0) throw new Error('A IA não identificou alterações verificáveis no aditivo. Revisão manual necessária.');
  const ids=new Set(CAMPOS_CCT.map(c=>c.id));const vistos=new Set<string>();
  if(arr.length>CAMPOS_CCT.length) throw new Error('A IA retornou alterações excessivas.');
  return arr.map((r:unknown)=>{
    if(!r || typeof r!=='object') throw new Error('Alteração inválida.');
    const a=r as Record<string,unknown>;
    if(!apenasTexto(a.campo)||!ids.has(a.campo)||vistos.has(a.campo))throw new Error('ID de campo inválido ou duplicado na resposta do aditivo.');
    vistos.add(a.campo);
    if(!['substituir','acrescentar','revogar','revisar'].includes(String(a.acao)))throw new Error('Ação de alteração desconhecida.');
    if(!apenasTexto(a.citacao) || a.citacao.trim().length<8 || !compact(texto).includes(compact(a.citacao)))
      throw new Error(`Citação não localizada no aditivo para ${a.campo}. A análise não foi aplicada.`);
    if(!apenasTexto(a.clausula)) throw new Error(`Cláusula de origem ausente em ${a.campo}.`);
    if(a.acao!=='revogar' && (!apenasTexto(a.valor) || a.valor===NAO_CONSTA_CCT))
      throw new Error(`Valor novo ausente para ${a.campo}.`);
    return {campo:a.campo,acao:a.acao as Acao,valor:apenasTexto(a.valor)?a.valor.trim():'',clausula:a.clausula.trim(),citacao:a.citacao.trim().slice(0,450)};
  });
}

/** Consolidação determinística com proveniência por campo; nunca altera extracao_json dos instrumentos. */
export function aplicarAlteracoes(base:PadraoCct,numeroBase:string, termos:{numero:string;data:string|null;alteracoes:Alteracao[]}[]):ResultadoConsolidado {
  const campos={...base.campos}, evidencias={...base.evidencias};
  const fontes=Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,numeroBase]));
  const historico:Record<string,HistoricoCampo[]>={};
  const pendencias:string[]=[];
  const datas=termos.map(t=>dataISO(t.data));
  const possuiCronologia=termos.length<=1||(datas.every(Boolean)&&new Set(datas).size===datas.length);
  // Quando há várias alterações do mesmo campo sem ordem documental, não presumir qual é a última.
  const camposIdentidade=new Set(['s01_numero_do_registro_no_mte','s01_codigo_da_solicitacao_mediador']);
  const frequencia=new Map<string,number>();
  for(const t of termos)for(const a of t.alteracoes)frequencia.set(a.campo,(frequencia.get(a.campo)??0)+1);
  for(const t of termos) {
    for(const a of t.alteracoes) {
      const antes=campos[a.campo]??NAO_CONSTA_CCT;
      const conflito=!possuiCronologia&&(frequencia.get(a.campo)??0)>1;
      let depois=antes;
      let aplicada=false;
      if(conflito||a.acao==='revisar'||camposIdentidade.has(a.campo)) {
        pendencias.push(`${a.campo}: conferir ${t.numero}${camposIdentidade.has(a.campo)?' (identificador da CCT original é imutável)':conflito?' (ordem entre aditivos não comprovada)':' (alteração ambígua/parcial)'}.`);
      } else if (a.acao==='revogar') {
        depois=`Revogado expressamente pelo termo aditivo ${t.numero}.`;
        aplicada=true;
      } else if (a.acao==='substituir') {
        depois=a.valor;aplicada=true;
      } else if (a.acao==='acrescentar') {
        depois=antes===NAO_CONSTA_CCT ? a.valor : `${antes}\n[Complemento do termo ${t.numero}] ${a.valor}`;
        aplicada=true;
      }
      if(aplicada) {
        campos[a.campo]=depois;
        fontes[a.campo]=t.numero;
        evidencias[a.campo]={clausula:a.clausula,citacao:a.citacao.slice(0,200)};
      }
      (historico[a.campo]??=[]).push({...a,instrumento:t.numero,anterior:antes,posterior:depois,aplicada});
    }
  }
  return {versao:'1.0',base:numeroBase,aditivos:termos.map(t=>t.numero),criadoEm:new Date().toISOString(),
    padrao:{...base,campos,evidencias},fontes,historico,pendencias,
    observacao:'Consolidação documental assistida por IA. Apenas alterações com evidência literal são aplicadas; confirme eficácia temporal, representatividade e interpretação jurídica nos originais.'};
}
function dataISO(d:string|null):string {if(!d)return '';const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';}
export function renderizarConsolidadoMarkdown(resultado:ResultadoConsolidado):string {
  const lista=resultado.aditivos.map(i=>`- ${i}`).join('\n');
  const hist=Object.entries(resultado.historico).flatMap(([campo,items])=>items.map(a=>
    `- **${campo}** · ${a.instrumento} · ${a.acao}${a.aplicada?' (aplicada)':' (revisão necessária)'}\n  - Cláusula: ${a.clausula}\n  - Citação: ${a.citacao.replace(/\n/g,' ')}\n  - Antes: ${a.anterior.replace(/\n/g,' | ')}\n  - Depois: ${a.posterior.replace(/\n/g,' | ')}`)).join('\n');
  return `# CCT consolidada — ${resultado.base}\n\n**CCT original:** ${resultado.base}\n\n**Aditivos vinculados:**\n${lista}\n\n${resultado.observacao}\n\n${renderizarCctMarkdown(resultado.padrao)}\n## Rastreabilidade por campo\n\n${hist}\n\n## Decisões humanas de revisão

${((resultado as ResultadoConsolidado & {pendenciasDetalhadas?:import('./revisoes.js').PendenciaDetalhada[]}).pendenciasDetalhadas||[]).filter(p=>p.decisao).map(p=>`- **${p.rotulo}** (${p.instrumento}): ${p.decisao}. Responsável: ${p.revisor}. Justificativa: ${p.justificativa}. ${p.valor_decidido ? 'Valor decidido: '+p.valor_decidido : 'Regra existente preservada.'}`).join('\n')||'Nenhuma decisão humana registrada.'}

## Pendências de revisão

${resultado.pendencias.length?resultado.pendencias.map(x=>'- '+x).join('\n'):'Nenhuma pendência sinalizada pela consolidação automática.'}\n`;
}

