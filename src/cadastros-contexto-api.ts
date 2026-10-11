import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Db } from './db.js';
import type { criarAcessoHttp } from './auth-http.js';
import { auditarSeguranca } from './autenticacao.js';
import { exigirPermissao } from './autorizacao.js';
import { ClienteSchema, ContatoSchema, ErroCadastro, detalheCliente, exigirCadastroEscritorio,
  excluirCadastro, listarClientes, listarContatos, salvarCliente, salvarContato } from './cadastros.js';
import { excluirMonitoramento, listarCatalogoSindicatos, listarMonitoramentos, obterMonitoramento, salvarMonitoramento } from './monitoramentos-escritorio.js';
import { decidirDocumentoCliente, descobrirDocumentosClientes } from './cadastros.js';
import { listarDocumentosContexto, obterDocumentoContexto, originalDocumentoContexto } from './documentos-contexto.js';

/** API de cadastros com contexto obrigatório. Nunca encaminha para as rotas globais. */
export async function tratarCadastrosContexto(req: IncomingMessage, res: ServerResponse, db: Db, url: URL,
  acesso: ReturnType<typeof criarAcessoHttp>, corpo: (req: IncomingMessage) => Promise<unknown>): Promise<boolean> {
  if (!url.pathname.startsWith('/api/contexto/')) return false;
  acesso.validarRequisicao(req);
  const rota = url.pathname.match(/^\/api\/contexto\/(clientes|contatos|sindicatos|monitoramentos)(?:\/([1-9]\d*))?$/);
  const documentos = url.pathname.match(/^\/api\/contexto\/clientes\/([1-9]\d*)\/documentos(?:\/(atualizar|decidir|original))?$/);
  const monitoramento = rota?.[1] === 'monitoramentos' || rota?.[1] === 'sindicatos';
  const autorizar = () => {
    const identidade = acesso.identidade(req), contexto = acesso.contextoRequisicao(req);
    if (contexto.tipo !== 'escritorio') throw new ErroCadastro('Selecione um escritório autorizado.',403);
    const leitura = req.method === 'GET';
    exigirPermissao(identidade, documentos ? (leitura?'documentos.ler_internos':'documentos.revisar') : monitoramento ? (leitura?'monitoramentos.ler':'monitoramentos.gerenciar')
      : (leitura?'clientes.ler':'clientes.gerenciar'), contexto);
    if (!leitura) acesso.csrf(req);
    return { identidade, contexto };
  };
  let acessoAtual = autorizar();
  if (!rota && !documentos) throw new ErroCadastro('Não encontrado.',404);
  const tabela = rota?.[1] as 'clientes'|'contatos', id = rota?.[2] ? z.coerce.number().int().positive().safe().parse(rota[2]) : null;
  const responder = (status: number, dados: unknown) => {
    res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
      'x-mediador-escopo':`escritorio:${acessoAtual.contexto.escritorio_id}`});
    res.end(JSON.stringify(dados));
  };
  if(documentos) {
    const clienteId=z.coerce.number().int().positive().safe().parse(documentos[1]),acao=documentos[2];
    exigirCadastroEscritorio(db,'clientes',clienteId,acessoAtual.contexto.escritorio_id);
    if(req.method==='GET'&&!acao){responder(200,listarDocumentosContexto(db,acessoAtual.contexto.escritorio_id,clienteId));return true;}
    if(req.method==='GET'&&acao==='original'){
      const numero=z.string().min(1).max(100).parse(url.searchParams.get('numero'));
      const original=originalDocumentoContexto(db,acessoAtual.contexto.escritorio_id,clienteId,numero);
      auditarSeguranca(db,'ORIGINAL_INTERNO_DISPONIBILIZADO',acessoAtual.identidade.usuario_id,acesso.evento(req),
        {numero,hash:original.hash}, {...acessoAtual.contexto,cliente_id:clienteId});
      res.writeHead(200,{'content-type':original.tipo,'content-disposition':`attachment; filename="${original.nome}"`,
        'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(original.bytes);return true;
    }
    if(req.method==='POST'&&(acao==='atualizar'||acao==='decidir')){
      const raw=await corpo(req);acessoAtual=autorizar();
      exigirCadastroEscritorio(db,'clientes',clienteId,acessoAtual.contexto.escritorio_id);
      const contexto={...acessoAtual.contexto,cliente_id:clienteId};
      const resultado=db.transaction(()=>{
        if(acao==='atualizar'){
          z.object({}).strict().parse(raw);
          const total=descobrirDocumentosClientes(db,clienteId,false,false);
          auditarSeguranca(db,'DOCUMENTOS_CLIENTE_ATUALIZADOS',acessoAtual.identidade.usuario_id,acesso.evento(req),{total},contexto);
        }else{
          const dados=z.object({numero:z.string().min(1).max(100),status:z.enum(['confirmado','rejeitado']),
            justificativa:z.string().trim().min(1).max(2000),versao:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(raw);
          const antes=obterDocumentoContexto(db,contexto.escritorio_id,clienteId,dados.numero);
          if(antes.desatualizado||antes.versao!==dados.versao)throw new ErroCadastro('Documento, vínculos ou decisão alterados. Atualize a lista e confira novamente.',409);
          const original=dados.status==='confirmado'?originalDocumentoContexto(db,contexto.escritorio_id,clienteId,dados.numero):null;
          decidirDocumentoCliente(db,clienteId,dados.numero,dados.status,acessoAtual.identidade.nome,dados.justificativa,false);
          auditarSeguranca(db,'APLICABILIDADE_DECIDIDA',acessoAtual.identidade.usuario_id,acesso.evento(req),
            {numero:dados.numero,antes:antes.status,status:dados.status,justificativa:dados.justificativa,versao_anterior:antes.versao,hash_original:original?.hash??null},contexto);
        }
        return listarDocumentosContexto(db,contexto.escritorio_id,clienteId);
      })();responder(200,resultado);return true;
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  if(monitoramento) {
    const escritorio=acessoAtual.contexto.escritorio_id;
    if(rota![1]==='sindicatos') {
      if(req.method!=='GET'||id)throw new ErroCadastro('Catálogo compartilhado disponível somente para consulta.',405);
      responder(200,listarCatalogoSindicatos(db,escritorio));return true;
    }
    if(req.method==='GET'){responder(200,id?obterMonitoramento(db,escritorio,id):listarMonitoramentos(db,escritorio));return true;}
    if((req.method==='POST'&&!id)||(req.method==='PUT'&&id)) {
      const raw=await corpo(req);acessoAtual=autorizar();
      const novo=db.transaction(()=>{
        const resultado=salvarMonitoramento(db,acessoAtual.contexto.escritorio_id,id,raw);
        auditarSeguranca(db,'MONITORAMENTO_CONTEXTO_SALVO',acessoAtual.identidade.usuario_id,acesso.evento(req),
          {monitoramento_id:resultado,operacao:id?'editar':'criar'},acessoAtual.contexto);return resultado;
      })();responder(id?200:201,{id:novo});return true;
    }
    if(req.method==='DELETE'&&id){db.transaction(()=>{
      excluirMonitoramento(db,escritorio,id);
      auditarSeguranca(db,'MONITORAMENTO_CONTEXTO_EXCLUIDO',acessoAtual.identidade.usuario_id,acesso.evento(req),{monitoramento_id:id},acessoAtual.contexto);
    })();responder(200,{ok:true});return true;}
    throw new ErroCadastro('Método não permitido.',405);
  }
  if (req.method === 'GET') {
    const escritorio = acessoAtual.contexto.escritorio_id;
    if (id) exigirCadastroEscritorio(db,tabela,id,escritorio);
    const dados = tabela === 'clientes' ? (id ? detalheCliente(db,id,escritorio) : listarClientes(db,escritorio))
      : (id ? listarContatos(db,escritorio).find(c => c.id === id) : listarContatos(db,escritorio));
    responder(200,dados); return true;
  }
  if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)) {
    const raw = await corpo(req);
    // Vínculos ou sessão podem ter sido revogados durante a leitura do corpo.
    acessoAtual = autorizar();
    const dados = tabela === 'clientes' ? ClienteSchema.strict().parse(raw) : ContatoSchema.strict().parse(raw);
    const escritorio = acessoAtual.contexto.escritorio_id;
    if (id) exigirCadastroEscritorio(db,tabela,id,escritorio);
    // Evitar revelar a existência de um cadastro privado pelo conflito global atual.
    if (tabela === 'clientes' && db.prepare('SELECT id FROM clientes WHERE cnpj=? AND escritorio_id<>?').get((dados as z.infer<typeof ClienteSchema>).cnpj,escritorio))
      throw new ErroCadastro('Não foi possível cadastrar este CNPJ. Procure o administrador da plataforma.',409);
    const novo = db.transaction(() => {
      const resultado = tabela === 'clientes' ? salvarCliente(db,id,dados,escritorio) : salvarContato(db,id,dados,escritorio);
      auditarSeguranca(db,'CADASTRO_CONTEXTO_SALVO',acessoAtual.identidade.usuario_id,acesso.evento(req),
        { entidade:tabela, entidade_id:resultado, operacao:id?'editar':'criar' },acessoAtual.contexto);
      return resultado;
    })();
    responder(id?200:201,{id:novo});return true;
  }
  if (req.method === 'DELETE' && id) {
    db.transaction(() => {
      excluirCadastro(db,tabela,id,acessoAtual.contexto.escritorio_id);
      auditarSeguranca(db,'CADASTRO_CONTEXTO_EXCLUIDO',acessoAtual.identidade.usuario_id,acesso.evento(req),
        {entidade:tabela,entidade_id:id},acessoAtual.contexto);
    })();
    responder(200,{ok:true});return true;
  }
  throw new ErroCadastro('Método não permitido.',405);
}
