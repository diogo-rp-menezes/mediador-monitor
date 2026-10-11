import {criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {prepararEnviosPostgres} from './postgres-preparacao-envios.js';
import {origemSistemaPreparo} from './postgres-preparation-origin.js';
const match=process.argv.slice(2).join(' ').match(/^--escritorio ([1-9]\d*)(?: --cliente ([1-9]\d*))?$/);
const office=Number(match?.[1]),customer=match?.[2]?Number(match[2]):undefined;
if(!match||!Number.isSafeInteger(office)||(customer!==undefined&&!Number.isSafeInteger(customer)))
  throw new Error('Uso: postgres:preparar-envios -- --escritorio ID [--cliente ID]');
const pool=criarPoolPostgresRuntime();
try{
  await validarPapelRuntimePostgres(pool);
  await withPostgresOfficeTransaction(pool,office,async client=>{
    if(!(await client.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true',[office])).rowCount)throw new Error('Escritório indisponível.');
    if(customer!==undefined&&!(await client.query('SELECT id FROM clientes WHERE id=$1 AND escritorio_id=$2 AND ativo=true',[customer,office])).rowCount)
      throw new Error('Cliente indisponível.');
  });
  const result=await prepararEnviosPostgres(pool,office,customer,undefined,{origem:origemSistemaPreparo});
  console.log('[Preparação PostgreSQL]',JSON.stringify(result));
  if(result.bloqueados)process.exitCode=1;
}catch{console.error('Preparação não concluída. Verifique contexto, documentos, permissões e auditoria.');process.exitCode=1;}
finally{await pool.end();}

