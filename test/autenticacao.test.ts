import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb } from '../src/db.js';
import { salvarUsuario, vincularUsuarioCliente, vincularUsuarioEscritorio, salvarEscritorio, revogarVinculo } from '../src/organizacoes.js';
import { criarAutenticacao, criarHashSenha, verificarSenha, migrarAutenticacao, hashToken, tokenCsrf, exigirCsrf, lerCookieSessao,
  cookieSessao, bootstrapAdministrador, possuiAdministrador, definirCredencial, DURACAO_SESSAO_MS, INATIVIDADE_SESSAO_MS, DURACAO_RECUPERACAO_MS } from '../src/autenticacao.js';
import { exigirPermissao, iniciarContextoSuporte, resolverContexto, encerrarContextoSuporte } from '../src/autorizacao.js';

const senha = 'senha de teste bastante longa', outraSenha = 'outra senha de teste bastante longa';
let senhaHash: string;
beforeAll(async () => { senhaHash = await criarHashSenha(senha); }, 15000);
const bancos: Database.Database[] = [];
afterEach(() => { for (const db of bancos.splice(0)) db.close(); });
function fixture(papel?: 'administrador_plataforma' | 'suporte') {
  const db = openDb(':memory:'); bancos.push(db);
  const uid = salvarUsuario(db, null, { nome: 'Maria Teste', email: 'maria@example.test' });
  db.prepare('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES (?,?,?)').run(uid, senhaHash, Date.now());
  if (papel) db.prepare('INSERT INTO papeis_plataforma(usuario_id,papel) VALUES (?,?)').run(uid, papel);
  let tempo = Date.now();
  const entregas: string[] = [];
  const auth = criarAutenticacao(db, { agora: () => tempo, enviarRecuperacao: async (_destino, token) => { entregas.push(token); } });
  return { db, uid, auth, entregas, agora: () => tempo, avancar: (ms: number) => { tempo += ms; } };
}
const entrar = (f: ReturnType<typeof fixture>) => f.auth.login({ email: 'maria@example.test', senha }, { ip: '127.0.0.1' });

describe('credenciais e bootstrap', () => {
  it('não cria identidades privilegiadas, mantém migração idempotente e não armazena senha em claro', () => {
    const db = openDb(':memory:'); bancos.push(db); migrarAutenticacao(db);
    expect(possuiAdministrador(db)).toBe(false);
    expect(db.prepare('SELECT COUNT(*) n FROM credenciais_usuarios').get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) n FROM migracoes_aplicadas WHERE chave='002-autenticacao-sessoes'").get()).toEqual({ n: 1 });
    expect(senhaHash).not.toContain(senha);
  });
  it('usa salt aleatório, valida senha e rejeita hash adulterado', async () => {
    expect(await criarHashSenha(senha)).not.toBe(senhaHash);
    expect(await verificarSenha(senha, senhaHash)).toBe(true);
    expect(await verificarSenha('incorreta', senhaHash)).toBe(false);
    expect(await verificarSenha(senha, senhaHash.replace('131072', '999999999'))).toBe(false);
    await expect(criarHashSenha('curta')).rejects.toThrow(/15 caracteres/);
  }, 15000);
  it('cria administrador somente por bootstrap explícito e bloqueia segunda execução', async () => {
    const db = openDb(':memory:'); bancos.push(db);
    const id = await bootstrapAdministrador(db, { nome: 'Administrador Teste', email: 'ADMIN@example.test', senha });
    expect(possuiAdministrador(db)).toBe(true);
    expect(db.prepare('SELECT email FROM usuarios WHERE id=?').get(id)).toEqual({ email: 'admin@example.test' });
    await expect(bootstrapAdministrador(db, { nome: 'Outro', email: 'outro@example.test', senha })).rejects.toThrow(/já configurado/);
    expect(db.prepare('SELECT COUNT(*) n FROM usuarios').get()).toEqual({ n: 1 });
  });
});

describe('login e sessões', () => {
  it('autentica, guarda somente hash do token e retorna cookie seguro para HTTPS', async () => {
    const f = fixture(), sessao = await entrar(f);
    expect(f.auth.exigirSessao(sessao.token).usuario_id).toBe(f.uid);
    const persistido = JSON.stringify(f.db.prepare('SELECT * FROM sessoes_usuarios').all());
    expect(persistido).toContain(hashToken(sessao.token)); expect(persistido).not.toContain(sessao.token);
    expect(cookieSessao(sessao.token, true)).toContain('HttpOnly; SameSite=Strict'); expect(cookieSessao(sessao.token, true)).toContain('; Secure');
    expect(cookieSessao('', true, true)).toContain('Max-Age=0');
  });
  it('responde da mesma forma para senha errada, usuário inexistente e usuário inativo', async () => {
    const f = fixture();
    await expect(f.auth.login({ email: 'maria@example.test', senha: 'incorreta' })).rejects.toMatchObject({ status: 401, message: 'E-mail ou senha inválidos.' });
    await expect(f.auth.login({ email: 'inexistente@example.test', senha })).rejects.toMatchObject({ status: 401, message: 'E-mail ou senha inválidos.' });
    f.db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(f.uid);
    await expect(entrar(f)).rejects.toMatchObject({ status: 401, message: 'E-mail ou senha inválidos.' });
  });
  it('limita tentativas por conta, conserva o bloqueio e libera após a janela', async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await expect(f.auth.login({ email: 'maria@example.test', senha: 'incorreta' }, { ip: '127.0.0.1' })).rejects.toMatchObject({ status: 401 });
    await expect(entrar(f)).rejects.toMatchObject({ status: 429 });
    await expect(entrar(f)).rejects.toMatchObject({ status: 429 });
    f.avancar(15 * 60 * 1000); expect((await entrar(f)).identidade.usuario_id).toBe(f.uid);
  }, 15000);
  it('limita IP mesmo quando as tentativas alternam várias contas', async () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) await expect(f.auth.solicitarRecuperacao({ email: `inexistente${i}@example.test` }, { ip: '127.0.0.1' })).resolves.toHaveProperty('mensagem');
    await expect(f.auth.solicitarRecuperacao({ email: 'inexistente20@example.test' }, { ip: '127.0.0.1' })).rejects.toMatchObject({ status: 429 });
  });
  it('renova token ao entrar novamente e revoga a sessão substituída', async () => {
    const f = fixture(), antiga = await entrar(f);
    const nova = await f.auth.login({ email: 'maria@example.test', senha }, {}, antiga.token);
    expect(nova.token).not.toBe(antiga.token); expect(() => f.auth.exigirSessao(antiga.token)).toThrow(/Sessão encerrada/);
    f.auth.logout(nova.token); expect(() => f.auth.exigirSessao(nova.token)).toThrow(/Sessão encerrada/);
  });
  it('expira por inatividade e pelo limite absoluto, mesmo com atividade periódica', async () => {
    const f = fixture(), sessao = await entrar(f);
    f.avancar(INATIVIDADE_SESSAO_MS); expect(() => f.auth.exigirSessao(sessao.token)).toThrow(/Sessão encerrada/);
    const outra = await entrar(f);
    for (let i = 0; i < 31; i++) { f.avancar(15 * 60 * 1000); f.auth.exigirSessao(outra.token); }
    f.avancar(15 * 60 * 1000); expect(() => f.auth.exigirSessao(outra.token)).toThrow(/Sessão encerrada/);
    expect(DURACAO_SESSAO_MS).toBe(8 * 60 * 60 * 1000);
  });
  it('aplica inativação e remoção do papel global na próxima consulta de sessão', async () => {
    const f = fixture('administrador_plataforma'), sessao = await entrar(f);
    f.db.prepare('UPDATE papeis_plataforma SET ativo=0 WHERE usuario_id=?').run(f.uid);
    expect(f.auth.exigirSessao(sessao.token).papel_plataforma).toBeNull();
    f.db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(f.uid);
    expect(() => f.auth.exigirSessao(sessao.token)).toThrow(/Sessão encerrada/);
  });
  it('recusa cookie duplicado, token adulterado e CSRF ausente, incorreto ou Unicode', async () => {
    const f = fixture(), sessao = await entrar(f);
    expect(lerCookieSessao(`outro=x; mediador_sessao=${sessao.token}`)).toBe(sessao.token);
    expect(lerCookieSessao(`mediador_sessao=${sessao.token}; mediador_sessao=${sessao.token}`)).toBe('');
    expect(() => f.auth.exigirSessao('x'.repeat(43))).toThrow(/Sessão encerrada/);
    expect(() => exigirCsrf(sessao.token, tokenCsrf(sessao.token))).not.toThrow();
    for (const recebido of [undefined, 'x'.repeat(64), 'é'.repeat(64)]) expect(() => exigirCsrf(sessao.token, recebido)).toThrow(/não autorizada/);
  });
});

describe('recuperação de acesso', () => {
  it('responde genericamente e não espera o transporte de e-mail concluir', async () => {
    const f = fixture(); let concluir!: () => void; let token = '';
    const auth = criarAutenticacao(f.db, { enviarRecuperacao: async (_destino, valor) => { token = valor; await new Promise<void>(resolve => { concluir = resolve; }); } });
    const conhecida = await auth.solicitarRecuperacao({ email: 'maria@example.test' });
    const desconhecida = await auth.solicitarRecuperacao({ email: 'outra@example.test' });
    expect(conhecida).toEqual(desconhecida); expect(token).toHaveLength(43); concluir();
    expect(JSON.stringify(f.db.prepare('SELECT * FROM recuperacoes_acesso').all())).not.toContain(token);
  });
  it('redefine a senha, revoga sessões e impede uso repetido e outros tokens pendentes', async () => {
    const f = fixture(), sessao = await entrar(f);
    await f.auth.solicitarRecuperacao({ email: 'maria@example.test' }); await f.auth.solicitarRecuperacao({ email: 'maria@example.test' });
    const [primeiro, segundo] = f.entregas;
    await f.auth.recuperar({ token: primeiro, senha: outraSenha });
    expect(() => f.auth.exigirSessao(sessao.token)).toThrow(/Sessão encerrada/);
    await expect(f.auth.recuperar({ token: primeiro, senha: outraSenha })).rejects.toMatchObject({ status: 400 });
    await expect(f.auth.recuperar({ token: segundo, senha: outraSenha })).rejects.toMatchObject({ status: 400 });
    await expect(f.auth.login({ email: 'maria@example.test', senha: outraSenha })).resolves.toHaveProperty('token');
    const auditoria = JSON.stringify(f.db.prepare('SELECT * FROM auditoria_seguranca').all());
    expect(auditoria).not.toContain(primeiro); expect(auditoria).not.toContain(outraSenha);
  });
  it('rejeita token expirado e não altera credencial', async () => {
    const f = fixture(); await f.auth.solicitarRecuperacao({ email: 'maria@example.test' }); f.avancar(DURACAO_RECUPERACAO_MS);
    await expect(f.auth.recuperar({ token: f.entregas[0], senha: outraSenha })).rejects.toMatchObject({ status: 400 });
    expect(f.db.prepare('SELECT senha_hash FROM credenciais_usuarios WHERE usuario_id=?').get(f.uid)).toEqual({ senha_hash: senhaHash });
  });
  it('consome token uma única vez em confirmações concorrentes', async () => {
    const f = fixture(); await f.auth.solicitarRecuperacao({ email: 'maria@example.test' });
    const resultados = await Promise.allSettled([f.auth.recuperar({ token: f.entregas[0], senha: outraSenha }), f.auth.recuperar({ token: f.entregas[0], senha: senha })]);
    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
  it('invalida token se o usuário for inativado ou a credencial alterada internamente', async () => {
    const f = fixture(); await f.auth.solicitarRecuperacao({ email: 'maria@example.test' });
    f.db.prepare('UPDATE usuarios SET ativo=0 WHERE id=?').run(f.uid);
    await expect(f.auth.recuperar({ token: f.entregas[0], senha: outraSenha })).rejects.toMatchObject({ status: 400 });
    f.db.prepare('UPDATE usuarios SET ativo=1 WHERE id=?').run(f.uid);
    await definirCredencial(f.db, f.uid, outraSenha);
    await expect(f.auth.recuperar({ token: f.entregas[0], senha })).rejects.toMatchObject({ status: 400 });
  });
});

describe('contexto e política de permissões', () => {
  it('valida vínculos atuais e mantém contextos concorrentes independentes', async () => {
    const f = fixture(), eid = salvarEscritorio(f.db, null, { nome: 'Outro escritório', cnpj: '11.222.333/0001-81' });
    vincularUsuarioEscritorio(f.db, f.uid, 1, 'administrador'); vincularUsuarioEscritorio(f.db, f.uid, eid, 'operador');
    const sessao = await entrar(f), id = sessao.identidade;
    const [a, b] = await Promise.all([Promise.resolve(resolverContexto(f.db, id, { tipo: 'escritorio', id: 1 }, f.agora())), Promise.resolve(resolverContexto(f.db, id, { tipo: 'escritorio', id: eid }, f.agora()))]);
    expect(a.escritorio_id).toBe(1); expect(b.escritorio_id).toBe(eid); expect(Object.isFrozen(a)).toBe(true);
    expect(() => exigirPermissao(id, 'envios.aprovar', a)).not.toThrow(); expect(() => exigirPermissao(id, 'envios.aprovar', b)).toThrow(/permissão/);
    expect(() => resolverContexto(f.db, id, { tipo: 'escritorio', id: 999 }, f.agora())).toThrow(/não autorizado/);
    revogarVinculo(f.db, f.uid, 'escritorio', eid);
    expect(() => resolverContexto(f.db, id, { tipo: 'escritorio', id: eid }, f.agora())).toThrow(/não autorizado/);
  });
  it('representante da empresa não recebe acesso de funcionário ou aprovação de envios', async () => {
    const f = fixture(); const cid = Number(f.db.prepare('INSERT INTO clientes(razao_social,cnpj) VALUES (?,?)').run('Cliente', '11222333000181').lastInsertRowid);
    vincularUsuarioCliente(f.db, f.uid, cid); const id = (await entrar(f)).identidade;
    const contexto = resolverContexto(f.db, id, { tipo: 'cliente', id: cid }, f.agora());
    expect(contexto).toMatchObject({ cliente_id: cid, escritorio_id: 1, papel: 'cliente' });
    expect(() => exigirPermissao(id, 'documentos.ler_publicados', contexto)).not.toThrow();
    expect(() => exigirPermissao(id, 'envios.aprovar', contexto)).toThrow(/permissão/);
    expect(() => resolverContexto(f.db, id, { tipo: 'escritorio', id: 1 }, f.agora())).toThrow(/não autorizado/);
    f.db.prepare('UPDATE clientes SET ativo=0 WHERE id=?').run(cid);
    expect(() => resolverContexto(f.db, id, { tipo: 'cliente', id: cid }, f.agora())).toThrow(/não autorizado/);
  });
  it('nega contexto e ações sem permissão mesmo para usuário com login válido', async () => {
    const f = fixture(), id = (await entrar(f)).identidade;
    expect(() => exigirPermissao(id, 'legado.acessar')).toThrow(/permissão/);
    expect(() => iniciarContextoSuporte(f.db, id, { escritorio_id: 1, justificativa: 'Atendimento solicitado' }, {}, f.agora())).toThrow(/permissão/);
    expect(f.db.prepare('SELECT COUNT(*) n FROM concessoes_suporte').get()).toEqual({ n: 0 });
  });
  it('suporte exige justificativa, preserva operador real e limita acesso à sessão de origem', async () => {
    const f = fixture('suporte'), sessao = await entrar(f);
    expect(() => iniciarContextoSuporte(f.db, sessao.identidade, { escritorio_id: 1, justificativa: 'curta' }, {}, f.agora())).toThrow();
    const ctx = iniciarContextoSuporte(f.db, sessao.identidade, { escritorio_id: 1, justificativa: 'Diagnóstico solicitado pelo escritório' }, {}, f.agora());
    expect(ctx.papel).toBe('suporte'); expect(() => exigirPermissao(sessao.identidade, 'clientes.gerenciar', ctx)).toThrow(/permissão/);
    const registro = f.db.prepare("SELECT ator_id,escritorio_id FROM auditoria_seguranca WHERE acao='SUPORTE_CONTEXTO_INICIADO'").get();
    expect(registro).toEqual({ ator_id: f.uid, escritorio_id: 1 });
    const outra = await entrar(f);
    expect(() => resolverContexto(f.db, outra.identidade, { tipo: 'escritorio', id: 1, concessao: ctx.concessao }, f.agora())).toThrow(/não autorizado/);
    encerrarContextoSuporte(f.db, sessao.identidade, ctx.concessao!);
    expect(() => resolverContexto(f.db, sessao.identidade, { tipo: 'escritorio', id: 1, concessao: ctx.concessao }, f.agora())).toThrow(/não autorizado/);
  });
  it('concessão não sobrevive à revogação do papel global nem ao logout', async () => {
    const f = fixture('suporte'), sessao = await entrar(f);
    const ctx = iniciarContextoSuporte(f.db, sessao.identidade, { escritorio_id: 1, justificativa: 'Diagnóstico solicitado' }, {}, f.agora());
    f.db.prepare('UPDATE papeis_plataforma SET ativo=0 WHERE usuario_id=?').run(f.uid);
    expect(() => resolverContexto(f.db, sessao.identidade, { tipo: 'escritorio', id: 1, concessao: ctx.concessao }, f.agora())).toThrow(/não autorizado/);
    expect(() => iniciarContextoSuporte(f.db, sessao.identidade, { escritorio_id: 1, justificativa: 'Diagnóstico solicitado' }, {}, f.agora())).toThrow(/permissão/);
    f.auth.logout(sessao.token);
    expect(() => resolverContexto(f.db, sessao.identidade, { tipo: 'escritorio', id: 1, concessao: ctx.concessao }, f.agora())).toThrow(/Sessão encerrada/);
  });
});
