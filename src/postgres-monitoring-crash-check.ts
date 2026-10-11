import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import type {Pool} from 'pg';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {solicitarMonitoramentoPostgres} from './postgres-monitoring-requests.js';
import {executarCicloMonitoramentoPostgres} from './postgres-monitoring-worker.js';
import {recuperarMonitoramentoPostgres} from './postgres-monitoring-recovery.js';
import {concluirMonitoramentoPostgres} from './postgres-monitoring-reservation.js';
import {MONITORAMENTO_LOCK_NAMESPACE} from './postgres-monitoring-lock.js';

export async function conferirEncerramentoAbruptoMonitoramento(pool:Pool,admin:Pool,
  fixture:{officeA:number;officeB:number;monitorA:number;monitorB:number;actor:number}){
  const database=(await admin.query('SELECT current_database() AS nome')).rows[0].nome;
  if(!/^mediador_monitor_test_[a-f0-9]{32}$/.test(database)||(await pool.query('SELECT current_database() AS nome')).rows[0].nome!==database)
    throw new Error('Encerramento abrupto exige pools do mesmo banco descartável.');
  const {officeA,officeB,monitorA,monitorB,actor}=fixture;
  const request=(office:number,monitor:number)=>withPostgresOfficeTransaction(pool,office,client=>solicitarMonitoramentoPostgres(client,office,actor,{monitoramento_id:monitor}));
  const id=await request(officeA,monitorA);
  const child=spawn(process.execPath,['--import','tsx',resolve('src/postgres-monitoring-crash-fixture.ts')],{
    env:{...process.env,PGDATABASE:database,PGPOOL_MAX:'2',MEDIADOR_CRASH_TEST_OFFICE:String(officeA)},
    stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false,
  });
  const closed=new Promise<void>((resolve,reject)=>{child.once('close',()=>resolve());child.once('error',reject);});
  // Observe errors immediately; the same promise is awaited during cleanup.
  void closed.catch(()=>{});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await new Promise<void>((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Fixture não iniciou no prazo.')),15000);
      child.once('error',reject);child.once('exit',()=>reject(new Error('Fixture encerrou antes da coleta.')));
      child.once('message',message=>{
        const value=message as {pronto?:boolean;id?:number};
        if(value.pronto===true&&value.id===id)resolve();else reject(new Error('Mensagem da fixture divergente.'));
      });
    });
  }finally{
    if(timer)clearTimeout(timer);
    child.kill('SIGKILL');await closed;
  }
  const before=(await admin.query('SELECT status,detalhes_json FROM execucoes_escritorio WHERE id=$1',[id])).rows[0];
  assert.equal(before.status,'executando');assert.ok(before.detalhes_json.coletas['Convenção Coletiva']);
  const deadline=Date.now()+5000;
  while(Number((await admin.query(`SELECT count(*) n FROM pg_locks WHERE locktype='advisory' AND granted
    AND classid=$1::oid AND objid=$2::oid AND objsubid=2`,[MONITORAMENTO_LOCK_NAMESPACE,officeA])).rows[0].n)>0){
    if(Date.now()>deadline)throw new Error('Bloqueio do subprocesso não foi liberado.');await wait(25);
  }
  let duplicate=false;
  assert.equal((await executarCicloMonitoramentoPostgres(pool,officeA,{work:async()=>{duplicate=true;}})).reservada,false);
  assert.equal(duplicate,false);await assert.rejects(()=>request(officeA,monitorA));
  await request(officeB,monitorB);assert.equal((await executarCicloMonitoramentoPostgres(pool,officeB,{work:async()=>{}})).reservada,true);
  const input={justificativa:'Subprocesso de teste encerrado e saída observada',consumidor_encerrado:true};
  await assert.rejects(()=>recuperarMonitoramentoPostgres(pool,officeB,id,input,async()=>{throw new Error('Não deve auditar');}));
  await assert.rejects(()=>recuperarMonitoramentoPostgres(pool,officeA,id,input,async()=>{throw new Error('Auditoria indisponível');}));
  assert.equal((await admin.query('SELECT status FROM execucoes_escritorio WHERE id=$1',[id])).rows[0].status,'executando');
  await recuperarMonitoramentoPostgres(pool,officeA,id,input,async(client,details)=>{
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,'MONITORAMENTO_EXECUCAO_RECUPERADA',$2,$3,'127.0.0.1','ensaio-crash',$4,$5::jsonb)`,
      [actor,officeA,Date.now(),randomUUID(),JSON.stringify(details)]);
  });
  const after=(await admin.query('SELECT status,detalhes_json FROM execucoes_escritorio WHERE id=$1',[id])).rows[0];
  assert.equal(after.status,'falhou');assert.deepEqual(after.detalhes_json.coletas,before.detalhes_json.coletas);
  assert.equal(after.detalhes_json.reserva_token,undefined);
  await assert.rejects(()=>concluirMonitoramentoPostgres(pool,officeA,id,before.detalhes_json.reserva_token,'concluida'));
  assert.equal(Number((await admin.query("SELECT count(*) n FROM registros WHERE numero_registro='DF999997/2026'")).rows[0].n),1);
  assert.equal(Number((await admin.query("SELECT count(*) n FROM auditoria_seguranca WHERE acao='MONITORAMENTO_EXECUCAO_RECUPERADA' AND detalhes_json->>'execucao_id'=$1",[String(id)])).rows[0].n),1);
  await request(officeA,monitorA);assert.equal((await executarCicloMonitoramentoPostgres(pool,officeA,{work:async()=>{}})).reservada,true);
}

