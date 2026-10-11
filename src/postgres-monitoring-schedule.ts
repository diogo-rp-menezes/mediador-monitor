import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ErroCadastro} from './cadastros.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';

export const AgendamentoMonitoramentoSchema=z.object({
  monitoramento_id:z.number().int().positive(),intervalo_minutos:z.number().int().min(60).max(10080),
}).strict();

/** Explicit office/filter only. Database clock and office lock make repeated scheduler ticks idempotent. */
export async function agendarMonitoramentoPostgres(pool:Pool,office:number,raw:unknown,options:{exigirAgenda?:boolean}={}){
  const data=AgendamentoMonitoramentoSchema.parse(raw);
  return withPostgresOfficeTransaction(pool,office,async client=>{
    if(!(await client.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true FOR UPDATE',[office])).rowCount)
      throw new ErroCadastro('Escritório indisponível.',409);
    const monitor=await client.query('SELECT id,agenda_ativa,agenda_intervalo_minutos,agenda_semanal_json FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2 AND ativo=true FOR SHARE',[data.monitoramento_id,office]);
    if(options.exigirAgenda&&(!monitor.rowCount||!monitor.rows[0].agenda_ativa||monitor.rows[0].agenda_semanal_json||monitor.rows[0].agenda_intervalo_minutos!==data.intervalo_minutos))return {criada:false as const};
    if(!monitor.rowCount)
      throw new ErroCadastro('Monitoramento ativo não encontrado.',404);
    const clock=(await client.query(`SELECT floor(extract(epoch FROM clock_timestamp())/($1::integer*60))::bigint::text AS janela,
      floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS agora`,[data.intervalo_minutos])).rows[0];
    const slot=String(clock.janela);
    const previous=await client.query(`SELECT id FROM execucoes_escritorio WHERE escritorio_id=$1
      AND detalhes_json->>'formato'='monitoramento-execucao-v1' AND detalhes_json->>'monitoramento_id'=$2
      AND (status IN ('solicitada','executando') OR
        (detalhes_json->>'origem'='agendada' AND detalhes_json->>'intervalo_minutos'=$3
          AND (CASE WHEN detalhes_json->>'janela_agendamento' ~ '^[0-9]+$' THEN (detalhes_json->>'janela_agendamento')::bigint END) >= $4::bigint)) LIMIT 1`,
      [office,String(data.monitoramento_id),String(data.intervalo_minutos),slot]);
    if(previous.rowCount)return {criada:false as const};
    const details={formato:'monitoramento-execucao-v1',monitoramento_id:data.monitoramento_id,origem:'agendada',
      ator_tipo:'sistema',intervalo_minutos:data.intervalo_minutos,janela_agendamento:slot};
    const id=(await client.query(`INSERT INTO execucoes_escritorio(escritorio_id,solicitada_por,status,detalhes_json)
      VALUES($1,NULL,'solicitada',$2::jsonb) RETURNING id`,[office,JSON.stringify(details)])).rows[0].id as number;
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES(NULL,'MONITORAMENTO_EXECUCAO_AGENDADA',$1,$2,'','postgres-monitoring-scheduler',$3,$4::jsonb)`,
      [office,Number(clock.agora),randomUUID(),JSON.stringify({...details,execucao_id:id})]);
    return {criada:true as const,id};
  });
}

