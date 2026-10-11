import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import type { Db, LlmConfig } from './db.js';
import { lerLlm } from './db.js';
import { lerDocumento, extrairCabecalho } from './documento.js';
import { chat, extrairClausulas, normalizarExtracao } from './extract.js';
import { CAMPOS_CCT, NAO_CONSTA_CCT, renderizarCctMarkdown, type PadraoCct } from './cct-template.js';
import { ehCct, invalidarConsolidacao } from './vinculos.js';
import { pendenciasComDecisoes } from './revisoes.js';

import { aplicarAlteracoes, validarAlteracoes, renderizarConsolidadoMarkdown, type Acao, type Alteracao, type HistoricoCampo, type ResultadoConsolidado } from './consolidacao-core.js';
export { aplicarAlteracoes, validarAlteracoes, renderizarConsolidadoMarkdown, type Acao, type Alteracao, type HistoricoCampo, type ResultadoConsolidado } from './consolidacao-core.js';
type DocRow = {numero_registro:string; tipo:string; arquivo_path:string|null; arquivo_hash:string|null; extracao_json?:string|null;};
export async function extrairAlteracoesAditivo(texto:string,cfg:LlmConfig):Promise<Alteracao[]> {
  if(texto.length>150000)throw new Error('Aditivo muito extenso: exige análise por partes para não omitir alterações.');
  const prompt=`Você compara um TERMO ADITIVO DE CONVENÇÃO COLETIVA com o contrato original, sem interpretar leis externas.
Retorne JSON estrito com {"alteracoes":[{"campo":"id_do_template","acao":"substituir|acrescentar|revogar|revisar","valor":"texto ou regra do aditivo","clausula":"Cláusula n","citacao":"trecho literal exato do aditivo"}]}.
Ações: substituir SÓ quando o texto expressamente der nova redação integral à regra; acrescentar para regras adicionais (sem apagar a antiga); revogar para revogação expressa; revisar se a alteração for parcial, ambígua, condicionada ou faltar certeza quanto ao efeito.
Não liste campos não alterados. Não invente valores, prazos, números, vigências nem fontes. O campo "citacao" DEVE ser literalmente encontrado no documento. Se houver texto ambíguo, use revisar; não apresente conclusão automática.
IDs permitidos:\n${CAMPOS_CCT.map(c=>`${c.id}: ${c.rotulo}`).join('\n')}`;
  const saida=await chat(cfg,prompt,`TERMO ADITIVO ORIGINAL:\n${texto}`);
  let parsed:unknown;try{parsed=JSON.parse(saida.match(/\{[\s\S]*\}/)?.[0]??saida);}catch{throw new Error('Resposta do aditivo não é JSON válido.');}
  return validarAlteracoes(parsed,texto);
}

function dataISO(d:string|null):string {if(!d)return '';const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';}
const hashCache=new Map<string,{mtime:number;size:number;hash:string}>();
function hashArquivo(path:string):string {
  const info=statSync(path);const old=hashCache.get(path);
  if(old&&old.mtime===info.mtimeMs&&old.size===info.size)return old.hash;
  const hash=createHash('sha256').update(readFileSync(path)).digest('hex');
  hashCache.set(path,{mtime:info.mtimeMs,size:info.size,hash});
  return hash;
}
export function fingerprintDocumentos(rows:DocRow[]):string {
  return createHash('sha256').update(rows.map(r=>`${r.numero_registro}:${r.arquivo_path && existsSync(r.arquivo_path)?hashArquivo(r.arquivo_path):'ausente'}`).join('|')).digest('hex');
}
function documentosRelacionados(db:Db,numero:string):DocRow[] {
  const base=db.prepare('SELECT numero_registro,tipo,arquivo_path,arquivo_hash,extracao_json FROM registros WHERE numero_registro=?').get(numero) as DocRow|undefined;
  if(!base||!ehCct(base.tipo))throw new Error('Selecione uma Convenção Coletiva original.');
  const aditivos=db.prepare(`SELECT r.numero_registro,r.tipo,r.arquivo_path,r.arquivo_hash,r.extracao_json FROM registros r
    JOIN vinculos_aditivos v ON v.aditivo_registro=r.numero_registro
    WHERE v.base_registro=? AND v.status IN ('automatico','confirmado') ORDER BY r.numero_registro`).all(numero) as DocRow[];
  if(aditivos.length===0)throw new Error('Esta CCT ainda não possui termos aditivos vinculados.');
  if(aditivos.length>12)throw new Error('Mais de 12 aditivos: divida a consolidação em lotes revisados.');
  for(const d of [base,...aditivos])if(!d.arquivo_path||!existsSync(d.arquivo_path))throw new Error(`Documento de ${d.numero_registro} não localizado. Baixe o arquivo antes da consolidação.`);
  return [base,...aditivos];
}
export function validarProntidao(db:Db,numero:string):void {
  documentosRelacionados(db,numero);
  const cfg=lerLlm(db);
  if(!cfg.ativo||!cfg.model)throw new Error('Configure um LLM ativo para consolidar.');
}
export function reservarConsolidacao(db:Db,base:string):boolean {
  db.prepare(`INSERT OR IGNORE INTO consolidacoes_cct(base_registro,status) VALUES (?,'sem_analise')`).run(base);
  return db.prepare(`UPDATE consolidacoes_cct SET status='consolidando',erro=NULL,iniciado_em=datetime('now'),atualizado_em=datetime('now')
    WHERE base_registro=? AND status<>'consolidando'`).run(base).changes===1;
}
export async function consolidarCct(db:Db, numero:string):Promise<ResultadoConsolidado> {
  // Reserva antes do primeiro await: bloqueio para múltiplas abas.
  const docs=documentosRelacionados(db,numero);
  const cfg=lerLlm(db);
  if(!cfg.ativo||!cfg.model)throw new Error('Configure um LLM ativo.');
  if(!reservarConsolidacao(db,numero))throw new Error('Consolidação já em andamento.');
  try {
    const textoBase=await lerDocumento(docs[0].arquivo_path!);
    const atual=docs[0].extracao_json?normalizarExtracao(JSON.parse(docs[0].extracao_json)):null;
    const base=atual?.padrao??(await extrairClausulas(textoBase,cfg))?.padrao;
    if(!base)throw new Error('Falha na extração dos 60 campos da CCT original.');
    const termos=[] as {numero:string;data:string|null;alteracoes:Alteracao[]}[];
    for(const d of docs.slice(1)) {
      const texto=await lerDocumento(d.arquivo_path!);
      const cab=extrairCabecalho(texto);
      const analisado=d.extracao_json?normalizarExtracao(JSON.parse(d.extracao_json)):null;
      // Reutiliza a extração individual do aditivo SOMENTE quando o arquivo não foi substituído.
      const reutilizar=!!(analisado?.aditivo?.alteracoes?.length && d.arquivo_hash && d.arquivo_hash===hashArquivo(d.arquivo_path!));
      const alteracoes=reutilizar
        ? validarAlteracoes({alteracoes:analisado!.aditivo!.alteracoes},texto)
        : await extrairAlteracoesAditivo(texto,cfg);
      termos.push({numero:d.numero_registro,data:cab.dataRegistro??null,alteracoes});
    }
    termos.sort((a,b)=>dataISO(a.data).localeCompare(dataISO(b.data))||a.numero.localeCompare(b.numero));
    const resultado=aplicarAlteracoes(base,numero,termos);
    const fingerprint=fingerprintDocumentos(docs);
    db.prepare(`UPDATE consolidacoes_cct SET status='consolidado', resultado_json=?, entrada_hash=?,erro=NULL, atualizado_em=datetime('now')
      WHERE base_registro=?`).run(JSON.stringify(resultado),fingerprint,numero);
    return resultado;
  } catch(e) {
    db.prepare(`UPDATE consolidacoes_cct SET status='falhou',erro=?,atualizado_em=datetime('now') WHERE base_registro=?`)
      .run((e as Error).message.slice(0,2000),numero);
    throw e;
  }
}
export function lerConsolidacao(db:Db,numero:string):{status:string;erro:string|null;resultado:ResultadoConsolidado|null}|null {
  const row=db.prepare('SELECT status,erro,resultado_json,entrada_hash FROM consolidacoes_cct WHERE base_registro=?').get(numero) as
    {status:string;erro:string|null;resultado_json:string|null;entrada_hash:string|null}|undefined;
  if(!row)return null;
  let status=row.status;
  if(status==='consolidado') {
    try{if(fingerprintDocumentos(documentosRelacionados(db,numero))!==row.entrada_hash){status='desatualizado';invalidarConsolidacao(db,numero);}}
    catch{status='desatualizado';invalidarConsolidacao(db,numero);}
  }
  return {status,erro:row.erro,resultado:row.resultado_json ? (status==='consolidado' ? pendenciasComDecisoes(db,JSON.parse(row.resultado_json) as ResultadoConsolidado) : JSON.parse(row.resultado_json) as ResultadoConsolidado) : null};
}

