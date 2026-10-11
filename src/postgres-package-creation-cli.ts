import {writeFile,lstat} from 'node:fs/promises';
import {criarPoolPostgres} from './postgres.js';
import {backupPostgresConfig} from './postgres-backup.js';
import {criarPacotePostgresIsolado} from './postgres-package-creation.js';
import {validarRelatorioForaDoPacote} from './backup-report-path.js';

let pool:ReturnType<typeof criarPoolPostgres>|undefined;
try{
  let output:string|undefined,report:string|undefined;const roots:string[]=[],args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){const value=args[i+1];if(!value||value.startsWith('--'))throw new Error();if(args[i]==='--output'&&!output)output=value;else if(args[i]==='--report'&&!report)report=value;else if(args[i]==='--root')roots.push(value);else throw new Error();}
  const encoded=process.env.BACKUP_ENCRYPTION_KEY??'';
  if(!output||!report||!roots.length||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw new Error();
  validarRelatorioForaDoPacote(output,report);
  for(const target of [output,report]){try{await lstat(target);throw new Error('Destino existente.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  const key=Buffer.from(encoded,'base64');
  try{
    if(key.length!==32||key.toString('base64')!==encoded)throw new Error();
    const config=backupPostgresConfig();
    if(!/^mediador_backup_test_[a-f0-9]{32}$/.test(config.database))throw new Error();
    pool=criarPoolPostgres({...process.env,PGDATABASE:config.database});
    const result=await criarPacotePostgresIsolado(pool,config,roots,output,key);
    await writeFile(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  }finally{key.fill(0);}
  console.log('Pacote de ensaio criado e transação concluída; dump temporário removido.');
}catch{console.error('Criação não concluída. Uso: postgres:backup:criar-pacote-isolado -- --root pasta-permitida --output nova-pasta --report novo-relatorio.json. Exige origem mediador_backup_test_<32 hex> e chave BACKUP_ENCRYPTION_KEY. Um pacote concluído pode permanecer caso a gravação do relatório falhe.');process.exitCode=1;}
finally{await pool?.end();}

