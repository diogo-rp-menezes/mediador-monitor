import {criarPoolPostgres,criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {importarPacoteOperacionalPostgres} from './postgres-operational-import.js';
import {conferirArquivosPacoteMigracao} from './postgres-migration-package.js';

const args=process.argv.slice(2);
try{
  if(args.length!==3||args[0]!=='--manifest'||!args[1]||args[2]!=='--execute')throw new Error('Uso: postgres:importar-pacote -- --manifest <manifesto.json> --execute');
  const runtime=criarPoolPostgresRuntime();
  try{await validarPapelRuntimePostgres(runtime);}finally{await runtime.end();}
  const pool=criarPoolPostgres();
  try{
    const key=Buffer.from(process.env.CREDENTIALS_MASTER_KEY??'','base64');
    const {manifest}=conferirArquivosPacoteMigracao(args[1],key);
    const database=(await pool.query('SELECT current_database() nome')).rows[0].nome;
    if(database!==manifest.destino.database)throw new Error('Banco configurado diverge do pacote.');
    const result=await importarPacoteOperacionalPostgres(pool,args[1],key,{bloquearOrigemParaCorte:true});
    console.log(JSON.stringify({etapa:result.escopo,retomado:result.checkpoint.retomado,
      tabelas:result.tabelas.length,linhas:result.tabelas.reduce((sum,table)=>sum+table.linhas,0),
      destino_preexistente_preservado:result.destino_preexistente_preservado,corte_aplicacao_executado:false},null,2));
  }finally{await pool.end();}
}catch(error){
  console.error('Importação operacional não concluída:',(error as {code?:string}).code??(error as Error).name);
  process.exitCode=1;
}

