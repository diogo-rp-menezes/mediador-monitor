import {it,expect,vi} from 'vitest';
import {createServer,request} from 'node:http';
import type {AddressInfo} from 'node:net';
import type {Pool} from 'pg';
import {criarAcessoHttpPostgres} from '../src/postgres-auth-http.js';
it('eventos HTTP PostgreSQL usam política explícita e detectam cabeçalho repetido real',async()=>{
  vi.stubEnv('AUTH_TRUSTED_PROXY_CIDRS','127.0.0.1');
  const access=criarAcessoHttpPostgres({} as Pool,{publicUrl:'http://localhost:3000'});
  const server=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(access.event(req)));});
  try{
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const get=(headers:Record<string,string|string[]>)=>new Promise<{ip:string}>((resolve,reject)=>{
      const call=request({host:'127.0.0.1',port:(server.address() as AddressInfo).port,headers},res=>{
        let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve(JSON.parse(body)));
      });call.on('error',reject);call.end();
    });
    expect((await get({'x-forwarded-for':'203.0.113.99,198.51.100.8'})).ip).toBe('198.51.100.8');
    expect((await get({'x-forwarded-for':['198.51.100.8','203.0.113.99']})).ip).toBe('127.0.0.1');
    expect((await get({'forwarded':'for=203.0.113.99'})).ip).toBe('127.0.0.1');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));vi.unstubAllEnvs();}
});
