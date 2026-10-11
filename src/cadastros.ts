import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db.js';
import { extrairCabecalho } from './documento.js';
import { TIPOS_VALIDOS } from './instrumentos.js';

import {ErroCadastro} from './cadastro-erro.js';
export {ErroCadastro} from './cadastro-erro.js';
const texto = z.string().trim().max(500).default('');
const uf = z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, 'UF inválida').default('');
export const normalizarCnpj = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase();
export const normalizarTexto = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function cnpjValido(raw: string): boolean {
  const s = normalizarCnpj(raw);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(.)\1+$/.test(s)) return false;
  const calcular = (base: string, pesos: number[]) => {
    const resto = [...base].reduce((n, c, i) => n + (c.charCodeAt(0) - 48) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const a = calcular(s.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  return Number(s[12]) === a && Number(s[13]) === calcular(s.slice(0, 12) + a, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
}
const cnpj = z.string().trim().transform(normalizarCnpj).refine(cnpjValido, 'CNPJ inválido: confira os dígitos verificadores');
const dataCadastral = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default('');
const cnae = z.object({ codigo: z.string().regex(/^(\d{7})?$/).default(''), descricao: texto });
export const DadosCnpjSchema = z.object({
  cnpj, fonte: z.literal('BrasilAPI / Minha Receita'), consultado_em: z.string().datetime(),
  razao_social: z.string().trim().min(2).max(250), nome_fantasia: texto, uf, municipio: texto,
  endereco: z.object({ logradouro: texto, numero: texto, complemento: texto, bairro: texto, cep: z.string().regex(/^(\d{8})?$/).default('') }),
  cnae_principal: cnae, cnaes_secundarios: z.array(cnae).max(200),
  situacao_cadastral: texto, data_situacao_cadastral: dataCadastral, natureza_juridica: texto, porte: texto, inicio_atividade: dataCadastral
});
export type DadosCnpj = z.infer<typeof DadosCnpjSchema>;
const idsUnicos = <T>(v: T[], chave: keyof T) => new Set(v.map(x => x[chave])).size === v.length;
export const SindicatoClienteSchema = z.object({
  sindicato_id: z.coerce.number().int().positive(), categoria: texto, uf, municipio: texto,
  principal: z.boolean().default(false), enquadramento_confirmado: z.boolean().default(false)
});
export const ContatoClienteSchema = z.object({
  contato_id: z.coerce.number().int().positive(), funcao: texto, receber_email: z.boolean().default(true),
  tipos: z.array(z.string()).max(9).default([]).refine(v => v.every(t => TIPOS_VALIDOS.has(t)), 'Tipo de documento inválido')
});
export const ClienteSchema = z.object({
  razao_social: z.string().trim().min(2, 'Informe a razão social').max(250), nome_fantasia: texto, cnpj, uf, municipio: texto,
  ativo: z.boolean().default(true), modo_envio: z.enum(['revisao','automatico']).default('revisao'),
  dados_cnpj: DadosCnpjSchema.nullable().optional(),
  sindicatos: z.array(SindicatoClienteSchema).max(100).optional()
    .refine(v => !v || idsUnicos(v, 'sindicato_id'), 'Sindicato duplicado')
    .refine(v => !v || v.filter(x => x.principal).length <= 1, 'Selecione apenas um sindicato principal'),
  contatos: z.array(ContatoClienteSchema).max(100).optional().refine(v => !v || idsUnicos(v, 'contato_id'), 'Contato duplicado')
});
export const ContatoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(250),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254), telefone: texto, cargo: texto,
  ativo: z.boolean().default(true)
});
export type ClienteInput = z.infer<typeof ClienteSchema>;
export type ContatoInput = z.infer<typeof ContatoSchema>;
export interface ClienteRow { id: number; razao_social: string; nome_fantasia: string; cnpj: string; uf: string; municipio: string; ativo: number; modo_envio: 'revisao'|'automatico'; criado_em: string; atualizado_em: string; dados_cnpj_json: string|null }
export interface ContatoRow { id: number; nome: string; email: string; telefone: string; cargo: string; ativo: number; criado_em: string; atualizado_em: string }
export interface DocumentoMeta { cnpjs: string[]; categoria: string; abrangencia: string; inicio: string; fim: string }

/** Migração aditiva: preserva todos os registros, análises, configurações e vínculos antigos. */
export function migrarCadastros(db: Db): void {
  const columns = new Set((db.prepare('PRAGMA table_info(registros)').all() as {name:string}[]).map(x => x.name));
  if (!columns.has('documento_meta_json')) db.exec('ALTER TABLE registros ADD COLUMN documento_meta_json TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, razao_social TEXT NOT NULL, nome_fantasia TEXT NOT NULL DEFAULT '',
      cnpj TEXT NOT NULL UNIQUE COLLATE NOCASE, uf TEXT NOT NULL DEFAULT '', municipio TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1, modo_envio TEXT NOT NULL DEFAULT 'revisao' CHECK(modo_envio IN ('revisao','automatico')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contatos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      telefone TEXT NOT NULL DEFAULT '', cargo TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clientes_sindicatos (
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      sindicato_id INTEGER NOT NULL REFERENCES sindicatos(id) ON DELETE RESTRICT,
      categoria TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '', municipio TEXT NOT NULL DEFAULT '',
      principal INTEGER NOT NULL DEFAULT 0, enquadramento_confirmado INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(cliente_id,sindicato_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cliente_principal ON clientes_sindicatos(cliente_id) WHERE principal=1;
    CREATE INDEX IF NOT EXISTS idx_clientes_sindicato ON clientes_sindicatos(sindicato_id);
    CREATE TABLE IF NOT EXISTS clientes_contatos (
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      contato_id INTEGER NOT NULL REFERENCES contatos(id) ON DELETE RESTRICT,
      funcao TEXT NOT NULL DEFAULT '', receber_email INTEGER NOT NULL DEFAULT 1, tipos_json TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY(cliente_id,contato_id)
    );
    CREATE TABLE IF NOT EXISTS registros_sindicatos (
      numero_registro TEXT NOT NULL REFERENCES registros(numero_registro) ON DELETE CASCADE,
      sindicato_id INTEGER NOT NULL REFERENCES sindicatos(id) ON DELETE RESTRICT,
      PRIMARY KEY(numero_registro,sindicato_id)
    );
    CREATE TABLE IF NOT EXISTS clientes_documentos (
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
      numero_registro TEXT NOT NULL REFERENCES registros(numero_registro) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'candidato' CHECK(status IN ('candidato','confirmado','rejeitado')),
      motivo TEXT NOT NULL, contexto_hash TEXT NOT NULL, origem TEXT NOT NULL DEFAULT 'regra',
      incluir_envio INTEGER NOT NULL DEFAULT 0, responsavel TEXT, justificativa TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(cliente_id,numero_registro)
    );
    CREATE TABLE IF NOT EXISTS auditoria_clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entidade TEXT NOT NULL, entidade_id TEXT NOT NULL, acao TEXT NOT NULL,
      detalhes_json TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS envios_clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
      contato_id INTEGER NOT NULL REFERENCES contatos(id) ON DELETE RESTRICT,
      numero_registro TEXT NOT NULL REFERENCES registros(numero_registro) ON DELETE RESTRICT,
      versao TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('bloqueado','preparando','revisao','na_fila','enviando','enviado','falhou','cancelado','incerto')),
      motivo TEXT, snapshot_json TEXT, aprovado_por TEXT, aprovado_em TEXT, contexto_aprovacao TEXT,
      tentativas INTEGER NOT NULL DEFAULT 0, proxima_tentativa TEXT, erro TEXT, message_id TEXT, resposta_smtp TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now')), enviado_em TEXT,
      UNIQUE(cliente_id,contato_id,numero_registro,versao)
    );
    CREATE INDEX IF NOT EXISTS idx_envios_status ON envios_clientes(status,proxima_tentativa);
    CREATE TABLE IF NOT EXISTS tentativas_envio (
      id INTEGER PRIMARY KEY AUTOINCREMENT, envio_id INTEGER NOT NULL REFERENCES envios_clientes(id) ON DELETE RESTRICT,
      resultado TEXT NOT NULL, erro TEXT, message_id TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const clienteColumns = new Set((db.prepare('PRAGMA table_info(clientes)').all() as {name:string}[]).map(x => x.name));
  if (!clienteColumns.has('dados_cnpj_json')) db.exec('ALTER TABLE clientes ADD COLUMN dados_cnpj_json TEXT');
  // Nome era a única referência até v0.3.11. Só recupera nomes não ambíguos.
  db.exec(`INSERT OR IGNORE INTO registros_sindicatos(numero_registro,sindicato_id)
    SELECT r.numero_registro,s.id FROM registros r JOIN sindicatos s ON s.nome=r.watch
    WHERE (SELECT COUNT(*) FROM sindicatos x WHERE x.nome=r.watch)=1`);
}
export function auditarCadastro(db: Db, entidade: string, id: string|number, acao: string, detalhes: unknown): void {
  db.prepare('INSERT INTO auditoria_clientes(entidade,entidade_id,acao,detalhes_json) VALUES (?,?,?,?)')
    .run(entidade, String(id), acao, JSON.stringify(detalhes));
}
function exigir(db: Db, tabela: 'clientes'|'contatos'|'sindicatos', id: number): void {
  if (!db.prepare(`SELECT id FROM ${tabela} WHERE id=?`).get(id)) throw new ErroCadastro('Cadastro não encontrado', 404);
}
export function exigirCadastroEscritorio(db: Db, tabela: 'clientes'|'contatos', id: number, escritorioId: number): void {
  z.number().int().positive().parse(escritorioId);
  if (!db.prepare(`SELECT id FROM ${tabela} WHERE id=? AND escritorio_id=?`).get(id, escritorioId))
    throw new ErroCadastro('Cadastro não encontrado', 404);
}
export function listarClientes(db: Db, escritorioId?: number) {
  return (db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM clientes_sindicatos x WHERE x.cliente_id=c.id) sindicatos_total,
    (SELECT COUNT(*) FROM clientes_contatos x WHERE x.cliente_id=c.id AND x.receber_email=1) contatos_total,
    (SELECT COUNT(*) FROM envios_clientes e WHERE e.cliente_id=c.id AND e.status IN ('revisao','bloqueado','falhou','incerto')) pendentes
    FROM clientes c WHERE (? IS NULL OR c.escritorio_id=?) ORDER BY c.razao_social COLLATE NOCASE`).all(escritorioId??null,escritorioId??null) as (ClienteRow & {sindicatos_total:number;contatos_total:number;pendentes:number})[])
    .map(x => ({...x, dados_cnpj_json:undefined, ativo:!!x.ativo}));
}
export function detalheCliente(db: Db, id: number, escritorioId?: number) {
  if (escritorioId !== undefined) exigirCadastroEscritorio(db, 'clientes', id, escritorioId);
  exigir(db, 'clientes', id);
  const c = db.prepare('SELECT * FROM clientes WHERE id=?').get(id) as ClienteRow;
  const sindicatos = db.prepare(`SELECT cs.*,s.nome,s.cnpj,s.ativo FROM clientes_sindicatos cs JOIN sindicatos s ON s.id=cs.sindicato_id
    WHERE cs.cliente_id=? ORDER BY cs.principal DESC,s.nome`).all(id) as Record<string, unknown>[];
  const contatos = db.prepare(`SELECT cc.*,c.nome,c.email,c.telefone,c.cargo,c.ativo FROM clientes_contatos cc JOIN contatos c ON c.id=cc.contato_id
    WHERE cc.cliente_id=? ORDER BY c.nome`).all(id) as Record<string, unknown>[];
  return {...c, dados_cnpj_json:undefined, dados_cnpj:c.dados_cnpj_json?DadosCnpjSchema.parse(JSON.parse(c.dados_cnpj_json)):null, ativo:!!c.ativo, sindicatos:sindicatos.map(x => ({...x, ativo:!!x.ativo, principal:!!x.principal, enquadramento_confirmado:!!x.enquadramento_confirmado})),
    contatos:contatos.map(x => ({...x, ativo:!!x.ativo, receber_email:!!x.receber_email, tipos:JSON.parse(String(x.tipos_json)), tipos_json:undefined}))};
}
export function salvarCliente(db: Db, id: number|null, raw: unknown, escritorioId?: number): number {
  if (id && escritorioId !== undefined) exigirCadastroEscritorio(db,'clientes',id,escritorioId);
  const c = ClienteSchema.parse(raw);
  if (c.dados_cnpj && c.dados_cnpj.cnpj !== c.cnpj) throw new ErroCadastro('Os dados consultados pertencem a outro CNPJ. Consulte novamente ou remova a consulta.');
  if (id) exigir(db, 'clientes', id);
  if (db.prepare('SELECT id FROM clientes WHERE cnpj=? AND id<>?').get(c.cnpj, id??0)) throw new ErroCadastro('Já existe um cliente com este CNPJ', 409);
  return db.transaction(() => {
    const antes = id ? detalheCliente(db, id) : null;
    const consulta = c.dados_cnpj === undefined ? (antes?.cnpj === c.cnpj ? antes.dados_cnpj : null) : c.dados_cnpj;
    const args = [c.razao_social,c.nome_fantasia,c.cnpj,c.uf,c.municipio,Number(c.ativo),c.modo_envio,consulta?JSON.stringify(consulta):null];
    if (id) db.prepare(`UPDATE clientes SET razao_social=?,nome_fantasia=?,cnpj=?,uf=?,municipio=?,ativo=?,modo_envio=?,dados_cnpj_json=?,atualizado_em=datetime('now') WHERE id=?`).run(...args,id);
    else id = Number((escritorioId === undefined
      ? db.prepare('INSERT INTO clientes(razao_social,nome_fantasia,cnpj,uf,municipio,ativo,modo_envio,dados_cnpj_json) VALUES (?,?,?,?,?,?,?,?)').run(...args)
      : db.prepare('INSERT INTO clientes(razao_social,nome_fantasia,cnpj,uf,municipio,ativo,modo_envio,dados_cnpj_json,escritorio_id) VALUES (?,?,?,?,?,?,?,?,?)').run(...args,escritorioId)).lastInsertRowid);
    if (c.sindicatos) {
      c.sindicatos.forEach(x => {
        exigir(db,'sindicatos',x.sindicato_id);
        if(escritorioId !== undefined
          && !db.prepare('SELECT id FROM monitoramentos_escritorios WHERE escritorio_id=? AND sindicato_id=?').get(escritorioId,x.sindicato_id)
          && !db.prepare('SELECT cliente_id FROM clientes_sindicatos WHERE cliente_id=? AND sindicato_id=?').get(id,x.sindicato_id))
          throw new ErroCadastro('Sindicato não configurado neste escritório.',404);
      });
      db.prepare('DELETE FROM clientes_sindicatos WHERE cliente_id=?').run(id);
      const insert = db.prepare('INSERT INTO clientes_sindicatos(cliente_id,sindicato_id,categoria,uf,municipio,principal,enquadramento_confirmado) VALUES (?,?,?,?,?,?,?)');
      for (const s of c.sindicatos) insert.run(id,s.sindicato_id,s.categoria,s.uf,s.municipio,Number(s.principal),Number(s.enquadramento_confirmado));
    }
    if (c.contatos) {
      if (escritorioId !== undefined) c.contatos.forEach(x => exigirCadastroEscritorio(db,'contatos',x.contato_id,escritorioId));
      else c.contatos.forEach(x => exigir(db,'contatos',x.contato_id));
      db.prepare('DELETE FROM clientes_contatos WHERE cliente_id=?').run(id);
      const insert = db.prepare('INSERT INTO clientes_contatos(cliente_id,contato_id,funcao,receber_email,tipos_json) VALUES (?,?,?,?,?)');
      for (const t of c.contatos) insert.run(id,t.contato_id,t.funcao,Number(t.receber_email),JSON.stringify(t.tipos));
    }
    auditarCadastro(db,'cliente',id!,'salvar',{antes,depois:detalheCliente(db,id!)});
    return id!;
  })();
}
export function listarContatos(db: Db, escritorioId?: number) {
  return (db.prepare('SELECT * FROM contatos WHERE (? IS NULL OR escritorio_id=?) ORDER BY nome COLLATE NOCASE').all(escritorioId??null,escritorioId??null) as ContatoRow[]).map(c => ({...c,ativo:!!c.ativo,
    clientes:db.prepare(`SELECT c.id,c.razao_social,cc.receber_email,cc.funcao FROM clientes_contatos cc JOIN clientes c ON c.id=cc.cliente_id WHERE cc.contato_id=? ORDER BY c.razao_social`).all(c.id)}));
}
export function salvarContato(db: Db, id: number|null, raw: unknown, escritorioId?: number): number {
  if (id && escritorioId !== undefined) exigirCadastroEscritorio(db,'contatos',id,escritorioId);
  const c = ContatoSchema.parse(raw);
  if (id) exigir(db,'contatos',id);
  const possuiEscritorio = (db.prepare('PRAGMA table_info(contatos)').all() as {name:string}[]).some(col=>col.name==='escritorio_id');
  const dono = escritorioId ?? (id && possuiEscritorio ? (db.prepare('SELECT escritorio_id FROM contatos WHERE id=?').get(id) as {escritorio_id:number}).escritorio_id : 1);
  const duplicado = possuiEscritorio
    ? db.prepare('SELECT id FROM contatos WHERE email=? AND escritorio_id=? AND id<>?').get(c.email,dono,id??0)
    : db.prepare('SELECT id FROM contatos WHERE email=? AND id<>?').get(c.email,id??0);
  if (duplicado) throw new ErroCadastro('Já existe um contato com este e-mail neste escritório',409);
  return db.transaction(() => {
    const args = [c.nome,c.email,c.telefone,c.cargo,Number(c.ativo)];
    const antes=id?db.prepare('SELECT * FROM contatos WHERE id=?').get(id):null;
    if(id) db.prepare(`UPDATE contatos SET nome=?,email=?,telefone=?,cargo=?,ativo=?,atualizado_em=datetime('now') WHERE id=?`).run(...args,id);
    else id=Number((escritorioId === undefined
      ? db.prepare('INSERT INTO contatos(nome,email,telefone,cargo,ativo) VALUES (?,?,?,?,?)').run(...args)
      : db.prepare('INSERT INTO contatos(nome,email,telefone,cargo,ativo,escritorio_id) VALUES (?,?,?,?,?,?)').run(...args,escritorioId)).lastInsertRowid);
    auditarCadastro(db,'contato',id!,'salvar',{antes,depois:c});return id!;
  })();
}
export function excluirCadastro(db: Db, tabela: 'clientes'|'contatos', id: number, escritorioId?: number): void {
  if (escritorioId !== undefined) exigirCadastroEscritorio(db,tabela,id,escritorioId);
  exigir(db,tabela,id);
  const campo=tabela==='clientes'?'cliente_id':'contato_id';
  const usado=!!db.prepare(`SELECT id FROM envios_clientes WHERE ${campo}=? LIMIT 1`).get(id)
    || (tabela==='clientes'?!!db.prepare('SELECT numero_registro FROM clientes_documentos WHERE cliente_id=? LIMIT 1').get(id)
      :!!db.prepare('SELECT cliente_id FROM clientes_contatos WHERE contato_id=? LIMIT 1').get(id));
  const possuiRepresentante = tabela === 'clientes'
    && !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios_clientes'").get()
    && !!db.prepare('SELECT usuario_id FROM usuarios_clientes WHERE cliente_id=? LIMIT 1').get(id);
  if(usado || possuiRepresentante) throw new ErroCadastro('Cadastro possui vínculos ou histórico. Inative-o para preservar os registros.',409);
  db.transaction(() => {db.prepare(`DELETE FROM ${tabela} WHERE id=?`).run(id);auditarCadastro(db,tabela,id,'excluir',{});})();
}
export function registrarSindicatoDocumento(db: Db, numero: string, sindicatoId: number): void {
  db.prepare('INSERT OR IGNORE INTO registros_sindicatos(numero_registro,sindicato_id) VALUES (?,?)').run(numero,sindicatoId);
}
export function indexarMetaDocumento(db: Db, numero: string, textoOriginal: string): DocumentoMeta {
  const t=textoOriginal.replace(/\s+/g,' ');
  const trecho = t.match(/(?:abranger[áa]|abrange)\s+a\(s\)\s+categoria\(s\)([\s\S]{0,7000}?)(?=CL[ÁA]USULA\s+|$)/i)?.[1] ?? '';
  const cat = trecho.split(/com abrang[êe]ncia territorial/i)[0].trim().replace(/[,;:]+$/,'').trim();
  const territorio = trecho.match(/com abrang[êe]ncia territorial\s*(?:em|no|na)?\s*([\s\S]*)/i)?.[1]?.trim() ?? '';
  const datas = t.match(/vig[êe]ncia\s+(?:da|do)\s+(?:presente\s+)?(?:Conven[çc][ãa]o|Acordo|Termo)[\s\S]{0,160}?per[íi]odo\s+de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
  const iso = (s?:string) => s?.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1') ?? '';
  const cabecalhoPartes=textoOriginal.split(/CL[ÁA]USULA\s+/i)[0];
  const meta: DocumentoMeta={cnpjs:extrairCabecalho(cabecalhoPartes).cnpjs.map(normalizarCnpj),categoria:cat,abrangencia:territorio,inicio:iso(datas?.[1]),fim:iso(datas?.[2])};
  db.prepare('UPDATE registros SET documento_meta_json=? WHERE numero_registro=?').run(JSON.stringify(meta),numero);
  return meta;
}
export function contextoDocumentoCliente(db: Db, clienteId: number, numero: string): string {
  const cliente=db.prepare('SELECT cnpj,uf,municipio FROM clientes WHERE id=?').get(clienteId);
  const doc=db.prepare('SELECT arquivo_hash,documento_meta_json,tipo,vigencia FROM registros WHERE numero_registro=?').get(numero);
  // Pausar uma consulta não muda o enquadramento da empresa. Mantém a chave histórica
  // ativo=1 no fingerprint para preservar decisões de sindicatos anteriormente ativos.
  const vinculos=db.prepare(`SELECT cs.*,s.cnpj,1 AS ativo FROM clientes_sindicatos cs JOIN sindicatos s ON s.id=cs.sindicato_id
    WHERE cs.cliente_id=? AND cs.sindicato_id IN (SELECT sindicato_id FROM registros_sindicatos WHERE numero_registro=?) ORDER BY cs.sindicato_id`).all(clienteId,numero);
  return createHash('sha256').update(JSON.stringify({cliente,doc,vinculos})).digest('hex');
}
/** Coincidência de consulta cria candidato. Confirmação automática exige evidências do original. */
export function descobrirDocumentosClientes(db: Db, clienteId?: number, incluirHistorico=false, incluirNovosEnvios=true): number {
  // Também invalida associações que deixaram de aparecer na consulta após remover um vínculo.
  const anteriores=db.prepare(`SELECT cliente_id,numero_registro,contexto_hash FROM clientes_documentos ${clienteId?'WHERE cliente_id=?':''}`).all(...(clienteId?[clienteId]:[])) as {cliente_id:number;numero_registro:string;contexto_hash:string}[];
  for(const a of anteriores)if(contextoDocumentoCliente(db,a.cliente_id,a.numero_registro)!==a.contexto_hash)
    db.prepare(`UPDATE clientes_documentos SET status='candidato',motivo='Documento ou vínculos alterados. Confira novamente a aplicabilidade.',origem='regra',responsavel=NULL,justificativa=NULL WHERE cliente_id=? AND numero_registro=?`).run(a.cliente_id,a.numero_registro);
  const pares=db.prepare(`SELECT DISTINCT c.id cliente_id,r.numero_registro,c.criado_em,r.primeira_vez FROM clientes c JOIN registros r
    ON EXISTS (SELECT 1 FROM clientes_sindicatos cs JOIN registros_sindicatos rs ON rs.sindicato_id=cs.sindicato_id
      WHERE cs.cliente_id=c.id AND rs.numero_registro=r.numero_registro)
      OR instr(COALESCE(r.documento_meta_json,''),c.cnpj)>0
    WHERE c.ativo=1 ${clienteId?'AND c.id=?':''}`).all(...(clienteId?[clienteId]:[])) as {cliente_id:number;numero_registro:string;criado_em:string;primeira_vez:string}[];
  let total=0;
  for(const p of pares) {
    const hash=contextoDocumentoCliente(db,p.cliente_id,p.numero_registro);
    const old=db.prepare('SELECT * FROM clientes_documentos WHERE cliente_id=? AND numero_registro=?').get(p.cliente_id,p.numero_registro) as {contexto_hash:string;origem:string;incluir_envio:number;status:string}|undefined;
    if(old?.contexto_hash===hash) {if(incluirHistorico)db.prepare('UPDATE clientes_documentos SET incluir_envio=1 WHERE cliente_id=? AND numero_registro=?').run(p.cliente_id,p.numero_registro);continue;}
    const cliente=db.prepare('SELECT * FROM clientes WHERE id=?').get(p.cliente_id) as ClienteRow;
    const doc=db.prepare('SELECT tipo,documento_meta_json FROM registros WHERE numero_registro=?').get(p.numero_registro) as {tipo:string;documento_meta_json:string|null};
    const meta:DocumentoMeta=doc.documento_meta_json?JSON.parse(doc.documento_meta_json):{cnpjs:[],categoria:'',abrangencia:'',inicio:'',fim:''};
    const links=db.prepare(`SELECT cs.*,s.cnpj FROM clientes_sindicatos cs JOIN sindicatos s ON s.id=cs.sindicato_id
      JOIN registros_sindicatos rs ON rs.sindicato_id=cs.sindicato_id WHERE cs.cliente_id=? AND rs.numero_registro=?`).all(p.cliente_id,p.numero_registro) as {categoria:string;uf:string;municipio:string;cnpj:string;enquadramento_confirmado:number}[];
    const hoje=new Date().toISOString().slice(0,10);
    const dataValida=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
    const vigente=dataValida(meta.inicio)&&dataValida(meta.fim)&&meta.inicio<=meta.fim&&meta.inicio<=hoje&&meta.fim>=hoje;
    const acordo=/acordo coletivo/i.test(doc.tipo);
    const prova=links.some(l => {
      const categoria=normalizarTexto(l.categoria), cidade=normalizarTexto(l.municipio||cliente.municipio), estado=l.uf||cliente.uf;
      const ambigua=/exclu|exceto|ressalv|salvo|excetu/i.test(meta.categoria+' '+meta.abrangencia);
      return !!l.enquadramento_confirmado && !!categoria && !!cidade && !!estado && !!l.cnpj
        && meta.cnpjs.includes(normalizarCnpj(l.cnpj)) && !ambigua
        && normalizarTexto(meta.categoria)===categoria
        && normalizarTexto(meta.abrangencia).split(/[,;]/).some(x => x.trim().replace(/[.]$/,'')===cidade+'/'+estado.toLowerCase());
    });
    const confirmado=vigente && (acordo?meta.cnpjs.includes(cliente.cnpj):prova);
    const motivo=confirmado?'CNPJ e escopo documental conferidos por regras determinísticas.':'Confira categoria, município/UF, vigência e partes do documento antes de liberar o envio.';
    const incluir=old?.incluir_envio||incluirHistorico||(incluirNovosEnvios&&p.primeira_vez>=p.criado_em);
    db.prepare(`INSERT INTO clientes_documentos(cliente_id,numero_registro,status,motivo,contexto_hash,incluir_envio)
      VALUES (?,?,?,?,?,?) ON CONFLICT(cliente_id,numero_registro) DO UPDATE SET status=excluded.status,motivo=excluded.motivo,
      contexto_hash=excluded.contexto_hash,origem='regra',responsavel=NULL,justificativa=NULL,incluir_envio=excluded.incluir_envio,atualizado_em=datetime('now')`)
      .run(p.cliente_id,p.numero_registro,confirmado?'confirmado':'candidato',motivo,hash,Number(!!incluir));total++;
  }
  return total;
}
export function decidirDocumentoCliente(db:Db,clienteId:number,numero:string,status:'confirmado'|'rejeitado',responsavel:string,justificativa:string,incluirEnvio=true):void {
  if(!responsavel.trim()||!justificativa.trim())throw new ErroCadastro('Informe responsável e justificativa da decisão.');
  descobrirDocumentosClientes(db,clienteId,false,incluirEnvio);
  const row=db.prepare('SELECT * FROM clientes_documentos WHERE cliente_id=? AND numero_registro=?').get(clienteId,numero);
  if(!row)throw new ErroCadastro('Documento não relacionado ao cliente.',404);
  db.transaction(() => {
    db.prepare(`UPDATE clientes_documentos SET status=?,origem='manual',responsavel=?,justificativa=?,incluir_envio=?,atualizado_em=datetime('now')
      WHERE cliente_id=? AND numero_registro=?`).run(status,responsavel.trim().slice(0,250),justificativa.trim().slice(0,2000),Number(incluirEnvio),clienteId,numero);
    auditarCadastro(db,'documento_cliente',`${clienteId}:${numero}`,status,{antes:row,responsavel,justificativa});
  })();
}

