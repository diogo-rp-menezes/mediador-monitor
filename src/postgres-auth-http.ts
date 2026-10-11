import { randomUUID } from 'node:crypto';
import {criarResolvedorIp} from './request-ip.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { z } from 'zod';
import { ErroCadastro } from './cadastros.js';
import { cookieSessao, exigirCsrf, lerCookieSessao, tokenCsrf, type DadosEvento } from './auth-core.js';
import { criarAutenticacaoPostgres } from './postgres-autenticacao.js';
import { encerrarContextoSuportePostgres, iniciarContextoSuportePostgres, resolverContextoPostgres } from './postgres-autorizacao.js';
import { listarVinculosUsuarioPostgres, salvarUsuarioPostgres } from './postgres-organizacoes.js';
import { alterarPapelPlataformaPostgres, possuiAdministradorPlataformaPostgres } from './postgres-papeis.js';
import { withPostgresGlobalTransaction, withPostgresOfficeTransaction } from './postgres-transaction.js';

export interface ConfigAcessoPostgres { publicUrl:string; agora?:()=>number; enviarRecuperacao?:(destino:string,token:string)=>Promise<void> }
const respond=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};

export function criarAcessoHttpPostgres(pool:Pool,config:ConfigAcessoPostgres){
  const resolveIp=criarResolvedorIp(process.env.AUTH_TRUSTED_PROXY_CIDRS??'');
  const publicUrl=new URL(config.publicUrl);
  if(!['http:','https:'].includes(publicUrl.protocol)||publicUrl.username||publicUrl.password||publicUrl.search||publicUrl.hash||publicUrl.pathname!=='/')
    throw new Error('AUTH_PUBLIC_URL deve conter somente a origem HTTP/HTTPS da aplicação.');
  const local=publicUrl.protocol==='http:'&&['localhost','127.0.0.1'].includes(publicUrl.hostname);
  if(publicUrl.protocol==='http:'&&!local)throw new Error('AUTH_PUBLIC_URL externo exige HTTPS.');
  const origins=new Set([publicUrl.origin]);
  if(local)for(const host of ['localhost','127.0.0.1'])origins.add(`http://${host}${publicUrl.port?':'+publicUrl.port:''}`);
  const hosts=new Set([...origins].map(origin=>new URL(origin).host));
  const secure=publicUrl.protocol==='https:',auth=criarAutenticacaoPostgres(pool,{agora:config.agora,enviarRecuperacao:config.enviarRecuperacao});
  const token=(req:IncomingMessage)=>lerCookieSessao(req.headers.cookie);
  const identity=(req:IncomingMessage)=>auth.exigirSessao(token(req));
  const event=(req:IncomingMessage):DadosEvento=>({ip:resolveIp(req),user_agent:req.headers['user-agent']??'',request_id:randomUUID()});
  const validarRequisicao=(req:IncomingMessage)=>{
    if(!req.headers.host||!hosts.has(req.headers.host.toLowerCase()))throw new ErroCadastro('Host não autorizado.',403);
    if(req.method==='GET'||req.method==='HEAD')return;
    const origin=req.headers.origin;
    if(origin&&(!origins.has(origin)||new URL(origin).host!==req.headers.host.toLowerCase()))throw new ErroCadastro('Origem não autorizada.',403);
    if(req.headers['sec-fetch-site']==='cross-site')throw new ErroCadastro('Origem não autorizada.',403);
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))throw new ErroCadastro('Envie conteúdo JSON.',415);
  };
  const csrf=(req:IncomingMessage)=>exigirCsrf(token(req),req.headers['x-csrf-token']);
  async function vistaSessao(req:IncomingMessage){
    const id=await identity(req),links=await listarVinculosUsuarioPostgres(pool,id.usuario_id);
    const offices=id.papel_plataforma?await pool.query<{id:number;nome:string}&Record<string,unknown>>('SELECT id,nome FROM escritorios WHERE ativo=true ORDER BY lower(nome),id'):
      {rows:[] as Array<{id:number;nome:string}>};
    const contextOffices=id.papel_plataforma?offices.rows.map(office=>({
      ...office,membro:links.escritorios.some(m=>m.id===office.id),
      papel:links.escritorios.find(m=>m.id===office.id)?.papel??'suporte'
    })):links.escritorios.map(office=>({...office,membro:true}));
    return {usuario:{id:id.usuario_id,nome:id.nome,email:id.email,papel_plataforma:id.papel_plataforma},
      csrf:tokenCsrf(token(req)),expira_em:id.expira_em,contextos:{escritorios:contextOffices,clientes:links.clientes},
      painel_global:id.papel_plataforma==='administrador_plataforma',capacidades:{fila_manual:true,monitoramento_execucoes:true,ia_plataforma:true}};
  }
  async function resolverDoRequest(req:IncomingMessage){
    const type=req.headers['x-context-type'],rawId=req.headers['x-context-id'],grant=req.headers['x-support-grant'];
    if(typeof rawId!=='string'||!/^[1-9]\d*$/.test(rawId)||(type!=='escritorio'&&type!=='cliente')||(grant!==undefined&&typeof grant!=='string'))
      throw new ErroCadastro('Selecione um contexto válido.',400);
    return resolverContextoPostgres(pool,await identity(req),{tipo:type,id:Number(rawId),...(grant?{concessao:grant}:{})},config.agora?.());
  }
  async function auditarContexto(atorId:number,ctx:{escritorio_id:number;cliente_id:number|null},evt:DadosEvento){
    await withPostgresOfficeTransaction(pool,ctx.escritorio_id,client=>client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,'CONTEXTO_VALIDADO',$2,$3,$4,$5,$6,$7,'{}'::jsonb)`,[atorId,ctx.escritorio_id,ctx.cliente_id,config.agora?.()??Date.now(),
      (evt.ip??'').slice(0,96),(evt.user_agent??'').slice(0,1000),evt.request_id??randomUUID()]));
  }
  return {
    validarRequisicao,identidade:identity,vistaSessao,resolverContexto:resolverDoRequest,csrf,event,
    async tratar(req:IncomingMessage,res:ServerResponse,url:URL,body:(req:IncomingMessage)=>Promise<unknown>):Promise<boolean>{
      const path=url.pathname,method=req.method;
      if(!path.startsWith('/api/auth/'))return false;
      validarRequisicao(req);
      if(method==='GET'&&path==='/api/auth/estado'){
        respond(res,200,{configurado:await possuiAdministradorPlataformaPostgres(pool)});return true;
      }
      if(method==='POST'&&path==='/api/auth/login'){
        const result=await auth.login(await body(req),event(req),token(req));
        res.setHeader('set-cookie',cookieSessao(result.token,secure));respond(res,200,{ok:true});return true;
      }
      if(method==='POST'&&path==='/api/auth/recuperacao'){
        respond(res,200,await auth.solicitarRecuperacao(await body(req),event(req)));return true;
      }
      if(method==='POST'&&path==='/api/auth/recuperar'){
        respond(res,200,await auth.recuperar(await body(req),event(req)));return true;
      }
      const id=await identity(req);
      if(!['GET','HEAD'].includes(method??'GET'))csrf(req);
      if(method==='GET'&&path==='/api/auth/sessao'){respond(res,200,await vistaSessao(req));return true;}
      if(method==='POST'&&path==='/api/auth/logout'){
        await auth.logout(token(req),event(req));res.setHeader('set-cookie',cookieSessao('',secure,true));respond(res,200,{ok:true});return true;
      }
      if(method==='GET'&&path==='/api/auth/contexto'){respond(res,200,{contexto:await resolverDoRequest(req)});return true;}
      if(method==='POST'&&path==='/api/auth/contexto'){
        const context=await resolverContextoPostgres(pool,id,await body(req),config.agora?.());await auditarContexto(id.usuario_id,context,event(req));
        respond(res,200,{contexto:context});return true;
      }
      if(method==='POST'&&path==='/api/auth/suporte/iniciar'){
        respond(res,200,{contexto:await iniciarContextoSuportePostgres(pool,id,await body(req),event(req),config.agora?.())});return true;
      }
      if(method==='POST'&&path==='/api/auth/suporte/encerrar'){
        const raw=z.object({concessao:z.string().uuid()}).strict().parse(await body(req));
        await encerrarContextoSuportePostgres(pool,id,raw.concessao,event(req),config.agora?.());respond(res,200,{ok:true});return true;
      }
      if(method==='PUT'&&path==='/api/auth/perfil'){
        const raw=z.object({nome:z.string().trim().min(2).max(250)}).strict().parse(await body(req));
        await withPostgresGlobalTransaction(pool,client=>salvarUsuarioPostgres(client,id.usuario_id,{nome:raw.nome,email:id.email,ativo:true},id.usuario_id));
        respond(res,200,await vistaSessao(req));return true;
      }
      if(method==='POST'&&path==='/api/auth/papel-plataforma'){
        if(id.papel_plataforma!=='administrador_plataforma')throw new ErroCadastro('Você não tem permissão para esta ação.',403);
        const raw=z.object({usuario_id:z.number().int().positive(),papel:z.enum(['administrador_plataforma','suporte']).nullable()}).strict().parse(await body(req));
        await alterarPapelPlataformaPostgres(pool,raw.usuario_id,raw.papel,id.usuario_id);respond(res,200,{ok:true});return true;
      }
      respond(res,404,{erro:'Não encontrado.'});return true;
    }
  };
}


