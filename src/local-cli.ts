import {execFileSync} from 'node:child_process';
import {criarPoolPostgres,criarPoolPostgresRuntime} from './postgres.js';
import {verificarAmbienteLocal} from './local-preflight.js';

const mode=process.argv[2];
if(!['verificar','iniciar'].includes(mode)||process.argv.length!==3){console.error('Uso: local:verificar ou local:iniciar');process.exitCode=1;}
else{
  let ready=false;
  try{
    execFileSync('docker',['info','--format','{{.ServerVersion}}'],{stdio:'ignore',windowsHide:true,timeout:10000});
    const pool=criarPoolPostgresRuntime(),metadata=criarPoolPostgres();
    try{
      const report=await verificarAmbienteLocal(pool,process.env,metadata);
      for(const check of report.checks)console.log(`[${check.ok?'OK':'PENDENTE'}] ${check.item}: ${check.detalhe}`);
      console.log(`Origem local: ${report.origem}`);ready=report.pronto;
      if(!ready)process.exitCode=1;
    }finally{await Promise.all([pool.end(),metadata.end()]);}
  }catch(error){const code=(error as {code?:string}).code;console.error('Verificação local não concluída. Confira Docker, PostgreSQL e configuração runtime. Nenhum segredo foi exibido.',code&&/^[A-Z0-9]{5}$/.test(code)?`Código: ${code}`:'');process.exitCode=1;}
  if(mode==='iniciar'&&ready){

    console.log('Iniciando interface PostgreSQL. Workers são executados pelos comandos separados do roteiro local.');
    await import('./server.js');
  }
}

