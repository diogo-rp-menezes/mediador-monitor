import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {Pool} from 'pg';
import {criarPacoteBackup} from './backup-package.js';
import {criarBackupPostgres,type BackupPostgresConfig} from './postgres-backup.js';
import {comSnapshotBackupIsolado} from './postgres-backup-snapshot.js';
import {lerReferenciasBackupPostgres,inventariarArquivosBackup} from './postgres-backup-inventory.js';

/** Rehearsal only. A returned package has survived the snapshot transaction's COMMIT. */
export async function criarPacotePostgresIsolado(pool:Pool,config:BackupPostgresConfig,roots:string[],destination:string,key:Buffer){
  if(!/^mediador_backup_test_[a-f0-9]{32}$/.test(config.database))throw new Error('Criação permitida apenas em origem de ensaio.');
  if(key.length!==32||!roots.length)throw new Error('Chave ou raízes inválidas.');
  const staging=await mkdtemp(join(tmpdir(),'mediador-backup-private-'));
  const output=resolve(destination);let created=false;
  try{
    return await comSnapshotBackupIsolado(pool,config.database,async snapshot=>{
      const dump=join(staging,'main.dump');
      await criarBackupPostgres({...config,output:dump,snapshot});
      const inventory=await inventariarArquivosBackup(await lerReferenciasBackupPostgres(pool,snapshot),roots);
      // An explicit empty map keeps new installations on the recoverable v2 contract.
      const result=await criarPacoteBackup([{source:dump,path:'database/main.dump',references:[]},...inventory.files],output,key);
      created=true;
      return {formato:'criacao-pacote-postgres-isolado-v1',validado:true,banco_temporario:true,
        arquivos_pacote:result.files,arquivos_referenciados:inventory.arquivos,referencias:inventory.referencias};
    });
  }catch(error){
    // Only the exact directory successfully created by this invocation is owned here.
    if(created)await rm(output,{recursive:true,force:true});
    throw error;
  }finally{await rm(staging,{recursive:true,force:true});}
}

