import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ErroCadastro } from './cadastros.js';
import { obterUsuario, salvarUsuario } from './organizacoes.js';

type Banco = Database.Database;
import { COOKIE_SESSAO, DURACAO_SESSAO_MS, INATIVIDADE_SESSAO_MS, DURACAO_RECUPERACAO_MS, EmailSchema, SenhaSchema, hashToken, tokenValido, novoToken, tokenCsrf, criarHashSenha, verificarSenha, lerCookieSessao, cookieSessao, exigirCsrf, type PapelPlataforma, type Identidade, type DadosEvento } from './auth-core.js';
export { COOKIE_SESSAO, DURACAO_SESSAO_MS, INATIVIDADE_SESSAO_MS, DURACAO_RECUPERACAO_MS, EmailSchema, SenhaSchema, hashToken, tokenValido, novoToken, tokenCsrf, criarHashSenha, verificarSenha, lerCookieSessao, cookieSessao, exigirCsrf, type PapelPlataforma, type Identidade, type DadosEvento } from './auth-core.js';
export function migrarAutenticacao(db: Banco): void {
  const chave = '002-autenticacao-sessoes';
  if (db.prepare('SELECT chave FROM migracoes_aplicadas WHERE chave=?').get(chave)) return;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE credenciais_usuarios (
        usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
        senha_hash TEXT NOT NULL, atualizado_em INTEGER NOT NULL
      );
      CREATE TABLE papeis_plataforma (
        usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
        papel TEXT NOT NULL CHECK(papel IN ('administrador_plataforma','suporte')),
        ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1))
      );
      CREATE TABLE sessoes_usuarios (
        token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        criada_em INTEGER NOT NULL, ultimo_acesso_em INTEGER NOT NULL, expira_em INTEGER NOT NULL,
        revogada INTEGER NOT NULL DEFAULT 0 CHECK(revogada IN (0,1))
      );
      CREATE INDEX idx_sessoes_usuario ON sessoes_usuarios(usuario_id,revogada);
      CREATE TABLE limites_autenticacao (chave TEXT PRIMARY KEY, janela_em INTEGER NOT NULL, contador INTEGER NOT NULL);
      CREATE TABLE recuperacoes_acesso (
        token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        criada_em INTEGER NOT NULL, expira_em INTEGER NOT NULL, usada_em INTEGER
      );
      CREATE INDEX idx_recuperacoes_usuario ON recuperacoes_acesso(usuario_id,expira_em);
      CREATE TABLE concessoes_suporte (
        id TEXT PRIMARY KEY, sessao_hash TEXT NOT NULL REFERENCES sessoes_usuarios(token_hash) ON DELETE RESTRICT,
        escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
        justificativa TEXT NOT NULL, criada_em INTEGER NOT NULL, expira_em INTEGER NOT NULL,
        revogada INTEGER NOT NULL DEFAULT 0 CHECK(revogada IN (0,1))
      );
      CREATE TABLE auditoria_seguranca (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ator_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
        acao TEXT NOT NULL, escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE RESTRICT,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE RESTRICT, criado_em INTEGER NOT NULL,
        ip TEXT NOT NULL, user_agent TEXT NOT NULL, request_id TEXT NOT NULL, detalhes_json TEXT NOT NULL
      );
      CREATE INDEX idx_auditoria_seguranca_ator ON auditoria_seguranca(ator_id,criado_em);
    `);
    db.prepare('INSERT INTO migracoes_aplicadas(chave) VALUES (?)').run(chave);
  })();
}

export function auditarSeguranca(db: Banco, acao: string, atorId: number | null, evento: DadosEvento = {},
  detalhes: Record<string, unknown> = {}, contexto?: { escritorio_id: number; cliente_id?: number | null }, agora = Date.now()): void {
  db.prepare(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(atorId, acao, contexto?.escritorio_id ?? null, contexto?.cliente_id ?? null, agora,
    (evento.ip ?? '').slice(0, 96), (evento.user_agent ?? '').slice(0, 1000), evento.request_id ?? randomUUID(), JSON.stringify(detalhes));
}

// Cada derivação usa aproximadamente 128 MiB; limita concorrência sem bloquear o event loop.
/** Uso interno/CLI. Não exposto por HTTP; o fluxo de recuperação valida seu token antes de escrever. */
export async function definirCredencial(db: Banco, usuarioId: number, senha: string): Promise<void> {
  obterUsuario(db, usuarioId);
  const senhaHash = await criarHashSenha(senha);
  db.transaction(() => {
    db.prepare(`INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES (?,?,?)
      ON CONFLICT(usuario_id) DO UPDATE SET senha_hash=excluded.senha_hash,atualizado_em=excluded.atualizado_em`).run(usuarioId, senhaHash, Date.now());
    db.prepare('UPDATE sessoes_usuarios SET revogada=1 WHERE usuario_id=?').run(usuarioId);
    db.prepare('UPDATE recuperacoes_acesso SET usada_em=? WHERE usuario_id=? AND usada_em IS NULL').run(Date.now(), usuarioId);
  })();
}
export async function bootstrapAdministrador(db: Banco, dados: { nome: string; email: string; senha: string }): Promise<number> {
  if (db.prepare("SELECT 1 FROM papeis_plataforma WHERE papel='administrador_plataforma' LIMIT 1").get())
    throw new ErroCadastro('Administrador inicial já configurado.', 409);
  const nome = z.string().trim().min(2).max(250).parse(dados.nome), email = EmailSchema.parse(dados.email);
  const senhaHash = await criarHashSenha(dados.senha);
  return db.transaction(() => {
    if (db.prepare("SELECT 1 FROM papeis_plataforma WHERE papel='administrador_plataforma' LIMIT 1").get())
      throw new ErroCadastro('Administrador inicial já configurado.', 409);
    const uid = salvarUsuario(db, null, { nome, email });
    db.prepare('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES (?,?,?)').run(uid, senhaHash, Date.now());
    db.prepare("INSERT INTO papeis_plataforma(usuario_id,papel) VALUES (?,'administrador_plataforma')").run(uid);
    auditarSeguranca(db, 'ADMINISTRADOR_INICIAL_CRIADO', uid, {}, { origem: 'cli_local' });
    return uid;
  })();
}
export function possuiAdministrador(db: Banco): boolean {
  return !!db.prepare("SELECT 1 FROM papeis_plataforma WHERE papel='administrador_plataforma' LIMIT 1").get();
}

function limitar(db: Banco, operacao: string, email: string, ip: string, agora: number): void {
  const janela = operacao === 'login' ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const bloqueado = db.transaction(() => {
    db.prepare('DELETE FROM limites_autenticacao WHERE janela_em<?').run(agora - 24 * 60 * 60 * 1000);
    let excedeu = false;
    for (const [sufixo, valor, maximo] of [['conta', email, 5], ['ip', ip, 20]] as const) {
      const chave = `${operacao}:${sufixo}:${hashToken(valor)}`;
      db.prepare(`INSERT INTO limites_autenticacao(chave,janela_em,contador) VALUES (?,?,1)
        ON CONFLICT(chave) DO UPDATE SET janela_em=CASE WHEN janela_em<=? THEN excluded.janela_em ELSE janela_em END,
        contador=CASE WHEN janela_em<=? THEN 1 ELSE contador+1 END`).run(chave, agora, agora - janela, agora - janela);
      const row = db.prepare('SELECT contador FROM limites_autenticacao WHERE chave=?').get(chave) as { contador: number };
      if (row.contador > maximo) excedeu = true;
    }
    return excedeu;
  })();
  if (bloqueado) throw new ErroCadastro('Muitas tentativas. Aguarde e tente novamente.', 429);
}
interface Credencial { id: number; ativo: number; senha_hash: string }
export interface OpcoesAutenticacao {
  agora?: () => number;
  enviarRecuperacao?: (destino: string, token: string) => Promise<void>;
}
export function criarAutenticacao(db: Banco, opcoes: OpcoesAutenticacao = {}) {
  const agora = opcoes.agora ?? Date.now;
  const exigirSessao = (token: string): Identidade => {
    if (!tokenValido(token)) throw new ErroCadastro('Entre para continuar.', 401);
    const hash = hashToken(token), momento = agora();
    const row = db.prepare(`SELECT u.id usuario_id,u.nome,u.email,u.ativo,s.token_hash sessao_hash,s.expira_em,s.ultimo_acesso_em,s.revogada,
      CASE WHEN p.ativo=1 THEN p.papel ELSE NULL END papel_plataforma
      FROM sessoes_usuarios s JOIN usuarios u ON u.id=s.usuario_id LEFT JOIN papeis_plataforma p ON p.usuario_id=u.id WHERE s.token_hash=?`)
      .get(hash) as (Identidade & { ativo: number; revogada: number; ultimo_acesso_em: number }) | undefined;
    if (!row || !row.ativo || row.revogada || row.expira_em <= momento || row.ultimo_acesso_em + INATIVIDADE_SESSAO_MS <= momento)
      throw new ErroCadastro('Sessão encerrada. Entre novamente.', 401);
    db.prepare('UPDATE sessoes_usuarios SET ultimo_acesso_em=? WHERE token_hash=?').run(momento, hash);
    const { ativo: _ativo, revogada: _revogada, ultimo_acesso_em: _ultimo, ...identidade } = row;
    return identidade;
  };
  return {
    exigirSessao,
    async login(raw: unknown, evento: DadosEvento = {}, tokenAnterior = '') {
      const dados = z.object({ email: EmailSchema, senha: z.string().min(1).max(128) }).strict().parse(raw);
      limitar(db, 'login', dados.email, evento.ip ?? '', agora());
      const row = db.prepare(`SELECT u.id,u.ativo,c.senha_hash FROM usuarios u
        JOIN credenciais_usuarios c ON c.usuario_id=u.id WHERE u.email=?`).get(dados.email) as Credencial | undefined;
      const confere = await verificarSenha(dados.senha, row?.senha_hash);
      const atual = row ? db.prepare(`SELECT u.id,u.ativo,c.senha_hash FROM usuarios u JOIN credenciais_usuarios c ON c.usuario_id=u.id WHERE u.id=?`).get(row.id) as Credencial | undefined : undefined;
      if (!confere || !atual?.ativo || atual.senha_hash !== row?.senha_hash) {
        auditarSeguranca(db, 'LOGIN_RECUSADO', null, evento, {}, undefined, agora());
        throw new ErroCadastro('E-mail ou senha inválidos.', 401);
      }
      const token = novoToken(), momento = agora();
      db.transaction(() => {
        if (tokenValido(tokenAnterior)) db.prepare('UPDATE sessoes_usuarios SET revogada=1 WHERE token_hash=?').run(hashToken(tokenAnterior));
        db.prepare('INSERT INTO sessoes_usuarios(token_hash,usuario_id,criada_em,ultimo_acesso_em,expira_em) VALUES (?,?,?,?,?)')
          .run(hashToken(token), atual.id, momento, momento, momento + DURACAO_SESSAO_MS);
        auditarSeguranca(db, 'LOGIN_CONCLUIDO', atual.id, evento, {}, undefined, momento);
      })();
      return { token, identidade: exigirSessao(token), csrf: tokenCsrf(token) };
    },
    logout(token: string, evento: DadosEvento = {}) {
      const identidade = exigirSessao(token);
      db.transaction(() => {
        db.prepare('UPDATE sessoes_usuarios SET revogada=1 WHERE token_hash=?').run(identidade.sessao_hash);
        auditarSeguranca(db, 'LOGOUT', identidade.usuario_id, evento, {}, undefined, agora());
      })();
    },
    async solicitarRecuperacao(raw: unknown, evento: DadosEvento = {}) {
      const { email } = z.object({ email: EmailSchema }).strict().parse(raw);
      limitar(db, 'recuperacao', email, evento.ip ?? '', agora());
      const row = db.prepare(`SELECT u.id FROM usuarios u JOIN credenciais_usuarios c ON c.usuario_id=u.id WHERE u.email=? AND u.ativo=1`).get(email) as { id: number } | undefined;
      if (row && opcoes.enviarRecuperacao) {
        const token = novoToken(), hash = hashToken(token), momento = agora();
        db.prepare('INSERT INTO recuperacoes_acesso(token_hash,usuario_id,criada_em,expira_em) VALUES (?,?,?,?)').run(hash, row.id, momento, momento + DURACAO_RECUPERACAO_MS);
        // O transporte roda depois, sem tornar o tempo da resposta dependente da existência da conta.
        queueMicrotask(() => {
          void opcoes.enviarRecuperacao!(email, token).catch(() => {
            if (db.open) db.prepare('UPDATE recuperacoes_acesso SET usada_em=? WHERE token_hash=?').run(agora(), hash);
          });
        });
      }
      // Resposta e auditoria não informam se a conta existe ou se o provedor aceitou a mensagem.
      auditarSeguranca(db, 'RECUPERACAO_SOLICITADA', null, evento, {}, undefined, agora());
      return { mensagem: 'Se houver uma conta ativa e o e-mail estiver configurado, você receberá as instruções.' };
    },
    async recuperar(raw: unknown, evento: DadosEvento = {}) {
      const dados = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), senha: SenhaSchema }).strict().parse(raw);
      limitar(db, 'confirmar_recuperacao', hashToken(dados.token), evento.ip ?? '', agora());
      const hash = hashToken(dados.token);
      const row = db.prepare(`SELECT r.usuario_id FROM recuperacoes_acesso r JOIN usuarios u ON u.id=r.usuario_id
        WHERE r.token_hash=? AND r.usada_em IS NULL AND r.expira_em>? AND u.ativo=1`).get(hash, agora()) as { usuario_id: number } | undefined;
      if (!row) throw new ErroCadastro('Link inválido ou expirado. Solicite outra recuperação.', 400);
      const senhaHash = await criarHashSenha(dados.senha);
      db.transaction(() => {
        const ativa = db.prepare('SELECT ativo FROM usuarios WHERE id=?').get(row.usuario_id) as { ativo: number } | undefined;
        const atualizado = db.prepare('UPDATE recuperacoes_acesso SET usada_em=? WHERE token_hash=? AND usada_em IS NULL AND expira_em>?')
          .run(agora(), hash, agora());
        if (!atualizado.changes || !ativa?.ativo) throw new ErroCadastro('Link inválido ou expirado. Solicite outra recuperação.', 400);
        db.prepare('UPDATE credenciais_usuarios SET senha_hash=?,atualizado_em=? WHERE usuario_id=?').run(senhaHash, agora(), row.usuario_id);
        db.prepare('UPDATE sessoes_usuarios SET revogada=1 WHERE usuario_id=?').run(row.usuario_id);
        db.prepare('UPDATE recuperacoes_acesso SET usada_em=? WHERE usuario_id=? AND usada_em IS NULL').run(agora(), row.usuario_id);
        auditarSeguranca(db, 'SENHA_RECUPERADA', row.usuario_id, evento, {}, undefined, agora());
      })();
      return { mensagem: 'Senha atualizada. Entre novamente.' };
    }
  };
}


