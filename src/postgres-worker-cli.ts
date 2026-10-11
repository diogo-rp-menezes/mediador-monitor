import {setTimeout as wait} from 'node:timers/promises';
import {criarPoolPostgresRuntime} from './postgres.js';
import {executarCicloFilasPostgres} from './postgres-worker.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';

const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--once'))throw new Error('Uso: postgres:worker [--once]');
const once=args.includes('--once');
const seconds=Number(process.env.PGWORKER_INTERVAL_SECONDS||30);
if(!Number.isInteger(seconds)||seconds<5||seconds>3600)throw new Error('PGWORKER_INTERVAL_SECONDS deve ser inteiro entre 5 e 3600.');
const pool=criarPoolPostgresRuntime(),stop=new AbortController();
const shutdown=()=>stop.abort();process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
pool.on('error',()=>{console.error('[Worker PostgreSQL] Conexão ociosa perdida. Encerrando o worker.');process.exitCode=1;shutdown();});
try{
  await validarPapelRuntimePostgres(pool);
  console.log(`[Worker PostgreSQL] ${once?'Ciclo único':'Ativo'}; apenas filas existentes, intervalo ${seconds}s.`);
  while(!stop.signal.aborted){
    const result=await executarCicloFilasPostgres(pool,{signal:stop.signal,onError:(office,queue)=>console.error(`[Worker PostgreSQL] Falha no escritório ${office}, fila ${queue}. Consulte os registros operacionais.`)});
    if(once||result.escritorios)console.log('[Worker PostgreSQL]',JSON.stringify(result));
    if(once){if(result.falhas)process.exitCode=1;break;}
    try{await wait(seconds*1000,undefined,{signal:stop.signal});}catch(error){if(!stop.signal.aborted)throw error;}
  }
}catch(error){console.error('[Worker PostgreSQL]',(error as Error).message);process.exitCode=1;}
finally{process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);await pool.end();}

