import {z} from 'zod';
import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {ErroCadastro} from './cadastros.js';

export const AgendaSemanalSchema=z.object({
  dias:z.array(z.number().int().min(0).max(6)).min(1).max(7).transform(days=>[...new Set(days)].sort()),
  horario:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  fuso:z.string().trim().min(1).max(100).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}},'Fuso horário inválido.'),
}).strict();
export function janelaSemanal(raw:unknown,now:Date):string|null{
  const agenda=AgendaSemanalSchema.parse(raw);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:agenda.fuso,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  const date=`${part('year')}-${part('month')}-${part('day')}`;
  const weekday=new Date(date+'T12:00:00Z').getUTCDay();
  return agenda.dias.includes(weekday)&&`${part('hour')}:${part('minute')}`>=agenda.horario?date:null;
}

export async function agendarSemanalPostgres(pool:Pool,office:number,id:number,raw:unknown){
  const expected=AgendaSemanalSchema.parse(raw);
  return withPostgresOfficeTransaction(pool,office,async client=>{
    if(!(await client.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true FOR UPDATE',[office])).rowCount)throw new ErroCadastro('Escritório indisponível.',409);
    const monitor=(await client.query('SELECT agenda_ativa,agenda_semanal_json FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2 AND ativo=true FOR SHARE',[id,office])).rows[0];
    if(!monitor?.agenda_ativa||!monitor.agenda_semanal_json)return {criada:false};
    const current=AgendaSemanalSchema.parse(monitor.agenda_semanal_json);
    if(JSON.stringify(current)!==JSON.stringify(expected))return {criada:false};
    const clock=(await client.query('SELECT clock_timestamp() AS agora')).rows[0].agora;
    const now=new Date(clock),slot=janelaSemanal(current,now);if(!slot)return {criada:false};
    const previous=await client.query(`SELECT id FROM execucoes_escritorio WHERE escritorio_id=$1
      AND detalhes_json->>'formato'='monitoramento-execucao-v1' AND detalhes_json->>'monitoramento_id'=$2
      AND (status IN ('solicitada','executando') OR (detalhes_json->>'origem'='agendada_semanal'
        AND detalhes_json->>'janela_agendamento' >= $3)) LIMIT 1`,[office,String(id),slot]);
    if(previous.rowCount)return {criada:false};
    const details={formato:'monitoramento-execucao-v1',monitoramento_id:id,origem:'agendada_semanal',ator_tipo:'sistema',janela_agendamento:slot,agenda:current};
    const execution=(await client.query(`INSERT INTO execucoes_escritorio(escritorio_id,solicitada_por,status,detalhes_json) VALUES($1,NULL,'solicitada',$2::jsonb) RETURNING id`,[office,JSON.stringify(details)])).rows[0].id;
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES(NULL,'MONITORAMENTO_EXECUCAO_AGENDADA',$1,$2,'','postgres-monitoring-scheduler',$3,$4::jsonb)`,[office,now.getTime(),randomUUID(),JSON.stringify({...details,execucao_id:execution})]);
    return {criada:true,id:execution};
  });
}

