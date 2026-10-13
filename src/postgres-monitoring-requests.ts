import type {PoolClient} from 'pg';
import {z} from 'zod';
import {ErroCadastro} from './cadastros.js';
export const SolicitarMonitoramentoSchema=z.object({monitoramento_id:z.number().int().positive()}).strict();
/** Caller owns an office transaction. Office lock serializes duplicate requests. */
export async function solicitarMonitoramentoPostgres(client:PoolClient,office:number,actor:number,raw:unknown){
  const data=SolicitarMonitoramentoSchema.parse(raw);
  if(!(await client.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true FOR UPDATE',[office])).rowCount)throw new ErroCadastro('Escritório indisponível.',409);
  if(!(await client.query('SELECT id FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2 AND ativo=true',[data.monitoramento_id,office])).rowCount)throw new ErroCadastro('Monitoramento ativo não encontrado.',404);
  const pending=await client.query(`SELECT id FROM execucoes_escritorio WHERE escritorio_id=$1 AND status IN ('solicitada','executando') AND detalhes_json->>'formato'='monitoramento-execucao-v1' AND detalhes_json->>'monitoramento_id'=$2`,[office,String(data.monitoramento_id)]);
  if(pending.rowCount)throw new ErroCadastro('Monitoramento já possui execução pendente.',409);
  return (await client.query(`INSERT INTO execucoes_escritorio(escritorio_id,solicitada_por,status,detalhes_json) VALUES($1,$2,'solicitada',$3::jsonb) RETURNING id`,[office,actor,JSON.stringify({formato:'monitoramento-execucao-v1',monitoramento_id:data.monitoramento_id,origem:'manual'})])).rows[0].id as number;
}
export async function listarSolicitacoesMonitoramentoPostgres(client:PoolClient,office:number){
  return (await client.query(`SELECT id,solicitada_por,status,iniciada_em,concluida_em,detalhes_json->>'monitoramento_id' AS monitoramento_id,
    COALESCE(detalhes_json->>'cancelamento_solicitado'='true',false) AS cancelamento_solicitado,
    (status='solicitada' OR (status='executando' AND detalhes_json ? 'reserva_token')) AND NOT COALESCE(detalhes_json->>'cancelamento_solicitado'='true',false) AS cancelavel,
    status='executando' AS recuperavel,
    COALESCE(detalhes_json->>'limite_duracao_excedido'='true',false) AS limite_duracao_excedido,
    COALESCE(detalhes_json->>'limite_volume_excedido'='true',false) AS limite_volume_excedido
    FROM execucoes_escritorio WHERE escritorio_id=$1 AND detalhes_json->>'formato'='monitoramento-execucao-v1' ORDER BY id DESC LIMIT 100`,[office])).rows;
}
export async function cancelarSolicitacaoMonitoramentoPostgres(client:PoolClient,office:number,id:number){
  if((await client.query(`UPDATE execucoes_escritorio SET status='cancelada',concluida_em=now() WHERE id=$1 AND escritorio_id=$2 AND status='solicitada' AND detalhes_json->>'formato'='monitoramento-execucao-v1' RETURNING id`,[id,office])).rowCount)return;
  const running=await client.query(`UPDATE execucoes_escritorio SET detalhes_json=detalhes_json||jsonb_build_object('cancelamento_solicitado',true)
    WHERE id=$1 AND escritorio_id=$2 AND status='executando' AND detalhes_json->>'formato'='monitoramento-execucao-v1'
    AND detalhes_json ? 'reserva_token' RETURNING id`,[id,office]);
  if(!running.rowCount)throw new ErroCadastro('Execução cancelável não encontrada; execução sem reserva exige recuperação administrativa do worker.',409);
}

