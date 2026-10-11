import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { criarPoolPostgres } from './postgres.js';

const pool=criarPoolPostgres();
const client=await pool.connect();
try{
  await client.query('BEGIN');
  const migrationTable=await client.query<{name:string|null}>("SELECT to_regclass('public.mediador_schema_migrations')::text AS name");
  const migrationApplied=migrationTable.rows[0]?.name
    ?(await client.query<{exists:boolean}>('SELECT EXISTS(SELECT 1 FROM mediador_schema_migrations WHERE version=$1) AS exists',['008_row_level_security.sql'])).rows[0].exists
    :false;
  if(!migrationApplied)await client.query(readFileSync(resolve('migrations/postgres/008_row_level_security.sql'),'utf8'));
  const suffix=randomUUID().replaceAll('-','').slice(0,16),role=`mediador_rls_probe_${suffix}`;
  await client.query(`CREATE ROLE ${role} NOLOGIN NOBYPASSRLS`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await client.query(`GRANT SELECT ON clientes TO ${role}`);
  const officeA=await client.query<{id:number}>('INSERT INTO escritorios(nome) VALUES($1) RETURNING id',[`RLS probe A ${suffix}`]);
  const officeB=await client.query<{id:number}>('INSERT INTO escritorios(nome) VALUES($1) RETURNING id',[`RLS probe B ${suffix}`]);
  await client.query('INSERT INTO clientes(escritorio_id,razao_social,cnpj) VALUES($1,$2,$3),($4,$5,$6)',
    [officeA.rows[0].id,`Empresa RLS A ${suffix}`,`A${suffix}`.slice(0,14),officeB.rows[0].id,`Empresa RLS B ${suffix}`,`B${suffix}`.slice(0,14)]);
  await client.query(`SET LOCAL ROLE ${role}`);
  const count=async()=>Number((await client.query<{total:string}>('SELECT count(*)::text total FROM clientes')).rows[0].total);
  if(await count()!==0)throw new Error('RLS falhou: sem contexto a consulta retornou dados tenant-scoped.');
  await client.query("SELECT set_config('app.escritorio_id', $1, true)",[String(officeA.rows[0].id)]);
  if(await count()!==1)throw new Error('RLS falhou: o escritório A não ficou restrito aos próprios clientes.');
  await client.query("SELECT set_config('app.escritorio_id', $1, true)",[String(officeB.rows[0].id)]);
  if(await count()!==1)throw new Error('RLS falhou: o escritório B não ficou restrito aos próprios clientes.');
  await client.query("SELECT set_config('app.escritorio_id', '', true)");
  await client.query("SELECT set_config('app.global_access', 'true', true)");
  if(await count()!==2)throw new Error('RLS falhou: o escopo global explícito não retornou os dois clientes de teste.');
  await client.query('ROLLBACK');
  console.log(`Isolamento RLS validado com papel NOLOGIN/NOBYPASSRLS${migrationApplied?' usando migração já aplicada':' com migração temporária'}; sem contexto negou dados, dois escritórios ficaram isolados, contexto global explícito funcionou e os dados de teste foram revertidos.`);
}catch(error){
  try{await client.query('ROLLBACK');}catch{/* preserve the migration error */}
  console.error('Falha ao validar migração RLS:',(error as Error).message);
  process.exitCode=1;
}finally{
  client.release();
  await pool.end();
}

