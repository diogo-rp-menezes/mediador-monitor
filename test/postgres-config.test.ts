import { expect,it } from 'vitest';
import { postgresConfigFromEnv, postgresRuntimeConfigFromEnv } from '../src/postgres.js';

it('builds a local PostgreSQL pool configuration without exposing defaults beyond loopback',()=>{
 expect(postgresConfigFromEnv({})).toMatchObject({host:'127.0.0.1',port:5432,database:'mediador',user:'mediador',ssl:false,max:5});
});

it('accepts explicit Docker connection values and bounds pool settings',()=>{
 expect(postgresConfigFromEnv({PGHOST:'127.0.0.1',PGPORT:'54329',PGDATABASE:'dev',PGUSER:'app',PGPASSWORD:'secret',PGSSLMODE:'verify-full',PGPOOL_MAX:'50'}))
   .toMatchObject({host:'127.0.0.1',port:54329,database:'dev',user:'app',password:'secret',ssl:{rejectUnauthorized:true},max:10});
});

it('rejects invalid port and SSL mode configuration',()=>{
 expect(()=>postgresConfigFromEnv({PGPORT:'70000'})).toThrow(/PGPORT/);
 expect(()=>postgresConfigFromEnv({PGSSLMODE:'unsafe'})).toThrow(/PGSSLMODE/);
});

it('requires distinct runtime credentials and never falls back to admin credentials',()=>{
 expect(()=>postgresRuntimeConfigFromEnv({PGUSER:'admin',PGPASSWORD:'admin-secret'})).toThrow(/PGAPPUSER/);
 expect(()=>postgresRuntimeConfigFromEnv({PGUSER:'admin',PGAPPUSER:'admin',PGAPPASSWORD:'runtime-secret'})).toThrow(/diferente/);
 expect(postgresRuntimeConfigFromEnv({PGUSER:'admin',PGPASSWORD:'admin-secret',PGAPPUSER:'app_runtime',PGAPPASSWORD:'runtime-secret'}))
   .toMatchObject({user:'app_runtime',password:'runtime-secret'});
});
