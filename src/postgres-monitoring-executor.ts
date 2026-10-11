import type {Pool} from 'pg';
import {reservarMonitoramentoPostgres,consultarCancelamentoMonitoramentoPostgres,concluirMonitoramentoPostgres} from './postgres-monitoring-reservation.js';
import {limiteDuracaoMonitoramentoMs,ErroLimiteVolumeMonitoramento} from './postgres-monitoring-limits.js';
type Reserva=NonNullable<Awaited<ReturnType<typeof reservarMonitoramentoPostgres>>>;
export type TrabalhoMonitoramento=(reserva:Reserva,signal:AbortSignal)=>Promise<void>;

/** Keeps the reservation until all callback work settles. Callback must honor signal and await its child tasks. */
export async function executarSolicitacaoMonitoramentoPostgres(pool:Pool,office:number,work:TrabalhoMonitoramento,options:{signal?:AbortSignal;intervalMs?:number;maxDurationMs?:number}={}){
  const interval=options.intervalMs??1000;
  if(!Number.isInteger(interval)||interval<10||interval>60000)throw new Error('Intervalo de cancelamento inválido.');
  let duration=options.maxDurationMs??limiteDuracaoMonitoramentoMs(office);
  if(!Number.isInteger(duration)||duration<10||duration>3600000)throw new Error('Limite de duração inválido.');
  if(options.signal?.aborted)return {reservada:false};
  const reservation=await reservarMonitoramentoPostgres(pool,office);
  if(!reservation)return {reservada:false};
  duration=options.maxDurationMs??(reservation.limites?reservation.limites.duracao_segundos*1000:duration);
  const controller=new AbortController();
  const stop=()=>controller.abort();options.signal?.addEventListener('abort',stop,{once:true});
  if(options.signal?.aborted)stop();
  let cancelled=false,pollFailed=false,workFailed=false,stopping=false,expired=false,volumeExceeded=false;
  const deadline=setTimeout(()=>{expired=true;controller.abort();},duration);
  let pending:Promise<void>|undefined;
  const poll=async()=>{
    try{
      if(await consultarCancelamentoMonitoramentoPostgres(pool,office,reservation.id,reservation.token)){
        cancelled=true;controller.abort();
      }
    }catch{pollFailed=true;controller.abort();}
  };
  let timer:ReturnType<typeof setInterval>|undefined;
  try{
    await poll();
    timer=setInterval(()=>{
      if(!stopping&&!pending)pending=poll().finally(()=>{pending=undefined;});
    },interval);
    if(!controller.signal.aborted)try{await work(reservation,controller.signal);}catch(error){workFailed=true;volumeExceeded=error instanceof ErroLimiteVolumeMonitoramento;}
  }finally{
    stopping=true;clearInterval(timer);clearTimeout(deadline);await pending;
    options.signal?.removeEventListener('abort',stop);
  }
  // Lost DB/token validation leaves the reservation untouched for explicit recovery.
  if(pollFailed)throw new Error('Executor perdeu validação da reserva; trabalho interrompido, recuperação administrativa necessária.');
  const result=expired||workFailed||controller.signal.aborted&&!cancelled?'falhou':'concluida';
  if(expired)await concluirMonitoramentoPostgres(pool,office,reservation.id,reservation.token,result,'duracao_excedida');
  else if(volumeExceeded)await concluirMonitoramentoPostgres(pool,office,reservation.id,reservation.token,result,'volume_excedido');
  else await concluirMonitoramentoPostgres(pool,office,reservation.id,reservation.token,result);
  return {reservada:true,execucao_id:reservation.id,cancelamento_observado:cancelled,resultado_solicitado:result,limite_duracao_excedido:expired};
}

