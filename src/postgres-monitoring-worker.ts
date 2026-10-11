import type {Pool} from 'pg';
import {executarSolicitacaoMonitoramentoPostgres,type TrabalhoMonitoramento} from './postgres-monitoring-executor.js';
import {criarTrabalhoColetaComPersistenciaPostgres} from './postgres-monitoring-collection.js';
import {comExclusividadeMonitoramentoPostgres} from './postgres-monitoring-lock.js';

export function lerArgumentosWorkerMonitoramento(args:string[]){
  const match=args.join(' ').match(/^--escritorio ([1-9]\d*)(?: (--once|--continuous))?$/);
  const office=Number(match?.[1]);
  if(!match||!Number.isSafeInteger(office))throw new Error('Uso: postgres:monitorar -- --escritorio ID [--once|--continuous]');
  return {office,once:match[2]!=='--continuous'};
}

/** One request for one explicitly selected office; no global discovery or creation of jobs. */
export async function executarCicloMonitoramentoPostgres(pool:Pool,office:number,options:{signal?:AbortSignal;work?:TrabalhoMonitoramento}={}){
  if(!Number.isSafeInteger(office)||office<1)throw new Error('Escritório inválido.');
  const exclusive=await comExclusividadeMonitoramentoPostgres(pool,office,signal=>
    executarSolicitacaoMonitoramentoPostgres(pool,office,options.work??criarTrabalhoColetaComPersistenciaPostgres(pool),{signal}),options.signal);
  return exclusive.adquirido?exclusive.result:{reservada:false};
}

