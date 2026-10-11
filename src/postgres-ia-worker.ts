import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {executarAnalisePostgres,type OpcoesExecutorIa} from './postgres-ia-executor.js';
import {obterIaPostgres} from './postgres-ia-settings.js';
import {comExclusividadeIaPostgres} from './postgres-ia-lock.js';
export const IA_QUEUE_LOCK='fila-ia-plataforma-v1';
async function audit(client:PoolClient,action:string,id:number){
  await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES(NULL,$1,$2,'','fila-ia-v1',$3,$4::jsonb)`,[action,Date.now(),randomUUID(),JSON.stringify({solicitacao_id:id,origem:{tipo:'sistema',rotina:'fila-ia-v1'}})]);
}
/** One existing request only. Never retries running requests automatically. */
export async function executarSolicitacaoIaPostgres(pool:Pool,options:Pick<OpcoesExecutorIa,'signal'|'gerar'|'maxDurationMs'>={}){
  if((pool.options.max??10)<3)throw new Error('Consumidor IA exige PGPOOL_MAX de pelo menos 3.');
  const exclusive=await comExclusividadeIaPostgres(pool,IA_QUEUE_LOCK,signal=>consumir(pool,{...options,signal}),options.signal);
  return exclusive.adquirido?exclusive.result:{reservada:false as const};
}
async function consumir(pool:Pool,options:Pick<OpcoesExecutorIa,'signal'|'gerar'|'maxDurationMs'>){
  if(options.signal?.aborted)return {reservada:false as const};
  const job=await withPostgresGlobalTransaction(pool,async client=>{
    if(!(await obterIaPostgres(client)).ativo)return null;
    const row=(await client.query("SELECT id,numero_registro,arquivo_hash FROM solicitacoes_analise WHERE status='solicitada' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
    if(!row)return null;const token=randomUUID();
    await client.query("UPDATE solicitacoes_analise SET status='executando',reserva_token=$2 WHERE id=$1",[row.id,token]);
    await audit(client,'IA_SOLICITACAO_RESERVADA',row.id);return {...row,token};
  });
  if(!job)return {reservada:false as const};
  let status:'concluida'|'falhou'='falhou',reason='execucao_interrompida';
  try{
    const result=await executarAnalisePostgres(pool,job.numero_registro,{...options,aposReserva:async(client,attempt)=>{
      const doc=(await client.query('SELECT arquivo_hash FROM registros WHERE numero_registro=$1',[attempt.numero_registro])).rows[0];
      if(doc?.arquivo_hash!==job.arquivo_hash)throw new Error('Original cadastrado mudou após solicitação.');
      const linked=await client.query("UPDATE solicitacoes_analise SET tentativa_id=$3 WHERE id=$1 AND status='executando' AND reserva_token=$2 RETURNING id",[job.id,job.token,attempt.id]);
      if(!linked.rowCount)throw new Error('Solicitação não está ativa.');
    }});
    status=result.status==='concluida'?'concluida':'falhou';reason=result.status==='falhou'?result.motivo:result.status;
  }catch{
    // A linked attempt left running needs recovery, not automatic finalization/requeue.
    const blocked=await withPostgresGlobalTransaction(pool,async client=>(await client.query("SELECT 1 FROM solicitacoes_analise s JOIN tentativas_analise t ON t.id=s.tentativa_id WHERE s.id=$1 AND t.status='executando'",[job.id])).rowCount);
    if(blocked)throw new Error('Tentativa IA permanece ativa; recuperação administrativa necessária.');
  }
  await withPostgresGlobalTransaction(pool,async client=>{
    const finished=await client.query("UPDATE solicitacoes_analise SET status=$3,motivo=$4,reserva_token=NULL,concluida_em=now() WHERE id=$1 AND status='executando' AND reserva_token=$2 RETURNING id",[job.id,job.token,status,status==='falhou'?reason:null]);
    if(!finished.rowCount){
      const done=(await client.query('SELECT status,reserva_token,tentativa_id FROM solicitacoes_analise WHERE id=$1',[job.id])).rows[0];
      if(done?.status===status&&done.reserva_token===null&&done.tentativa_id)return;
      throw new Error('Solicitação IA já foi encerrada ou recuperada.');
    }
    await audit(client,'IA_SOLICITACAO_ENCERRADA',job.id);
  });
  return {reservada:true as const,solicitacao_id:job.id as number,status};
}

