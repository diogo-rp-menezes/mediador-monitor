import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withPostgresOfficeTransaction as scoped} from '../dist/postgres-transaction.js';
import {solicitarMonitoramentoPostgres} from '../dist/postgres-monitoring-requests.js';
import {reservarMonitoramentoPostgres,concluirMonitoramentoPostgres} from '../dist/postgres-monitoring-reservation.js';
import {executarCicloMonitoramentoPostgres} from '../dist/postgres-monitoring-worker.js';
import {criarTrabalhoColetaPostgres} from '../dist/postgres-monitoring-collection.js';
import {criarPersistenciaColetaPostgres} from '../dist/postgres-monitoring-persistence.js';
import {agendarMonitoramentoPostgres} from '../dist/postgres-monitoring-schedule.js';
import {recuperarMonitoramentoPostgres} from '../dist/postgres-monitoring-recovery.js';

/** Real worker/adapter/persistence; controlled scraper boundary, never opens a browser or contacts MTE. */
export async function prepararMonitoramentoBackup(pool,office,other,actor){
  assert.match((await pool.query('SELECT current_database() nome')).rows[0].nome,/^mediador_backup_test_[a-f0-9]{32}$/);
  const monitors=[];
  for(const [id,name] of [[office,'A concluído/interrompido'],[office,'A pendente'],[office,'A agenda'],[other,'B pendente']]){
    const sindicato=(await pool.query('INSERT INTO sindicatos(nome) VALUES($1) RETURNING id',['Sindicato sintético '+name])).rows[0].id;
    monitors.push((await pool.query(`INSERT INTO monitoramentos_escritorios(escritorio_id,sindicato_id,nome,categoria,tipos_json)
      VALUES($1,$2,$3,'Teste','["Convenção Coletiva"]'::jsonb) RETURNING id`,[id,sindicato,name])).rows[0].id);
  }
  let calls=0,opened=0,closed=0;
  const work=runtime=>criarTrabalhoColetaPostgres(criarPersistenciaColetaPostgres(runtime),{baixarOriginais:false},{
    abrir:async()=>{opened++;return {};},fechar:async()=>{closed++;},consultar:async(_session,host,path,watch)=>{
      assert.equal(host,'https://mediador.trabalho.gov.br/');assert.equal(path,'/sistemas/mediador/ConsultarInstColetivo');calls++;
      return {registros:[{numeroRegistro:`DF91000${calls}/2026`,numeroSolicitacao:'MRTESTE',tipo:watch.tipo,vigencia:'2026',partes:'Partes sintéticas',indice:0}],arquivos:new Map(),erros:[]};
    }
  });
  const request=(o,monitor)=>scoped(pool,o,tx=>solicitarMonitoramentoPostgres(tx,o,actor,{monitoramento_id:monitor}));
  await request(office,monitors[0]);assert.equal((await executarCicloMonitoramentoPostgres(pool,office,{work:work(pool)})).resultado_solicitado,'concluida');
  await request(office,monitors[0]);const active=await reservarMonitoramentoPostgres(pool,office);assert.ok(active);
  const pending=await request(office,monitors[1]),otherPending=await request(other,monitors[3]);
  await pool.query('UPDATE monitoramentos_escritorios SET agenda_ativa=true,agenda_intervalo_minutos=10080 WHERE id=$1',[monitors[2]]);
  const agenda=await agendarMonitoramentoPostgres(pool,office,{monitoramento_id:monitors[2],intervalo_minutos:10080},{exigirAgenda:true});assert.equal(agenda.criada,true);
  const before=(await pool.query('SELECT * FROM execucoes_escritorio ORDER BY id')).rows;
  const filters=(await pool.query('SELECT * FROM monitoramentos_escritorios ORDER BY id')).rows;
  assert.equal(calls,1);assert.equal(opened,closed);
  return {async validar(target,runtime){
    assert.match((await target.query('SELECT current_database() nome')).rows[0].nome,/^mediador_import_test_[a-f0-9]{32}$/);
    assert.deepEqual((await target.query('SELECT * FROM execucoes_escritorio ORDER BY id')).rows,before);
    assert.deepEqual((await target.query('SELECT * FROM monitoramentos_escritorios ORDER BY id')).rows,filters);
    assert.equal((await scoped(runtime,other,tx=>tx.query('SELECT id FROM execucoes_escritorio WHERE id=$1',[pending]))).rowCount,0);
    assert.equal((await executarCicloMonitoramentoPostgres(runtime,office,{work:work(runtime)})).reservada,false);assert.equal(calls,1);
    assert.equal((await agendarMonitoramentoPostgres(runtime,office,{monitoramento_id:monitors[2],intervalo_minutos:10080},{exigirAgenda:true})).criada,false);
    const consumed=await executarCicloMonitoramentoPostgres(runtime,other,{work:work(runtime)});assert.equal(consumed.execucao_id,otherPending);assert.equal(consumed.resultado_solicitado,'concluida');
    const recovery={justificativa:'Processo anterior encerrado antes de restaurar a cópia',consumidor_encerrado:true};
    const audit=(tx,details)=>tx.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,'ENSAIO_RECUPERACAO_MONITORAMENTO',$2,$3,'127.0.0.1','teste',$4,$5::jsonb)`,[actor,office,Date.now(),randomUUID(),JSON.stringify(details)]);
    await assert.rejects(recuperarMonitoramentoPostgres(runtime,other,active.id,recovery,audit),{status:409});
    assert.equal((await recuperarMonitoramentoPostgres(runtime,office,active.id,recovery,audit)).status,'falhou');
    await assert.rejects(concluirMonitoramentoPostgres(runtime,office,active.id,active.token,'concluida'),{status:409});
    for(const id of [pending,agenda.id]){const result=await executarCicloMonitoramentoPostgres(runtime,office,{work:work(runtime)});assert.equal(result.execucao_id,id);assert.equal(result.resultado_solicitado,'concluida');}
    assert.equal((await executarCicloMonitoramentoPostgres(runtime,office,{work:work(runtime)})).reservada,false);
    assert.equal((await executarCicloMonitoramentoPostgres(runtime,other,{work:work(runtime)})).reservada,false);
    assert.equal(calls,4);assert.equal(opened,closed);
    assert.equal(Number((await target.query("SELECT count(*) n FROM registros WHERE numero_registro LIKE 'DF91000%/2026'")).rows[0].n),4);
    assert.equal(Number((await target.query("SELECT count(*) n FROM auditoria_seguranca WHERE acao='ENSAIO_RECUPERACAO_MONITORAMENTO'")).rows[0].n),1);
  }};
}
