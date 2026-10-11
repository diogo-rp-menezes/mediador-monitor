import assert from 'node:assert/strict';
import {createServer, type IncomingMessage} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {criarHashSenha} from './auth-core.js';
import {ErroCadastro} from './cadastros.js';
import {criarAcessoHttpPostgres} from './postgres-auth-http.js';
import {tratarGestaoPostgres} from './postgres-gestao-http.js';

/** Real HTTP against migrated data, with a new temporary user; imported credentials are untouched. */
export async function validarHttpImportacaoIsolada(admin:Pool,runtime:Pool){
  assert.match((await admin.query('SELECT current_database() nome')).rows[0].nome,/^mediador_import_test_[a-f0-9]{32}$/);
  const offices=(await admin.query('SELECT id FROM escritorios WHERE ativo ORDER BY id')).rows as {id:number}[];
  if(offices.length<2)throw new Error('Validação HTTP exige ao menos dois escritórios ativos na cópia.');
  const email=`import-check-${randomUUID()}@example.test`,password=`Teste-A1!-${randomUUID()}`;
  const user=(await admin.query("INSERT INTO usuarios(nome,email) VALUES('Validação isolada',$1) RETURNING id",[email])).rows[0].id;
  await admin.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[user,await criarHashSenha(password),Date.now()]);
  await admin.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'administrador')",[user,offices[0].id]);
  let access:ReturnType<typeof criarAcessoHttpPostgres>,origin='';
  const body=async(req:IncomingMessage)=>{
    let value='';for await(const chunk of req){value+=chunk.toString();if(value.length>1024*1024)throw new ErroCadastro('Corpo grande demais.',413);}
    return JSON.parse(value||'{}') as unknown;
  };
  const server=createServer((req,res)=>{void(async()=>{
    try{
      const url=new URL(req.url??'/',origin);
      if(await access.tratar(req,res,url,body))return;
      if(await tratarGestaoPostgres(req,res,runtime,url,access,body))return;
      res.writeHead(404);res.end('{}');
    }catch(error){
      if(!(error instanceof ErroCadastro))console.error('[Validação HTTP]',req.url,(error as {code?:string}).code??(error as Error).name);
      if((error as {code?:string}).code==='42501')console.error((error as Error).message);
      res.writeHead(error instanceof ErroCadastro?error.status:500,{'content-type':'application/json'});res.end(JSON.stringify({erro:'Falha no cenário de validação.'}));}
  })();});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');origin=`http://127.0.0.1:${address.port}`;
  access=criarAcessoHttpPostgres(runtime,{publicUrl:origin});
  let cookie='',csrf='';
  const request=async(path:string,options:{method?:string;data?:unknown;office?:number;csrf?:string}={})=>fetch(origin+path,{
    method:options.method??'GET',headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':options.csrf??csrf}:{}),...(options.office?{'x-context-type':'escritorio','x-context-id':String(options.office)}:{})},
    body:options.data===undefined?undefined:JSON.stringify(options.data)
  });
  try{
    assert.equal((await request('/api/contexto/clientes',{office:offices[0].id})).status,401);
    const login=await request('/api/auth/login',{method:'POST',data:{email,senha:password}});assert.equal(login.status,200);
    cookie=login.headers.get('set-cookie')?.split(';')[0]??'';assert.ok(cookie);assert.ok(!cookie.includes(password));
    const session=await request('/api/auth/sessao');assert.equal(session.status,200);
    csrf=(await session.json() as {csrf:string}).csrf;assert.ok(csrf);
    assert.equal((await request('/api/contexto/clientes',{office:offices[1].id})).status,403);
    const clients=await request('/api/contexto/clientes',{office:offices[0].id});assert.equal(clients.status,200);
    const expected=(await admin.query('SELECT id FROM clientes WHERE escritorio_id=$1 ORDER BY id',[offices[0].id])).rows.map(row=>row.id);
    assert.deepEqual((await clients.json() as {id:number}[]).map(row=>row.id).sort((a,b)=>a-b),expected);
    await admin.query("INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,'administrador')",[user,offices[1].id]);
    for(const office of offices.slice(0,2)){
      const response=await request('/api/contexto/envios',{office:office.id});assert.equal(response.status,200);
      const expectedDeliveries=(await admin.query('SELECT id::text FROM envios_clientes WHERE escritorio_id=$1 ORDER BY id',[office.id])).rows.map(row=>row.id).sort();
      assert.deepEqual((await response.json() as {id:string|number}[]).map(row=>String(row.id)).sort(),expectedDeliveries);
    }
    assert.equal((await request('/api/auth/logout',{method:'POST',data:{},csrf:'invalido'})).status,403);
    assert.equal((await request('/api/auth/sessao')).status,200);
    await admin.query('UPDATE usuarios_escritorios SET ativo=false WHERE usuario_id=$1 AND escritorio_id=$2',[user,offices[1].id]);
    assert.equal((await request('/api/contexto/clientes',{office:offices[1].id})).status,403);
    assert.equal((await request('/api/auth/logout',{method:'POST',data:{}})).status,200);
    assert.equal((await request('/api/auth/sessao')).status,401);
    return {login:true,contextos:true,isolamento_http:true,revogacao:true,csrf:true,logout:true};
  }finally{
    server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

