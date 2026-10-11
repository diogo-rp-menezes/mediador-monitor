import type { IncomingMessage,ServerResponse } from 'node:http';
import {exigirSqliteOperacional} from './sqlite-cutover-lock.js';
import { randomUUID } from 'node:crypto';
import {resolverIpRequisicao} from './request-ip.js';
import { z } from 'zod';
import type { Db } from './db.js';
import type { criarAcessoHttp } from './auth-http.js';
import { exigirPermissao } from './autorizacao.js';
import { auditarSeguranca } from './autenticacao.js';
import { ErroCadastro, exigirCadastroEscritorio } from './cadastros.js';
import { relatorioContexto } from './interpretacoes-contexto.js';
import { gerarPdfRelatorio, hashBytes } from './relatorios.js';
import { smtpEscritorio } from './operacoes-escritorio.js';
import { criarTransporteEmail } from './notify.js';

const requestIds=new WeakMap<IncomingMessage,string>();
const audit=(db:Db,req:IncomingMessage,office:number,client:number,id:number|null,version:string,actor:number|null,event:string,result:string)=>{let requestId=requestIds.get(req);if(!requestId){requestId=randomUUID();requestIds.set(req,requestId);}return db.prepare(`INSERT INTO auditoria_acessos_publicacoes(escritorio_id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,ip,user_agent,request_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(office,client,id,version,actor,event,result,resolverIpRequisicao(req),String(req.headers['user-agent']||'').slice(0,1000),requestId);};
/** Notificações contêm apenas link autenticado; resultados ambíguos não são repetidos automaticamente. */
export async function processarNotificacoesPublicacao(db:Db,publicUrl=process.env.AUTH_PUBLIC_URL||`http://localhost:${process.env.UI_PORT||3000}`){
 exigirSqliteOperacional(db.name);
 db.exec(`UPDATE notificacoes_publicacoes SET destino=(SELECT u.email FROM usuarios u WHERE u.id=notificacoes_publicacoes.usuario_id)
   WHERE estado='pendente' AND EXISTS(SELECT 1 FROM usuarios u JOIN usuarios_clientes v ON v.usuario_id=u.id
   WHERE u.id=notificacoes_publicacoes.usuario_id AND u.ativo=1 AND v.ativo=1 AND v.cliente_id=notificacoes_publicacoes.cliente_id
   AND v.escritorio_id=notificacoes_publicacoes.escritorio_id AND u.email<>notificacoes_publicacoes.destino);
   UPDATE notificacoes_publicacoes SET estado='cancelado',erro='Usuário, vínculo ou publicação inativos.' WHERE estado='pendente' AND NOT EXISTS(
   SELECT 1 FROM publicacoes_documentos p JOIN usuarios_clientes v ON v.usuario_id=notificacoes_publicacoes.usuario_id
   JOIN usuarios u ON u.id=notificacoes_publicacoes.usuario_id WHERE p.id=notificacoes_publicacoes.publicacao_id AND p.estado='ativa'
   AND v.escritorio_id=notificacoes_publicacoes.escritorio_id AND v.cliente_id=notificacoes_publicacoes.cliente_id AND v.ativo=1 AND u.ativo=1)`);
 const rows=db.prepare(`SELECT n.* FROM notificacoes_publicacoes n JOIN publicacoes_documentos p ON p.id=n.publicacao_id AND p.estado='ativa'
   JOIN usuarios_clientes v ON v.usuario_id=n.usuario_id AND v.cliente_id=n.cliente_id AND v.escritorio_id=n.escritorio_id AND v.ativo=1
   JOIN usuarios u ON u.id=n.usuario_id AND u.ativo=1 AND u.email=n.destino WHERE n.estado='pendente'
   AND n.id IN (SELECT MIN(n2.id) FROM notificacoes_publicacoes n2 WHERE n2.estado='pendente' GROUP BY n2.escritorio_id)
   ORDER BY n.id LIMIT 20`).all() as any[];
 let enviados=0,erros=0;
 for(const n of rows){const smtp=smtpEscritorio(db,n.escritorio_id);if(!smtp)continue;
  const reserved=db.prepare("UPDATE notificacoes_publicacoes SET estado='enviando',tentativas=tentativas+1,erro=NULL WHERE id=? AND estado='pendente'").run(n.id);if(!reserved.changes)continue;
  const transport=criarTransporteEmail({slack:{ativo:false,webhook:''},email:{ativo:smtp.ativo,host:smtp.host,port:smtp.port,secure:smtp.secure,user:smtp.user,password:smtp.password,from:smtp.from,to:''}});
  try{exigirSqliteOperacional(db.name);await transport.sendMail({from:smtp.from,to:n.destino,subject:'Documento disponível no Mediador Monitor',text:`Um documento foi publicado para sua empresa. Entre na sua conta para consultar: ${new URL('/acesso',publicUrl).href}\n\nEste link exige autenticação; não compartilhe sua senha.`});db.prepare("UPDATE notificacoes_publicacoes SET estado='enviado',enviada_em=datetime('now') WHERE id=? AND estado='enviando'").run(n.id);enviados++;}
  catch(e){const x=e as Error&{code?:string};const uncertain=['ETIMEDOUT','ECONNRESET','EPIPE','ESOCKET'].includes(x.code||'');db.prepare('UPDATE notificacoes_publicacoes SET estado=?,erro=? WHERE id=? AND estado=\'enviando\'').run(uncertain?'incerto':'falhou',(x.message||'Falha SMTP').slice(0,500),n.id);erros++;}
  finally{transport.close();}
 }
 return {enviados,erros};
}
export async function tratarPublicacoes(req:IncomingMessage,res:ServerResponse,db:Db,url:URL,acesso:ReturnType<typeof criarAcessoHttp>,corpo:(r:IncomingMessage)=>Promise<unknown>){
 const p=url.pathname;
 if(!p.startsWith('/api/contexto/publicacoes')&&!p.startsWith('/api/portal/'))return false;
 acesso.validarRequisicao(req);
 const officeContext=(write=false,permission:'documentos.publicar'|'documentos.ler_internos'='documentos.ler_internos')=>{const identidade=acesso.identidade(req),contexto=acesso.contextoRequisicao(req);if(contexto.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);exigirPermissao(identidade,permission,contexto);if(write)acesso.csrf(req);return {identidade,contexto};};
 const clientContext=(write=false)=>{const identidade=acesso.identidade(req),contexto=acesso.contextoRequisicao(req);if(contexto.tipo!=='cliente'||!contexto.cliente_id)throw new ErroCadastro('Selecione uma empresa cliente.',403);exigirPermissao(identidade,'documentos.ler_publicados',contexto);if(write)acesso.csrf(req);return {identidade,contexto};};
 const send=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));return true;};
 if(p==='/api/contexto/publicacoes'&&req.method==='GET'){
  const {contexto}=officeContext();return send(200,db.prepare(`SELECT p.id,p.cliente_id,c.razao_social,p.base,p.versao,p.hash_pdf,p.estado,p.criada_em,p.revogada_em FROM publicacoes_documentos p JOIN clientes c ON c.id=p.cliente_id WHERE p.escritorio_id=? ORDER BY p.id DESC LIMIT 200`).all(contexto.escritorio_id));
 }
 if(p==='/api/contexto/publicacoes/auditoria'&&req.method==='GET') {const {contexto,identidade}=officeContext();exigirPermissao(identidade,'auditoria.ler',contexto);const rows=db.prepare('SELECT id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,criado_em,ip,user_agent,request_id FROM auditoria_acessos_publicacoes WHERE escritorio_id=? ORDER BY id DESC LIMIT 200').all(contexto.escritorio_id) as Record<string,unknown>[];if(url.searchParams.get('formato')==='csv'){const cell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;const csv=['id,cliente_id,publicacao_id,versao,ator_id,evento,resultado,criado_em,ip,user_agent,request_id',...rows.map(r=>['id','cliente_id','publicacao_id','versao','ator_id','evento','resultado','criado_em','ip','user_agent','request_id'].map(k=>cell(r[k])).join(','))].join('\r\n');res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="auditoria-publicacoes.csv"','cache-control':'no-store','x-content-type-options':'nosniff'});res.end('\uFEFF'+csv);return true;}return send(200,rows);}
 if(p==='/api/contexto/publicacoes'&&req.method==='POST'){
  let {identidade,contexto}=officeContext(true,'documentos.publicar');const d=z.object({cliente_id:z.number().int().positive(),base:z.string().trim().min(1).max(40)}).strict().parse(await corpo(req));
  ({identidade,contexto}=officeContext(true,'documentos.publicar'));exigirCadastroEscritorio(db,'clientes',d.cliente_id,contexto.escritorio_id);
  const r=relatorioContexto(db,contexto.escritorio_id,d.cliente_id,d.base),c=db.prepare('SELECT razao_social,cnpj FROM clientes WHERE id=? AND escritorio_id=?').get(d.cliente_id,contexto.escritorio_id) as {razao_social:string;cnpj:string};
  const pdf=await gerarPdfRelatorio(r,c);
  const current=officeContext(true,'documentos.publicar');exigirCadastroEscritorio(db,'clientes',d.cliente_id,current.contexto.escritorio_id);const again=relatorioContexto(db,current.contexto.escritorio_id,d.cliente_id,d.base);if(again.versao!==r.versao)throw new ErroCadastro('O relatório mudou enquanto era preparado. Confira e publique novamente.',409);
  const hash=hashBytes(pdf);const result=db.transaction(()=>{const old=db.prepare('SELECT id,estado FROM publicacoes_documentos WHERE escritorio_id=? AND cliente_id=? AND base=? AND versao=?').get(current.contexto.escritorio_id,d.cliente_id,d.base,r.versao) as {id:number;estado:string}|undefined;
   let id:number,hashPublicado=hash;if(old){id=old.id;hashPublicado=(db.prepare('SELECT hash_pdf FROM publicacoes_documentos WHERE id=?').get(id) as {hash_pdf:string}).hash_pdf;db.prepare("UPDATE publicacoes_documentos SET estado='ativa',revogada_em=NULL WHERE id=?").run(id);}else id=Number(db.prepare("INSERT INTO publicacoes_documentos(escritorio_id,cliente_id,base,versao,hash_pdf,relatorio_json,pdf,ator_id) VALUES(?,?,?,?,?,?,?,?)").run(current.contexto.escritorio_id,d.cliente_id,d.base,r.versao,hash,JSON.stringify(r),pdf,current.identidade.usuario_id).lastInsertRowid);
   db.prepare(`INSERT OR IGNORE INTO notificacoes_publicacoes(publicacao_id,escritorio_id,cliente_id,usuario_id,destino) SELECT ?,?,?,u.id,u.email FROM usuarios_clientes v JOIN usuarios u ON u.id=v.usuario_id WHERE v.escritorio_id=? AND v.cliente_id=? AND v.ativo=1 AND u.ativo=1`).run(id,current.contexto.escritorio_id,d.cliente_id,current.contexto.escritorio_id,d.cliente_id);
   const avisos=(db.prepare("SELECT COUNT(*) n FROM notificacoes_publicacoes WHERE publicacao_id=? AND estado='pendente'").get(id) as {n:number}).n;
   audit(db,req,current.contexto.escritorio_id,d.cliente_id,id,r.versao,current.identidade.usuario_id,'publicada','publicação ativa');auditarSeguranca(db,'DOCUMENTO_PUBLICADO',current.identidade.usuario_id,acesso.evento(req),{publicacao_id:id,cliente_id:d.cliente_id,base:d.base,versao:r.versao,hash:hashPublicado,notificacoes_pendentes:avisos},current.contexto);return {id,avisos,hash:hashPublicado};})();return send(201,{id:result.id,versao:r.versao,hash_pdf:result.hash,notificacoes_pendentes:result.avisos});
 }
 const revoke=p.match(/^\/api\/contexto\/publicacoes\/([1-9]\d+)\/revogar$/);
 if(revoke&&req.method==='POST') {const current=officeContext(true,'documentos.publicar'),id=Number(revoke[1]);const row=db.prepare('SELECT * FROM publicacoes_documentos WHERE id=? AND escritorio_id=?').get(id,current.contexto.escritorio_id) as any;if(!row)throw new ErroCadastro('Publicação não encontrada.',404);db.transaction(()=>{db.prepare("UPDATE publicacoes_documentos SET estado='revogada',revogada_em=datetime('now') WHERE id=? AND estado='ativa'").run(id);db.prepare("UPDATE notificacoes_publicacoes SET estado='cancelado' WHERE publicacao_id=? AND estado='pendente'").run(id);audit(db,req,row.escritorio_id,row.cliente_id,id,row.versao,current.identidade.usuario_id,'revogada','publicação revogada');auditarSeguranca(db,'DOCUMENTO_PUBLICACAO_REVOGADO',current.identidade.usuario_id,acesso.evento(req),{publicacao_id:id,cliente_id:row.cliente_id,versao:row.versao},current.contexto);})();return send(200,{ok:true});}
 if(p==='/api/portal/documentos'&&req.method==='GET'){const {contexto,identidade}=clientContext();return send(200,db.prepare(`SELECT p.id,p.base,p.versao,p.hash_pdf,p.criada_em,EXISTS(SELECT 1 FROM auditoria_acessos_publicacoes a WHERE a.publicacao_id=p.id AND a.ator_id=? AND a.evento='ciencia_confirmada') ciencia_confirmada FROM publicacoes_documentos p WHERE p.escritorio_id=? AND p.cliente_id=? AND p.estado='ativa' ORDER BY p.id DESC`).all(identidade.usuario_id,contexto.escritorio_id,contexto.cliente_id));}
 const portal=p.match(/^\/api\/portal\/documentos\/([1-9]\d+)(?:\/(ciencia))?$/);
 if(portal&&req.method==='GET'&&!portal[2]){const {identidade,contexto}=clientContext();const row=db.prepare("SELECT * FROM publicacoes_documentos WHERE id=? AND escritorio_id=? AND cliente_id=? AND estado='ativa'").get(Number(portal[1]),contexto.escritorio_id,contexto.cliente_id) as any;if(!row){audit(db,req,contexto.escritorio_id,contexto.cliente_id!,null,'',identidade.usuario_id,'acesso_negado','não encontrado, revogado ou fora do escopo');throw new ErroCadastro('Documento não encontrado.',404);}audit(db,req,row.escritorio_id,row.cliente_id,row.id,row.versao,identidade.usuario_id,'abertura_autorizada','conteúdo autorizado');audit(db,req,row.escritorio_id,row.cliente_id,row.id,row.versao,identidade.usuario_id,'download_servido',url.searchParams.has('download')?'download autorizado':'PDF disponibilizado inline');res.writeHead(200,{'content-type':'application/pdf','content-disposition':`${url.searchParams.has('download')?'attachment':'inline'}; filename="${row.base.replace(/[^a-z0-9_-]/gi,'_')}.pdf"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(row.pdf);return true;}
 if(portal&&portal[2]==='ciencia'&&req.method==='POST'){const {identidade,contexto}=clientContext(true),id=Number(portal[1]);const row=db.prepare("SELECT * FROM publicacoes_documentos WHERE id=? AND escritorio_id=? AND cliente_id=? AND estado='ativa'").get(id,contexto.escritorio_id,contexto.cliente_id) as any;if(!row)throw new ErroCadastro('Documento não encontrado.',404);const b=z.object({confirmo:z.literal(true)}).strict().parse(await corpo(req));void b;const latest=clientContext(true);db.transaction(()=>{audit(db,req,row.escritorio_id,row.cliente_id,row.id,row.versao,latest.identidade.usuario_id,'ciencia_confirmada','ciência explícita registrada');auditarSeguranca(db,'CIENCIA_PUBLICACAO_CLIENTE',latest.identidade.usuario_id,acesso.evento(req),{publicacao_id:id,versao:row.versao},latest.contexto);})();return send(200,{ok:true});}
 throw new ErroCadastro('Método não permitido.',405);
}
