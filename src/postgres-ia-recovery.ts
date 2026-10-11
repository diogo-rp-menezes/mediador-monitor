import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import {ErroCadastro} from './cadastros.js';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {comExclusividadeIaPostgres} from './postgres-ia-lock.js';
import {IA_QUEUE_LOCK} from './postgres-ia-worker.js';
const schema=z.object({justificativa:z.string().trim().min(8).max(1000),consumidor_encerrado:z.literal(true)}).strict();
/** Only orphan requests: linked attempts use their existing recovery path. */
export async function recuperarSolicitacaoIaPostgres(pool:Pool,id:number,raw:unknown,audit:(client:PoolClient,details:Record<string,unknown>)=>Promise<void>){
  const input=schema.parse(raw);z.number().int().positive().max(2147483647).parse(id);
  const exclusive=await comExclusividadeIaPostgres(pool,IA_QUEUE_LOCK,()=>withPostgresGlobalTransaction(pool,async client=>{
    const row=(await client.query("SELECT id,numero_registro FROM solicitacoes_analise WHERE id=$1 AND status='executando' AND tentativa_id IS NULL FOR UPDATE",[id])).rows[0];
    if(!row)throw new ErroCadastro('Solicitação sem tentativa ativa não encontrada; use a recuperação da tentativa vinculada.',409);
    await client.query("UPDATE solicitacoes_analise SET status='falhou',motivo='execucao_interrompida',reserva_token=NULL,concluida_em=now() WHERE id=$1",[id]);
    await audit(client,{solicitacao_id:id,numero_registro:row.numero_registro,justificativa:input.justificativa,consumidor_encerrado:true});
    return {solicitacao_id:id,status:'falhou' as const};
  }));
  if(!exclusive.adquirido)throw new ErroCadastro('Consumidor IA ainda mantém exclusividade. Encerre-o antes de recuperar.',409);
  return exclusive.result;
}
export async function listarTentativasIaPostgres(client:PoolClient){
  return (await client.query(`SELECT id,numero_registro,config_versao,status,motivo,iniciada_em,concluida_em
    FROM tentativas_analise ORDER BY id DESC LIMIT 100`)).rows;
}
/** Administrative caller authorizes/revalidates identity and supplies audit in this transaction. */
export async function recuperarAnalisePostgres(pool:Pool,id:number,raw:unknown,audit:(client:PoolClient,details:Record<string,unknown>)=>Promise<void>){
  const input=schema.parse(raw);z.number().int().positive().max(2147483647).parse(id);
  const lookup=await withPostgresGlobalTransaction(pool,async client=>(await client.query('SELECT numero_registro FROM tentativas_analise WHERE id=$1',[id])).rows[0]);
  if(!lookup)throw new ErroCadastro('Tentativa de análise não encontrada.',409);
  const exclusive=await comExclusividadeIaPostgres(pool,lookup.numero_registro,()=>withPostgresGlobalTransaction(pool,async client=>{
    const doc=(await client.query('SELECT numero_registro,analise_status,arquivo_hash FROM registros WHERE numero_registro=$1 FOR UPDATE',[lookup.numero_registro])).rows[0];
    const attempt=(await client.query("SELECT * FROM tentativas_analise WHERE id=$1 AND status='executando' FOR UPDATE",[id])).rows[0];
    if(!attempt||attempt.numero_registro!==lookup.numero_registro||doc?.analise_status!=='analisando')throw new ErroCadastro('Tentativa ativa não encontrada.',409);
    await client.query("UPDATE tentativas_analise SET status='falhou',motivo='execucao_interrompida',reserva_token=NULL,concluida_em=now() WHERE id=$1",[id]);
    const restored=doc.arquivo_hash===attempt.arquivo_hash?attempt.status_anterior:'falhou';
    await client.query('UPDATE registros SET analise_status=$2,analise_iniciada_em=$3,analise_erro=$4 WHERE numero_registro=$1',
      [attempt.numero_registro,restored,attempt.inicio_anterior,'Extração interrompida encerrada por recuperação administrativa.']);
    const jobs=await client.query("UPDATE solicitacoes_analise SET status='falhou',motivo='execucao_interrompida',reserva_token=NULL,concluida_em=now() WHERE tentativa_id=$1 AND status='executando' RETURNING id",[id]);
    await audit(client,{tentativa_id:id,numero_registro:attempt.numero_registro,justificativa:input.justificativa,consumidor_encerrado:true,solicitacoes:jobs.rows.map(row=>row.id)});
    return {tentativa_id:id,numero_registro:attempt.numero_registro,status:'falhou' as const};
  }));
  if(!exclusive.adquirido)throw new ErroCadastro('Processamento ainda mantém exclusividade. Encerre-o antes de recuperar.',409);
  return exclusive.result;
}

