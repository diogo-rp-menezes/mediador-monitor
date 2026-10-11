import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ErroCadastro } from './cadastros.js';
import { auditarSeguranca, INATIVIDADE_SESSAO_MS, type DadosEvento, type Identidade } from './autenticacao.js';

type Banco = Database.Database;
export type Permissao = 'plataforma.gerenciar' | 'legado.acessar' | 'suporte.contexto' | 'escritorio.gerenciar' | 'usuarios.gerenciar'
  | 'monitoramentos.ler' | 'monitoramentos.gerenciar' | 'clientes.ler' | 'clientes.gerenciar' | 'documentos.ler_internos' | 'documentos.revisar' | 'documentos.publicar' | 'documentos.ler_publicados' | 'envios.aprovar' | 'auditoria.ler';
export type Contexto = Readonly<{ tipo: 'escritorio' | 'cliente'; escritorio_id: number; cliente_id: number | null;
  papel: 'administrador' | 'operador' | 'cliente' | 'suporte'; concessao?: string }>;
const permissoes: Record<Contexto['papel'], readonly Permissao[]> = {
  administrador: ['documentos.ler_internos','monitoramentos.ler','monitoramentos.gerenciar','escritorio.gerenciar','usuarios.gerenciar','clientes.ler','clientes.gerenciar','documentos.revisar','documentos.publicar','documentos.ler_publicados','envios.aprovar','auditoria.ler'],
  operador: ['documentos.ler_internos','monitoramentos.ler','monitoramentos.gerenciar','clientes.ler','clientes.gerenciar','documentos.revisar','documentos.ler_publicados'],
  cliente: ['documentos.ler_publicados'],
  suporte: ['documentos.ler_internos','monitoramentos.ler','clientes.ler','documentos.ler_publicados']
};
export function exigirPermissao(identidade: Identidade, permissao: Permissao, contexto?: Contexto): void {
  const global = identidade.papel_plataforma === 'administrador_plataforma'
    ? ['plataforma.gerenciar','legado.acessar','suporte.contexto'] : identidade.papel_plataforma === 'suporte' ? ['suporte.contexto'] : [];
  if (global.includes(permissao) || (contexto && permissoes[contexto.papel]?.includes(permissao))) return;
  throw new ErroCadastro('Você não tem permissão para esta ação.', 403);
}
const ContextoSchema = z.object({ tipo: z.enum(['escritorio','cliente']), id: z.number().int().positive(), concessao: z.string().uuid().optional() }).strict();
function exigirIdentidadeAtual(db: Banco, identidade: Identidade, agora: number): void {
  if (!db.prepare(`SELECT u.id FROM sessoes_usuarios s JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.token_hash=? AND u.id=? AND u.ativo=1 AND s.revogada=0 AND s.expira_em>? AND s.ultimo_acesso_em>?`)
    .get(identidade.sessao_hash, identidade.usuario_id, agora, agora - INATIVIDADE_SESSAO_MS))
    throw new ErroCadastro('Sessão encerrada.', 401);
}
export function resolverContexto(db: Banco, identidade: Identidade, raw: unknown, agora = Date.now()): Contexto {
  const dados = ContextoSchema.parse(raw);
  exigirIdentidadeAtual(db, identidade, agora);
  if (dados.tipo === 'cliente') {
    const row = db.prepare(`SELECT c.escritorio_id FROM usuarios_clientes v JOIN clientes c ON c.id=v.cliente_id AND c.escritorio_id=v.escritorio_id
      JOIN escritorios e ON e.id=c.escritorio_id WHERE v.usuario_id=? AND c.id=? AND v.ativo=1 AND c.ativo=1 AND e.ativo=1`)
      .get(identidade.usuario_id, dados.id) as { escritorio_id: number } | undefined;
    if (row) return Object.freeze({ tipo: 'cliente', escritorio_id: row.escritorio_id, cliente_id: dados.id, papel: 'cliente' });
  } else {
    const membro = db.prepare(`SELECT v.papel FROM usuarios_escritorios v JOIN escritorios e ON e.id=v.escritorio_id
      WHERE v.usuario_id=? AND e.id=? AND v.ativo=1 AND e.ativo=1`).get(identidade.usuario_id, dados.id) as { papel: 'administrador' | 'operador' } | undefined;
    if (membro && !dados.concessao) return Object.freeze({ tipo: 'escritorio', escritorio_id: dados.id, cliente_id: null, papel: membro.papel });
    // Papel global é reconsultado; uma concessão não sobrevive à revogação do suporte.
    const papel = db.prepare('SELECT papel FROM papeis_plataforma WHERE usuario_id=? AND ativo=1').get(identidade.usuario_id) as { papel: 'administrador_plataforma' | 'suporte' } | undefined;
    if (dados.concessao && papel && db.prepare(`SELECT g.id FROM concessoes_suporte g JOIN escritorios e ON e.id=g.escritorio_id
      WHERE g.id=? AND g.sessao_hash=? AND g.escritorio_id=? AND g.revogada=0 AND g.expira_em>? AND e.ativo=1`)
      .get(dados.concessao, identidade.sessao_hash, dados.id, agora))
      return Object.freeze({ tipo: 'escritorio', escritorio_id: dados.id, cliente_id: null,
        papel: papel.papel === 'administrador_plataforma' ? 'administrador' : 'suporte', concessao: dados.concessao });
  }
  throw new ErroCadastro('Contexto não autorizado.', 403);
}
export function iniciarContextoSuporte(db: Banco, identidade: Identidade, raw: unknown, evento: DadosEvento = {}, agora = Date.now()): Contexto {
  exigirIdentidadeAtual(db, identidade, agora);
  const papelAtual = db.prepare('SELECT papel FROM papeis_plataforma WHERE usuario_id=? AND ativo=1').get(identidade.usuario_id) as { papel: Identidade['papel_plataforma'] } | undefined;
  exigirPermissao({ ...identidade, papel_plataforma: papelAtual?.papel ?? null }, 'suporte.contexto');
  const dados = z.object({ escritorio_id: z.number().int().positive(), justificativa: z.string().trim().min(8).max(1000) }).strict().parse(raw);
  if (!db.prepare('SELECT id FROM escritorios WHERE id=? AND ativo=1').get(dados.escritorio_id)) throw new ErroCadastro('Contexto não autorizado.', 403);
  const id = randomUUID(), expira = Math.min(identidade.expira_em, agora + 60 * 60 * 1000);
  db.transaction(() => {
    db.prepare('INSERT INTO concessoes_suporte(id,sessao_hash,escritorio_id,justificativa,criada_em,expira_em) VALUES (?,?,?,?,?,?)')
      .run(id, identidade.sessao_hash, dados.escritorio_id, dados.justificativa, agora, expira);
    auditarSeguranca(db, 'SUPORTE_CONTEXTO_INICIADO', identidade.usuario_id, evento, { justificativa: dados.justificativa, concessao: id }, { escritorio_id: dados.escritorio_id }, agora);
  })();
  return resolverContexto(db, identidade, { tipo: 'escritorio', id: dados.escritorio_id, concessao: id }, agora);
}
export function encerrarContextoSuporte(db: Banco, identidade: Identidade, id: string, evento: DadosEvento = {}) {
  z.string().uuid().parse(id);
  const row = db.prepare('SELECT escritorio_id FROM concessoes_suporte WHERE id=? AND sessao_hash=? AND revogada=0').get(id, identidade.sessao_hash) as { escritorio_id: number } | undefined;
  if (!row) throw new ErroCadastro('Contexto não autorizado.', 403);
  db.transaction(() => {
    db.prepare('UPDATE concessoes_suporte SET revogada=1 WHERE id=?').run(id);
    auditarSeguranca(db, 'SUPORTE_CONTEXTO_ENCERRADO', identidade.usuario_id, evento, { concessao: id }, row);
  })();
}
