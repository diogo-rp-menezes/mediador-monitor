import { afterEach, beforeAll, expect, it } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';
import { openDb, type Db } from '../src/db.js';
import { criarAcessoHttp } from '../src/auth-http.js';
import { criarHashSenha } from '../src/autenticacao.js';
import { ErroCadastro } from '../src/cadastros.js';
import { salvarUsuario, vincularUsuarioEscritorio, salvarEscritorio } from '../src/organizacoes.js';

const senha = 'senha longa para teste de HTTP';
let senhaHash: string;
beforeAll(async () => { senhaHash = await criarHashSenha(senha); }, 15000);
const recursos: Array<{ db: Db; server: Server }> = [];
afterEach(async () => {
  for (const r of recursos.splice(0)) { r.server.closeAllConnections(); await new Promise<void>(resolve => r.server.close(() => resolve())); r.db.close(); }
});
async function fixture(papel?: 'administrador_plataforma' | 'suporte', secure = false) {
  const db = openDb(':memory:');
  const uid = salvarUsuario(db, null, { nome: 'Operador Teste', email: 'operador@example.test' });
  db.prepare('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES (?,?,?)').run(uid, senhaHash, Date.now());
  if (papel) db.prepare('INSERT INTO papeis_plataforma(usuario_id,papel) VALUES (?,?)').run(uid, papel);
  let acesso: ReturnType<typeof criarAcessoHttp>;
  const server = createServer(async (req, res) => {
    try {
      acesso.validarRequisicao(req); const url = new URL(req.url!, 'http://localhost');
      const corpo = async () => { let dados = ''; for await (const chunk of req) dados += chunk; return dados ? JSON.parse(dados) : {}; };
      if (await acesso.tratar(req, res, url, corpo)) return;
      const id = acesso.protegerLegado(req);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ator: id.usuario_id }));
    } catch (erro) {
      const status = erro instanceof ErroCadastro ? erro.status : erro instanceof z.ZodError ? 400 : 500;
      res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ erro: status === 500 ? 'Erro interno' : (erro as Error).message }));
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  acesso = criarAcessoHttp(db, { publicUrl: `${secure ? 'https' : 'http'}://127.0.0.1:${port}` });
  recursos.push({ db, server });
  const req = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<Response> => {
    const cabecalhos = { ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}), ...headers };
    // fetch normaliza Host; usar HTTP nativo para testar o cabeçalho adversarial real.
    if (headers.host || headers['sec-fetch-site']) return new Promise((resolve, reject) => {
      const chamada = request(base + path, { method, headers: cabecalhos }, response => {
        const dados: Buffer[] = [];
        response.on('data', chunk => dados.push(chunk)); response.on('end', () => resolve(new Response(Buffer.concat(dados), { status: response.statusCode }))); response.on('error', reject);
      });
      chamada.on('error', reject); chamada.end(body === undefined ? undefined : JSON.stringify(body));
    });
    return fetch(base + path, { method, headers: cabecalhos, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const login = async () => {
    const response = await req('/api/auth/login', 'POST', { email: 'operador@example.test', senha });
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie')!, cookie = setCookie.split(';')[0];
    const info = await (await req('/api/auth/sessao', 'GET', undefined, { cookie })).json();
    return { cookie, setCookie, csrf: info.csrf, info };
  };
  return { db, uid, req, login, acesso };
}

it('nega acesso anônimo às sessões e dados, sem aceitar token por URL ou Bearer', async () => {
  const f = await fixture();
  expect((await f.req('/api/auth/estado')).status).toBe(200);
  expect((await f.req('/api/auth/sessao')).status).toBe(401);
  expect((await f.req('/dados')).status).toBe(401);
  const sessao = await f.login();
  expect((await f.req('/dados?token=' + sessao.cookie.split('=')[1])).status).toBe(401);
  expect((await f.req('/dados', 'GET', undefined, { authorization: 'Bearer ' + sessao.cookie.split('=')[1] })).status).toBe(401);
});
it('rejeita host, origem, fetch cross-site e conteúdo de formulário antes de autenticar', async () => {
  const f = await fixture(); const dados = { email: 'operador@example.test', senha };
  expect((await f.req('/api/auth/login', 'POST', dados, { origin: 'https://outro.example' })).status).toBe(403);
  expect((await f.req('/api/auth/login', 'POST', dados, { host: 'outro.example' })).status).toBe(403);
  expect((await f.req('/api/auth/login', 'POST', dados, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
  expect((await f.req('/api/auth/login', 'POST', dados, { 'content-type': 'text/plain' })).status).toBe(415);
  expect(f.db.prepare('SELECT COUNT(*) n FROM sessoes_usuarios').get()).toEqual({ n: 0 });
});
it('gera Secure quando a origem configurada usa HTTPS e ignora X-Forwarded-Proto', async () => {
  const seguro = await fixture('administrador_plataforma', true), sessao = await seguro.login();
  expect(sessao.setCookie).toContain('; Secure');
  const local = await fixture('administrador_plataforma');
  const response = await local.req('/api/auth/login', 'POST', { email: 'operador@example.test', senha }, { 'x-forwarded-proto': 'https' });
  expect(response.headers.get('set-cookie')).not.toContain('; Secure');
});
it('exige CSRF nas mutações e preserva a sessão em tentativa de logout forjada', async () => {
  const f = await fixture('administrador_plataforma'), sessao = await f.login();
  expect((await f.req('/api/auth/logout', 'POST', {}, { cookie: sessao.cookie })).status).toBe(403);
  expect((await f.req('/dados', 'POST', {}, { cookie: sessao.cookie, 'x-csrf-token': '0'.repeat(64) })).status).toBe(403);
  expect((await f.req('/api/auth/sessao', 'GET', undefined, { cookie: sessao.cookie })).status).toBe(200);
  const response = await f.req('/api/auth/logout', 'POST', {}, { cookie: sessao.cookie, 'x-csrf-token': sessao.csrf });
  expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await f.req('/api/auth/sessao', 'GET', undefined, { cookie: sessao.cookie })).status).toBe(401);
});
it('bloqueia o legado para administrador de escritório, cliente e suporte', async () => {
  const f = await fixture(); vincularUsuarioEscritorio(f.db, f.uid, 1, 'administrador'); const sessao = await f.login();
  expect((await f.req('/dados', 'GET', undefined, { cookie: sessao.cookie })).status).toBe(403);
  f.db.prepare("INSERT INTO papeis_plataforma(usuario_id,papel) VALUES (?,'suporte')").run(f.uid);
  expect((await f.req('/dados', 'GET', undefined, { cookie: sessao.cookie })).status).toBe(403);
  f.db.prepare("UPDATE papeis_plataforma SET papel='administrador_plataforma' WHERE usuario_id=?").run(f.uid);
  expect((await f.req('/dados', 'GET', undefined, { cookie: sessao.cookie })).status).toBe(200);
  f.db.prepare('UPDATE papeis_plataforma SET ativo=0 WHERE usuario_id=?').run(f.uid);
  expect((await f.req('/dados', 'GET', undefined, { cookie: sessao.cookie })).status).toBe(403);
});
it('deriva ator da sessão, impede mass assignment e não confia no IP encaminhado', async () => {
  const f = await fixture(), sessao = await f.login();
  const outro = salvarUsuario(f.db, null, { nome: 'Outra Pessoa', email: 'outra@example.test' });
  const headers = { cookie: sessao.cookie, 'x-csrf-token': sessao.csrf, 'x-forwarded-for': '203.0.113.99' };
  expect((await f.req('/api/auth/perfil', 'PUT', { nome: 'Nome forjado', usuario_id: outro, papel_plataforma: 'administrador_plataforma' }, headers)).status).toBe(400);
  expect((await f.req('/api/auth/perfil', 'PUT', { nome: 'Nome conferido' }, headers)).status).toBe(200);
  expect(f.db.prepare('SELECT nome FROM usuarios WHERE id=?').get(outro)).toEqual({ nome: 'Outra Pessoa' });
  expect(f.db.prepare("SELECT ator_id,ip FROM auditoria_seguranca WHERE acao='PERFIL_ATUALIZADO'").get()).toEqual({ ator_id: f.uid, ip: '127.0.0.1' });
});
it('valida contexto por requisição, sem alterar a sessão ou misturar seleções simultâneas', async () => {
  const f = await fixture(), eid = salvarEscritorio(f.db, null, { nome: 'Segundo escritório', cnpj: '11.222.333/0001-81' });
  vincularUsuarioEscritorio(f.db, f.uid, 1, 'administrador'); vincularUsuarioEscritorio(f.db, f.uid, eid, 'operador'); const sessao = await f.login();
  const contextos = await Promise.all([1, eid].map(id => f.req('/api/auth/contexto', 'GET', undefined, { cookie: sessao.cookie, 'x-context-type': 'escritorio', 'x-context-id': String(id) })));
  expect((await contextos[0].json()).contexto.escritorio_id).toBe(1); expect((await contextos[1].json()).contexto.escritorio_id).toBe(eid);
  expect((await f.req('/api/auth/contexto', 'GET', undefined, { cookie: sessao.cookie, 'x-context-type': 'escritorio', 'x-context-id': '999' })).status).toBe(403);
  f.db.prepare('UPDATE usuarios_escritorios SET ativo=0 WHERE usuario_id=? AND escritorio_id=?').run(f.uid, eid);
  expect((await f.req('/api/auth/contexto', 'GET', undefined, { cookie: sessao.cookie, 'x-context-type': 'escritorio', 'x-context-id': String(eid) })).status).toBe(403);
});
it('não aceita origem HTTP externa na configuração da aplicação', async () => {
  const f = await fixture();
  expect(() => criarAcessoHttp(f.db, { publicUrl: 'http://publico.example' })).toThrow(/exige HTTPS/);
  expect(() => criarAcessoHttp(f.db, { publicUrl: 'https://publico.example/?destino=outro' })).toThrow(/somente a origem/);
});
