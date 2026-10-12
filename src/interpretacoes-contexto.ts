import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Db } from './db.js';
import { ErroCadastro } from './cadastros.js';
import { arquivoPermitido, hashBytes, type Relatorio } from './relatorios.js';
import { ehCct, ehAditivoCct } from './vinculos.js';
import { aplicarAlteracoes, validarAlteracoes, type ResultadoConsolidado } from './consolidacao.js';
import { validarExtracaoCct, CAMPOS_CCT } from './cct-template.js';
import { lerDocumento } from './documento.js';
import { obterDocumentoContexto } from './documentos-contexto.js';
import { normalizarExtracao,paraVisao } from './extract.js';
import type { Extracao } from './types.js';

type Documento={numero_registro:string;tipo:string;vigencia:string;arquivo_path:string|null;arquivo_hash:string|null;extracao_json:string|null;analise_status:string;analise_concluida_em:string|null};
type Vinculo={aditivo:string;base:string|null;justificativa:string;revisao:number};
type Revisao={campo:string;aditivo:string;acao:'manter'|'manual'|'aplicar_aditivo';valor:string;justificativa:string;revisor:string;ator_id:number};
type Resultado=ResultadoConsolidado & {pendenciasDetalhadas?:Array<Record<string,unknown>>};
type Salvo={entrada_hash:string;resultado_json:string;revisoes_json:string;versao:string};
export const NumeroSchema=z.string().trim().min(1).max(100);

export function documentoEscritorio(db:Db,office:number,numero:string):Documento {
  const row=db.prepare(`SELECT r.* FROM registros r WHERE r.numero_registro=? AND EXISTS (
    SELECT 1 FROM clientes_documentos d JOIN clientes c ON c.id=d.cliente_id
    WHERE d.numero_registro=r.numero_registro AND c.escritorio_id=?)`).get(numero,office) as Documento|undefined;
  if(!row)throw new ErroCadastro('Documento não encontrado neste escritório.',404);
  return row;
}
export function catalogoDocumentos(db:Db,office:number) {
  return db.prepare(`SELECT r.numero_registro,r.tipo,min(c.id) AS cliente_original_id,
    (r.arquivo_path IS NOT NULL AND r.arquivo_hash IS NOT NULL) AS original_disponivel
    FROM registros r JOIN clientes_documentos d ON d.numero_registro=r.numero_registro
    JOIN clientes c ON c.id=d.cliente_id WHERE c.escritorio_id=?
    GROUP BY r.numero_registro,r.tipo,r.arquivo_path,r.arquivo_hash ORDER BY r.numero_registro`).all(office);
}
export function detalheInstrumento(db:Db,office:number,numero:string) {
  documentoEscritorio(db,office,numero);
  const row=db.prepare(`SELECT numero_registro,numero_solicitacao,tipo,vigencia,partes,
    analise_status,analise_concluida_em,extracao_json FROM registros WHERE numero_registro=?`).get(numero) as Record<string,unknown>;
  const {extracao_json,...details}=row;
  const analise=extracao_json?JSON.parse(String(extracao_json)):null;
  return {...details,analise,analise_visao:paraVisao(normalizarExtracao(analise))};
}
function vinculos(db:Db,office:number,base:string) {
  return db.prepare('SELECT aditivo,base,justificativa,revisao FROM vinculos_escritorio WHERE escritorio_id=? AND base=? ORDER BY aditivo').all(office,base) as Vinculo[];
}
function original(row:Documento) {
  if(!row.arquivo_path)throw new ErroCadastro('Baixe e analise os originais antes de consolidar.',409);
  const path=arquivoPermitido(row.arquivo_path),bytes=readFileSync(path);
  if(!row.arquivo_hash||hashBytes(bytes)!==row.arquivo_hash)throw new ErroCadastro('Original alterado ou sem integridade confirmada.',409);
  return {path,bytes,hash:row.arquivo_hash};
}
function entrada(db:Db,office:number,base:string) {
  const links=vinculos(db,office,base),docs=[base,...links.map(v=>v.aditivo)].map(n=>documentoEscritorio(db,office,n));
  if(!ehCct(docs[0].tipo))throw new ErroCadastro('Selecione uma CCT original.',400);
  if(links.length>12)throw new ErroCadastro('Mais de 12 aditivos exigem revisão em lotes.',409);
  const arquivos=docs.map(original);
  const hash=hashBytes(JSON.stringify({office,links,docs:docs.map((d,i)=>({numero:d.numero_registro,tipo:d.tipo,
    hash:arquivos[i].hash,extracao:d.extracao_json,status:d.analise_status}))}));
  return {docs,arquivos,hash};
}
function salvo(db:Db,office:number,base:string) {
  return db.prepare('SELECT * FROM interpretacoes_escritorio WHERE escritorio_id=? AND base=?').get(office,base) as Salvo|undefined;
}
export function vistaInterpretacao(db:Db,office:number,base:string) {
  documentoEscritorio(db,office,base);
  const row=salvo(db,office,base);
  let atual=false;
  if(row)try{atual=entrada(db,office,base).hash===row.entrada_hash;}catch{/* Permite consultar histórico sem autorizar exportação obsoleta. */}
  return {base,vinculos:vinculos(db,office,base),versao:row?.versao??null,desatualizado:!!row&&!atual,
    resultado:row?JSON.parse(row.resultado_json) as Resultado:null,
    revisoes:row?JSON.parse(row.revisoes_json) as Revisao[]:[],
    historico:db.prepare('SELECT versao,criado_em,ator_id FROM versoes_interpretacao WHERE escritorio_id=? AND base=? ORDER BY id DESC LIMIT 30').all(office,base)};
}
export const VinculoSchema=z.object({aditivo:NumeroSchema,base:NumeroSchema.nullable(),justificativa:z.string().trim().min(8).max(2000),revisao:z.number().int().nonnegative()}).strict();
export function salvarVinculoContexto(db:Db,office:number,ator:number,raw:unknown) {
  const d=VinculoSchema.parse(raw);
  if(!ehAditivoCct(documentoEscritorio(db,office,d.aditivo).tipo))throw new ErroCadastro('Selecione um termo aditivo de CCT.',400);
  if(d.base&&!ehCct(documentoEscritorio(db,office,d.base).tipo))throw new ErroCadastro('Selecione uma CCT original.',400);
  const old=db.prepare('SELECT revisao FROM vinculos_escritorio WHERE escritorio_id=? AND aditivo=?').get(office,d.aditivo) as {revisao:number}|undefined;
  if((old?.revisao??0)!==d.revisao)throw new ErroCadastro('Vínculo alterado em outra aba. Atualize antes de decidir.',409);
  db.prepare(`INSERT INTO vinculos_escritorio(escritorio_id,aditivo,base,justificativa,ator_id) VALUES (?,?,?,?,?)
    ON CONFLICT(escritorio_id,aditivo) DO UPDATE SET base=excluded.base,justificativa=excluded.justificativa,
    ator_id=excluded.ator_id,revisao=revisao+1,atualizado_em=datetime('now')`).run(office,d.aditivo,d.base,d.justificativa,ator);
  return d;
}
export function listarVinculosContexto(db:Db,office:number) {
  return db.prepare(`SELECT v.aditivo,v.base,v.justificativa,v.revisao FROM vinculos_escritorio v WHERE v.escritorio_id=?
    AND EXISTS(SELECT 1 FROM clientes_documentos d JOIN clientes c ON c.id=d.cliente_id WHERE c.escritorio_id=v.escritorio_id AND d.numero_registro=v.aditivo)`).all(office);
}
function persistir(db:Db,office:number,base:string,hash:string,result:Resultado,revisoes:Revisao[],ator:number) {
  const resultado=JSON.stringify(result),revs=JSON.stringify(revisoes),versao=hashBytes(JSON.stringify({office,base,hash,resultado,revs}));
  db.prepare(`INSERT INTO interpretacoes_escritorio(escritorio_id,base,entrada_hash,resultado_json,revisoes_json,versao) VALUES (?,?,?,?,?,?)
    ON CONFLICT(escritorio_id,base) DO UPDATE SET entrada_hash=excluded.entrada_hash,resultado_json=excluded.resultado_json,
    revisoes_json=excluded.revisoes_json,versao=excluded.versao,atualizado_em=datetime('now')`).run(office,base,hash,resultado,revs,versao);
  db.prepare('INSERT OR IGNORE INTO versoes_interpretacao(escritorio_id,base,versao,resultado_json,ator_id) VALUES (?,?,?,?,?)').run(office,base,versao,resultado,ator);
  return versao;
}
/** Preparação sem rede: só extração pública já concluída; nenhuma decisão global é consultada. */
export async function prepararConsolidacaoContexto(db:Db,office:number,base:string) {
  const e=entrada(db,office,base),anterior=salvo(db,office,base)?.versao??null;
  const analises=e.docs.map(d=>{
    if(d.analise_status!=='analisado'||!d.extracao_json)throw new ErroCadastro('Solicite a análise pública dos originais antes de consolidar.',409);
    return JSON.parse(d.extracao_json) as Extracao;
  });
  if(!analises[0].padrao)throw new ErroCadastro('A CCT precisa da extração estruturada.',409);
  const termos=[];
  for(let i=1;i<e.docs.length;i++) {
    if(!analises[i].aditivo)throw new ErroCadastro('Aditivo precisa de extração concluída.',409);
    const texto=await lerDocumento(e.arquivos[i].path);
    // Sem cronologia comprovada, o motor abre pendências; nunca presume ordem pelo número.
    termos.push({numero:e.docs[i].numero_registro,data:null,alteracoes:validarAlteracoes(analises[i].aditivo,texto)});
  }
  const resultado=aplicarAlteracoes(validarExtracaoCct(analises[0].padrao),base,termos);
  return {gravar(ator:number) {
    if(entrada(db,office,base).hash!==e.hash||(salvo(db,office,base)?.versao??null)!==anterior)
      throw new ErroCadastro('Entradas ou revisão alteradas durante a consolidação. Atualize.',409);
    // Repetir a consolidação sem mudar entradas não apaga decisões humanas.
    if(salvo(db,office,base)?.entrada_hash===e.hash)return anterior!;
    return persistir(db,office,base,e.hash,resultado,[],ator);
  }};
}
export const RevisaoSchema=z.object({base:NumeroSchema,campo:z.string().min(1).max(150),aditivo:NumeroSchema,
  acao:z.enum(['manter','manual','aplicar_aditivo']),valor:z.string().trim().max(3000).default(''),
  justificativa:z.string().trim().min(8).max(2500),versao:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function revisarContexto(db:Db,office:number,ator:{usuario_id:number;nome:string},raw:unknown) {
  const d=RevisaoSchema.parse(raw),row=salvo(db,office,d.base),e=entrada(db,office,d.base);
  if(!row||row.versao!==d.versao||row.entrada_hash!==e.hash)throw new ErroCadastro('Consolidação desatualizada. Atualize antes de revisar.',409);
  const result=JSON.parse(row.resultado_json) as Resultado,lista=result.historico[d.campo]??[],item=lista.find(i=>i.instrumento===d.aditivo&&!i.aplicada);
  if(!item)throw new ErroCadastro('Pendência não encontrada.',404);
  if(d.acao!=='manter'&&(lista.filter(i=>!i.aplicada).length>1||['s01_numero_do_registro_no_mte','s01_codigo_da_solicitacao_mediador'].includes(d.campo)))
    throw new ErroCadastro('Conflito de ordem ou identificador: preserve a regra original.',409);
  const revisoes=(JSON.parse(row.revisoes_json) as Revisao[]).filter(r=>!(r.campo===d.campo&&r.aditivo===d.aditivo));
  const valor=d.acao==='manter'?item.anterior:d.acao==='aplicar_aditivo'?item.valor:d.valor;
  if(!valor.trim())throw new ErroCadastro('Informe o texto da decisão.',400);
  const revisao:Revisao={campo:d.campo,aditivo:d.aditivo,acao:d.acao,valor,justificativa:d.justificativa,revisor:ator.nome,ator_id:ator.usuario_id};
  revisoes.push(revisao);
  result.padrao.campos[d.campo]=valor;result.fontes[d.campo]=d.acao==='manter'?d.base:d.aditivo;
  if(d.acao!=='manter'){
    result.padrao.evidencias??={};
    result.padrao.evidencias[d.campo]={clausula:item.clausula,citacao:item.citacao.slice(0,200)};
  }
  result.pendencias=Object.entries(result.historico).flatMap(([campo,itens])=>itens.filter(i=>!i.aplicada&&!revisoes.some(r=>r.campo===campo&&r.aditivo===i.instrumento)).map(i=>`${campo}: conferir ${i.instrumento}.`));
  result.pendenciasDetalhadas=revisoes.map(r=>({...r,decisao:r.acao,valor_decidido:r.valor,rotulo:CAMPOS_CCT.find(c=>c.id===r.campo)?.rotulo??r.campo}));
  const versao=persistir(db,office,d.base,e.hash,result,revisoes,ator.usuario_id);
  return {versao,revisao};
}
export function relatorioContexto(db:Db,office:number,cliente:number,base:string):Relatorio {
  const e=entrada(db,office,base),row=salvo(db,office,base);
  if(!row||row.entrada_hash!==e.hash)throw new ErroCadastro('Atualize a consolidação deste escritório.',409);
  for(const d of e.docs)obterDocumentoContexto(db,office,cliente,d.numero_registro);
  const resultado=JSON.parse(row.resultado_json) as Resultado;
  if(resultado.pendencias.length)throw new ErroCadastro('Resolva as pendências antes de exportar.',409);
  return {numero:base,base,tipo:e.docs[0].tipo,vigencia:e.docs[0].vigencia,versao:row.versao,
    analise:JSON.parse(e.docs[0].extracao_json!) as Extracao,consolidado:resultado,analisado_em:e.docs[0].analise_concluida_em??'',
    arquivos:e.docs.map((d,i)=>({numero:d.numero_registro,path:e.arquivos[i].path,nome:d.numero_registro,hash:e.arquivos[i].hash,bytes:e.arquivos[i].bytes.length}))};
}
