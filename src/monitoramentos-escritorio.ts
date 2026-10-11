import type Database from 'better-sqlite3';
import { z } from 'zod';
import { cnpjValido, ErroCadastro, normalizarCnpj } from './cadastros.js';
import { normalizarTipos, TIPOS_VALIDOS } from './instrumentos.js';

type Banco = Database.Database;
const texto = z.string().trim().max(500).default('');
export const MonitoramentoSchema = z.object({
  sindicato_id:z.number().int().positive().safe(), nome:z.string().trim().min(2).max(250),
  cnpj_filtro:texto.transform(normalizarCnpj).refine(v=>!v||cnpjValido(v),'CNPJ inválido'), categoria:texto,
  uf:texto.transform(v=>v.toUpperCase()).refine(v=>!v||/^[A-Z]{2}$/.test(v),'UF inválida'),
  tipos:z.array(z.string()).min(1).max(9).refine(v=>v.every(t=>TIPOS_VALIDOS.has(t)),'Tipo inválido').transform(v=>normalizarTipos(v)),
  vigencia:texto, titulo:texto, ativo:z.boolean().default(true)
}).strict().refine(v=>!!(v.cnpj_filtro||v.categoria||v.titulo),'Informe CNPJ, categoria ou título para consultar.');
interface LinhaMonitoramento {id:number;escritorio_id:number;sindicato_id:number;nome:string;cnpj_filtro:string;
  categoria:string;uf:string;tipos_json:string;vigencia:string;titulo:string;ativo:number;[chave:string]:unknown}
const vista = (row:LinhaMonitoramento) => {
  const {tipos_json,...dados}=row;
  return {...dados,tipos:JSON.parse(tipos_json) as string[],ativo:!!row.ativo};
};
export function migrarMonitoramentosEscritorio(db:Banco):void {
  const chave='004-monitoramentos-por-escritorio';
  if(db.prepare('SELECT chave FROM migracoes_aplicadas WHERE chave=?').get(chave))return;
  db.transaction(()=>{
    db.exec(`CREATE TABLE monitoramentos_escritorios (
      id INTEGER PRIMARY KEY AUTOINCREMENT, escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
      sindicato_id INTEGER NOT NULL REFERENCES sindicatos(id) ON DELETE RESTRICT, nome TEXT NOT NULL,
      cnpj_filtro TEXT NOT NULL DEFAULT '', categoria TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '',
      tipos_json TEXT NOT NULL, vigencia TEXT NOT NULL DEFAULT '', titulo TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
      criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(escritorio_id,sindicato_id)
    );
    CREATE TRIGGER monitoramentos_propriedade BEFORE UPDATE OF escritorio_id,sindicato_id ON monitoramentos_escritorios
      WHEN NEW.escritorio_id<>OLD.escritorio_id OR NEW.sindicato_id<>OLD.sindicato_id
      BEGIN SELECT RAISE(ABORT,'Propriedade do monitoramento é imutável'); END;
    INSERT INTO monitoramentos_escritorios(escritorio_id,sindicato_id,nome,cnpj_filtro,categoria,uf,tipos_json,vigencia,titulo,ativo)
      SELECT 1,id,nome,cnpj,categoria,uf,tipos_json,vigencia,titulo,ativo FROM sindicatos;
    INSERT OR IGNORE INTO monitoramentos_escritorios(escritorio_id,sindicato_id,nome,cnpj_filtro,categoria,uf,tipos_json,vigencia,titulo,ativo)
      SELECT DISTINCT c.escritorio_id,s.id,s.nome,s.cnpj,s.categoria,s.uf,s.tipos_json,s.vigencia,s.titulo,s.ativo
      FROM clientes_sindicatos cs JOIN clientes c ON c.id=cs.cliente_id JOIN sindicatos s ON s.id=cs.sindicato_id;`);
    db.prepare('INSERT INTO migracoes_aplicadas(chave) VALUES (?)').run(chave);
  })();
}
export function listarCatalogoSindicatos(db:Banco,escritorioId:number) {
  // Somente identidade compartilhada. Filtros e contadores globais não entram nessa projeção.
  return db.prepare(`SELECT s.id,s.nome,s.cnpj,
    (SELECT COUNT(*) FROM clientes_sindicatos cs JOIN clientes c ON c.id=cs.cliente_id
      WHERE cs.sindicato_id=s.id AND c.escritorio_id=?) clientes_total
    FROM sindicatos s ORDER BY s.nome COLLATE NOCASE,s.id`).all(escritorioId);
}
export function listarMonitoramentos(db:Banco,escritorioId:number) {
  return (db.prepare(`SELECT m.*,s.nome sindicato_nome,s.cnpj sindicato_cnpj FROM monitoramentos_escritorios m
    JOIN sindicatos s ON s.id=m.sindicato_id WHERE m.escritorio_id=? ORDER BY m.nome COLLATE NOCASE,m.id`).all(escritorioId) as LinhaMonitoramento[]).map(vista);
}
export function obterMonitoramento(db:Banco,escritorioId:number,id:number) {
  const row=db.prepare('SELECT * FROM monitoramentos_escritorios WHERE id=? AND escritorio_id=?').get(id,escritorioId) as LinhaMonitoramento|undefined;
  if(!row)throw new ErroCadastro('Monitoramento não encontrado.',404);
  return vista(row);
}
export function salvarMonitoramento(db:Banco,escritorioId:number,id:number|null,raw:unknown):number {
  if(id)obterMonitoramento(db,escritorioId,id);
  const dados=MonitoramentoSchema.parse(raw);
  if(!db.prepare('SELECT id FROM sindicatos WHERE id=?').get(dados.sindicato_id))throw new ErroCadastro('Sindicato não encontrado.',404);
  if(id && obterMonitoramento(db,escritorioId,id).sindicato_id!==dados.sindicato_id)throw new ErroCadastro('Sindicato do monitoramento não pode ser alterado.',409);
  if(db.prepare('SELECT id FROM monitoramentos_escritorios WHERE escritorio_id=? AND sindicato_id=? AND id<>?').get(escritorioId,dados.sindicato_id,id??0))
    throw new ErroCadastro('Este sindicato já está configurado neste escritório.',409);
  const args=[dados.nome,dados.cnpj_filtro,dados.categoria,dados.uf,JSON.stringify(dados.tipos),dados.vigencia,dados.titulo,Number(dados.ativo)];
  if(id){db.prepare("UPDATE monitoramentos_escritorios SET nome=?,cnpj_filtro=?,categoria=?,uf=?,tipos_json=?,vigencia=?,titulo=?,ativo=?,atualizado_em=datetime('now') WHERE id=? AND escritorio_id=?").run(...args,id,escritorioId);return id;}
  return Number(db.prepare('INSERT INTO monitoramentos_escritorios(nome,cnpj_filtro,categoria,uf,tipos_json,vigencia,titulo,ativo,sindicato_id,escritorio_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(...args,dados.sindicato_id,escritorioId).lastInsertRowid);
}
export function excluirMonitoramento(db:Banco,escritorioId:number,id:number):void {
  const item=obterMonitoramento(db,escritorioId,id);
  if(db.prepare(`SELECT cs.cliente_id FROM clientes_sindicatos cs JOIN clientes c ON c.id=cs.cliente_id
    WHERE cs.sindicato_id=? AND c.escritorio_id=? LIMIT 1`).get(item.sindicato_id,escritorioId))
    throw new ErroCadastro('Sindicato vinculado a clientes. Inative o monitoramento para preservar os vínculos.',409);
  db.prepare('DELETE FROM monitoramentos_escritorios WHERE id=? AND escritorio_id=?').run(id,escritorioId);
}
