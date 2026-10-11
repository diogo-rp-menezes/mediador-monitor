import type { Db } from './db.js';

/** O legado fica preservado; nunca é herdado por um novo escritório. */
export function migrarInterpretacoes(db: Db) {
  const chave='005-interpretacoes-escritorio';
  if(db.prepare('SELECT 1 FROM migracoes_aplicadas WHERE chave=?').get(chave))return;
  db.transaction(()=>{
    db.exec(`
      CREATE TABLE vinculos_escritorio (
        escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
        aditivo TEXT NOT NULL REFERENCES registros(numero_registro) ON DELETE RESTRICT,
        base TEXT REFERENCES registros(numero_registro) ON DELETE RESTRICT,
        justificativa TEXT NOT NULL, ator_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
        revisao INTEGER NOT NULL DEFAULT 1, atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(escritorio_id,aditivo)
      );
      CREATE TABLE interpretacoes_escritorio (
        escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
        base TEXT NOT NULL REFERENCES registros(numero_registro) ON DELETE RESTRICT,
        entrada_hash TEXT NOT NULL, resultado_json TEXT NOT NULL, revisoes_json TEXT NOT NULL DEFAULT '[]',
        versao TEXT NOT NULL, atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(escritorio_id,base)
      );
      CREATE TABLE versoes_interpretacao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
        base TEXT NOT NULL, versao TEXT NOT NULL, resultado_json TEXT NOT NULL,
        ator_id INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(escritorio_id,base,versao)
      );
      CREATE TABLE historico_interpretacoes_legado (
        escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
        entidade TEXT NOT NULL, conteudo_json TEXT NOT NULL
      );
      CREATE INDEX idx_vinculos_escritorio_base ON vinculos_escritorio(escritorio_id,base);
      CREATE INDEX idx_auditoria_seguranca_escritorio ON auditoria_seguranca(escritorio_id,id);
    `);
    for(const tabela of ['vinculos_aditivos','revisoes_pendencias','auditoria_revisoes','consolidacoes_cct']) {
      for(const row of db.prepare(`SELECT * FROM ${tabela}`).all())
        db.prepare('INSERT INTO historico_interpretacoes_legado VALUES (1,?,?)').run(tabela,JSON.stringify(row));
    }
    db.exec(`INSERT INTO vinculos_escritorio(escritorio_id,aditivo,base,justificativa)
      SELECT 1,aditivo_registro,base_registro,COALESCE(evidencia,'Vínculo legado: conferir antes de consolidar')
      FROM vinculos_aditivos WHERE status IN ('confirmado','automatico','rejeitado')`);
    for(const tabela of ['vinculos_escritorio','interpretacoes_escritorio','versoes_interpretacao','historico_interpretacoes_legado'])
      db.exec(`CREATE TRIGGER ${tabela}_proprietario BEFORE UPDATE OF escritorio_id ON ${tabela}
        WHEN NEW.escritorio_id<>OLD.escritorio_id BEGIN SELECT RAISE(ABORT,'Proprietário imutável'); END;`);
    db.prepare('INSERT INTO migracoes_aplicadas(chave) VALUES (?)').run(chave);
  })();
}
