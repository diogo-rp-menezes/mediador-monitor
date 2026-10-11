import 'dotenv/config';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { backupPostgresConfig, criarBackupPostgres, validarRestauracaoPostgres } from './postgres-backup.js';

dotenv.config({path:'.env.docker',override:false});
const args=process.argv.slice(2);
const outputIndex=args.indexOf('--output');
const backupIndex=args.indexOf('--backup');
const output=outputIndex>=0?args[outputIndex+1]:undefined;
const backup=backupIndex>=0?args[backupIndex+1]:undefined;
try{
  if(args[0]==='criar'){
    if(args.some((arg,index)=>arg==='--output'&&!args[index+1]))throw new Error('Informe o caminho após --output.');
    const created=await criarBackupPostgres(backupPostgresConfig(process.env,output));
    console.log(`Backup PostgreSQL criado: ${created.path} (${created.bytes} bytes).`);
  }else if(args[0]==='validar-restauracao'){
    if(!backup||args.some((arg,index)=>arg==='--backup'&&!args[index+1]))throw new Error('Uso: npm run postgres:backup:validar -- --backup <arquivo.dump>');
    const config=backupPostgresConfig();
    await validarRestauracaoPostgres({container:config.container,database:config.database,user:config.user,backup:resolve(backup)});
    console.log('Restauração validada em banco temporário; o banco de produção local não foi alterado.');
  }else throw new Error('Uso: npm run postgres:backup -- criar [--output <arquivo.dump>]');
}catch(error){
  console.error(error instanceof Error?error.message:'Falha ao executar backup PostgreSQL.');
  process.exitCode=1;
}

