import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Db } from './db.js';
import { ErroCadastro, decidirDocumentoCliente, descobrirDocumentosClientes, detalheCliente, excluirCadastro, listarClientes, listarContatos, salvarCliente, salvarContato } from './cadastros.js';
import { anexoEnvio, aprovarEnvio, cancelarEnvio, listarEnvios, prepararEnvios, processarFila, reprepararEnvio, resumoEnvios, vistaEnvio } from './envios.js';
import { gerarPdfRelatorio, obterRelatorio } from './relatorios.js';
import { lerNotificacoes } from './settings.js';
import { consultarCnpj } from './consulta-cnpj.js';

const json=(res:ServerResponse,status:number,data:unknown) => {res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const idValido=(v:string)=>z.coerce.number().int().positive().parse(v);
export function documentosCliente(db:Db,id:number) {
  detalheCliente(db,id);descobrirDocumentosClientes(db,id);
  return db.prepare(`SELECT d.*,r.tipo,r.vigencia,r.analise_status,r.arquivo_path IS NOT NULL arquivo_disponivel,r.primeira_vez
    FROM clientes_documentos d JOIN registros r ON r.numero_registro=d.numero_registro WHERE d.cliente_id=? ORDER BY r.primeira_vez DESC,d.numero_registro DESC`).all(id);
}
export async function tratarClientes(req:IncomingMessage,res:ServerResponse,db:Db,url:URL,corpo:(req:IncomingMessage)=>Promise<unknown>):Promise<boolean> {
  const p=url.pathname,m=req.method;
  const consulta = p.match(/^\/api\/clientes\/consulta-cnpj\/([^/]+)$/);
  if (m==='GET' && consulta) { json(res,200,await consultarCnpj(decodeURIComponent(consulta[1]))); return true; }
  if(m==='GET'&&p==='/api/clientes'){json(res,200,listarClientes(db));return true;}
  if(m==='GET'&&p==='/api/contatos'){json(res,200,listarContatos(db));return true;}
  if(m==='GET'&&p==='/api/envios') {const cliente=url.searchParams.get('cliente');json(res,200,listarEnvios(db,cliente?idValido(cliente):undefined));return true;}
  if(m==='GET'&&p==='/api/envios/resumo') {const c=lerNotificacoes(db);json(res,200,{estados:resumoEnvios(db),smtp_ativo:c.email.ativo&&!!c.email.host&&!!c.email.from});return true;}
  if(m==='POST'&&p==='/api/envios/processar'){json(res,200,await processarFila(db));return true;}
  if(m==='POST'&&p==='/api/envios/preparar'){json(res,200,await prepararEnvios(db));return true;}
  const pdf=p.match(/^\/api\/relatorio-pdf\/(.+)$/);
  if(m==='GET'&&pdf) {
    const numero=decodeURIComponent(pdf[1]),r=obterRelatorio(db,numero),bytes=await gerarPdfRelatorio(r);
    res.writeHead(200,{'content-type':'application/pdf','content-disposition':`attachment; filename="${numero.replace(/[^A-Z0-9_-]/gi,'_')}_analise.pdf"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(bytes);return true;
  }
  const sind=p.match(/^\/api\/sindicatos\/(\d+)\/clientes$/);
  if(m==='GET'&&sind){json(res,200,db.prepare(`SELECT c.id,c.razao_social,c.cnpj,c.ativo,cs.categoria,cs.principal FROM clientes_sindicatos cs JOIN clientes c ON c.id=cs.cliente_id WHERE cs.sindicato_id=? ORDER BY c.razao_social`).all(idValido(sind[1])));return true;}
  const cadastro=p.match(/^\/api\/(clientes|contatos)(?:\/(\d+))?$/);
  if(cadastro) {
    const tabela=cadastro[1] as 'clientes'|'contatos',id=cadastro[2]?idValido(cadastro[2]):null;
    if(m==='GET'&&id){const item=tabela==='clientes'?detalheCliente(db,id):listarContatos(db).find(x=>x.id===id);if(!item)throw new ErroCadastro('Contato não encontrado.',404);json(res,200,item);return true;}
    if((m==='POST'&&!id)||(m==='PUT'&&id)) {const data=await corpo(req),novo=tabela==='clientes'?salvarCliente(db,id,data):salvarContato(db,id,data);json(res,id?200:201,{id:novo});return true;}
    if(m==='DELETE'&&id){excluirCadastro(db,tabela,id);json(res,200,{ok:true});return true;}
  }
  const cliente=p.match(/^\/api\/clientes\/(\d+)\/(documentos(?:\/decidir|\/atualizar)?|envios|preparar)$/);
  if(cliente) {
    const id=idValido(cliente[1]),acao=cliente[2];detalheCliente(db,id);
    if(m==='GET'&&acao==='documentos'){json(res,200,documentosCliente(db,id));return true;}
    if(m==='GET'&&acao==='envios'){json(res,200,listarEnvios(db,id));return true;}
    if(m==='POST'&&acao==='documentos/atualizar') {const b=z.object({historico:z.boolean().default(false)}).parse(await corpo(req));descobrirDocumentosClientes(db,id,b.historico);json(res,200,documentosCliente(db,id));return true;}
    if(m==='POST'&&acao==='documentos/decidir') {
      const b=z.object({numero:z.string().min(1),status:z.enum(['confirmado','rejeitado']),responsavel:z.string().trim().min(1).max(250),justificativa:z.string().trim().min(1).max(2000),contexto_hash:z.string().length(64)}).parse(await corpo(req));
      descobrirDocumentosClientes(db,id);const row=db.prepare('SELECT contexto_hash FROM clientes_documentos WHERE cliente_id=? AND numero_registro=?').get(id,b.numero) as {contexto_hash:string}|undefined;
      if(row?.contexto_hash!==b.contexto_hash)throw new ErroCadastro('Documento ou vínculos alterados. Atualize a tela e confira novamente.',409);
      decidirDocumentoCliente(db,id,b.numero,b.status,b.responsavel,b.justificativa);json(res,200,{ok:true});return true;
    }
    if(m==='POST'&&acao==='preparar') {const b=z.object({numero:z.string().optional()}).parse(await corpo(req));json(res,200,await prepararEnvios(db,id,b.numero));return true;}
  }
  const envio=p.match(/^\/api\/envios\/(\d+)(?:\/(aprovar|cancelar|repreparar|anexos\/(\d+)))?$/);
  if(envio) {
    const id=idValido(envio[1]),acao=envio[2];
    if(m==='GET'&&!acao){json(res,200,vistaEnvio(db,id));return true;}
    if(m==='GET'&&acao?.startsWith('anexos/')) {const a=anexoEnvio(db,id,Number(envio[3]));res.writeHead(200,{'content-type':a.nome.endsWith('.pdf')?'application/pdf':'application/msword','content-disposition':`attachment; filename="${a.nome}"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(a.bytes);return true;}
    if(m==='POST'&&acao==='aprovar') {const b=z.object({responsavel:z.string().trim().min(1).max(250),previsualizacao_hash:z.string().length(64)}).parse(await corpo(req));aprovarEnvio(db,id,b.responsavel,b.previsualizacao_hash);json(res,200,{ok:true});return true;}
    if(m==='POST'&&acao==='cancelar'){cancelarEnvio(db,id);json(res,200,{ok:true});return true;}
    if(m==='POST'&&acao==='repreparar') {const b=z.object({confirmar_risco:z.boolean().default(false)}).parse(await corpo(req));reprepararEnvio(db,id,b.confirmar_risco);const e=vistaEnvio(db,id),result=await prepararEnvios(db,e.cliente_id,e.numero_registro);
      const atual=db.prepare('SELECT id FROM envios_clientes WHERE cliente_id=? AND contato_id=? AND numero_registro=? ORDER BY id DESC LIMIT 1').get(e.cliente_id,e.contato_id,e.numero_registro) as {id:number}|undefined;
      json(res,200,{...result,envio_id:atual?.id||id});return true;}
  }
  return false;
}
