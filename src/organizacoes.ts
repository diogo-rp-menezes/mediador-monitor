import type Database from 'better-sqlite3';
import { z } from 'zod';
import { auditarCadastro, cnpjValido, ErroCadastro, normalizarCnpj } from './cadastros.js';

type Banco = Database.Database;
export const ESCRITORIO_INICIAL_ID = 1;
const MIGRACAO = '001-organizacoes-identidade';
const texto = z.string().trim().max(500).default('');
const email = z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).default('');
const EscritorioSchema = z.object({
  nome: z.string().trim().min(2).max(250),
  cnpj: z.string().trim().transform(normalizarCnpj).refine(cnpjValido, 'CNPJ inválido'),
  email, telefone: texto, ativo: z.boolean().default(true)
}).strict();
const UsuarioSchema = z.object({
  nome: z.string().trim().min(2).max(250),
  email: z.string().trim().toLowerCase().email().max(254),
  ativo: z.boolean().default(true)
}).strict();
export type PapelEscritorio = 'administrador' | 'operador';
interface EscritorioRow {
  id: number; nome: string; cnpj: string | null; email: string; telefone: string;
  ativo: number; criado_em: string; atualizado_em: string;
}
interface UsuarioRow { id: number; nome: string; email: string; ativo: number; criado_em: string; atualizado_em: string }
const idValido = (id: number) => z.number().int().positive().parse(id);

/** Fundação local. Não autentica usuários nem isola as rotas HTTP existentes. */
export function migrarOrganizacoes(db: Banco): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migracoes_aplicadas (
    chave TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  if (db.prepare('SELECT chave FROM migracoes_aplicadas WHERE chave=?').get(MIGRACAO)) return;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE escritorios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
        cnpj TEXT UNIQUE COLLATE NOCASE, email TEXT NOT NULL DEFAULT '', telefone TEXT NOT NULL DEFAULT '',
        ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
        criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO escritorios(id,nome) VALUES (1,'Escritório inicial');
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
        criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE usuarios_escritorios (
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
        papel TEXT NOT NULL CHECK(papel IN ('administrador','operador')),
        ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
        criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(usuario_id,escritorio_id)
      );
      CREATE INDEX idx_usuarios_escritorio ON usuarios_escritorios(escritorio_id,ativo);
    `);
    // SQLite não permite adicionar REFERENCES com default não nulo a tabelas preenchidas.
    // Backfill + trigger mantêm os novos cadastros locais no escritório inicial.
    for (const tabela of ['clientes', 'contatos'] as const) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE RESTRICT;
        UPDATE ${tabela} SET escritorio_id=1;
        CREATE INDEX idx_${tabela}_escritorio ON ${tabela}(escritorio_id);
        CREATE TRIGGER ${tabela}_escritorio_inicial AFTER INSERT ON ${tabela}
          WHEN NEW.escritorio_id IS NULL BEGIN
            UPDATE ${tabela} SET escritorio_id=1 WHERE id=NEW.id;
          END;
        CREATE TRIGGER ${tabela}_escritorio_obrigatorio BEFORE UPDATE OF escritorio_id ON ${tabela}
          WHEN NEW.escritorio_id IS NULL BEGIN SELECT RAISE(ABORT,'Escritório obrigatório'); END;
        CREATE TRIGGER ${tabela}_escritorio_imutavel BEFORE UPDATE OF escritorio_id ON ${tabela}
          WHEN OLD.escritorio_id IS NOT NULL AND NEW.escritorio_id<>OLD.escritorio_id
          BEGIN SELECT RAISE(ABORT,'Transferência entre escritórios exige fluxo específico'); END;`);
    }
    db.exec(`
      CREATE UNIQUE INDEX idx_clientes_id_escritorio ON clientes(id,escritorio_id);
      CREATE TABLE usuarios_clientes (
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        cliente_id INTEGER NOT NULL,
        escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
        criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(usuario_id,cliente_id),
        FOREIGN KEY(cliente_id,escritorio_id) REFERENCES clientes(id,escritorio_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_usuarios_cliente_escritorio ON usuarios_clientes(escritorio_id,ativo);
      CREATE TRIGGER clientes_contatos_mesmo_escritorio_insert BEFORE INSERT ON clientes_contatos
        WHEN (SELECT escritorio_id FROM clientes WHERE id=NEW.cliente_id)
          <> (SELECT escritorio_id FROM contatos WHERE id=NEW.contato_id)
        BEGIN SELECT RAISE(ABORT,'Cliente e contato pertencem a escritórios diferentes'); END;
      CREATE TRIGGER clientes_contatos_mesmo_escritorio_update BEFORE UPDATE ON clientes_contatos
        WHEN (SELECT escritorio_id FROM clientes WHERE id=NEW.cliente_id)
          <> (SELECT escritorio_id FROM contatos WHERE id=NEW.contato_id)
        BEGIN SELECT RAISE(ABORT,'Cliente e contato pertencem a escritórios diferentes'); END;
    `);
    db.prepare('INSERT INTO migracoes_aplicadas(chave) VALUES (?)').run(MIGRACAO);
    auditarCadastro(db, 'migracao', MIGRACAO, 'aplicar', { escritorio_inicial_id: 1, origem: 'sistema' });
  })();
}

export function obterEscritorio(db: Banco, id: number) {
  const row = db.prepare('SELECT * FROM escritorios WHERE id=?').get(idValido(id)) as EscritorioRow | undefined;
  if (!row) throw new ErroCadastro('Escritório não encontrado.', 404);
  return { ...row, ativo: !!row.ativo };
}
export function listarEscritorios(db: Banco) {
  return (db.prepare('SELECT * FROM escritorios ORDER BY nome COLLATE NOCASE,id').all() as EscritorioRow[])
    .map(row => ({ ...row, ativo: !!row.ativo }));
}
export function salvarEscritorio(db: Banco, id: number | null, raw: unknown): number {
  const dados = EscritorioSchema.parse(raw);
  const antes = id === null ? null : obterEscritorio(db, id);
  if (db.prepare('SELECT id FROM escritorios WHERE cnpj=? AND id<>?').get(dados.cnpj, id ?? 0))
    throw new ErroCadastro('Já existe um escritório com este CNPJ.', 409);
  return db.transaction(() => {
    const args = [dados.nome, dados.cnpj, dados.email, dados.telefone, Number(dados.ativo)];
    if (id !== null) db.prepare(`UPDATE escritorios SET nome=?,cnpj=?,email=?,telefone=?,ativo=?,atualizado_em=datetime('now') WHERE id=?`).run(...args, id);
    else id = Number(db.prepare('INSERT INTO escritorios(nome,cnpj,email,telefone,ativo) VALUES (?,?,?,?,?)').run(...args).lastInsertRowid);
    auditarCadastro(db, 'escritorio', id, 'salvar', { antes, depois: obterEscritorio(db, id), origem: 'servico_interno' });
    return id;
  })();
}
export function excluirEscritorio(db: Banco, id: number): void {
  const antes = obterEscritorio(db, id);
  if (id === ESCRITORIO_INICIAL_ID) throw new ErroCadastro('O escritório inicial deve ser preservado durante a migração.', 409);
  for (const tabela of ['clientes', 'contatos', 'usuarios_escritorios', 'usuarios_clientes', 'monitoramentos_escritorios', 'concessoes_suporte', 'auditoria_seguranca', 'vinculos_escritorio', 'interpretacoes_escritorio', 'versoes_interpretacao', 'historico_interpretacoes_legado']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tabela)) continue;
    if (db.prepare(`SELECT 1 FROM ${tabela} WHERE escritorio_id=? LIMIT 1`).get(id))
      throw new ErroCadastro('Escritório possui cadastros ou vínculos. Inative-o para preservar o histórico.', 409);
  }
  db.transaction(() => {
    db.prepare('DELETE FROM escritorios WHERE id=?').run(id);
    auditarCadastro(db, 'escritorio', id, 'excluir', { antes, origem: 'servico_interno' });
  })();
}
export function obterUsuario(db: Banco, id: number) {
  const row = db.prepare('SELECT * FROM usuarios WHERE id=?').get(idValido(id)) as UsuarioRow | undefined;
  if (!row) throw new ErroCadastro('Usuário não encontrado.', 404);
  return { ...row, ativo: !!row.ativo };
}
export function salvarUsuario(db: Banco, id: number | null, raw: unknown): number {
  const dados = UsuarioSchema.parse(raw);
  const antes = id === null ? null : obterUsuario(db, id);
  if (db.prepare('SELECT id FROM usuarios WHERE email=? AND id<>?').get(dados.email, id ?? 0))
    throw new ErroCadastro('Já existe um usuário com este e-mail.', 409);
  return db.transaction(() => {
    const args = [dados.nome, dados.email, Number(dados.ativo)];
    if (id !== null) db.prepare(`UPDATE usuarios SET nome=?,email=?,ativo=?,atualizado_em=datetime('now') WHERE id=?`).run(...args, id);
    else id = Number(db.prepare('INSERT INTO usuarios(nome,email,ativo) VALUES (?,?,?)').run(...args).lastInsertRowid);
    auditarCadastro(db, 'usuario', id, 'salvar', { antes, depois: obterUsuario(db, id), origem: 'servico_interno' });
    return id;
  })();
}
function exigirAtivos(db: Banco, usuarioId: number, escritorioId: number) {
  if (!obterUsuario(db, usuarioId).ativo) throw new ErroCadastro('Usuário inativo.', 409);
  if (!obterEscritorio(db, escritorioId).ativo) throw new ErroCadastro('Escritório inativo.', 409);
}
export function vincularUsuarioEscritorio(db: Banco, usuarioId: number, escritorioId: number, papel: PapelEscritorio): void {
  z.enum(['administrador', 'operador']).parse(papel);
  exigirAtivos(db, usuarioId, escritorioId);
  db.transaction(() => {
    db.prepare(`INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES (?,?,?)
      ON CONFLICT(usuario_id,escritorio_id) DO UPDATE SET papel=excluded.papel,ativo=1,atualizado_em=datetime('now')`)
      .run(usuarioId, escritorioId, papel);
    auditarCadastro(db, 'usuario_escritorio', `${usuarioId}:${escritorioId}`, 'vincular', { papel, origem: 'servico_interno' });
  })();
}
export function vincularUsuarioCliente(db: Banco, usuarioId: number, clienteId: number): void {
  idValido(clienteId);
  const cliente = db.prepare('SELECT escritorio_id,ativo FROM clientes WHERE id=?').get(clienteId) as { escritorio_id: number; ativo: number } | undefined;
  if (!cliente) throw new ErroCadastro('Cliente não encontrado.', 404);
  if (!cliente.ativo) throw new ErroCadastro('Cliente inativo.', 409);
  exigirAtivos(db, usuarioId, cliente.escritorio_id);
  db.transaction(() => {
    db.prepare(`INSERT INTO usuarios_clientes(usuario_id,cliente_id,escritorio_id) VALUES (?,?,?)
      ON CONFLICT(usuario_id,cliente_id) DO UPDATE SET ativo=1,atualizado_em=datetime('now')`)
      .run(usuarioId, clienteId, cliente.escritorio_id);
    auditarCadastro(db, 'usuario_cliente', `${usuarioId}:${clienteId}`, 'vincular', { escritorio_id: cliente.escritorio_id, origem: 'servico_interno' });
  })();
}
export function revogarVinculo(db: Banco, usuarioId: number, tipo: 'escritorio' | 'cliente', alvoId: number): void {
  obterUsuario(db, usuarioId); idValido(alvoId);
  z.enum(['escritorio', 'cliente']).parse(tipo);
  const tabela = tipo === 'escritorio' ? 'usuarios_escritorios' : 'usuarios_clientes';
  const campo = tipo === 'escritorio' ? 'escritorio_id' : 'cliente_id';
  db.transaction(() => {
    const result = db.prepare(`UPDATE ${tabela} SET ativo=0,atualizado_em=datetime('now') WHERE usuario_id=? AND ${campo}=? AND ativo=1`).run(usuarioId, alvoId);
    if (!result.changes) throw new ErroCadastro('Vínculo ativo não encontrado.', 404);
    auditarCadastro(db, `usuario_${tipo}`, `${usuarioId}:${alvoId}`, 'revogar', { origem: 'servico_interno' });
  })();
}
/** Lista vínculos elegíveis; o middleware de autorização será implementado na sprint 2. */
export function listarVinculosUsuario(db: Banco, usuarioId: number) {
  const usuario = obterUsuario(db, usuarioId);
  if (!usuario.ativo) return { escritorios: [], clientes: [] };
  return {
    escritorios: db.prepare(`SELECT e.id,e.nome,v.papel FROM usuarios_escritorios v JOIN escritorios e ON e.id=v.escritorio_id
      WHERE v.usuario_id=? AND v.ativo=1 AND e.ativo=1 ORDER BY e.nome,e.id`).all(usuarioId),
    clientes: db.prepare(`SELECT c.id,c.razao_social,c.escritorio_id FROM usuarios_clientes v
      JOIN clientes c ON c.id=v.cliente_id AND c.escritorio_id=v.escritorio_id JOIN escritorios e ON e.id=c.escritorio_id
      WHERE v.usuario_id=? AND v.ativo=1 AND c.ativo=1 AND e.ativo=1 ORDER BY c.razao_social,c.id`).all(usuarioId)
  };
}

