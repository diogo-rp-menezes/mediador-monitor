import {it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

it('inicia HTTP PostgreSQL sem abrir SQLite nem expor handlers legados',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-pg-server-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=(reservation.address() as {port:number}).port;
  await new Promise<void>((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));
  // A directory cannot be opened as SQLite: startup would fail if legacy initialization ran.
  const child=spawn(process.execPath,['--import','tsx','src/server.ts'],{
    cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,APP_POSTGRES_CONTEXT:'0',DB_PATH:folder,UI_PORT:String(port),AUTH_PUBLIC_URL:`http://localhost:${port}`}
  });
  try{
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Servidor não iniciou no prazo.')),15000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('Servidor encerrou antes de iniciar.'));});
      child.stdout.on('data',chunk=>{if(String(chunk).includes('Painel:')){clearTimeout(timer);resolve();}});
      child.stderr.resume();
    });
    const base=`http://127.0.0.1:${port}`;
    expect((await fetch(base+'/login')).status).toBe(200);
    expect((await fetch(base+'/auth-ui.js')).status).toBe(200);
    for(const path of ['/api/resumo','/api/registros','/api/executar','/api/agendamento']){
      const response=await fetch(base+path,path==='/api/executar'?{method:'POST',headers:{'content-type':'application/json',origin:base},body:'{"modo":"check"}'}:{});
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({erro:'Rota indisponível no modo PostgreSQL.'});
    }
    expect(readdirSync(folder)).toEqual([]);
  }finally{
    if(child.exitCode===null){const closed=once(child,'exit');child.kill();await closed;}
    rmSync(folder,{recursive:true,force:true});
  }
},20000);

