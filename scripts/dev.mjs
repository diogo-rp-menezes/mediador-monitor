import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const child=spawn(process.execPath,[require.resolve('tsx/cli'),'watch','src/server.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,MEDIADOR_VITE_DEV:'1'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Não foi possível iniciar o ambiente de desenvolvimento.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
