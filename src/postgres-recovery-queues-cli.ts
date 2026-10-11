import {criarPoolPostgres} from './postgres.js';
import {compararFilasRecuperacaoPostgres} from './postgres-recovery-queues.js';
import {exportarRelatorioRecuperacao,verificarRelatorioRecuperacao} from './postgres-recovery-report.js';
const args=process.argv.slice(2);
try{
  const verify=args.length===2&&args[0]==='--verify'&&!!args[1];
  const compare=(args.length===2||args.length===4)&&args[0]==='--manifest'&&!!args[1]&&(args.length===2||(args[2]==='--output'&&!!args[3]));
  if(!verify&&!compare)throw new Error('Informe --manifest <manifesto.json> [--output <novo.json>] ou --verify <relatorio.json>.');
  const pool=criarPoolPostgres();
  try{
    const key=Buffer.from(process.env.CREDENTIALS_MASTER_KEY??'','base64');
    const result=verify?await verificarRelatorioRecuperacao(pool,args[1],key):args.length===4?await exportarRelatorioRecuperacao(pool,args[1],args[3],key):await compararFilasRecuperacaoPostgres(pool,args[1],key);
    console.log(JSON.stringify(result,null,2));
  }
  finally{await pool.end();}
}catch(error){console.error('Comparação de recuperação não concluída:',(error as {code?:string}).code??(error as Error).name);process.exitCode=1;}

