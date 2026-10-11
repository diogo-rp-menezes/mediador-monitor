import {z} from 'zod';
import type {PoolClient} from 'pg';
import {ErroCadastro} from './cadastros.js';
import {limiteHoraMonitoramento,limiteDuracaoMonitoramentoMs,limiteVolumeMonitoramentoBytes} from './postgres-monitoring-limits.js';
export const LimitesMonitoramentoSchema=z.object({
  limite_hora:z.number().int().min(1).max(1000).nullable(),
  duracao_segundos:z.number().int().min(10).max(3600).nullable(),
  volume_mib:z.number().int().min(1).max(1024).nullable(),
}).strict();
export function resolverLimitesMonitoramento(office:number,row:Record<string,unknown>={},environment:NodeJS.ProcessEnv=process.env){
  const configured=LimitesMonitoramentoSchema.parse({limite_hora:row.monitor_limite_hora??null,
    duracao_segundos:row.monitor_duracao_segundos??null,volume_mib:row.monitor_volume_mib??null});
  const ceilings={limite_hora:limiteHoraMonitoramento(office,environment),duracao_segundos:limiteDuracaoMonitoramentoMs(office,environment)/1000,
    volume_mib:limiteVolumeMonitoramentoBytes(office,environment)/1048576};
  const effective={limite_hora:Math.min(configured.limite_hora??ceilings.limite_hora,ceilings.limite_hora),
    duracao_segundos:Math.min(configured.duracao_segundos??ceilings.duracao_segundos,ceilings.duracao_segundos),
    volume_mib:Math.min(configured.volume_mib??ceilings.volume_mib,ceilings.volume_mib)};
  return {configurados:configured,tetos:ceilings,efetivos:effective};
}
export async function obterLimitesMonitoramentoPostgres(client:PoolClient,office:number){
  const row=(await client.query(`SELECT l.monitor_limite_hora,l.monitor_duracao_segundos,l.monitor_volume_mib FROM escritorios e
    LEFT JOIN limites_monitoramento_escritorio l ON l.escritorio_id=e.id WHERE e.id=$1 AND e.id=mediador_contexto_escritorio()`,[office])).rows[0];
  if(!row)throw new ErroCadastro('Escritório indisponível.',404);
  return resolverLimitesMonitoramento(office,row);
}
export async function salvarLimitesMonitoramentoPostgres(client:PoolClient,office:number,raw:unknown){
  const data=LimitesMonitoramentoSchema.parse(raw),ceilings=resolverLimitesMonitoramento(office).tetos;
  if(Object.entries(data).some(([key,value])=>value!==null&&value>ceilings[key as keyof typeof ceilings]))
    throw new ErroCadastro('Os limites não podem exceder os tetos da plataforma.',400);
  if(!(await client.query('SELECT id FROM escritorios WHERE id=$1 AND id=mediador_contexto_escritorio() AND ativo=true FOR UPDATE',[office])).rowCount)
    throw new ErroCadastro('Escritório indisponível.',409);
  await client.query(`INSERT INTO limites_monitoramento_escritorio(escritorio_id,monitor_limite_hora,monitor_duracao_segundos,monitor_volume_mib)
    VALUES($1,$2,$3,$4) ON CONFLICT(escritorio_id) DO UPDATE SET monitor_limite_hora=EXCLUDED.monitor_limite_hora,
    monitor_duracao_segundos=EXCLUDED.monitor_duracao_segundos,monitor_volume_mib=EXCLUDED.monitor_volume_mib`,
    [office,data.limite_hora,data.duracao_segundos,data.volume_mib]);
  return data;
}

