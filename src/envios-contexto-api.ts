import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Db } from './db.js';
import type { criarAcessoHttp } from './auth-http.js';
import { exigirPermissao } from './autorizacao.js';
import { auditarSeguranca } from './autenticacao.js';
import { ErroCadastro, exigirCadastroEscritorio } from './cadastros.js';
import { anexoEnvio, aprovarEnvio, cancelarEnvio, prepararEnvios, reprepararEnvio, vistaEnvio } from './envios.js';

export async function tratarEnviosContexto(req: IncomingMessage, res: ServerResponse, db: Db, url: URL,
  acesso: ReturnType<typeof criarAcessoHttp>, corpo: (req: IncomingMessage) => Promise<unknown>): Promise<boolean> {
  const p=url.pathname;
  if(!p.startsWith('/api/contexto/envios'))return false;
  acesso.validarRequisicao(req);
  const autorizar=(permissao:'documentos.ler_internos'|'documentos.revisar'|'envios.aprovar')=>{
    const identidade=acesso.identidade(req),contexto=acesso.contextoRequisicao(req);
    if(contexto.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    exigirPermissao(identidade,permissao,contexto);if(req.method!=='GET')acesso.csrf(req);
    return {identidade,contexto};
  };
  const send=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-mediador-escopo':'escritorio'});res.end(JSON.stringify(data));return true;};
  const list=p==='/api/contexto/envios';
  if(list&&req.method==='GET'){const {contexto}=autorizar('documentos.ler_internos');const ids=db.prepare('SELECT id FROM envios_clientes WHERE escritorio_id=? ORDER BY id DESC LIMIT 500').all(contexto.escritorio_id) as {id:number}[];return send(200,ids.map(e=>vistaEnvio(db,e.id)).map(e=>({...e,snapshot:e.snapshot?{...e.snapshot,anexos:e.snapshot.anexos.map((a:any,i:number)=>({...a,url:`/api/contexto/envios/${e.id}/anexos/${i}`}))}:null})));}
  if(p==='/api/contexto/envios/preparar'&&req.method==='POST'){
    let atual=autorizar('documentos.revisar');const body=z.object({cliente_id:z.number().int().positive().optional()}).strict().parse(await corpo(req));atual=autorizar('documentos.revisar');
    if(body.cliente_id)exigirCadastroEscritorio(db,'clientes',body.cliente_id,atual.contexto.escritorio_id);
    const result=await prepararEnvios(db,body.cliente_id);atual=autorizar('documentos.revisar');
    auditarSeguranca(db,'ENVIOS_ESCRITORIO_PREPARADOS',atual.identidade.usuario_id,acesso.evento(req),{cliente_id:body.cliente_id??null,...result},atual.contexto);
    return send(200,result);
  }
  const action=p.match(/^\/api\/contexto\/envios\/([1-9]\d*)\/(aprovar|cancelar|repreparar|anexos\/(\d+))$/);
  if(action){const id=Number(action[1]),acao=action[2];
    const office=acesso.contextoRequisicao(req);if(office.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    const row=db.prepare('SELECT escritorio_id,cliente_id,numero_registro FROM envios_clientes WHERE id=?').get(id) as {escritorio_id:number;cliente_id:number;numero_registro:string}|undefined;
    if(!row||row.escritorio_id!==office.escritorio_id)throw new ErroCadastro('Envio não encontrado.',404);
    if(req.method==='GET'&&acao.startsWith('anexos/')){const {identidade,contexto}=autorizar('documentos.ler_internos');const file=anexoEnvio(db,id,Number(action[3]));auditarSeguranca(db,'ANEXO_ENVIO_ESCRITORIO_EXPORTADO',identidade.usuario_id,acesso.evento(req),{envio_id:id,indice:Number(action[3])},contexto);res.writeHead(200,{'content-type':file.nome.endsWith('.pdf')?'application/pdf':'application/msword','content-disposition':`attachment; filename="${file.nome.replace(/[^a-z0-9_.-]/gi,'_')}"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(file.bytes);return true;}
    if(req.method==='POST'&&acao==='aprovar'){let atual=autorizar('envios.aprovar');const d=z.object({previsualizacao_hash:z.string().length(64)}).strict().parse(await corpo(req));atual=autorizar('envios.aprovar');const nome=(db.prepare('SELECT nome FROM usuarios WHERE id=?').get(atual.identidade.usuario_id) as {nome:string}).nome;db.transaction(()=>{aprovarEnvio(db,id,nome,d.previsualizacao_hash);auditarSeguranca(db,'ENVIO_ESCRITORIO_APROVADO',atual.identidade.usuario_id,acesso.evento(req),{envio_id:id},atual.contexto);})();return send(200,{ok:true});}
    if(req.method==='POST'&&acao==='cancelar'){let atual=autorizar('documentos.revisar');await corpo(req);atual=autorizar('documentos.revisar');db.transaction(()=>{cancelarEnvio(db,id);auditarSeguranca(db,'ENVIO_ESCRITORIO_CANCELADO',atual.identidade.usuario_id,acesso.evento(req),{envio_id:id},atual.contexto);})();return send(200,{ok:true});}
    if(req.method==='POST'&&acao==='repreparar'){let atual=autorizar('documentos.revisar');const d=z.object({confirmar_risco:z.boolean().default(false)}).strict().parse(await corpo(req));atual=autorizar('documentos.revisar');db.transaction(()=>{reprepararEnvio(db,id,d.confirmar_risco);auditarSeguranca(db,'ENVIO_ESCRITORIO_REPREPARADO',atual.identidade.usuario_id,acesso.evento(req),{envio_id:id,confirmar_risco:d.confirmar_risco},atual.contexto);})();const result=await prepararEnvios(db,row.cliente_id,row.numero_registro);return send(200,{...result,envio_id:id});}
  }
  throw new ErroCadastro('Método não permitido.',405);
}
