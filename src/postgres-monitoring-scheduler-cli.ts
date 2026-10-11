import {setTimeout as wait} from 'node:timers/promises';
import {criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {AgendamentoMonitoramentoSchema,agendarMonitoramentoPostgres} from './postgres-monitoring-schedule.js';
import {executarAgendasPostgres} from './postgres-monitoring-agendas.js';

const match=process.argv.slice(2).join(' ').match(/^--escritorio ([1-9]\d*)(?: --monitoramento ([1-9]\d*) --intervalo-minutos ([1-9]\d*))?(?: (--continuous))?$/);
const office=Number(match?.[1]);
if(!match||!Number.isSafeInteger(office))throw new Error('Uso: postgres:agendar -- --escritorio ID --monitoramento ID --intervalo-minutos 60..10080 [--continuous]');
const settings=match[2]?AgendamentoMonitoramentoSchema.parse({monitoramento_id:Number(match[2]),intervalo_minutos:Number(match[3])}):null;
const pool=criarPoolPostgresRuntime(),stop=new AbortController(),shutdown=()=>stop.abort();
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
pool.on('error',()=>{process.exitCode=1;shutdown();});
try{
  await validarPapelRuntimePostgres(pool);
  do{
    if(stop.signal.aborted)break;
    const result=settings?await agendarMonitoramentoPostgres(pool,office,settings):await executarAgendasPostgres(pool,office);
    if(!match[4]||('criada' in result?result.criada:result.criadas>0))console.log('[Agendamento PostgreSQL]',JSON.stringify(result));
    if(!match[4]||stop.signal.aborted)break;
    try{await wait(30000,undefined,{signal:stop.signal});}catch(error){if(!stop.signal.aborted)throw error;}
  }while(!stop.signal.aborted);
}catch{
  console.error('Agendamento interrompido. Verifique escritório, filtro, banco e permissões.');process.exitCode=1;
}finally{
  process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);await pool.end();
}

