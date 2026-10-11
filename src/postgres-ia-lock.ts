import type {Pool} from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import {BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY} from './postgres-backup-gate.js';
const participants=new AsyncLocalStorage<Pool>();
export const IA_LOCK_NAMESPACE=817204624;
/** Held until every worker task settles; hash collisions safely serialize unrelated documents. */
export async function comExclusividadeIaPostgres<T>(pool:Pool,number:string,work:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal){
  if(!number.trim()||number.length>100)throw new Error('Documento inválido.');
  if((pool.options?.max??10)<2)throw new Error('Extração IA exige PGPOOL_MAX de pelo menos 2.');
  if(signal?.aborted)return {adquirido:false as const};
  const client=await pool.connect(),stop=new AbortController();let acquired=false,shared=false,broken=false;
  const abort=()=>stop.abort(),lost=()=>{broken=true;abort();};
  signal?.addEventListener('abort',abort,{once:true});client.on('error',lost);
  try{
    if(signal?.aborted)abort();if(stop.signal.aborted)return {adquirido:false as const};
    if(participants.getStore()!==pool){shared=(await client.query('SELECT pg_try_advisory_lock_shared($1,$2) adquirido',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0].adquirido===true;if(!shared)return {adquirido:false as const};}
    acquired=(await client.query('SELECT pg_try_advisory_lock($1,hashtext($2)) adquirido',[IA_LOCK_NAMESPACE,number])).rows[0].adquirido===true;
    if(!acquired)return {adquirido:false as const};
    const result=await participants.run(pool,()=>work(stop.signal));
    if(broken)throw new Error('Exclusividade de IA perdida; verifique o processo antes de recuperar.');
    return {adquirido:true as const,result};
  }finally{
    signal?.removeEventListener('abort',abort);client.removeListener('error',lost);
    if(acquired&&!broken){try{if((await client.query('SELECT pg_advisory_unlock($1,hashtext($2)) liberado',[IA_LOCK_NAMESPACE,number])).rows[0].liberado!==true)broken=true;}catch{broken=true;}}
    if(shared&&!broken){try{if((await client.query('SELECT pg_advisory_unlock_shared($1,$2) liberado',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0].liberado!==true)broken=true;}catch{broken=true;}}
    client.release(broken?new Error('Conexão de exclusividade IA descartada.'):undefined);
  }
}

