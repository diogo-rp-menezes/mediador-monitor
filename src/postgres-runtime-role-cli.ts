import { criarPoolPostgres } from './postgres.js';
import {comEscritorArquivosPostgres} from './postgres-backup-gate.js';

const roleName=process.env.PGAPPUSER?.trim()??'';
const password=process.env.PGAPPASSWORD??'';
if(!/^[a-z][a-z0-9_]{2,62}$/.test(roleName))throw new Error('PGAPPUSER deve ser um identificador minúsculo de 3 a 63 caracteres.');
if(password.length<32)throw new Error('PGAPPASSWORD deve ter ao menos 32 caracteres aleatórios.');
const pool=criarPoolPostgres();
try{
  await comEscritorArquivosPostgres(pool,async()=>{
  const current=await pool.query<{rolsuper:boolean;rolbypassrls:boolean}>('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  if(!current.rows[0]?.rolsuper)throw new Error('O provisionamento exige uma conexão administrativa com privilégio CREATEROLE.');
  const found=await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[roleName]);
  const roleSql=await pool.query<{sql:string}>(found.rowCount
    ?`SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD %L',$1::text,$2::text) sql`
    :`SELECT format('CREATE ROLE %I WITH LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD %L',$1::text,$2::text) sql`,[roleName,password]);
  await pool.query(roleSql.rows[0].sql);
  const grantConnect=await pool.query<{sql:string}>(`SELECT format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),$1::text) sql`,[roleName]);
  await pool.query(grantConnect.rows[0].sql);
  const grantSchema=await pool.query<{sql:string}>(`SELECT format('GRANT USAGE ON SCHEMA %I TO %I',current_schema(),$1::text) sql`,[roleName]);
  await pool.query(grantSchema.rows[0].sql);
  const tables=await pool.query<{table_name:string}>(`SELECT table_name FROM information_schema.tables
    WHERE table_schema=current_schema() AND table_type='BASE TABLE' AND table_name<>'mediador_schema_migrations'`);
  for(const {table_name} of tables.rows){
    const grant=await pool.query<{sql:string}>(`SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.%I TO %I',current_schema(),$1::text,$2::text) sql`,[table_name,roleName]);
    await pool.query(grant.rows[0].sql);
  }
  const sequences=await pool.query<{sequence_name:string}>(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema=current_schema()`);
  for(const {sequence_name} of sequences.rows){
    const grant=await pool.query<{sql:string}>(`SELECT format('GRANT USAGE,SELECT ON SEQUENCE %I.%I TO %I',current_schema(),$1::text,$2::text) sql`,[sequence_name,roleName]);
    await pool.query(grant.rows[0].sql);
  }
  for(const table of ['auditoria_seguranca','auditoria_clientes','auditoria_acessos_publicacoes','tentativas_envio','versoes_interpretacao']){
    const exists=await pool.query('SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=$1',[table]);
    if(!exists.rowCount)continue;
    const revoke=await pool.query<{sql:string}>(`SELECT format('REVOKE UPDATE,DELETE ON TABLE %I.%I FROM %I',current_schema(),$1::text,$2::text) sql`,[table,roleName]);
    await pool.query(revoke.rows[0].sql);
  }
  const verify=await pool.query<{rolsuper:boolean;rolbypassrls:boolean;rolinherit:boolean;rolcanlogin:boolean}>(
    'SELECT rolsuper,rolbypassrls,rolinherit,rolcanlogin FROM pg_roles WHERE rolname=$1',[roleName]);
  if(verify.rows[0]?.rolsuper||verify.rows[0]?.rolbypassrls||verify.rows[0]?.rolinherit||!verify.rows[0]?.rolcanlogin)
    throw new Error('O papel runtime não passou a verificação NOSUPERUSER/NOBYPASSRLS/NOINHERIT/LOGIN.');
  console.log(`Papel ${roleName} provisionado com NOBYPASSRLS e privilégios de aplicação. O segredo não foi exibido.`);
  console.log('Repita este comando após adicionar migrações novas para conceder acesso às novas tabelas.');
  });
}finally{await pool.end();}

