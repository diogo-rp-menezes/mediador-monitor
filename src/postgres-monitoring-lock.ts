import type {Pool} from 'pg';
import {BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY} from './postgres-backup-gate.js';
export const MONITORAMENTO_LOCK_NAMESPACE=817204622;

/** Session lock survives transaction boundaries and is kept until the complete callback settles. */
export async function comExclusividadeMonitoramentoPostgres<T>(pool:Pool,office:number,work:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal){
  if(!Number.isInteger(office)||office<1||office>2147483647)throw new Error('Escritório inválido.');
  if((pool.options.max??10)<2)throw new Error('Monitoramento exige PGPOOL_MAX de pelo menos 2.');
  if(signal?.aborted)return {adquirido:false as const};
  const client=await pool.connect(),stop=new AbortController();
  let acquired=false,shared=false,broken=false;
  const abort=()=>stop.abort();
  const lost=()=>{broken=true;abort();};
  signal?.addEventListener('abort',abort,{once:true});client.on('error',lost);
  try{
    if(signal?.aborted)abort();
    if(stop.signal.aborted)return {adquirido:false as const};
    shared=(await client.query('SELECT pg_try_advisory_lock_shared($1,$2) AS adquirido',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0].adquirido===true;
    if(!shared)return {adquirido:false as const};
    acquired=(await client.query('SELECT pg_try_advisory_lock($1,$2) AS adquirido',[MONITORAMENTO_LOCK_NAMESPACE,office])).rows[0].adquirido===true;
    if(!acquired)return {adquirido:false as const};
    const result=await work(stop.signal);
    if(broken)throw new Error('Conexão de exclusividade perdida; verifique o processo antes de recuperar a reserva.');
    return {adquirido:true as const,result};
  }finally{
    signal?.removeEventListener('abort',abort);client.removeListener('error',lost);
    if(acquired&&!broken){
      try{
        const unlocked=await client.query('SELECT pg_advisory_unlock($1,$2) AS liberado',[MONITORAMENTO_LOCK_NAMESPACE,office]);
        if(unlocked.rows[0].liberado!==true)broken=true;
      }catch{broken=true;}
    }
    if(shared&&!broken){try{if((await client.query('SELECT pg_advisory_unlock_shared($1,$2) AS liberado',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0].liberado!==true)broken=true;}catch{broken=true;}}
    // Destroy an uncertain connection instead of returning a possible session lock to the pool.
    client.release(broken?new Error('Conexão de exclusividade descartada.'):undefined);
  }
}

