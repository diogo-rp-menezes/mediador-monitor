import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { z } from 'zod';
import type { Pool,PoolClient,QueryResultRow } from 'pg';
import { ErroCadastro } from './cadastros.js';
import { arquivoPermitido,hashBytes } from './relatorio-core.js';
import { extrairCabecalho,lerDocumento } from './documento.js';
import { aplicarAlteracoes,renderizarConsolidadoMarkdown,validarAlteracoes,type ResultadoConsolidado } from './consolidacao-core.js';
import { ehAditivoCct,ehCct } from './vinculos.js';
import { CAMPOS_CCT,validarExtracaoCct } from './cct-template.js';
import { withPostgresOfficeTransaction, withPostgresTransaction } from './postgres-transaction.js';
import type {Relatorio} from './relatorio-core.js';
import type {Extracao} from './types.js';

type JsonRecord=Record<string,unknown>;
type Link={aditivo:string;base:string|null;justificativa:string;revisao:number};
type Doc={numero_registro:string;tipo:string;vigencia?:string;arquivo_path:string|null;arquivo_hash:string|null;extracao_json:unknown;analise_status:string;analise_concluida_em:string|null};
const parseJson=<T>(value:unknown):T=>typeof value==='string'?JSON.parse(value) as T:value as T;
const ReviewSchema=z.object({base:z.string().trim().min(1).max(100),campo:z.string().min(1).max(150),
  aditivo:z.string().trim().min(1).max(100),acao:z.enum(['manter','manual','aplicar_aditivo']),
  valor:z.string().trim().max(3000).default(''),justificativa:z.string().trim().min(8).max(2500),
  versao:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type Revision={campo:string;aditivo:string;acao:'manter'|'manual'|'aplicar_aditivo';valor:string;justificativa:string;revisor:string;ator_id:number};
type ConsolidatedResult=ResultadoConsolidado&{pendenciasDetalhadas?:Array<Record<string,unknown>>};
function validarArquivo(doc:Doc){
  if(!doc.arquivo_path)throw new ErroCadastro(`Documento de ${doc.numero_registro} não localizado. Baixe o arquivo antes da consolidação.`,409);
  const path=arquivoPermitido(doc.arquivo_path),bytes=readFileSync(path),hash=hashBytes(bytes);
  if(!doc.arquivo_hash||hash!==doc.arquivo_hash)throw new ErroCadastro(`Original de ${doc.numero_registro} alterado ou sem integridade confirmada.`,409);
  return {path,bytes,hash};
}

async function input(client:PoolClient,office:number,base:string){
  const baseResult=await client.query<Doc&QueryResultRow>(`SELECT r.numero_registro,r.tipo,r.arquivo_path,r.arquivo_hash,r.extracao_json,r.analise_status,r.analise_concluida_em
    FROM registros r WHERE r.numero_registro=$1 AND EXISTS(SELECT 1 FROM clientes_documentos d WHERE d.escritorio_id=$2 AND d.numero_registro=r.numero_registro)
    FOR SHARE OF r`,[base,office]);
  const baseDoc=baseResult.rows[0];
  if(!baseDoc)throw new ErroCadastro('CCT não encontrada neste escritório.',404);
  if(!ehCct(baseDoc.tipo))throw new ErroCadastro('Selecione uma CCT original.',400);
  const linkResult=await client.query<Link&QueryResultRow>(`SELECT v.aditivo,v.base,v.justificativa,v.revisao FROM vinculos_escritorio v
    WHERE v.escritorio_id=$1 AND v.base=$2 AND EXISTS(SELECT 1 FROM clientes_documentos d WHERE d.escritorio_id=$1 AND d.numero_registro=v.aditivo)
    ORDER BY v.aditivo FOR SHARE OF v`,[office,base]);
  const links=linkResult.rows;
  if(!links.length)throw new ErroCadastro('Esta CCT ainda não possui termos aditivos vinculados.',409);
  if(links.length>12)throw new ErroCadastro('Mais de 12 aditivos: divida a consolidação em lotes revisados.',409);
  const numbers=[base,...links.map(link=>link.aditivo)];
  const docsResult=await client.query<Doc&QueryResultRow>(`SELECT r.numero_registro,r.tipo,r.arquivo_path,r.arquivo_hash,r.extracao_json,r.analise_status,r.analise_concluida_em
    FROM registros r WHERE r.numero_registro=ANY($1::text[]) AND EXISTS(SELECT 1 FROM clientes_documentos d WHERE d.escritorio_id=$2 AND d.numero_registro=r.numero_registro)
    FOR SHARE OF r`,[numbers,office]);
  const map=new Map(docsResult.rows.map(doc=>[doc.numero_registro,doc]));
  const docs=numbers.map(number=>map.get(number));
  if(docs.some(doc=>!doc))throw new ErroCadastro('Um dos documentos vinculados não está disponível neste escritório.',404);
  const complete=docs as Doc[];
  if(!complete.slice(1).every(doc=>ehAditivoCct(doc.tipo)))throw new ErroCadastro('O vínculo contém documento que não é termo aditivo de CCT.',409);
  const files=complete.map(validarArquivo);
  for(const doc of complete)if(doc.analise_status!=='analisado'||!doc.extracao_json)
    throw new ErroCadastro(`Solicite a análise pública de ${doc.numero_registro} antes da consolidação.`,409);
  const fingerprint=hashBytes(JSON.stringify({office,links,docs:complete.map((doc,index)=>({numero:doc.numero_registro,tipo:doc.tipo,
    hash:files[index].hash,extracao:doc.extracao_json,status:doc.analise_status}))}));
  return {docs:complete,links,files,fingerprint};
}

async function gerarResultado(data:Awaited<ReturnType<typeof input>>,base:string):Promise<ResultadoConsolidado>{
  const extractions=data.docs.map(doc=>parseJson<JsonRecord>(doc.extracao_json));
  const basePattern=extractions[0].padrao;
  if(!basePattern)throw new ErroCadastro('A CCT precisa da extração estruturada antes da consolidação.',409);
  const terms=[] as {numero:string;data:string|null;alteracoes:ReturnType<typeof validarAlteracoes>}[];
  for(let index=1;index<data.docs.length;index++){
    const extraction=extractions[index].aditivo as {alteracoes?:unknown}|undefined;
    if(!extraction?.alteracoes)throw new ErroCadastro(`Solicite a análise do aditivo ${data.docs[index].numero_registro} antes da consolidação.`,409);
    const text=await lerDocumento(data.files[index].path);
    terms.push({numero:data.docs[index].numero_registro,data:extrairCabecalho(text).dataRegistro??null,
      alteracoes:validarAlteracoes({alteracoes:extraction.alteracoes},text)});
  }
  terms.sort((a,b)=>(a.data??'').localeCompare(b.data??'')||a.numero.localeCompare(b.numero));
  return aplicarAlteracoes(validarExtracaoCct(basePattern),base,terms);
}

export async function vistaInterpretacaoPostgres(pool:Pool,office:number,base:string){
  return withPostgresOfficeTransaction(pool,office,client=>vistaInterpretacaoNoCliente(client,office,base));
}

async function vistaInterpretacaoNoCliente(client:PoolClient,office:number,base:string){
  const result=await client.query(`SELECT entrada_hash,resultado_json,revisoes_json,versao,atualizado_em FROM interpretacoes_escritorio WHERE escritorio_id=$1 AND base=$2`,[office,base]);
  const row=result.rows[0];let stale=false;
  if(row){
    try{const current=(await input(client,office,base)).fingerprint;stale=current!==row.entrada_hash;}
    catch{stale=true;}
  }else{
    // Validate that the base belongs to this office even before the first interpretation exists.
    const visible=await client.query('SELECT 1 FROM clientes_documentos WHERE escritorio_id=$1 AND numero_registro=$2 LIMIT 1',[office,base]);
    if(!visible.rowCount)throw new ErroCadastro('Documento não encontrado neste escritório.',404);
  }
  const links=await client.query('SELECT aditivo,base,justificativa,revisao FROM vinculos_escritorio WHERE escritorio_id=$1 AND base=$2 ORDER BY aditivo',[office,base]);
  const history=await client.query('SELECT versao,criado_em,ator_id FROM versoes_interpretacao WHERE escritorio_id=$1 AND base=$2 ORDER BY id DESC LIMIT 30',[office,base]);
  return {base,vinculos:links.rows,versao:row?.versao??null,desatualizado:!!row&&stale,
    resultado:row?parseJson(row.resultado_json):null,revisoes:row?parseJson(row.revisoes_json):[],historico:history.rows};
}

export async function consolidarInterpretacaoPostgres(pool:Pool,office:number,base:string,actorId:number,audit?:(client:PoolClient,details:Record<string,unknown>)=>Promise<void>){
  return withPostgresOfficeTransaction(pool,office,async client=>{
    await client.query('SELECT pg_advisory_xact_lock($1,hashtext($2))',[817204618,`${office}:${base}`]);
    const current=await client.query<JsonRecord&QueryResultRow>('SELECT entrada_hash,versao FROM interpretacoes_escritorio WHERE escritorio_id=$1 AND base=$2 FOR UPDATE',[office,base]);
    const data=await input(client,office,base);
    if(current.rows[0]?.entrada_hash===data.fingerprint)return current.rows[0].versao;
    const result=await gerarResultado(data,base),resultJson=JSON.stringify(result),revisionsJson='[]';
    const version=hashBytes(JSON.stringify({office,base,hash:data.fingerprint,resultado:resultJson,revs:revisionsJson}));
    await client.query(`INSERT INTO interpretacoes_escritorio(escritorio_id,base,entrada_hash,resultado_json,revisoes_json,versao)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6) ON CONFLICT(escritorio_id,base) DO UPDATE SET entrada_hash=excluded.entrada_hash,
      resultado_json=excluded.resultado_json,revisoes_json=excluded.revisoes_json,versao=excluded.versao,atualizado_em=now()`,
    [office,base,data.fingerprint,resultJson,revisionsJson,version]);
    await client.query(`INSERT INTO versoes_interpretacao(escritorio_id,base,versao,resultado_json,ator_id)
      VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(escritorio_id,base,versao) DO NOTHING`,[office,base,version,resultJson,actorId]);
    await audit?.(client,{base,versao:version});
    return version;
  });
}

export async function revisarInterpretacaoPostgres(pool:Pool,office:number,actor:{usuario_id:number;nome:string},raw:unknown,audit?:(client:PoolClient,details:Record<string,unknown>)=>Promise<void>){
  const data=ReviewSchema.parse(raw);
  return withPostgresOfficeTransaction(pool,office,async client=>{
    const row=await client.query<JsonRecord&QueryResultRow>('SELECT entrada_hash,resultado_json,revisoes_json,versao FROM interpretacoes_escritorio WHERE escritorio_id=$1 AND base=$2 FOR UPDATE',[office,data.base]);
    const saved=row.rows[0];if(!saved)throw new ErroCadastro('Consolide os documentos antes de revisar.',404);
    const current=await input(client,office,data.base);
    if(saved.versao!==data.versao||saved.entrada_hash!==current.fingerprint)throw new ErroCadastro('Consolidação desatualizada. Atualize antes de revisar.',409);
    const result=parseJson<ConsolidatedResult>(saved.resultado_json),items=result.historico[data.campo]??[];
    const item=items.find(entry=>entry.instrumento===data.aditivo&&!entry.aplicada);
    if(!item)throw new ErroCadastro('Pendência não encontrada.',404);
    if(data.acao!=='manter'&&(items.filter(entry=>!entry.aplicada).length>1||['s01_numero_do_registro_no_mte','s01_codigo_da_solicitacao_mediador'].includes(data.campo)))
      throw new ErroCadastro('Conflito de ordem ou identificador: preserve a regra original.',409);
    const revisions=parseJson<Revision[]>(saved.revisoes_json).filter(revision=>!(revision.campo===data.campo&&revision.aditivo===data.aditivo));
    const value=data.acao==='manter'?item.anterior:data.acao==='aplicar_aditivo'?item.valor:data.valor;
    if(!value.trim())throw new ErroCadastro('Informe o texto da decisão.',400);
    const revision:Revision={campo:data.campo,aditivo:data.aditivo,acao:data.acao,valor:value,justificativa:data.justificativa,revisor:actor.nome,ator_id:actor.usuario_id};
    revisions.push(revision);
    result.padrao.campos[data.campo]=value;result.fontes[data.campo]=data.acao==='manter'?data.base:data.aditivo;
    if(data.acao!=='manter'){
      result.padrao.evidencias??={};result.padrao.evidencias[data.campo]={clausula:item.clausula,citacao:item.citacao.slice(0,200)};
    }
    result.pendencias=Object.entries(result.historico).flatMap(([field,history])=>history.filter(entry=>!entry.aplicada&&
      !revisions.some(savedRevision=>savedRevision.campo===field&&savedRevision.aditivo===entry.instrumento)).map(entry=>`${field}: conferir ${entry.instrumento}.`));
    result.pendenciasDetalhadas=revisions.map(savedRevision=>({...savedRevision,decisao:savedRevision.acao,valor_decidido:savedRevision.valor,
      rotulo:CAMPOS_CCT.find(field=>field.id===savedRevision.campo)?.rotulo??savedRevision.campo}));
    const resultJson=JSON.stringify(result),revisionsJson=JSON.stringify(revisions);
    const version=hashBytes(JSON.stringify({office,base:data.base,hash:current.fingerprint,resultado:resultJson,revs:revisionsJson}));
    await client.query(`UPDATE interpretacoes_escritorio SET resultado_json=$1::jsonb,revisoes_json=$2::jsonb,versao=$3,atualizado_em=now()
      WHERE escritorio_id=$4 AND base=$5`,[resultJson,revisionsJson,version,office,data.base]);
    await client.query(`INSERT INTO versoes_interpretacao(escritorio_id,base,versao,resultado_json,ator_id)
      VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(escritorio_id,base,versao) DO NOTHING`,[office,data.base,version,resultJson,actor.usuario_id]);
    const savedRevision={versao:version,revisao:revision};
    await audit?.(client,savedRevision);
    return savedRevision;
  });
}

export async function exportarMarkdownInterpretacaoPostgres(pool:Pool,office:number,clientId:number,base:string){
  return withPostgresOfficeTransaction(pool,office,async client=>{
  const view=await vistaInterpretacaoNoCliente(client,office,base);
  const result=view.resultado as ConsolidatedResult|null;
  if(!result||!view.versao||view.desatualizado)throw new ErroCadastro('Atualize a consolidação deste escritório antes de exportar.',409);
  if(result.pendencias.length)throw new ErroCadastro('Resolva as pendências antes de exportar.',409);
  const customer=await client.query<{razao_social:string;cnpj:string}&QueryResultRow>(
    'SELECT razao_social,cnpj FROM clientes WHERE id=$1 AND escritorio_id=$2',[clientId,office]);
  const customerData=customer.rows[0];if(!customerData)throw new ErroCadastro('Cliente não encontrado neste escritório.',404);
  const required=[base,...result.aditivos];
  const visible=await client.query('SELECT numero_registro FROM clientes_documentos WHERE cliente_id=$1 AND escritorio_id=$2 AND numero_registro=ANY($3::text[])',[clientId,office,required]);
  if(new Set(visible.rows.map(row=>row.numero_registro)).size!==new Set(required).size)
    throw new ErroCadastro('O cliente não possui acesso a todos os documentos desta consolidação.',404);
  return {nome:`${base.replace(/[^a-z0-9_-]/gi,'_')}.md`,versao:view.versao,bytes:Buffer.from(
    `# ${customerData.razao_social} (${customerData.cnpj})\n\nVersão: ${view.versao}\n\n${renderizarConsolidadoMarkdown(result)}`,'utf8')};
  });
}

/** Builds a tenant/client-scoped PDF input and an immutable fingerprint for publication revalidation. */
export async function prepararRelatorioPublicacaoPostgres(pool:Pool,office:number,clientId:number,base:string):Promise<{relatorio:Relatorio;cliente:{razao_social:string;cnpj:string};fingerprint:string;versao_interpretacao:string|null}>{
  return withPostgresOfficeTransaction(pool,office,async client=>{
  const customer=await client.query<{razao_social:string;cnpj:string}&QueryResultRow>('SELECT razao_social,cnpj FROM clientes WHERE id=$1 AND escritorio_id=$2 AND ativo=true',[clientId,office]);
  const cliente=customer.rows[0];if(!cliente)throw new ErroCadastro('Cliente não encontrado ou inativo neste escritório.',404);
  const visible=await client.query(`SELECT r.numero_registro,r.tipo,r.vigencia,r.arquivo_path,r.arquivo_hash,r.extracao_json,r.analise_status,r.analise_concluida_em
    FROM registros r JOIN clientes_documentos d ON d.numero_registro=r.numero_registro
    WHERE d.escritorio_id=$1 AND d.cliente_id=$2 AND r.numero_registro=$3`,[office,clientId,base]);
  const originalDoc=visible.rows[0] as Doc|undefined;
  if(!originalDoc)throw new ErroCadastro('Documento não encontrado para este cliente.',404);
  if(!ehCct(originalDoc.tipo))throw new ErroCadastro('A publicação precisa ser baseada em uma CCT original.',400);
  const linked=await client.query<Link&QueryResultRow>('SELECT aditivo,base,justificativa,revisao FROM vinculos_escritorio WHERE escritorio_id=$1 AND base=$2 ORDER BY aditivo',[office,base]);
  const docs=linked.rowCount?await input(client,office,base):null;
  const sourceDocs=docs?.docs??[originalDoc],files=docs?.files??[validarArquivo(originalDoc)];
  for(const document of sourceDocs)if(document.analise_status!=='analisado'||!document.extracao_json)throw new ErroCadastro(`A análise de ${document.numero_registro} precisa estar concluída.`,409);
  const access=await client.query('SELECT numero_registro FROM clientes_documentos WHERE escritorio_id=$1 AND cliente_id=$2 AND numero_registro=ANY($3::text[])',[office,clientId,sourceDocs.map(document=>document.numero_registro)]);
  if(new Set(access.rows.map(row=>row.numero_registro)).size!==new Set(sourceDocs.map(document=>document.numero_registro)).size)throw new ErroCadastro('O cliente não tem acesso a todos os documentos deste relatório.',404);
  const interpretation=linked.rowCount?await vistaInterpretacaoNoCliente(client,office,base):null;
  if(interpretation&&(interpretation.desatualizado||!interpretation.resultado||!interpretation.versao))throw new ErroCadastro('Atualize a consolidação deste escritório antes de publicar.',409);
  const consolidated=interpretation?.resultado as ConsolidatedResult|null;
  if(consolidated?.pendencias.length)throw new ErroCadastro('Resolva as pendências antes de publicar.',409);
  const analysis=parseJson<JsonRecord>(originalDoc.extracao_json);
  if(!analysis.padrao)throw new ErroCadastro('A CCT precisa da extração estruturada para gerar o relatório.',409);
  const pattern=validarExtracaoCct(analysis.padrao);
  const version=hashBytes(JSON.stringify({office,clientId,base,input:docs?.fingerprint??hashBytes(JSON.stringify({doc:originalDoc,hash:files[0].hash})),interpretation:interpretation?.versao??null,cliente,consolidated}));
  const relatorio:Relatorio={numero:base,base,tipo:originalDoc.tipo,vigencia:originalDoc.vigencia??'',versao:version,analise:{...analysis,padrao:pattern} as unknown as Extracao,
    consolidado:consolidated,analisado_em:originalDoc.analise_concluida_em??'',arquivos:sourceDocs.map((document,index)=>({numero:document.numero_registro,path:files[index].path,
      nome:document.numero_registro.replace(/[^A-Z0-9_-]/gi,'_')+'_original'+(['.pdf','.doc'].includes(extname(files[index].path).toLowerCase())?extname(files[index].path).toLowerCase():files[index].bytes.subarray(0,4).toString('latin1')==='%PDF'?'.pdf':'.doc'),hash:files[index].hash,bytes:files[index].bytes.length}))};
  return {relatorio,cliente,fingerprint:version,versao_interpretacao:interpretation?.versao??null};
  });
}



