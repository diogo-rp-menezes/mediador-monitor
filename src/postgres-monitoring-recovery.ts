import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import {ErroCadastro} from './cadastros.js';
import {comExclusividadeMonitoramentoPostgres} from './postgres-monitoring-lock.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
const schema=z.object({justificativa:z.string().trim().min(8).max(1000),consumidor_encerrado:z.literal(true)}).strict();
/** Administrative caller must authorize and supply transactional audit. Never requeues collection. */
export async function recuperarMonitoramentoPostgres(pool:Pool,office:number,id:number,raw:unknown,
  audit:(client:PoolClient,details:Record<string,unknown>)=>Promise<void>){
  const input=schema.parse(raw);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroCadastro('Identificador inválido.',400);
  const exclusive=await comExclusividadeMonitoramentoPostgres(pool,office,()=>withPostgresOfficeTransaction(pool,office,async client=>{
    const result=await client.query(`UPDATE execucoes_escritorio SET status='falhou',concluida_em=now(),
      detalhes_json=(detalhes_json-'reserva_token')||jsonb_build_object('recuperacao_administrativa',true,'recuperacao_em',now())
      WHERE id=$1 AND escritorio_id=$2 AND status='executando' AND detalhes_json->>'formato'='monitoramento-execucao-v1'
      RETURNING id`,[id,office]);
    if(!result.rowCount)throw new ErroCadastro('Execução ativa não encontrada neste escritório.',409);
    await audit(client,{execucao_id:id,justificativa:input.justificativa,consumidor_encerrado:true});
    return {id,status:'falhou' as const};
  }));
  if(!exclusive.adquirido)throw new ErroCadastro('Consumidor do escritório ainda mantém exclusividade. Encerre-o antes de recuperar.',409);
  return exclusive.result;
}

