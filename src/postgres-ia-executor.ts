import type {Pool,PoolClient} from 'pg';
import {lerOriginalIaPostgres} from './postgres-ia-original.js';
import {lerDocumentoBytes,extrairCabecalho} from './documento.js';
import {ehCct,ehAditivoCct} from './vinculos.js';
import {reservarAnalisePostgres,concluirAnalisePostgres,falharAnalisePostgres,type MotivoFalhaIa} from './postgres-ia-reservation.js';
import {gerarExtracaoIaPostgres,validarRespostaIaPostgres,FalhaGeracaoIa} from './postgres-ia-generation.js';
import {comExclusividadeIaPostgres} from './postgres-ia-lock.js';
/** Explicit trusted platform operation. No automatic retry, batch queue or office decisions. */
export type OpcoesExecutorIa={signal?:AbortSignal;maxDurationMs?:number;gerar?:typeof gerarExtracaoIaPostgres;aposReserva?:(client:PoolClient,attempt:{id:number;numero_registro:string})=>Promise<void>};
export async function executarAnalisePostgres(pool:Pool,number:string,options:OpcoesExecutorIa={}){
  const exclusive=await comExclusividadeIaPostgres(pool,number.trim(),signal=>executarReservada(pool,number,{...options,signal}),options.signal);
  return exclusive.adquirido?exclusive.result:{status:'ocupada' as const};
}
async function executarReservada(pool:Pool,number:string,options:OpcoesExecutorIa){
  const duration=options.maxDurationMs??240000;
  if(!Number.isInteger(duration)||duration<1||duration>240000)throw new Error('Duração de extração inválida.');
  options.signal?.throwIfAborted();
  const reservation=await reservarAnalisePostgres(pool,number,options.aposReserva);if(!reservation)return {status:'desativada' as const};
  const signal=AbortSignal.any([AbortSignal.timeout(duration),...(options.signal?[options.signal]:[])]);
  let reason:MotivoFalhaIa='original_invalido';
  try{
    signal.throwIfAborted();
    const bytes=lerOriginalIaPostgres(reservation.arquivo_path,reservation.arquivo_hash);
    reason='documento_invalido';
    const text=await lerDocumentoBytes(bytes);signal.throwIfAborted();
    if(!text.trim()||text.length>150000||extrairCabecalho(text).numeroRegistro!==reservation.numero_registro||(!ehCct(reservation.tipo)&&!ehAditivoCct(reservation.tipo)))
      throw new Error('Documento não elegível.');
    reason='provedor_indisponivel';
    // Await settlement even if aborted: never release the reservation while work is running.
    const raw=await (options.gerar??gerarExtracaoIaPostgres)(text,reservation.tipo,reservation.config,signal);
    signal.throwIfAborted();reason='resposta_invalida';validarRespostaIaPostgres(raw,reservation.tipo,text);
    reason='execucao_interrompida';
    return await concluirAnalisePostgres(pool,reservation.id,reservation.token,raw,text);
  }catch(error){
    if(signal.aborted)reason='execucao_interrompida';else if(error instanceof FalhaGeracaoIa)reason=error.motivo;
    // A failed audit leaves the attempt blocked, so no automatic retry can duplicate work.
    try{await falharAnalisePostgres(pool,reservation.id,reservation.token,reason);}
    catch{throw new Error('Não foi possível encerrar a tentativa de IA; recuperação administrativa necessária.');}
    return {tentativa_id:reservation.id,numero_registro:reservation.numero_registro,status:'falhou' as const,motivo:reason};
  }
}

