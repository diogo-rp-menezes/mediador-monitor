import {inspecionarSqliteRecuperacao} from './sqlite-recovery-inspection.js';
const args=process.argv.slice(2);
try{
  if(args.length!==2||args[0]!=='--source'||!args[1])throw new Error('Uso: sqlite:recuperacao:inspecionar -- --source <sqlite-bloqueado>');
  console.log(JSON.stringify(inspecionarSqliteRecuperacao(args[1]),null,2));
}catch(error){
  console.error('Inspeção de recuperação não concluída:',(error as {code?:string}).code??(error as Error).name);
  process.exitCode=1;
}
