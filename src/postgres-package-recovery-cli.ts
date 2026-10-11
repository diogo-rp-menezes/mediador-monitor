import {writeFile,lstat} from 'node:fs/promises';
import {ensaiarRecuperacaoPacotePostgres} from './postgres-package-recovery.js';
import {validarRelatorioForaDoPacote} from './backup-report-path.js';

try{
  let input:string|undefined,output:string|undefined,report:string|undefined;const args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){const value=args[i+1];if(!value||value.startsWith('--'))throw new Error();if(args[i]==='--input'&&!input)input=value;else if(args[i]==='--output'&&!output)output=value;else if(args[i]==='--report'&&!report)report=value;else throw new Error();}
  const encoded=process.env.BACKUP_ENCRYPTION_KEY??'';
  if(!input||!output||!report||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw new Error();
  validarRelatorioForaDoPacote(input,report);
  try{await lstat(report);throw new Error('Relatório existente.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const key=Buffer.from(encoded,'base64');
  try{
    if(key.length!==32||key.toString('base64')!==encoded)throw new Error();
    const result=await ensaiarRecuperacaoPacotePostgres(input,output,key);
    await writeFile(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  }finally{key.fill(0);}
  console.log('Recuperação validada; banco temporário removido, arquivos privados preservados e nenhum serviço ativado.');
}catch{console.error('Ensaio não concluído. Uso: postgres:backup:ensaiar-pacote -- --input pasta-pacote-v2 --output nova-pasta-privada --report novo-relatorio.json. Confira chave, Docker, banco e destinos. Arquivos já extraídos podem permanecer privados para conferência.');process.exitCode=1;}

