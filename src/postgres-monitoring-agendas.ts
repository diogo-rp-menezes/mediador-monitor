import type {PoolClient,Pool} from 'pg';
import {z} from 'zod';
import {ErroCadastro} from './cadastros.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {agendarMonitoramentoPostgres} from './postgres-monitoring-schedule.js';
import {AgendaSemanalSchema,agendarSemanalPostgres} from './postgres-weekly-schedule.js';
export const AgendaSchema=z.object({ativa:z.boolean(),intervalo_minutos:z.number().int().min(60).max(10080),semanal:AgendaSemanalSchema.nullable().optional()}).strict();
export async function listarAgendasPostgres(client:PoolClient,office:number){
  return (await client.query(`SELECT id AS monitoramento_id,nome,ativo AS monitoramento_ativo,
    agenda_ativa AS ativa,agenda_intervalo_minutos AS intervalo_minutos,agenda_semanal_json AS semanal
    FROM monitoramentos_escritorios WHERE escritorio_id=$1 ORDER BY lower(nome),id`,[office])).rows;
}
export async function salvarAgendaPostgres(client:PoolClient,office:number,id:number,raw:unknown){
  const data=AgendaSchema.parse(raw);
  if(!Number.isSafeInteger(id)||id<1)throw new ErroCadastro('Identificador inválido.',400);
  if(!(await client.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true FOR UPDATE',[office])).rowCount)
    throw new ErroCadastro('Escritório indisponível.',409);
  if(!(await client.query(`UPDATE monitoramentos_escritorios SET agenda_ativa=$3,agenda_intervalo_minutos=$4,agenda_semanal_json=$5::jsonb
    WHERE id=$1 AND escritorio_id=$2 AND (ativo=true OR $3=false) RETURNING id`,[id,office,data.ativa,data.intervalo_minutos,data.semanal?JSON.stringify(data.semanal):null])).rowCount)
    throw new ErroCadastro('Monitoramento disponível não encontrado.',404);
  return data;
}
export async function executarAgendasPostgres(pool:Pool,office:number){
  const agendas=await withPostgresOfficeTransaction(pool,office,client=>listarAgendasPostgres(client,office));
  let created=0;
  for(const agenda of agendas.filter(item=>item.ativa&&item.monitoramento_ativo)){
    const result=agenda.semanal?await agendarSemanalPostgres(pool,office,agenda.monitoramento_id,agenda.semanal):await agendarMonitoramentoPostgres(pool,office,{monitoramento_id:agenda.monitoramento_id,
      intervalo_minutos:agenda.intervalo_minutos},{exigirAgenda:true});
    if(result.criada)created++;
  }
  return {criadas:created};
}

