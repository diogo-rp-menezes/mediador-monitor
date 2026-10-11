import 'dotenv/config';
import {transformarBackup} from './backup-envelope.js';

try{
  const [mode,...args]=process.argv.slice(2);let input:string|undefined,output:string|undefined;
  for(let i=0;i<args.length;i+=2){
    const value=args[i+1];if(!value||value.startsWith('--'))throw new Error();
    if(args[i]==='--input'&&!input)input=value;
    else if(args[i]==='--output'&&!output)output=value;
    else throw new Error();
  }
  const encoded=process.env.BACKUP_ENCRYPTION_KEY??'';
  if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded)||!input||!output||(mode!=='cifrar'&&mode!=='decifrar'))throw new Error();
  const key=Buffer.from(encoded,'base64');
  if(key.length!==32||key.toString('base64')!==encoded)throw new Error();
  try{await transformarBackup(input,output,key,mode);}finally{key.fill(0);}
  console.log('Backup processado com sucesso; origem preservada e destino criado sem sobrescrita.');
}catch{
  console.error('Uso: backup:cifrar -- cifrar|decifrar --input arquivo --output novo-arquivo. Defina BACKUP_ENCRYPTION_KEY (32 bytes base64). Confira chave, integridade e destino inexistente.');process.exitCode=1;
}
