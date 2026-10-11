import { afterEach,expect,it } from 'vitest';
import { createServer,type Server } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { openDb,type Db } from '../src/db.js';
import { criarAcessoHttp } from '../src/auth-http.js';
import { hashToken,tokenCsrf } from '../src/autenticacao.js';
import { salvarEscritorio,salvarUsuario,vincularUsuarioEscritorio } from '../src/organizacoes.js';
import { salvarCliente,salvarContato,ErroCadastro } from '../src/cadastros.js';
import { tratarEnviosContexto } from '../src/envios-contexto-api.js';

const recursos:{db:Db;server:Server}[]=[];
afterEach(async()=>{for(const r of recursos.splice(0)){r.server.closeAllConnections();await new Promise<void>(done=>r.server.close(()=>done()));r.db.close();}});
async function fixture(){
 const db=openDb(':memory:'),b=salvarEscritorio(db,null,{nome:'Escritório B',cnpj:'04252011000110'}),uid=salvarUsuario(db,null,{nome:'Admin real',email:'admin@example.test'});
 vincularUsuarioEscritorio(db,uid,1,'administrador');vincularUsuarioEscritorio(db,uid,b,'administrador');
 const a=salvarCliente(db,null,{razao_social:'Cliente A',cnpj:'11222333000181'},1),c=salvarCliente(db,null,{razao_social:'Cliente B',cnpj:'11444777000161'},b);
 const ta=salvarContato(db,null,{nome:'Contato A',email:'a@example.test'},1),tc=salvarContato(db,null,{nome:'Contato B',email:'b@example.test'},b);
 db.prepare("INSERT INTO registros(numero_registro,watch,tipo) VALUES ('DF000001/2026','teste','Convenção Coletiva')").run();
 const snap={para:'destino@example.test',contato:'Contato',cliente:'Cliente',cnpj:'11222333000181',assunto:'Prévia',texto:'Mensagem',html:'<p>Mensagem</p>',versao:'v1',anexos:[]};
 const ea=Number(db.prepare("INSERT INTO envios_clientes(escritorio_id,cliente_id,contato_id,numero_registro,versao,status,snapshot_json) VALUES (?,?,?,'DF000001/2026','v1','revisao',?)").run(1,a,ta,JSON.stringify(snap)).lastInsertRowid);
 const eb=Number(db.prepare("INSERT INTO envios_clientes(escritorio_id,cliente_id,contato_id,numero_registro,versao,status,snapshot_json) VALUES (?,?,?,'DF000001/2026','v1','revisao',?)").run(b,c,tc,JSON.stringify(snap)).lastInsertRowid);
 const token=randomBytes(32).toString('base64url'),now=Date.now();db.prepare('INSERT INTO sessoes_usuarios(token_hash,usuario_id,criada_em,ultimo_acesso_em,expira_em) VALUES (?,?,?,?,?)').run(hashToken(token),uid,now,now,now+3600000);
 let acesso:ReturnType<typeof criarAcessoHttp>;
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url!,'http://localhost'),body=async()=>{let s='';for await(const chunk of req)s+=chunk;return JSON.parse(s||'{}');};if(await tratarEnviosContexto(req,res,db,url,acesso,body))return;res.writeHead(404);res.end();}catch(e){res.writeHead(e instanceof ErroCadastro?e.status:e instanceof z.ZodError?400:500,{'content-type':'application/json'});res.end(JSON.stringify({erro:(e as Error).message}));}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;acesso=criarAcessoHttp(db,{publicUrl:origin});recursos.push({db,server});
 const req=(path:string,office=1)=>fetch(origin+path,{headers:{cookie:`mediador_sessao=${token}`,'x-csrf-token':tokenCsrf(token),'content-type':'application/json','x-context-type':'escritorio','x-context-id':String(office)}});
 return {db,b,ea,eb,req};
}
it('lista somente a fila do escritório selecionado e oculta IDs e anexos de outro escritório',async()=>{
 const f=await fixture();
 const a=await(await f.req('/api/contexto/envios')).json(),b=await(await f.req('/api/contexto/envios',f.b)).json();
 expect(a.map((x:any)=>x.id)).toEqual([f.ea]);expect(b.map((x:any)=>x.id)).toEqual([f.eb]);
 expect(a[0].snapshot.anexos).toEqual([]);
 const response=await f.req(`/api/contexto/envios/${f.eb}/anexos/0`);expect(response.status).toBe(404);
});
