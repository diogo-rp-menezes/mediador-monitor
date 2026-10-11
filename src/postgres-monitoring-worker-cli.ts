import {setTimeout as wait} from 'node:timers/promises';
import {criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {lerArgumentosWorkerMonitoramento,executarCicloMonitoramentoPostgres} from './postgres-monitoring-worker.js';
import {configuracaoColeta} from './coleta-config.js';

const {office,once}=lerArgumentosWorkerMonitoramento(process.argv.slice(2));
configuracaoColeta();
const seconds=Number(process.env.PGMONITOR_INTERVAL_SECONDS??30);
if(!Number.isInteger(seconds)||seconds<5||seconds>3600)throw new Error('PGMONITOR_INTERVAL_SECONDS deve ser inteiro entre 5 e 3600.');
const pool=criarPoolPostgresRuntime(),stop=new AbortController();
const shutdown=()=>stop.abort();process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
pool.on('error',()=>{console.error('[Monitor PostgreSQL] Conexão perdida; encerrando.');process.exitCode=1;shutdown();});
try{
  await validarPapelRuntimePostgres(pool);
  console.log(`[Monitor PostgreSQL] Escritório ${office}; ${once?'ciclo único':'contínuo'}; apenas solicitações existentes.`);
  do{
    if(stop.signal.aborted)break;
    const result=await executarCicloMonitoramentoPostgres(pool,office,{signal:stop.signal});
    if(once||result.reservada)console.log('[Monitor PostgreSQL]',JSON.stringify(result));
    if(result.reservada&&result.resultado_solicitado==='falhou'&&!result.cancelamento_observado){
      process.exitCode=1;break;
    }
    if(once||stop.signal.aborted)break;
    try{await wait(seconds*1000,undefined,{signal:stop.signal});}catch(error){if(!stop.signal.aborted)throw error;}
  }while(!stop.signal.aborted);
}catch{
  console.error('[Monitor PostgreSQL] Execução não concluída. Verifique banco, permissões e reservas antes de reiniciar.');process.exitCode=1;
}finally{
  process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);await pool.end();
}

