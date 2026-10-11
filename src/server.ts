import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFileSync} from 'node:fs';
import {ZodError} from 'zod';
import {ErroCadastro} from './cadastros.js';
import {criarPoolPostgresRuntime} from './postgres.js';
import {criarAcessoHttpPostgres} from './postgres-auth-http.js';
import {criarEntregaRecuperacaoPostgres} from './postgres-recovery-mail.js';
import {comEscritorArquivosPostgres} from './postgres-backup-gate.js';
import {tratarGestaoPostgres} from './postgres-gestao-http.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
const PORT=Number(process.env.UI_PORT||3000);
const bindHost=process.env.UI_BIND_HOST||'127.0.0.1';
if(!['127.0.0.1','0.0.0.0'].includes(bindHost))throw new Error('UI_BIND_HOST inválido.');
const publicUrl=process.env.AUTH_PUBLIC_URL||`http://localhost:${PORT}`;
const postgresPool=criarPoolPostgresRuntime();
try {await validarPapelRuntimePostgres(postgresPool);} catch(error) {await postgresPool.end();throw error;}

const postgresAccess=criarAcessoHttpPostgres(postgresPool,{publicUrl,enviarRecuperacao:criarEntregaRecuperacaoPostgres(publicUrl)});
function json(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));}
const corpoPostgres=async(req:IncomingMessage)=>{
 let text='',size=0;
 for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>1024*1024)throw new ErroCadastro('Conteúdo excede o limite permitido.',413);text+=chunk;}
 try{return text?JSON.parse(text):{};}catch{throw new ErroCadastro('JSON inválido.',400);}
};
const server=createServer(async(req,res)=>{
 try{
 res.setHeader('referrer-policy','no-referrer');res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','DENY');
 const url=new URL(req.url??'/','http://localhost'),p=url.pathname;
    {
      postgresAccess.validarRequisicao(req);
      if (p.startsWith('/api/auth/') || p.startsWith('/api/contexto/') || p.startsWith('/api/portal/') || p.startsWith('/api/plataforma/')) {
        await comEscritorArquivosPostgres(postgresPool,async()=>{
          if(p.startsWith('/api/auth/')){if(await postgresAccess.tratar(req,res,url,corpoPostgres))return;}
          else if(await tratarGestaoPostgres(req,res,postgresPool,url,postgresAccess,corpoPostgres))return;
          json(res,404,{erro:'Rota PostgreSQL não implementada.'});
        });
        return;
      }
    }

    const arquivosAuth: Record<string, string> = { '/theme-ui.js':'theme-ui.js', '/workspace-ui.js':'workspace-ui.js', '/cadastros-ui.js':'cadastros-ui.js', '/uf-ui.js':'uf-ui.js', '/resumo-ui.js':'resumo-ui.js', '/workspace-conceito.css':'workspace-conceito.css', '/auth-ui.css': 'auth-ui.css', '/auth-ui.js': 'auth-ui.js', '/cliente-vinculos-ui.js':'cliente-vinculos-ui.js', '/cliente-cnpj-ui.js':'cliente-cnpj-ui.js', '/auth-client.js': 'auth-client.js', '/gestao-ui.js': 'gestao-ui.js', '/publicacoes-ui.js':'publicacoes-ui.js', '/monitoramento-ui.js':'monitoramento-ui.js', '/ia-plataforma-ui.js':'ia-plataforma-ui.js' };
    if (req.method === 'GET' && arquivosAuth[p]) {
      res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(readFileSync(new URL('../web/' + arquivosAuth[p], import.meta.url)));
    }
    if (req.method === 'GET' && p === '/login') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
      return res.end(readFileSync(new URL('../web/login.html', import.meta.url)));
    }
 if(req.method==='GET'&&(p==='/'||p==='/acesso')){
  try{await comEscritorArquivosPostgres(postgresPool,()=>postgresAccess.identidade(req));}
  catch(error){if(!(error instanceof ErroCadastro)||error.status!==401)throw error;res.writeHead(303,{location:'/login','cache-control':'no-store'});res.end();return;}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(readFileSync(new URL('../web/acesso.html',import.meta.url)));return;
 }
 json(res,404,{erro:'Rota indisponível no modo PostgreSQL.'});
 }catch(error){
  if(res.headersSent){res.destroy();console.error('[HTTP] Falha após início da resposta.');return;}
  if(error instanceof ErroCadastro){json(res,error.status,{erro:error.message});return;}
  if(error instanceof ZodError){json(res,400,{erro:error.issues[0]?.message||'Dados inválidos.'});return;}
  console.error('[HTTP] Falha interna ao processar requisição.');json(res,500,{erro:'Não foi possível concluir a operação.'});
 }
});
server.on('error',()=>{void postgresPool.end();});
server.listen(PORT,bindHost,()=>console.log(`Painel: http://localhost:${PORT} (PostgreSQL)`));



