import { z } from 'zod';
import type { Pool,PoolClient,QueryResultRow } from 'pg';
import { ErroCadastro } from './cadastros.js';
import { ehAditivoCct,ehCct } from './vinculos.js';
import { withPostgresOfficeTransaction } from './postgres-transaction.js';
import { normalizarExtracao,paraVisao } from './extract.js';

const NumberSchema=z.string().trim().min(1).max(100);
const SaveLinkSchema=z.object({aditivo:NumberSchema,base:NumberSchema.nullable(),justificativa:z.string().trim().min(8).max(2000),revisao:z.number().int().nonnegative()}).strict();

async function documentoVisivel(db:PoolClient,officeId:number,number:string){
  const result=await db.query<{tipo:string}&QueryResultRow>(`SELECT r.tipo FROM registros r WHERE r.numero_registro=$1 AND EXISTS(
    SELECT 1 FROM clientes_documentos d WHERE d.numero_registro=r.numero_registro AND d.escritorio_id=$2)`,[number,officeId]);
  return result.rows[0]??null;
}

export async function listarCatalogoInterpretacoesPostgres(pool:Pool,officeId:number){
  return withPostgresOfficeTransaction(pool,officeId,async client=>{
  const documents=await client.query(`SELECT r.numero_registro,r.tipo,min(d.cliente_id) AS cliente_original_id,
      array_agg(DISTINCT d.cliente_id) AS clientes_ids,
      (r.arquivo_path IS NOT NULL AND r.arquivo_hash IS NOT NULL) AS original_disponivel
      FROM registros r JOIN clientes_documentos d ON d.numero_registro=r.numero_registro
      WHERE d.escritorio_id=$1 GROUP BY r.numero_registro,r.tipo,r.arquivo_path,r.arquivo_hash ORDER BY r.numero_registro`,[officeId]),
  links=await client.query(`SELECT v.aditivo,v.base,v.justificativa,v.revisao,v.atualizado_em FROM vinculos_escritorio v
      WHERE v.escritorio_id=$1 AND EXISTS(SELECT 1 FROM clientes_documentos d WHERE d.escritorio_id=v.escritorio_id AND d.numero_registro=v.aditivo)
      ORDER BY v.aditivo`,[officeId]);
  return {documentos:documents.rows,vinculos:links.rows};
  });
}

export async function detalheInstrumentoPostgres(pool:Pool,officeId:number,numero:string){
  return withPostgresOfficeTransaction(pool,officeId,async client=>{
    const result=await client.query(`SELECT r.numero_registro,r.numero_solicitacao,r.tipo,r.vigencia,r.partes,
      r.analise_status,r.analise_concluida_em,r.extracao_json AS analise
      FROM registros r WHERE r.numero_registro=$1 AND EXISTS(
        SELECT 1 FROM clientes_documentos d WHERE d.numero_registro=r.numero_registro AND d.escritorio_id=$2)`,[NumberSchema.parse(numero),officeId]);
    if(!result.rowCount)throw new ErroCadastro('Documento não encontrado neste escritório.',404);
    const row=result.rows[0];
    return {...row,analise_visao:paraVisao(normalizarExtracao(row.analise))};
  });
}

export async function salvarVinculoContextoPostgres(client:PoolClient,officeId:number,actorId:number,raw:unknown){
  const data=SaveLinkSchema.parse(raw);
  const amendment=await documentoVisivel(client,officeId,data.aditivo);
  if(!amendment)throw new ErroCadastro('Aditivo não encontrado neste escritório.',404);
  if(!ehAditivoCct(amendment.tipo))throw new ErroCadastro('Selecione um termo aditivo de CCT.',400);
  if(data.base){
    const base=await documentoVisivel(client,officeId,data.base);
    if(!base)throw new ErroCadastro('CCT original não encontrada neste escritório.',404);
    if(!ehCct(base.tipo))throw new ErroCadastro('Selecione uma CCT original.',400);
  }
  await client.query('SELECT pg_advisory_xact_lock($1,hashtext($2))',[817204617,`${officeId}:${data.aditivo}`]);
  const current=await client.query<{revisao:number}&QueryResultRow>('SELECT revisao FROM vinculos_escritorio WHERE escritorio_id=$1 AND aditivo=$2 FOR UPDATE',[officeId,data.aditivo]);
  if((current.rows[0]?.revisao??0)!==data.revisao)throw new ErroCadastro('Vínculo alterado em outra aba. Atualize antes de decidir.',409);
  await client.query(`INSERT INTO vinculos_escritorio(escritorio_id,aditivo,base,justificativa,ator_id,revisao)
    VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(escritorio_id,aditivo) DO UPDATE SET base=excluded.base,justificativa=excluded.justificativa,
    ator_id=excluded.ator_id,revisao=vinculos_escritorio.revisao+1,atualizado_em=now()`,
  [officeId,data.aditivo,data.base,data.justificativa,actorId]);
  return {aditivo:data.aditivo,base:data.base,justificativa:data.justificativa,revisao:(current.rows[0]?.revisao??0)+1};
}

