import type { IncomingMessage,ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Db } from './db.js';
import type { criarAcessoHttp } from './auth-http.js';
import { exigirPermissao } from './autorizacao.js';
import { auditarSeguranca } from './autenticacao.js';
import { ErroCadastro, exigirCadastroEscritorio } from './cadastros.js';
import { detalheInstrumento, catalogoDocumentos, listarVinculosContexto, salvarVinculoContexto, vistaInterpretacao,
  prepararConsolidacaoContexto,revisarContexto,relatorioContexto,NumeroSchema } from './interpretacoes-contexto.js';
import { gerarPdfRelatorio,hashBytes } from './relatorios.js';
import { renderizarConsolidadoMarkdown } from './consolidacao.js';
import { anexoEnvio } from './envios.js';

export async function tratarInterpretacoesContexto(req:IncomingMessage,res:ServerResponse,db:Db,url:URL,
  acesso:ReturnType<typeof criarAcessoHttp>,corpo:(r:IncomingMessage)=>Promise<unknown>) {
  const rota=url.pathname.match(/^\/api\/contexto\/(interpretacoes|vinculos|revisoes|relatorio|anexo)(?:\/(consolidar|legado))?$/);
  if(!rota)return false;
  acesso.validarRequisicao(req);
  const autorizar=()=>{
    const identidade=acesso.identidade(req),contexto=acesso.contextoRequisicao(req);
    if(contexto.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    exigirPermissao(identidade,req.method==='GET'?'documentos.ler_internos':'documentos.revisar',contexto);
    if(req.method!=='GET')acesso.csrf(req);
    return {identidade,contexto};
  };
  let atual=autorizar();const office=atual.contexto.escritorio_id;
  const json=(dados:unknown)=>{res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(dados));return true;};
  const audit=(acao:string,dados:Record<string,unknown>)=>auditarSeguranca(db,acao,atual.identidade.usuario_id,acesso.evento(req),dados,atual.contexto);
  if(req.method==='GET'&&rota[1]==='interpretacoes'&&!rota[2]) {
    const numero=url.searchParams.get('numero');if(numero!==null)return json(detalheInstrumento(db,office,NumeroSchema.parse(numero)));
    const base=url.searchParams.get('base');return json(base?vistaInterpretacao(db,office,NumeroSchema.parse(base)):{documentos:catalogoDocumentos(db,office),vinculos:listarVinculosContexto(db,office)});
  }
  if(req.method==='GET'&&rota[1]==='interpretacoes'&&rota[2]==='legado') {
    exigirPermissao(atual.identidade,'auditoria.ler',atual.contexto);
    return json(db.prepare('SELECT entidade,conteudo_json FROM historico_interpretacoes_legado WHERE escritorio_id=?').all(office));
  }
  if(req.method==='POST') {
    const raw=await corpo(req);atual=autorizar();
    if(rota[1]==='vinculos'&&!rota[2])return json(db.transaction(()=>{const d=salvarVinculoContexto(db,office,atual.identidade.usuario_id,raw);audit('VINCULO_ADITIVO_DECIDIDO',d);return {ok:true};})());
    if(rota[1]==='revisoes'&&!rota[2])return json(db.transaction(()=>{const d=revisarContexto(db,office,atual.identidade,raw);audit('INTERPRETACAO_REVISADA',d);return d;})());
    if(rota[1]==='interpretacoes'&&rota[2]==='consolidar') {
      const d=z.object({base:NumeroSchema}).strict().parse(raw);
      const preparada=await prepararConsolidacaoContexto(db,office,d.base);atual=autorizar();
      return json(db.transaction(()=>{const versao=preparada.gravar(atual.identidade.usuario_id);audit('CONSOLIDACAO_ESCRITORIO_GERADA',{base:d.base,versao});return vistaInterpretacao(db,office,d.base);})());
    }
  }
  if(req.method==='GET'&&rota[1]==='relatorio'&&!rota[2]) {
    const cliente=z.coerce.number().int().positive().safe().parse(url.searchParams.get('cliente')),base=NumeroSchema.parse(url.searchParams.get('base'));
    const formato=z.enum(['pdf','md']).parse(url.searchParams.get('formato'));
    exigirCadastroEscritorio(db,'clientes',cliente,office);
    const r=relatorioContexto(db,office,cliente,base),c=db.prepare('SELECT razao_social,cnpj FROM clientes WHERE id=?').get(cliente) as {razao_social:string;cnpj:string};
    const bytes=formato==='pdf'?await gerarPdfRelatorio(r,c):Buffer.from(`# ${c.razao_social} (${c.cnpj})\n\nVersão: ${r.versao}\n\n${renderizarConsolidadoMarkdown(r.consolidado!)}`);
    atual=autorizar();exigirCadastroEscritorio(db,'clientes',cliente,office);
    const cAtual=db.prepare('SELECT razao_social,cnpj FROM clientes WHERE id=?').get(cliente);
    if(relatorioContexto(db,office,cliente,base).versao!==r.versao||JSON.stringify(cAtual)!==JSON.stringify(c))throw new ErroCadastro('Relatório alterado durante a geração. Atualize.',409);
    audit('RELATORIO_INTERNO_EXPORTADO',{cliente_id:cliente,base,versao:r.versao,formato,hash:hashBytes(bytes)});
    res.writeHead(200,{'content-type':formato==='pdf'?'application/pdf':'text/markdown; charset=utf-8','cache-control':'no-store',
      'content-disposition':`attachment; filename="${base.replace(/[^a-z0-9_-]/gi,'_')}.${formato}"`,'x-content-type-options':'nosniff'});res.end(bytes);return true;
  }
  if(req.method==='GET'&&rota[1]==='anexo'&&!rota[2]) {
    const id=z.coerce.number().int().positive().safe().parse(url.searchParams.get('envio')),indice=z.coerce.number().int().min(0).max(20).parse(url.searchParams.get('indice'));
    const row=db.prepare(`SELECT e.id FROM envios_clientes e JOIN clientes c ON c.id=e.cliente_id WHERE e.id=? AND c.escritorio_id=?`).get(id,office);
    if(!row)throw new ErroCadastro('Anexo não encontrado.',404);
    const anexo=anexoEnvio(db,id,indice);audit('ANEXO_INTERNO_EXPORTADO',{envio_id:id,indice,hash:hashBytes(anexo.bytes)});
    res.writeHead(200,{'content-type':'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff',
      'content-disposition':`attachment; filename="${anexo.nome.replace(/[^a-z0-9_.-]/gi,'_')}"`});res.end(anexo.bytes);return true;
  }
  throw new ErroCadastro('Método não permitido.',405);
}
