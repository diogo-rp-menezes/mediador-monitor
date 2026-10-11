import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {ErroCadastro} from './cadastros.js';
import {limiteHoraMonitoramento} from './postgres-monitoring-limits.js';
import {resolverLimitesMonitoramento} from './postgres-monitoring-settings.js';

/** Reserve one queued request; serialize with request creation on the office row. No scraper runs here. */
export async function reservarMonitoramentoPostgres(pool:Pool,office:number,options:{limiteHora?:number}={}){
  let limit=options.limiteHora??limiteHoraMonitoramento(office);
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Limite de monitoramento inválido.');
  return withPostgresOfficeTransaction(pool,office,async client=>{
    const officeRow=await client.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true FOR UPDATE',[office]);
    if(!officeRow.rowCount)return null;
    const configured=(await client.query('SELECT monitor_limite_hora,monitor_duracao_segundos,monitor_volume_mib FROM limites_monitoramento_escritorio WHERE escritorio_id=$1',[office])).rows[0];
    const limits=resolverLimitesMonitoramento(office,configured).efetivos;
    limit=options.limiteHora??limits.limite_hora;
    const running=await client.query(`SELECT id FROM execucoes_escritorio WHERE escritorio_id=$1 AND status='executando' AND detalhes_json->>'formato'='monitoramento-execucao-v1'`,[office]);
    if(running.rowCount)return null;
    const recent=await client.query(`SELECT count(*)::integer AS quantidade FROM execucoes_escritorio
      WHERE escritorio_id=$1 AND detalhes_json->>'formato'='monitoramento-execucao-v1'
      AND (detalhes_json->>'worker_iniciado_em')::timestamptz>=now()-interval '1 hour'`,[office]);
    if(recent.rows[0].quantidade>=limit)return null;
    const queued=await client.query(`SELECT id,solicitada_por,detalhes_json FROM execucoes_escritorio
      WHERE escritorio_id=$1 AND status='solicitada' AND detalhes_json->>'formato'='monitoramento-execucao-v1'
      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,[office]);
    const row=queued.rows[0];if(!row)return null;
    const monitorId=Number(row.detalhes_json.monitoramento_id);
    if(!Number.isSafeInteger(monitorId)||monitorId<1)throw new ErroCadastro('Solicitação de monitoramento inválida.',409);
    const monitor=(await client.query('SELECT id,nome,cnpj_filtro,categoria,uf,tipos_json,vigencia,titulo FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2 AND ativo=true',[monitorId,office])).rows[0];
    if(!monitor){
      await client.query("UPDATE execucoes_escritorio SET status='cancelada',concluida_em=now(),detalhes_json=detalhes_json||'{\"cancelamento_motivo\":\"monitoramento_inativo\"}'::jsonb WHERE id=$1 AND escritorio_id=$2",[row.id,office]);
      return null;
    }
    const token=randomUUID();
    await client.query(`UPDATE execucoes_escritorio SET status='executando',detalhes_json=detalhes_json||jsonb_build_object('reserva_token',$3::text,'worker_iniciado_em',now(),'limites_aplicados',$4::jsonb)
      WHERE id=$1 AND escritorio_id=$2 AND status='solicitada'`,[row.id,office,token,JSON.stringify(limits)]);
    return {id:row.id as number,escritorio_id:office,solicitada_por:row.solicitada_por as number|null,token,monitoramento:monitor,
      limites:limits as typeof limits|undefined};
  });
}

/** A worker can finalize only the work it reserved. Interrupted jobs are not automatically requeued. */
export async function concluirMonitoramentoPostgres(pool:Pool,office:number,id:number,token:string,status:'concluida'|'falhou',motivo?:'duracao_excedida'|'volume_excedido'){
  if(!/^[a-f0-9-]{36}$/.test(token)||!['concluida','falhou'].includes(status))throw new ErroCadastro('Conclusão inválida.',400);
  if(motivo!==undefined&&!['duracao_excedida','volume_excedido'].includes(motivo))throw new ErroCadastro('Motivo inválido.',400);
  await withPostgresOfficeTransaction(pool,office,async client=>{
    const result=await client.query(`UPDATE execucoes_escritorio SET status=CASE WHEN detalhes_json->>'cancelamento_solicitado'='true' THEN 'cancelada' ELSE $4 END,concluida_em=now(),detalhes_json=(detalhes_json-'reserva_token')||$5::jsonb
      WHERE id=$1 AND escritorio_id=$2 AND status='executando' AND detalhes_json->>'reserva_token'=$3 RETURNING id`,[id,office,token,status,JSON.stringify(motivo==='duracao_excedida'?{limite_duracao_excedido:true}:motivo==='volume_excedido'?{limite_volume_excedido:true}:{})]);
    if(!result.rowCount)throw new ErroCadastro('Reserva não corresponde à execução ativa.',409);
  });
}

/** Future worker polls this at safe points, then aborts and waits for its tasks before finalizing. */
export async function consultarCancelamentoMonitoramentoPostgres(pool:Pool,office:number,id:number,token:string){
  return withPostgresOfficeTransaction(pool,office,async client=>{
    const result=await client.query(`SELECT detalhes_json->>'cancelamento_solicitado'='true' AS solicitado
      FROM execucoes_escritorio WHERE id=$1 AND escritorio_id=$2 AND status='executando'
      AND detalhes_json->>'reserva_token'=$3`,[id,office,token]);
    if(!result.rowCount)throw new ErroCadastro('Reserva de monitoramento não está ativa.',409);
    return result.rows[0].solicitado===true;
  });
}


