import type Database from 'better-sqlite3';

/** Recria somente contatos, preservando IDs e referências de histórico. */
export function migrarContatosPorEscritorio(db: Database.Database): void {
  const chave = '003-contatos-email-por-escritorio';
  if (db.prepare('SELECT chave FROM migracoes_aplicadas WHERE chave=?').get(chave)) return;
  if (db.inTransaction) throw new Error('Migração de contatos exige conexão fora de transação.');
  const estrangeiras = db.pragma('foreign_keys',{simple:true});
  const objetos = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND (type='trigger' OR (type='index' AND tbl_name='contatos'))")
    .all() as {type:string;name:string;sql:string}[];
  const sequencia = (db.prepare("SELECT seq FROM sqlite_sequence WHERE name='contatos'").get() as {seq:number}|undefined)?.seq ?? 0;
  db.pragma('foreign_keys=OFF');
  try {
    db.transaction(() => {
      // Triggers de outras tabelas também referenciam contatos e precisam ser restaurados.
      for (const objeto of objetos.filter(o=>o.type==='trigger')) db.exec(`DROP TRIGGER "${objeto.name.replace(/"/g,'""')}"`);
      db.exec(`CREATE TABLE contatos_novo (
        id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE,
        telefone TEXT NOT NULL DEFAULT '', cargo TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
        escritorio_id INTEGER NOT NULL DEFAULT 1 REFERENCES escritorios(id) ON DELETE RESTRICT,
        UNIQUE(escritorio_id,email)
      );
      INSERT INTO contatos_novo(id,nome,email,telefone,cargo,ativo,criado_em,atualizado_em,escritorio_id)
        SELECT id,nome,email,telefone,cargo,ativo,criado_em,atualizado_em,escritorio_id FROM contatos;
      DROP TABLE contatos;
      ALTER TABLE contatos_novo RENAME TO contatos;`);
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='contatos'").run(sequencia);
      for (const objeto of objetos) db.exec(objeto.sql);
      if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migração de contatos encontrou referências inválidas.');
      db.prepare('INSERT INTO migracoes_aplicadas(chave) VALUES (?)').run(chave);
    })();
  } finally { db.pragma(`foreign_keys=${estrangeiras ? 'ON' : 'OFF'}`); }
}
