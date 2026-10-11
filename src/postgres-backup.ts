import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, unlink,open } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import {validarSnapshotBackup} from './postgres-backup-snapshot.js';

export interface BackupPostgresConfig { container:string; database:string; user:string; output:string; }

export function backupPostgresConfig(env:NodeJS.ProcessEnv=process.env, output?:string):BackupPostgresConfig {
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const target=resolve(output||env.POSTGRES_BACKUP_PATH||`data/backups/mediador-${stamp}.dump`);
  if(!target.endsWith('.dump'))throw new Error('O arquivo de backup deve usar a extensão .dump.');
  return {container:env.POSTGRES_CONTAINER?.trim()||'mediador-postgres',database:env.POSTGRES_DB?.trim()||env.PGDATABASE?.trim()||'mediador',user:env.POSTGRES_USER?.trim()||env.PGUSER?.trim()||'mediador',output:target};
}

function command(command:string,args:string[],input?:NodeJS.ReadableStream):Promise<void>{
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{stdio:[input?'pipe':'ignore','ignore','pipe'],windowsHide:true});let error='';
    child.stderr?.on('data',chunk=>{error+=String(chunk);});
    if(input)void pipeline(input,child.stdin!).catch(reject);
    child.on('error',error=>reject(new Error(`Não foi possível executar ${command}: ${error.message}`)));
    child.on('close',code=>code===0?resolvePromise():reject(new Error(`${command} falhou (${code}): ${error.trim()||'sem detalhes'}`)));
  });
}

export async function criarBackupPostgres(config:BackupPostgresConfig&{snapshot?:string}):Promise<{path:string;bytes:number}>{
  if(config.snapshot!==undefined)validarSnapshotBackup(config.snapshot);
  await mkdir(dirname(config.output),{recursive:true});
  const output=await open(config.output,'wx');
  const child=spawn('docker',['exec','-i',config.container,'pg_dump','-U',config.user,'-d',config.database,'--format=custom','--no-owner','--no-privileges',...(config.snapshot?['--snapshot='+config.snapshot]:[])],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let error='';child.stderr?.on('data',chunk=>{error+=String(chunk);});
  const closed=new Promise<number|null>((resolvePromise,reject)=>{child.once('close',resolvePromise);child.once('error',reject);});
  try{
    const [,code]=await Promise.all([pipeline(child.stdout,output.createWriteStream()),closed]);
    if(code!==0)throw new Error(`pg_dump falhou (${code}): ${error.trim()||'sem detalhes'}`);
    const bytes=statSync(config.output).size;if(bytes<1)throw new Error('O backup PostgreSQL ficou vazio.');
    return {path:config.output,bytes};
  }catch(error){
    child.kill();await output.close().catch(()=>{});
    try{await unlink(config.output);}catch{/* arquivo parcial não deve permanecer */}
    throw error;
  }
}

export async function comBackupRestauradoIsolado<T>(config:Omit<BackupPostgresConfig,'output'>&{backup:string;ensaioOperacional?:boolean},work:(database:string)=>Promise<T>):Promise<T>{
  const backup=resolve(config.backup);
  if(!existsSync(backup)||statSync(backup).size<1)throw new Error(`Backup não encontrado ou vazio: ${backup}`);
  if(basename(backup)!==basename(config.backup))throw new Error('Caminho de backup inválido.');
  const restoreDb=`${config.ensaioOperacional?'mediador_cutover_test_':'mediador_import_test_'}${randomUUID().replaceAll('-','')}`;
  let created=false;
  try{
    await command('docker',['exec','-i',config.container,'createdb','-U',config.user,restoreDb]);
    created=true;
    await command('docker',['exec','-i',config.container,'pg_restore','-U',config.user,'-d',restoreDb,'--exit-on-error','--single-transaction','--no-owner','--no-privileges'],createReadStream(backup));
    await command('docker',['exec','-i',config.container,'psql','-U',config.user,'-d',restoreDb,'-v','ON_ERROR_STOP=1','-Atqc',"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM mediador_schema_migrations) THEN RAISE EXCEPTION 'Backup sem migrações aplicadas'; END IF; END $$"]);
    return await work(restoreDb);
  }finally{
    if(created)await command('docker',['exec','-i',config.container,'dropdb','-U',config.user,'--if-exists',restoreDb]);
  }
}
export async function validarRestauracaoPostgres(config:Omit<BackupPostgresConfig,'output'>&{backup:string}):Promise<void>{
  await comBackupRestauradoIsolado(config,async()=>{});
}

