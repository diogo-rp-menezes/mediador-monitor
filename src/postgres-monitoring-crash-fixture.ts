// Disposable-database subprocess fixture. Never invokes MTE, downloads, IA or SMTP.
import {criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {executarCicloMonitoramentoPostgres} from './postgres-monitoring-worker.js';
import {criarPersistenciaColetaPostgres} from './postgres-monitoring-persistence.js';
const office=Number(process.env.MEDIADOR_CRASH_TEST_OFFICE);
if(!process.send||!Number.isSafeInteger(office)||office<1||!/^mediador_monitor_test_[a-f0-9]{32}$/.test(process.env.PGDATABASE??''))
  throw new Error('Fixture exige IPC, escritório e banco descartável.');
const pool=criarPoolPostgresRuntime();
try{
  if((await pool.query('SELECT current_database() AS nome')).rows[0].nome!==process.env.PGDATABASE)throw new Error('Banco da fixture divergente.');
  await validarPapelRuntimePostgres(pool);
  const persist=criarPersistenciaColetaPostgres(pool);
  await executarCicloMonitoramentoPostgres(pool,office,{work:async(reservation,signal)=>{
    const monitor=reservation.monitoramento,tipo='Convenção Coletiva';
    await persist(reservation,{name:monitor.nome,cnpj:monitor.cnpj_filtro,categoria:monitor.categoria,uf:monitor.uf,
      titulo:monitor.titulo,vigencia:monitor.vigencia,tipo,tipos:[tipo]},
    {registros:[{numeroRegistro:'DF999997/2026',numeroSolicitacao:'MR999997/2026',tipo,vigencia:'2026',partes:'Ensaio de encerramento abrupto',indice:0}],arquivos:new Map(),erros:[]},signal);
    process.send!({pronto:true,id:reservation.id});
    await new Promise<void>(()=>{});
  }});
}finally{await pool.end();}

