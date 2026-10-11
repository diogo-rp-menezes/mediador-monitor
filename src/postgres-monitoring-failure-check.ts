import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {MONITORAMENTO_LOCK_NAMESPACE} from './postgres-monitoring-lock.js';
import {executarCicloMonitoramentoPostgres} from './postgres-monitoring-worker.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {solicitarMonitoramentoPostgres} from './postgres-monitoring-requests.js';
import {concluirMonitoramentoPostgres} from './postgres-monitoring-reservation.js';

/** Destructive fault injection ONLY in the caller's disposable test database, never operational data. */
export async function conferirPerdaConexaoMonitoramento(worker:Pool,observer:Pool,admin:Pool,
  fixture:{officeA:number;officeB:number;monitorA:number;monitorB:number;actor:number}){
  const {officeA,officeB,monitorA,monitorB,actor}=fixture;
  const database=(await admin.query('SELECT current_database() AS nome')).rows[0].nome;
  if(!/^mediador_monitor_test_[a-f0-9]{32}$/.test(database))throw new Error('Injeção de falha exige banco descartável de monitoramento.');
  for(const pool of [worker,observer])if((await pool.query('SELECT current_database() AS nome')).rows[0].nome!==database)
    throw new Error('Pools de teste divergentes.');
  const request=(office:number,monitor:number)=>withPostgresOfficeTransaction(observer,office,client=>solicitarMonitoramentoPostgres(client,office,actor,{monitoramento_id:monitor}));
  const id=await request(officeA,monitorA);await request(officeB,monitorB);
  let ready!:()=>void,release!:()=>void,abort!:()=>void,oldToken='';
  const started=new Promise<void>(resolve=>{ready=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
  const stopped=new Promise<void>(resolve=>{abort=resolve;});
  const bounded=async(promise:Promise<void>)=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Falha de teste não observada no prazo.')),5000);})]);}
    finally{if(timer)clearTimeout(timer);}
  };
  const running=executarCicloMonitoramentoPostgres(worker,officeA,{work:async(reservation,signal)=>{
    oldToken=reservation.token;signal.addEventListener('abort',abort,{once:true});ready();await held;
  }}).then(result=>({result,error:undefined}),error=>({result:undefined,error}));
  try{
    await bounded(started);
    // Identify exactly the advisory-lock backend for this test office and database.
    const sessions=(await admin.query(`SELECT a.pid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
      WHERE a.datname=current_database() AND l.locktype='advisory' AND l.granted
      AND l.classid=$1::oid AND l.objid=$2::oid AND l.objsubid=2`,[MONITORAMENTO_LOCK_NAMESPACE,officeA])).rows;
    assert.equal(sessions.length,1);
    assert.equal((await admin.query('SELECT pg_terminate_backend($1) AS encerrada',[sessions[0].pid])).rows[0].encerrada,true);
    await bounded(stopped);
    assert.equal((await admin.query('SELECT status FROM execucoes_escritorio WHERE id=$1',[id])).rows[0].status,'executando');
    let duplicateStarted=false;
    assert.equal((await executarCicloMonitoramentoPostgres(observer,officeA,{work:async()=>{duplicateStarted=true;}})).reservada,false);
    assert.equal(duplicateStarted,false);
    await assert.rejects(()=>request(officeA,monitorA));
    const independent=await executarCicloMonitoramentoPostgres(observer,officeB,{work:async()=>{}});
    assert.equal(independent.reservada,true);
    assert.equal((await admin.query('SELECT status FROM execucoes_escritorio WHERE id=$1',[independent.execucao_id])).rows[0].status,'concluida');
  }finally{release();await running;}
  const outcome=await running;assert.match(String(outcome.error),/exclusividade perdida/);
  assert.equal((await admin.query('SELECT status FROM execucoes_escritorio WHERE id=$1',[id])).rows[0].status,'falhou');
  await assert.rejects(()=>concluirMonitoramentoPostgres(observer,officeA,id,oldToken,'concluida'));
  await request(officeA,monitorA);
  assert.equal((await executarCicloMonitoramentoPostgres(worker,officeA,{work:async()=>{}})).reservada,true);
}

