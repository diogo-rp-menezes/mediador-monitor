import { criarPoolPostgresRuntime } from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';

const pool=criarPoolPostgresRuntime();
try{
  const role=await validarPapelRuntimePostgres(pool);
  console.log(`Conectado como ${role.nome}: NOSUPERUSER, NOBYPASSRLS, NOINHERIT e sem associação a outros papéis.`);
}finally{await pool.end();}

