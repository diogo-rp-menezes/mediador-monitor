import 'dotenv/config';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {criarCopiaChavesBackup,recuperarCopiaChavesBackup,type ChavesBackup} from './backup-key-custody.js';

const readKey=(value:string|undefined)=>{const key=Buffer.from(value??'','base64');if(key.length!==32||key.toString('base64')!==value)throw new Error();return key;};
let recovery:Buffer|undefined,keys:ChavesBackup|undefined;
try{
  const [operation,...args]=process.argv.slice(2);let input:string|undefined,output:string|undefined;
  for(let i=0;i<args.length;i+=2){const value=args[i+1];if(!value||value.startsWith('--'))throw new Error();if(args[i]==='--input'&&!input)input=value;else if(args[i]==='--output'&&!output)output=value;else throw new Error();}
  if(!output)throw new Error();recovery=readKey(process.env.BACKUP_RECOVERY_KEY);
  if(operation==='criar'&&!input){
    keys={backupKey:readKey(process.env.BACKUP_ENCRYPTION_KEY),credentialsKey:readKey(process.env.CREDENTIALS_MASTER_KEY)};
    await writeFile(output,criarCopiaChavesBackup(keys,recovery),{flag:'wx',mode:0o600});
  }else if(operation==='recuperar'&&input&&resolve(input).toLowerCase()!==resolve(output).toLowerCase()){
    const stat=await lstat(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)throw new Error();
    keys=recuperarCopiaChavesBackup(await readFile(input,'utf8'),recovery);
    await writeFile(output,JSON.stringify({BACKUP_ENCRYPTION_KEY:keys.backupKey.toString('base64'),CREDENTIALS_MASTER_KEY:keys.credentialsKey.toString('base64')},null,2)+'\n',{flag:'wx',mode:0o600});
  }else throw new Error();
  console.log('Cópia de chaves processada sem sobrescrita. Nenhum segredo foi exibido ou ativado na aplicação.');
}catch{
  console.error('Uso: backup:chaves -- criar --output novo-arquivo | recuperar --input copia-cifrada --output novo-arquivo-privado. Confira as chaves de ambiente, integridade e destino inexistente.');process.exitCode=1;
}finally{recovery?.fill(0);keys?.backupKey.fill(0);keys?.credentialsKey.fill(0);}
