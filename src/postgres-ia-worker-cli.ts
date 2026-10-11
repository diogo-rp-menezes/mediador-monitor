import {criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {executarSolicitacaoIaPostgres} from './postgres-ia-worker.js';
if(process.argv.length>2)throw new Error('Este comando executa uma solicitação existente por chamada, sem argumentos.');
const pool=criarPoolPostgresRuntime(),stop=new AbortController(),shutdown=()=>stop.abort();
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
pool.on('error',()=>{process.exitCode=1;shutdown();});
try{
  await validarPapelRuntimePostgres(pool);
  const result=await executarSolicitacaoIaPostgres(pool,{signal:stop.signal});console.log('[Fila IA PostgreSQL]',JSON.stringify(result));
  if(result.reservada&&result.status==='falhou')process.exitCode=1;
}catch{console.error('[Fila IA PostgreSQL] Execução não concluída. Confira solicitações e tentativas antes de repetir.');process.exitCode=1;}
finally{process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);await pool.end();}

