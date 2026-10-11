import type {Pool} from 'pg';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {processarFilaPostgres} from './postgres-fila-envios.js';
import {processarNotificacoesPublicacaoPostgres} from './postgres-notificacoes-publicacoes.js';

export type ResultadoCicloPostgres={escritorios:number;envios:number;notificacoes:number;falhas:number};

/** Processes existing queues only; never creates previews or approves messages. */
export async function executarCicloFilasPostgres(pool:Pool,options:{signal?:AbortSignal;publicUrl?:string;onError?:(office:number,queue:string,error:unknown)=>void}={}):Promise<ResultadoCicloPostgres>{
  const offices=await withPostgresGlobalTransaction(pool,async client=>(await client.query<{id:number}>(
    `SELECT e.id FROM escritorios e WHERE e.ativo AND (
      EXISTS(SELECT 1 FROM envios_clientes d WHERE d.escritorio_id=e.id AND d.status='na_fila' AND (d.proxima_tentativa IS NULL OR d.proxima_tentativa<=now()))
      OR EXISTS(SELECT 1 FROM notificacoes_publicacoes n WHERE n.escritorio_id=e.id AND n.estado='pendente')
    ) ORDER BY e.id`)).rows);
  const result:ResultadoCicloPostgres={escritorios:0,envios:0,notificacoes:0,falhas:0};
  for(const office of offices){
    if(options.signal?.aborted)break;
    result.escritorios++;
    try{
      const sent=await processarFilaPostgres(pool,office.id,{limite:10});result.envios+=sent.enviados;result.falhas+=sent.falhas;
    }catch(error){result.falhas++;options.onError?.(office.id,'envios',error);}
    if(options.signal?.aborted)break;
    try{
      const notices=await processarNotificacoesPublicacaoPostgres(pool,office.id,{limit:10,publicUrl:options.publicUrl});result.notificacoes+=notices.enviadas;result.falhas+=notices.falhas;
    }catch(error){result.falhas++;options.onError?.(office.id,'notificacoes',error);}
  }
  return result;
}

