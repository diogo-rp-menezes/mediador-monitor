import Database from "better-sqlite3";
import {exigirSqliteOperacional} from './sqlite-cutover-lock.js';
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { env, type Watch } from "./config.js";
import type { Extracao, Registro } from "./types.js";
import { normalizarTipos } from "./instrumentos.js";
import { ErroCadastro, migrarCadastros } from './cadastros.js';
import { migrarOrganizacoes } from './organizacoes.js';
import { migrarAutenticacao } from './autenticacao.js';
import { migrarContatosPorEscritorio } from './migracao-contatos.js';
import { migrarMonitoramentosEscritorio } from './monitoramentos-escritorio.js';
import { migrarInterpretacoes } from './migracao-interpretacoes.js';
import { migrarOperacoesEscritorio } from './operacoes-escritorio.js';
import { migrarPublicacoes } from './migracao-publicacoes.js';

export function openDb(path: string) {
  exigirSqliteOperacional(path);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS registros (
      numero_registro TEXT PRIMARY KEY,
      numero_solicitacao TEXT,
      watch TEXT NOT NULL,
      tipo TEXT, vigencia TEXT, partes TEXT,
      arquivo_path TEXT,
      arquivo_hash TEXT, arquivo_tamanho INTEGER, arquivo_nome TEXT, download_erro TEXT,
      extracao_json TEXT,
      analise_status TEXT NOT NULL DEFAULT 'sem_analise',
      analise_erro TEXT,
      analise_iniciada_em TEXT,
      analise_concluida_em TEXT,
      primeira_vez TEXT NOT NULL DEFAULT (datetime('now')),
      notificado INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iniciada_em TEXT NOT NULL DEFAULT (datetime('now')),
      watch TEXT, tipo_instrumento TEXT NOT NULL DEFAULT '', encontrados INTEGER, novos INTEGER, erro TEXT
    );
    CREATE TABLE IF NOT EXISTS sindicatos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cnpj TEXT NOT NULL DEFAULT '', categoria TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT '', tipos_json TEXT NOT NULL DEFAULT '[]', vigencia TEXT NOT NULL DEFAULT '', titulo TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ajustes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);
  // Migrações aditivas: colunas antes dos índices; não elimina dados de versões anteriores.
  const columns = new Set((db.prepare('PRAGMA table_info(registros)').all() as Array<{name:string}>).map(r => r.name));
  for (const [key, type] of Object.entries({ arquivo_hash: 'TEXT', arquivo_tamanho: 'INTEGER', arquivo_nome: 'TEXT', download_erro: 'TEXT' })) {
    if (!columns.has(key)) db.exec(`ALTER TABLE registros ADD COLUMN ${key} ${type}`);
  }
  // v0.3.3: adicionar estado persistente, preservando as extrações antigas.
  // A ordem importa: adicionar colunas antes de qualquer consulta que as utilize.
  const analiseCols = new Set((db.prepare('PRAGMA table_info(registros)').all() as Array<{name:string}>).map(r => r.name));
  const criandoStatus = !analiseCols.has('analise_status');
  for (const [nome, sql] of Object.entries({
    analise_status: "TEXT NOT NULL DEFAULT 'sem_analise'",
    analise_erro: 'TEXT',
    analise_iniciada_em: 'TEXT',
    analise_concluida_em: 'TEXT'
  })) {
    if (!analiseCols.has(nome)) db.exec(`ALTER TABLE registros ADD COLUMN ${nome} ${sql}`);
  }
  if (criandoStatus) {
    db.exec("UPDATE registros SET analise_status='analisado' WHERE extracao_json IS NOT NULL AND trim(extracao_json) NOT IN ('', 'null')");
  }
  // Uma análise interrompida pelo encerramento do Node não pode ficar bloqueada para sempre.
  db.exec(`UPDATE registros SET analise_status='falhou',
           analise_erro='Análise interrompida pelo reinício do servidor. Tente novamente.',
           analise_concluida_em=datetime('now') WHERE analise_status='analisando'`);
  const execCols = new Set((db.prepare('PRAGMA table_info(execucoes)').all() as Array<{name:string}>).map(r=>r.name));
  if (!execCols.has('tipo_instrumento')) db.exec("ALTER TABLE execucoes ADD COLUMN tipo_instrumento TEXT NOT NULL DEFAULT ''");
  const sindicatoCols = new Set((db.prepare('PRAGMA table_info(sindicatos)').all() as Array<{name:string}>).map(r=>r.name));
  if (!sindicatoCols.has('titulo')) db.exec("ALTER TABLE sindicatos ADD COLUMN titulo TEXT NOT NULL DEFAULT ''");
  // v0.3.6: migração aditiva. O filtro único existente vira um array JSON de 1 elemento.
  if (!sindicatoCols.has('tipos_json')) {
    db.exec("ALTER TABLE sindicatos ADD COLUMN tipos_json TEXT NOT NULL DEFAULT '[]'");
    const antigos = db.prepare('SELECT id, tipo FROM sindicatos').all() as {id:number;tipo:string}[];
    const salvarTipos = db.prepare('UPDATE sindicatos SET tipos_json=? WHERE id=?');
    db.transaction(() => { for (const item of antigos) {
      const legado = item.tipo || 'Convenção Coletiva';
      const nomes = [legado]; // não altera nem descarta configurações antigas
      salvarTipos.run(JSON.stringify(nomes), item.id);
    } })();
  }
  // v0.3.7: relacionamento aditivo -> base e análises consolidadas versionadas.
  // Nunca substitui extracao_json nem o arquivo do instrumento original.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vinculos_aditivos (
      aditivo_registro TEXT PRIMARY KEY REFERENCES registros(numero_registro) ON DELETE CASCADE,
      base_registro TEXT REFERENCES registros(numero_registro) ON DELETE SET NULL,
      referencia_registro TEXT,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('automatico','confirmado','pendente','rejeitado')),
      evidencia TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vinculos_base ON vinculos_aditivos(base_registro);
    CREATE TABLE IF NOT EXISTS consolidacoes_cct (
      base_registro TEXT PRIMARY KEY REFERENCES registros(numero_registro) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'sem_analise',
      resultado_json TEXT,
      entrada_hash TEXT,
      erro TEXT,
      iniciado_em TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // v0.3.9: propostas de IA e decisões humanas são mantidas fora do JSON original.
  db.exec(`
    CREATE TABLE IF NOT EXISTS revisoes_pendencias (
      base_registro TEXT NOT NULL REFERENCES registros(numero_registro) ON DELETE CASCADE,
      campo TEXT NOT NULL,
      aditivo_registro TEXT NOT NULL REFERENCES registros(numero_registro) ON DELETE CASCADE,
      contexto_hash TEXT NOT NULL,
      sugestao_estado TEXT NOT NULL DEFAULT 'nao_solicitada',
      sugestao_json TEXT,
      sugestao_erro TEXT,
      decisao TEXT,
      valor_decidido TEXT,
      justificativa TEXT,
      revisor TEXT,
      revisado_em TEXT,
      PRIMARY KEY (base_registro,campo,aditivo_registro)
    );
    CREATE TABLE IF NOT EXISTS auditoria_revisoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_registro TEXT NOT NULL,
      campo TEXT NOT NULL,
      aditivo_registro TEXT NOT NULL,
      contexto_hash TEXT NOT NULL,
      anterior_json TEXT,
      decisao_json TEXT NOT NULL,
      revisor TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_auditoria_revisoes ON auditoria_revisoes(base_registro,campo,aditivo_registro,id);
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_registros_hash ON registros(arquivo_hash);
           CREATE INDEX IF NOT EXISTS idx_registros_watch ON registros(watch);
           CREATE INDEX IF NOT EXISTS idx_execucoes_data ON execucoes(iniciada_em);`);
  migrarCadastros(db);
  migrarOrganizacoes(db);
  migrarAutenticacao(db);
  migrarContatosPorEscritorio(db);
  migrarMonitoramentosEscritorio(db);
  migrarInterpretacoes(db);
  migrarOperacoesEscritorio(db);
  migrarPublicacoes(db);
  return db;
}
export type Db = ReturnType<typeof openDb>;

export function existe(db: Db, numero: string): boolean {
  return !!db.prepare("SELECT 1 FROM registros WHERE numero_registro = ?").get(numero);
}

/** Apenas os registros ainda não existentes no banco (diff por número de registro), sem duplicatas. */
export function filtrarNovos(db: Db, registros: Registro[]): Registro[] {
  const vistos = new Set<string>();
  return registros.filter((r) => {
    if (vistos.has(r.numeroRegistro)) return false;
    vistos.add(r.numeroRegistro);
    return !existe(db, r.numeroRegistro);
  });
}

export function salvarRegistro(db: Db, watch: string, r: Registro, notificado: boolean) {
  db.prepare(
    `INSERT OR IGNORE INTO registros
     (numero_registro, numero_solicitacao, watch, tipo, vigencia, partes, notificado)
     VALUES (?,?,?,?,?,?,?)`
  ).run(r.numeroRegistro, r.numeroSolicitacao, watch, r.tipo, r.vigencia, r.partes, notificado ? 1 : 0);
}

/** Impede concorrência entre análise manual, reanálise e monitoramento automático. */
export function iniciarAnalise(db: Db, numero: string): boolean {
  return db.prepare(`UPDATE registros SET analise_status='analisando', analise_erro=NULL,
      analise_iniciada_em=datetime('now'), analise_concluida_em=NULL
      WHERE numero_registro=? AND analise_status <> 'analisando'`).run(numero).changes === 1;
}

export function falharAnalise(db: Db, numero: string, mensagem: string): void {
  db.prepare(`UPDATE registros SET analise_status='falhou', analise_erro=?,
      analise_concluida_em=datetime('now')
      WHERE numero_registro=? AND analise_status='analisando'`).run(mensagem.slice(0, 2000), numero);
}

export function atualizarArquivoEExtracao(db: Db, numero: string, arquivo: string | null, ext: Extracao | null) {
  if (!ext) {
    // Nunca destrói análise anterior apenas porque o LLM está desativado.
    if (arquivo) db.prepare('UPDATE registros SET arquivo_path=? WHERE numero_registro=?').run(arquivo, numero);
    return;
  }
  db.prepare(`UPDATE consolidacoes_cct SET status='desatualizado' WHERE status='consolidado' AND
    (base_registro=? OR base_registro IN (SELECT base_registro FROM vinculos_aditivos WHERE aditivo_registro=?))`).run(numero,numero);
  db.prepare(`UPDATE registros SET arquivo_path=COALESCE(?, arquivo_path), extracao_json=?,
      analise_status='analisado', analise_erro=NULL,
      analise_concluida_em=datetime('now') WHERE numero_registro=?`).run(arquivo, JSON.stringify(ext), numero);
}

export function marcarNotificado(db: Db, numero: string) {
  db.prepare("UPDATE registros SET notificado = 1 WHERE numero_registro = ?").run(numero);
}

export function registrarExecucao(db: Db, watch: string, encontrados: number, novos: number, erro?: string, tipoInstrumento = '') {
  db.prepare("INSERT INTO execucoes (watch, tipo_instrumento, encontrados, novos, erro) VALUES (?,?,?,?,?)").run(
    watch, tipoInstrumento, encontrados, novos, erro ?? null
  );
}

export function listar(db: Db, limite = 50) {
  return db
    .prepare("SELECT numero_registro, watch, tipo, vigencia, partes, notificado, primeira_vez FROM registros ORDER BY primeira_vez DESC LIMIT ?")
    .all(limite);
}

// ---------- Sindicatos (CRUD). Cada sindicato ATIVO vira uma consulta monitorada.
export interface Sindicato {
  nome: string; cnpj: string; categoria: string; uf: string;
  tipo: string; tipos?: string[]; vigencia: string; titulo: string; ativo: boolean;
}
type SindRow = Omit<Sindicato, "ativo" | "tipos"> & { id: number; ativo: number; criado_em: string; tipos_json: string };
const paraSind = (r: SindRow) => {
  const { tipos_json, ...campos } = r;
  let tipos: string[];
  try { tipos = normalizarTipos(JSON.parse(tipos_json), r.tipo); }
  catch { tipos = [r.tipo || 'Convenção Coletiva']; } // tolera dados históricos sem interromper abertura
  return { ...campos, tipos, ativo: !!r.ativo };
};
const campos = (s: Sindicato) => {
  const tipos = normalizarTipos(s.tipos, s.tipo);
  return [s.nome, s.cnpj, s.categoria, s.uf, tipos[0], JSON.stringify(tipos), s.vigencia, s.titulo, s.ativo ? 1 : 0] as const;
};

export function listarSindicatos(db: Db) {
  return (db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM clientes_sindicatos cs WHERE cs.sindicato_id=s.id) clientes_total
    FROM sindicatos s ORDER BY nome COLLATE NOCASE`).all() as SindRow[]).map(paraSind);
}
export function criarSindicato(db: Db, s: Sindicato): number {
  const r = db.prepare("INSERT INTO sindicatos (nome,cnpj,categoria,uf,tipo,tipos_json,vigencia,titulo,ativo) VALUES (?,?,?,?,?,?,?,?,?)").run(...campos(s));
  return Number(r.lastInsertRowid);
}
export function atualizarSindicato(db: Db, id: number, s: Sindicato): boolean {
  return db.prepare("UPDATE sindicatos SET nome=?,cnpj=?,categoria=?,uf=?,tipo=?,tipos_json=?,vigencia=?,titulo=?,ativo=? WHERE id=?").run(...campos(s), id).changes > 0;
}
export function removerSindicato(db: Db, id: number): boolean {
  if(db.prepare('SELECT cliente_id FROM clientes_sindicatos WHERE sindicato_id=? LIMIT 1').get(id)
    ||db.prepare('SELECT numero_registro FROM registros_sindicatos WHERE sindicato_id=? LIMIT 1').get(id)
    ||db.prepare('SELECT id FROM monitoramentos_escritorios WHERE sindicato_id=? LIMIT 1').get(id))
    throw new ErroCadastro('Sindicato possui clientes, documentos ou configurações vinculadas. Pause o monitoramento para preservar o histórico.',409);
  return db.prepare("DELETE FROM sindicatos WHERE id = ?").run(id).changes > 0;
}
export function watchesDeSindicatos(db: Db): Watch[] {
  return listarSindicatos(db).filter((s) => s.ativo).map(({ id, nome, cnpj, categoria, uf, tipo, tipos, vigencia, titulo }) => ({ sindicatoId:id, name: nome, cnpj, categoria, uf, tipo, tipos, vigencia, titulo }));
}

// ---------- Configuração do LLM (API compatível com OpenAI)
export interface LlmConfig { ativo: boolean; baseUrl: string; apiKey: string; model: string }

export function lerLlm(db: Db): LlmConfig & { origem: "painel" | "env" } {
  const row = db.prepare("SELECT valor FROM ajustes WHERE chave = 'llm'").get() as { valor: string } | undefined;
  if (row) return { ...(JSON.parse(row.valor) as LlmConfig), origem: "painel" };
  const e = env.llm;
  return { ativo: !!(e.apiKey && e.model), baseUrl: e.baseUrl, apiKey: e.apiKey, model: e.model, origem: "env" };
}
export function salvarLlm(db: Db, c: LlmConfig) {
  db.prepare("INSERT INTO ajustes (chave, valor) VALUES ('llm', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(JSON.stringify(c));
}

// Persistência independente da descoberta; registros sem arquivo continuam elegíveis a nova tentativa.
export interface ArquivoInfo { path: string; hash: string; bytes: number; original: string }
export function precisaDownload(db: Db, numero: string): boolean {
  const row = db.prepare('SELECT arquivo_path FROM registros WHERE numero_registro=?').get(numero) as {arquivo_path:string|null}|undefined;
  if (!row?.arquivo_path) return true;
  return !existsSync(row.arquivo_path);
}
export function salvarArquivo(db: Db, numero: string, arquivo: ArquivoInfo) {
  db.prepare('UPDATE registros SET arquivo_path=?, arquivo_hash=?, arquivo_tamanho=?, arquivo_nome=?, download_erro=NULL WHERE numero_registro=?')
    .run(arquivo.path, arquivo.hash, arquivo.bytes, arquivo.original, numero);
  db.prepare(`UPDATE consolidacoes_cct SET status='desatualizado' WHERE status='consolidado' AND
    (base_registro=? OR base_registro IN (SELECT base_registro FROM vinculos_aditivos WHERE aditivo_registro=?))`).run(numero,numero);
}
export function registrarFalhaDownload(db: Db, numero: string, erro: string) {
  db.prepare('UPDATE registros SET download_erro=? WHERE numero_registro=?').run(erro, numero);
}
export function upsertRegistro(db: Db, watch: string, reg: Registro) {
  db.prepare(`INSERT INTO registros (numero_registro,numero_solicitacao,watch,tipo,vigencia,partes,notificado)
              VALUES (?,?,?,?,?,?,0)
              ON CONFLICT(numero_registro) DO UPDATE SET
                numero_solicitacao=excluded.numero_solicitacao, tipo=excluded.tipo,
                vigencia=excluded.vigencia, partes=excluded.partes`)
    .run(reg.numeroRegistro, reg.numeroSolicitacao, watch, reg.tipo, reg.vigencia, reg.partes);
}

/** Importa dados do schema v0.2.4 quando apontar DB_PATH ao banco anterior (mesmo arquivo). */
export function importarLegado(db: Db): { sindicatos: number; registros: number } {
  const table = (name: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if (!table('unions') || !table('documents')) return { sindicatos: 0, registros: 0 };
  const cols = (name: string) => new Set((db.prepare(`PRAGMA table_info(${name})`).all() as Array<{name:string}>).map(x=>x.name));
  const uc = cols('unions'), dc = cols('documents');
  const unions = db.prepare('SELECT * FROM unions').all() as Record<string,any>[];
  let countS = 0, countD = 0;
  db.transaction(() => {
    for (const u of unions) {
      if (!db.prepare('SELECT 1 FROM sindicatos WHERE cnpj=? AND nome=?').get(u.cnpj||'', u.name)) {
        criarSindicato(db, {nome:u.name,cnpj:u.cnpj||'',categoria:u.category||'',uf:u.uf||'',tipo:'Convenção Coletiva',vigencia:'Vigentes',titulo:u.title_keyword||'',ativo:!!u.active});
        countS++;
      }
    }
    if (!dc.has('registration_number')) return;
    for (const d of db.prepare('SELECT * FROM documents WHERE registration_number IS NOT NULL').all() as Record<string,any>[]) {
      const numero = String(d.registration_number).trim();
      if (!numero || existe(db, numero)) continue;
      const u = unions.find(x=>x.id===d.union_id);
      salvarRegistro(db, u?.name || 'Importado da v0.2.4', {
        numeroRegistro:numero, numeroSolicitacao:d.solicitation||'', tipo:d.instrument_type||'Convenção Coletiva',
        vigencia:[d.valid_from,d.expires_at].filter(Boolean).join(' - '), partes:d.title||'', indice:0
      }, true);
      db.prepare('UPDATE registros SET arquivo_path=?, arquivo_hash=?, arquivo_tamanho=?, arquivo_nome=? WHERE numero_registro=?')
        .run(d.pdf_path||null,d.pdf_hash||null,d.file_size||null,d.attachment_name||null,numero);
      countD++;
    }
  })();
  return { sindicatos: countS, registros: countD };
}

