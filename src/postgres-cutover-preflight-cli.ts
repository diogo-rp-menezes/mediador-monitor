import {criarPoolPostgres,criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {verificarPacoteMigracao} from './postgres-migration-rehearsal.js';

const args=process.argv.slice(2);
try{
  if(args.length!==2||args[0]!=='--manifest'||!args[1])throw new Error('Informe --manifest <manifesto.json>.');
  const pacote=await verificarPacoteMigracao(args[1]);
  const runtime=criarPoolPostgresRuntime();
  let papel;
  try{papel=await validarPapelRuntimePostgres(runtime);}finally{await runtime.end();}
  const admin=criarPoolPostgres();
  let conexoes:number;
  try{
    // Idle application pools can resume writing too; count all other sessions.
    const result=await admin.query<{n:string}>(`SELECT count(*)::text n FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid()`);
    conexoes=Number(result.rows[0].n);
  }finally{await admin.end();}
  console.log(JSON.stringify({operacao:'prechecagem_sem_mutacoes',pacote_verificado:pacote.manifesto,
    runtime_validado:papel.validado,outras_conexoes_postgres:conexoes,
    destino_postgres_sem_outros_processos:conexoes===0,corte_habilitado:false,
    pendencias:['Confirmar parada dos processos SQLite e alterações de originais; a checagem PostgreSQL não identifica esses processos.',
      ...(conexoes?['Parar os outros processos conectados ao PostgreSQL antes do corte.']:[]),
      'Concluir proteção de filas e procedimento operacional de reversão antes de executar o corte.',
      'Concluir equivalência dos fluxos necessários e validação HTTP dos dados importados.']},null,2));
}catch(error){
  console.error('Pré-checagem não concluída:',(error as {code?:string}).code??(error as Error).name);
  process.exitCode=1;
}

