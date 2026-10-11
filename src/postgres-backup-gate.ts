/** Cooperative database-local gate; only participating writers are covered. */
import type {Pool} from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import {ErroCadastro} from './cadastros.js';
const participants=new AsyncLocalStorage<{pool:Pool;signal:AbortSignal}>();
// Keep one connection available for work performed while a shared gate is held.
// Otherwise concurrent HTTP requests can occupy the entire pool with gates.
const slots=new WeakMap<Pool,{active:number;waiting:Array<()=>void>}>();
async function reservarParticipacao(pool:Pool):Promise<()=>void>{
  let state=slots.get(pool);if(!state){state={active:0,waiting:[]};slots.set(pool,state);}
  const current=state,limit=(pool.options?.max??10)-1;
  if(current.active<limit)current.active++;
  else await new Promise<void>((resolve,reject)=>{
    const next=()=>{clearTimeout(timer);resolve();};
    const timer=setTimeout(()=>{const index=current.waiting.indexOf(next);if(index>=0)current.waiting.splice(index,1);reject(new ErroCadastro('Aplicação ocupada. Tente novamente.',503));},pool.options?.connectionTimeoutMillis||5000);
    current.waiting.push(next);
  });
  return ()=>{const next=current.waiting.shift();if(next)next();else current.active--;};
}
export const BACKUP_WRITER_NAMESPACE=817204630;
export const BACKUP_WRITER_KEY=1;

export async function comEscritorArquivosPostgres<T>(pool:Pool,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const participant=participants.getStore();
  if(participant?.pool===pool){participant.signal.throwIfAborted();return work(participant.signal);}
  if((pool.options?.max??10)<2)throw new Error('Operação exige pool de pelo menos duas conexões.');
  const releaseSlot=await reservarParticipacao(pool);
  try{
  const client=await pool.connect(),stop=new AbortController();let acquired=false,broken=false;
  const lost=()=>{broken=true;stop.abort();};client.on('error',lost);
  try{
    try{acquired=(await client.query('SELECT pg_try_advisory_lock_shared($1,$2) AS adquirido',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0].adquirido===true;}catch(error){broken=true;throw error;}
    if(!acquired)throw new ErroCadastro('Backup em andamento. Tente novamente após a conclusão.',409);
    const result=await participants.run({pool,signal:stop.signal},()=>work(stop.signal));stop.signal.throwIfAborted();return result;
  }finally{
    let unlockFailed=false;
    if(acquired&&!broken){try{if((await client.query('SELECT pg_advisory_unlock_shared($1,$2) AS liberado',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0].liberado!==true)unlockFailed=true;}catch{unlockFailed=true;}}
    client.removeListener('error',lost);client.release(broken||unlockFailed?new Error('Participação no backup perdida.'):undefined);
    if(unlockFailed)throw new Error('Não foi possível liberar participação no backup.');
  }
  }finally{releaseSlot();}
}

