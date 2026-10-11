import {ensaiarMigracaoOperacional,verificarPacoteMigracao} from './postgres-migration-rehearsal.js';
const args=process.argv.slice(2),source=args[args.indexOf('--source')+1],output=args.includes('--output')?args[args.indexOf('--output')+1]:undefined;
try{
  if(args.includes('--verify')){
    const manifest=args[args.indexOf('--verify')+1];if(!manifest)throw new Error('Informe o manifesto após --verify.');
    const result=await verificarPacoteMigracao(manifest);console.log(`Pacote, origem e destino conferidos: ${result.manifesto}`);
  }else{
  if(!args.includes('--source')||!source)throw new Error('Uso: postgres:ensaiar-migracao -- --source <sqlite.db> [--output <pasta-nova>]');
  const result=await ensaiarMigracaoOperacional(source,output);
  await verificarPacoteMigracao(result.path);
  console.log(`Ensaio e reversão validados. Manifesto: ${result.path}`);
  console.log(`${result.manifest.ensaio.tabelas} tabelas, ${result.manifest.ensaio.linhas} linhas; bancos atuais preservados.`);
  }
}catch(error){
  console.error('Ensaio operacional não concluído:',(error as {code?:string}).code??(error as Error).name);
  const location=(error as Error).stack?.split('\n').find(line=>line.includes('postgres-migration-rehearsal.ts:'));
  if(location)console.error(location.trim());process.exitCode=1;
}

