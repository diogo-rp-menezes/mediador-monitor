import 'dotenv/config';
import {readFile,lstat} from 'node:fs/promises';
import {z} from 'zod';
import {criarPacoteBackup,recuperarPacoteBackup} from './backup-package.js';
import {copiarPacoteBackup} from './backup-package-copy.js';

try{
  const [mode,...args]=process.argv.slice(2);let input:string|undefined,output:string|undefined;
  for(let i=0;i<args.length;i+=2){const value=args[i+1];if(!value||value.startsWith('--'))throw new Error();if(args[i]==='--input'&&!input)input=value;else if(args[i]==='--output'&&!output)output=value;else throw new Error();}
  const encoded=process.env.BACKUP_ENCRYPTION_KEY??'';
  if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded)||!input||!output||(mode!=='criar'&&mode!=='recuperar'&&mode!=='copiar'))throw new Error();
  const key=Buffer.from(encoded,'base64');
  try{
    if(key.length!==32||key.toString('base64')!==encoded)throw new Error();
    if(mode==='criar'){
      const stat=await lstat(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw new Error();
      const files=z.array(z.object({source:z.string().min(1),path:z.string().min(1),references:z.array(z.string()).optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),bytes:z.number().int().nonnegative().optional()}).strict()).min(1).max(10000).parse(JSON.parse(await readFile(input,'utf8')));
      await criarPacoteBackup(files,output,key);
    }else if(mode==='copiar')await copiarPacoteBackup(input,output,key);
    else await recuperarPacoteBackup(input,output,key);
  }finally{key.fill(0);}
  console.log('Pacote processado; origem preservada e destino criado sem sobrescrita.');
}catch{console.error('Uso: backup:pacote -- criar|recuperar|copiar --input inventario.json|pasta-pacote --output nova-pasta. Defina BACKUP_ENCRYPTION_KEY e confira integridade, inventário e destino inexistente.');process.exitCode=1;}
