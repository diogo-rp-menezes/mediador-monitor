import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const container='mediador-clean-recovery-'+randomUUID(),password=randomBytes(32).toString('base64'),runtimePassword=randomBytes(32).toString('base64');
const docker=(args,options={})=>execFileSync('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});
let created=false;
async function nodeScript(file,env){
  const child=spawn(process.execPath,[file],{env,windowsHide:true,stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  assert.equal(code,0,'Etapa de recuperação em Docker limpo deve concluir.');
}
try{
  assert.match(container,/^mediador-clean-recovery-[a-f0-9-]{36}$/);
  docker(['run','--detach','--rm','--name',container,'--label','mediador.test=clean-recovery','--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD','--env','POSTGRES_USER=mediador','--env','POSTGRES_DB=mediador_clean','postgres:18.6-alpine3.24'],{env:{...process.env,POSTGRES_PASSWORD:password}});created=true;
  let ready=false;const deadline=Date.now()+60000;
  while(Date.now()<deadline){try{docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','mediador','-d','mediador_clean']);ready=true;break;}catch{}await delay(250);}
  assert.ok(ready,'PostgreSQL limpo deve iniciar.');
  const mapping=docker(['port',container,'5432/tcp']).toString().trim();assert.match(mapping,/^127\.0\.0\.1:\d+$/);
  const env={...process.env,PGHOST:'127.0.0.1',PGPORT:mapping.split(':')[1],PGDATABASE:'mediador_clean',PGUSER:'mediador',PGPASSWORD:password,PGAPPUSER:'mediador_runtime_clean',PGAPPASSWORD:runtimePassword,PGSSLMODE:'disable',POSTGRES_CONTAINER:container,POSTGRES_USER:'mediador',POSTGRES_DB:'mediador_clean',MEDIADOR_CLEAN_RESTORE:'1'};
  await nodeScript('dist/postgres-cli.js',env);
  await nodeScript('dist/postgres-runtime-role-cli.js',env);
  await nodeScript('test/postgres-encrypted-backup.integration.mjs',env);
  console.log('OK: recuperação cifrada em contêiner/volume novos, papel runtime provisionado e HTTP sobre banco restaurado.');
}catch{
  console.error('Ensaio Docker limpo não concluído. Confira Docker, imagem PostgreSQL local e resultados das etapas.');process.exitCode=1;
}finally{
  if(created){assert.match(container,/^mediador-clean-recovery-[a-f0-9-]{36}$/);docker(['rm','--force',container]);}
}
