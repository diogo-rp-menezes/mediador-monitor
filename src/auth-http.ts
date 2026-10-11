import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {criarResolvedorIp} from './request-ip.js';
import { z } from 'zod';
import type { Db } from './db.js';
import { ErroCadastro } from './cadastros.js';
import { listarVinculosUsuario, salvarUsuario } from './organizacoes.js';
import { auditarSeguranca, cookieSessao, criarAutenticacao, exigirCsrf, lerCookieSessao, possuiAdministrador, tokenCsrf,
  type DadosEvento, type OpcoesAutenticacao } from './autenticacao.js';
import { encerrarContextoSuporte, exigirPermissao, iniciarContextoSuporte, resolverContexto } from './autorizacao.js';

export interface ConfigAuthHttp extends OpcoesAutenticacao { publicUrl: string }
const json = (res: ServerResponse, status: number, dados: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(dados));
};
export function criarAcessoHttp(db: Db, config: ConfigAuthHttp) {
  const resolveIp=criarResolvedorIp(process.env.AUTH_TRUSTED_PROXY_CIDRS??'');
  const publicUrl = new URL(config.publicUrl);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/')
    throw new Error('AUTH_PUBLIC_URL deve conter somente a origem HTTP/HTTPS da aplicação.');
  const local = publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname);
  if (publicUrl.protocol === 'http:' && !local) throw new Error('AUTH_PUBLIC_URL externo exige HTTPS.');
  const origens = new Set([publicUrl.origin]);
  if (local) for (const host of ['localhost','127.0.0.1']) origens.add(`http://${host}${publicUrl.port ? ':' + publicUrl.port : ''}`);
  const hosts = new Set([...origens].map(origin => new URL(origin).host));
  const auth = criarAutenticacao(db, config), secure = publicUrl.protocol === 'https:';
  const token = (req: IncomingMessage) => lerCookieSessao(req.headers.cookie);
  const identidade = (req: IncomingMessage) => auth.exigirSessao(token(req));
  const evento = (req: IncomingMessage): DadosEvento => ({ ip: resolveIp(req),
    user_agent: req.headers['user-agent'] ?? '', request_id: randomUUID() });
  const validarRequisicao = (req: IncomingMessage) => {
    // Host é configurado, nunca inferido de X-Forwarded-* ou usado para construir links de recuperação.
    if (!req.headers.host || !hosts.has(req.headers.host.toLowerCase())) throw new ErroCadastro('Host não autorizado.', 403);
    if (req.method === 'GET' || req.method === 'HEAD') return;
    const origem = req.headers.origin;
    if (origem && (!origens.has(origem) || new URL(origem).host !== req.headers.host.toLowerCase()))
      throw new ErroCadastro('Origem não autorizada.', 403);
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new ErroCadastro('Origem não autorizada.', 403);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''))
      throw new ErroCadastro('Envie conteúdo JSON.', 415);
  };
  const csrf = (req: IncomingMessage) => exigirCsrf(token(req), req.headers['x-csrf-token']);
  function vistaSessao(req: IncomingMessage) {
    const id = identidade(req), vinculos = listarVinculosUsuario(db, id.usuario_id);
    const escritorios = id.papel_plataforma ? (db.prepare('SELECT id,nome FROM escritorios WHERE ativo=1 ORDER BY nome,id').all() as { id: number; nome: string }[])
      .map(e => ({ ...e, membro: vinculos.escritorios.some((v: any) => v.id === e.id), papel: (vinculos.escritorios.find((v: any) => v.id === e.id) as any)?.papel ?? 'suporte' }))
      : vinculos.escritorios.map((e: any) => ({ ...e, membro: true }));
    return { usuario: { id: id.usuario_id, nome: id.nome, email: id.email, papel_plataforma: id.papel_plataforma },
      csrf: tokenCsrf(token(req)), expira_em: id.expira_em, contextos: { escritorios, clientes: vinculos.clientes },
      painel_global: id.papel_plataforma === 'administrador_plataforma' };
  }
  const contextoRequisicao = (req: IncomingMessage) => {
    const tipo = req.headers['x-context-type'], valor = req.headers['x-context-id'], concessao = req.headers['x-support-grant'];
    if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor) || (tipo !== 'escritorio' && tipo !== 'cliente') || (concessao && typeof concessao !== 'string'))
      throw new ErroCadastro('Selecione um contexto válido.', 400);
    return resolverContexto(db, identidade(req), { tipo, id: Number(valor), ...(concessao ? { concessao } : {}) }, config.agora?.());
  };
  return {
    identidade, validarRequisicao, vistaSessao, contextoRequisicao, csrf, evento,
    protegerLegado(req: IncomingMessage) {
      const id = identidade(req);
      exigirPermissao(id, 'legado.acessar');
      if (!['GET','HEAD'].includes(req.method ?? 'GET')) csrf(req);
      return id;
    },
    async tratar(req: IncomingMessage, res: ServerResponse, url: URL, corpo: (req: IncomingMessage) => Promise<unknown>): Promise<boolean> {
      const p = url.pathname, m = req.method;
      if (!p.startsWith('/api/auth/')) return false;
      validarRequisicao(req);
      if (m === 'GET' && p === '/api/auth/estado') { json(res, 200, { configurado: possuiAdministrador(db) }); return true; }
      if (m === 'POST' && p === '/api/auth/login') {
        const result = await auth.login(await corpo(req), evento(req), token(req));
        res.setHeader('set-cookie', cookieSessao(result.token, secure));
        json(res, 200, { ok: true }); return true;
      }
      if (m === 'POST' && p === '/api/auth/recuperacao') { json(res, 200, await auth.solicitarRecuperacao(await corpo(req), evento(req))); return true; }
      if (m === 'POST' && p === '/api/auth/recuperar') {
        json(res, 200, await auth.recuperar(await corpo(req), evento(req))); return true;
      }
      identidade(req);
      if (!['GET','HEAD'].includes(m ?? 'GET')) csrf(req);
      if (m === 'GET' && p === '/api/auth/sessao') { json(res, 200, vistaSessao(req)); return true; }
      if (m === 'POST' && p === '/api/auth/logout') {
        auth.logout(token(req), evento(req)); res.setHeader('set-cookie', cookieSessao('', secure, true)); json(res, 200, { ok: true }); return true;
      }
      if (m === 'GET' && p === '/api/auth/contexto') { json(res, 200, { contexto: contextoRequisicao(req) }); return true; }
      if (m === 'POST' && p === '/api/auth/contexto') {
        const raw = await corpo(req), id = identidade(req), contexto = resolverContexto(db, id, raw, config.agora?.());
        auditarSeguranca(db, 'CONTEXTO_VALIDADO', id.usuario_id, evento(req), { tipo: contexto.tipo }, contexto, config.agora?.());
        json(res, 200, { contexto }); return true;
      }
      if (m === 'POST' && p === '/api/auth/suporte/iniciar') {
        const raw = await corpo(req), id = identidade(req);
        json(res, 200, { contexto: iniciarContextoSuporte(db, id, raw, evento(req), config.agora?.()) }); return true;
      }
      if (m === 'POST' && p === '/api/auth/suporte/encerrar') {
        const raw = z.object({ concessao: z.string().uuid() }).strict().parse(await corpo(req));
        encerrarContextoSuporte(db, identidade(req), raw.concessao, evento(req)); json(res, 200, { ok: true }); return true;
      }
      if (m === 'PUT' && p === '/api/auth/perfil') {
        const raw = z.object({ nome: z.string().trim().min(2).max(250) }).strict().parse(await corpo(req)), id = identidade(req);
        db.transaction(() => {
          salvarUsuario(db, id.usuario_id, { nome: raw.nome, email: id.email });
          auditarSeguranca(db, 'PERFIL_ATUALIZADO', id.usuario_id, evento(req), { nome_anterior: id.nome, nome: raw.nome });
        })();
        json(res, 200, vistaSessao(req)); return true;
      }
      json(res, 404, { erro: 'Não encontrado.' }); return true;
    }
  };
}
