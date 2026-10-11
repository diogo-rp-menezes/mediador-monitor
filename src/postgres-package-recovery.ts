import {join} from 'node:path';
import {recuperarPacoteBackup} from './backup-package.js';
import {backupPostgresConfig,comBackupRestauradoIsolado} from './postgres-backup.js';
import {criarPoolPostgres} from './postgres.js';
import {remapearArquivosBackupIsolado} from './postgres-backup-remap.js';
import {lerReferenciasBackupPostgres,inventariarArquivosBackup} from './postgres-backup-inventory.js';

/** Validation only: fresh disposable database is always dropped, recovered private files remain. */
export async function ensaiarRecuperacaoPacotePostgres(input:string,output:string,key:Buffer,environment:NodeJS.ProcessEnv=process.env){
  const recovered=await recuperarPacoteBackup(input,output,key);
  if(!recovered.references)throw new Error('Ensaio exige pacote v2 com mapa autenticado.');
  const config=backupPostgresConfig(environment);
  return comBackupRestauradoIsolado({...config,backup:join(recovered.path,'database','main.dump')},async database=>{
    const pool=criarPoolPostgres({...environment,PGDATABASE:database});
    try{
      const remapped=await remapearArquivosBackupIsolado(pool,database,recovered.path,recovered.references!);
      const inventory=await inventariarArquivosBackup(await lerReferenciasBackupPostgres(pool),[recovered.path]);
      return {formato:'ensaio-recuperacao-pacote-v1',validado:true,banco_temporario:true,servicos_ativados:false,
        arquivos_pacote:recovered.files,arquivos_referenciados:inventory.arquivos,referencias:inventory.referencias,
        originais_remapeados:remapped.originais,envios_remapeados:remapped.envios};
    }finally{await pool.end();}
  });
}

