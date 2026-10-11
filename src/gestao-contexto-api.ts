import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Db } from './db.js';
import type { criarAcessoHttp } from './auth-http.js';
import { exigirPermissao, type Permissao } from './autorizacao.js';
import { auditarSeguranca, criarHashSenha } from './autenticacao.js';
import { ErroCadastro, exigirCadastroEscritorio } from './cadastros.js';
import { obterEscritorio, listarEscritorios, salvarEscritorio, excluirEscritorio, salvarUsuario,
  vincularUsuarioEscritorio, vincularUsuarioCliente, revogarVinculo } from './organizacoes.js';
import { registrarExecucaoEscritorio, salvarSmtpEscritorio, vistaSmtpEscritorio } from './operacoes-escritorio.js';

export async function tratarGestaoContexto(req:IncomingMessage,res:ServerResponse,db:Db,url:URL,
  acesso:ReturnType<typeof criarAcessoHttp>,corpo:(r:IncomingMessage)=>Promise<unknown>) {
  const global=url.pathname.match(/^\/api\/plataforma\/escritorios(?:\/([1-9]\d*))?$/);
  const local=url.pathname.match(/^\/api\/contexto\/(escritorio|usuarios|resumo|execucoes|logs|smtp|executar)(?:\/([1-9]\d*))?$/);
  if(!global&&!local)return false;
  acesso.validarRequisicao(req);
  const recurso=local?.[1],id=Number(global?.[1]||local?.[2])||null;
  const autorizar=()=>{
    const identidade=acesso.identidade(req),contexto=global?undefined:acesso.contextoRequisicao(req);
    if(contexto&&contexto.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    const permissao:Permissao=global?'plataforma.gerenciar':recurso==='usuarios'?'usuarios.gerenciar':recurso==='escritorio'||recurso==='smtp'||recurso==='executar'?'escritorio.gerenciar':recurso==='logs'?'auditoria.ler':'documentos.ler_internos';
    exigirPermissao(identidade,permissao,contexto);
    if(req.method!=='GET')acesso.csrf(req);
    return {identidade,contexto};
  };
  let atual=autorizar();
  const responder=(status:number,dados:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(dados));return true;};
  const audit=(acao:string,dados:Record<string,unknown>)=>auditarSeguranca(db,acao,atual.identidade.usuario_id,acesso.evento(req),dados,atual.contexto);
  if(global) {
    if(req.method==='GET')return responder(200,id?obterEscritorio(db,id):listarEscritorios(db));
    if((req.method==='POST'&&!id)||(req.method==='PUT'&&id)) {
      const raw=await corpo(req);atual=autorizar();
      const novo=db.transaction(()=>{const n=salvarEscritorio(db,id,raw);audit('ESCRITORIO_SALVO',{escritorio_id:n,operacao:id?'editar':'criar'});return n;})();
      return responder(id?200:201,{id:novo});
    }
    if(req.method==='DELETE'&&id){db.transaction(()=>{excluirEscritorio(db,id);audit('ESCRITORIO_EXCLUIDO',{escritorio_id:id});})();return responder(200,{ok:true});}
    throw new ErroCadastro('Método não permitido.',405);
  }
  const office=atual.contexto!.escritorio_id;
  if(recurso==='escritorio'&&!id) {
    if(req.method==='GET')return responder(200,obterEscritorio(db,office));
    if(req.method==='PUT') {
      const d=z.object({nome:z.string().trim().min(2).max(250),email:z.union([z.string().trim().toLowerCase().email().max(254),z.literal('')]),telefone:z.string().trim().max(500)}).strict().parse(await corpo(req));
      atual=autorizar();db.transaction(()=>{db.prepare("UPDATE escritorios SET nome=?,email=?,telefone=?,atualizado_em=datetime('now') WHERE id=?").run(d.nome,d.email,d.telefone,office);audit('ESCRITORIO_PERFIL_EDITADO',d);})();
      return responder(200,obterEscritorio(db,office));
    }
  }
  if(recurso==='usuarios') {
    if(req.method==='GET'&&!id)return responder(200,{
      funcionarios:db.prepare(`SELECT u.id,u.nome,u.email,v.papel,v.ativo FROM usuarios_escritorios v JOIN usuarios u ON u.id=v.usuario_id WHERE v.escritorio_id=? ORDER BY u.nome`).all(office),
      representantes:db.prepare(`SELECT u.id,u.nome,u.email,v.cliente_id,v.ativo FROM usuarios_clientes v JOIN usuarios u ON u.id=v.usuario_id WHERE v.escritorio_id=? ORDER BY u.nome`).all(office)});
    if(req.method==='POST'&&!id) {
      const d=z.object({modo:z.enum(['cadastrar','vincular']),nome:z.string().trim().min(2).max(250).optional(),email:z.string().trim().toLowerCase().email().max(254),
        senha:z.string().min(15).max(128).optional(),papel:z.enum(['administrador','operador','cliente']),cliente_id:z.number().int().positive().optional()}).strict().parse(await corpo(req));
      atual=autorizar();
      if((d.papel==='cliente')!==!!d.cliente_id)throw new ErroCadastro('Informe uma empresa somente para representantes.',400);
      if(d.cliente_id)exigirCadastroEscritorio(db,'clientes',d.cliente_id,office);
      if(d.modo==='cadastrar'&&(!d.nome||!d.senha))throw new ErroCadastro('Informe nome e senha inicial.',400);
      if(d.modo==='vincular'&&(d.senha||d.nome))throw new ErroCadastro('Vínculo não altera a identidade ou senha existente.',400);
      const hash=d.modo==='cadastrar'?await criarHashSenha(d.senha!):null;
      atual=autorizar();
      const uid=db.transaction(()=>{
        let u=db.prepare('SELECT id FROM usuarios WHERE email=? AND ativo=1').get(d.email) as {id:number}|undefined;
        if(d.modo==='cadastrar') {
          if(db.prepare('SELECT 1 FROM usuarios WHERE email=?').get(d.email))throw new ErroCadastro('Cadastro indisponível. Use o vínculo de uma conta existente ou consulte a plataforma.',409);
          u={id:salvarUsuario(db,null,{nome:d.nome,email:d.email})};
          db.prepare('INSERT INTO credenciais_usuarios VALUES (?,?,?)').run(u.id,hash,Date.now());
        }
        if(!u)throw new ErroCadastro('Não foi possível vincular essa conta.',409);
        if(d.cliente_id){exigirCadastroEscritorio(db,'clientes',d.cliente_id,office);vincularUsuarioCliente(db,u.id,d.cliente_id);}
        else {protegerUltimoAdmin(db,office,u.id,d.papel);vincularUsuarioEscritorio(db,u.id,office,d.papel as 'administrador'|'operador');}
        audit('USUARIO_VINCULADO',{usuario_id:u.id,papel:d.papel,cliente_id:d.cliente_id??null,novo:d.modo==='cadastrar'});return u.id;
      })();return responder(201,{id:uid});
    }
    if(req.method==='PUT'&&id) {
      const d=z.object({papel:z.enum(['administrador','operador']).optional(),ativo:z.boolean(),cliente_id:z.number().int().positive().optional()}).strict().parse(await corpo(req));
      atual=autorizar();
      db.transaction(()=>{
        if(d.cliente_id) {
          if(d.papel)throw new ErroCadastro('Representante não possui papel de funcionário.',400);
          exigirCadastroEscritorio(db,'clientes',d.cliente_id,office);
          if(!db.prepare('SELECT 1 FROM usuarios_clientes WHERE usuario_id=? AND cliente_id=? AND escritorio_id=?').get(id,d.cliente_id,office))throw new ErroCadastro('Vínculo não encontrado.',404);
          if(d.ativo)vincularUsuarioCliente(db,id,d.cliente_id);else revogarVinculo(db,id,'cliente',d.cliente_id);
        }else{
          const v=db.prepare('SELECT papel FROM usuarios_escritorios WHERE usuario_id=? AND escritorio_id=?').get(id,office) as {papel:'administrador'|'operador'}|undefined;
          if(!v)throw new ErroCadastro('Vínculo não encontrado.',404);
          protegerUltimoAdmin(db,office,id,d.ativo?(d.papel??v.papel):'revogado');
          if(d.ativo)vincularUsuarioEscritorio(db,id,office,d.papel??v.papel);else revogarVinculo(db,id,'escritorio',office);
        }
        audit('USUARIO_VINCULO_EDITADO',{usuario_id:id,...d});
      })();return responder(200,{ok:true});
    }
  }
  if(recurso==='smtp'&&!id) {
    if(req.method==='GET')return responder(200,vistaSmtpEscritorio(db,office));
    if(req.method==='PUT') { const d=z.object({ativo:z.boolean(),host:z.string().trim().max(253),port:z.number().int(),secure:z.boolean(),user:z.string().trim().max(254),password:z.string().max(512).optional(),limparSenha:z.boolean().optional(),from:z.string().trim().max(254)}).strict().parse(await corpo(req)); atual=autorizar(); const v=salvarSmtpEscritorio(db,office,d); audit('SMTP_ESCRITORIO_SALVO',{ativo:v.ativo,host:v.host,port:v.port,temSenha:v.temSenha,versao:v.versao}); return responder(200,v); }
  }
  if(recurso==='executar'&&!id&&req.method==='POST') { const raw=z.object({motivo:z.string().trim().max(500).optional()}).strict().parse(await corpo(req)); atual=autorizar(); const idExec=registrarExecucaoEscritorio(db,office,atual.identidade.usuario_id,{motivo:raw.motivo||'',origem:'manual'}); audit('EXECUCAO_ESCRITORIO_SOLICITADA',{execucao_id:idExec}); return responder(202,{id:idExec,status:'solicitada'}); }
  if(req.method==='GET'&&!id) {
    if(recurso==='resumo')return responder(200,{
      clientes:(db.prepare('SELECT COUNT(*) n FROM clientes WHERE escritorio_id=?').get(office) as {n:number}).n,
      documentos:(db.prepare('SELECT COUNT(DISTINCT d.numero_registro) n FROM clientes_documentos d JOIN clientes c ON c.id=d.cliente_id WHERE c.escritorio_id=?').get(office) as {n:number}).n,
      consolidacoes:(db.prepare('SELECT COUNT(*) n FROM interpretacoes_escritorio WHERE escritorio_id=?').get(office) as {n:number}).n});
    if(recurso==='execucoes')return responder(200,{itens:db.prepare('SELECT id,status,detalhes_json,iniciada_em,concluida_em FROM execucoes_escritorio WHERE escritorio_id=? ORDER BY id DESC LIMIT 100').all(office)});
    if(recurso==='logs')return responder(200,db.prepare(`SELECT id,acao,ator_id,cliente_id,criado_em,detalhes_json FROM auditoria_seguranca
      WHERE escritorio_id=? AND id<? ORDER BY id DESC LIMIT 100`).all(office,z.coerce.number().int().positive().safe().parse(url.searchParams.get('antes')??Number.MAX_SAFE_INTEGER)));
  }
  throw new ErroCadastro('Método não permitido.',405);
}
function protegerUltimoAdmin(db:Db,office:number,uid:number,papel:string) {
  if(papel==='administrador')return;
  const atual=db.prepare("SELECT 1 FROM usuarios_escritorios WHERE usuario_id=? AND escritorio_id=? AND papel='administrador' AND ativo=1").get(uid,office);
  const outro=db.prepare("SELECT 1 FROM usuarios_escritorios v JOIN usuarios u ON u.id=v.usuario_id WHERE v.escritorio_id=? AND v.usuario_id<>? AND v.papel='administrador' AND v.ativo=1 AND u.ativo=1").get(office,uid);
  if(atual&&!outro)throw new ErroCadastro('Mantenha ao menos um administrador ativo neste escritório.',409);
}
