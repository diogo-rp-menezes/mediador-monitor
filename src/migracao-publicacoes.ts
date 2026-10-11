import type Database from 'better-sqlite3';
type Banco=Database.Database;
export function migrarPublicacoes(db:Banco){
 const key='007-publicacoes-portal-auditoria'; if(db.prepare('SELECT 1 FROM migracoes_aplicadas WHERE chave=?').get(key))return;
 db.transaction(()=>{db.exec(`CREATE TABLE publicacoes_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT, base TEXT NOT NULL,
  versao TEXT NOT NULL, hash_pdf TEXT NOT NULL, relatorio_json TEXT NOT NULL, pdf BLOB NOT NULL,
  ator_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'ativa' CHECK(estado IN ('ativa','revogada')),
  criada_em TEXT NOT NULL DEFAULT (datetime('now')), revogada_em TEXT,
  UNIQUE(escritorio_id,cliente_id,base,versao)
 );
 CREATE INDEX idx_publicacoes_cliente ON publicacoes_documentos(escritorio_id,cliente_id,estado,id DESC);
 CREATE TRIGGER publicacoes_propriedade BEFORE UPDATE OF escritorio_id,cliente_id,base,versao ON publicacoes_documentos
 WHEN NEW.escritorio_id<>OLD.escritorio_id OR NEW.cliente_id<>OLD.cliente_id OR NEW.base<>OLD.base OR NEW.versao<>OLD.versao
 BEGIN SELECT RAISE(ABORT,'Propriedade e versão da publicação são imutáveis'); END;
 CREATE TABLE auditoria_acessos_publicacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  publicacao_id INTEGER REFERENCES publicacoes_documentos(id) ON DELETE RESTRICT,
  versao TEXT NOT NULL, ator_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  evento TEXT NOT NULL CHECK(evento IN ('publicada','revogada','abertura_autorizada','download_servido','ciencia_confirmada','acesso_negado')),
  resultado TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')), ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '', request_id TEXT NOT NULL DEFAULT ''
 );
 CREATE INDEX idx_auditoria_publicacoes ON auditoria_acessos_publicacoes(escritorio_id,id DESC);
 CREATE TRIGGER auditoria_publicacoes_sem_update BEFORE UPDATE ON auditoria_acessos_publicacoes BEGIN SELECT RAISE(ABORT,'Auditoria imutável'); END;
 CREATE TRIGGER auditoria_publicacoes_sem_delete BEFORE DELETE ON auditoria_acessos_publicacoes BEGIN SELECT RAISE(ABORT,'Auditoria preservada'); END;
 CREATE TABLE notificacoes_publicacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, publicacao_id INTEGER NOT NULL REFERENCES publicacoes_documentos(id) ON DELETE RESTRICT,
  escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT, cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT, destino TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','enviando','enviado','falhou','incerto','cancelado')),
  tentativas INTEGER NOT NULL DEFAULT 0, erro TEXT, criada_em TEXT NOT NULL DEFAULT (datetime('now')), enviada_em TEXT,
  UNIQUE(publicacao_id,destino)
 );
 CREATE INDEX idx_notificacoes_publicacao_estado ON notificacoes_publicacoes(escritorio_id,estado,id);
 CREATE TRIGGER publicacoes_cliente_mesmo_escritorio BEFORE INSERT ON publicacoes_documentos
 WHEN NOT EXISTS(SELECT 1 FROM clientes WHERE id=NEW.cliente_id AND escritorio_id=NEW.escritorio_id)
 BEGIN SELECT RAISE(ABORT,'Cliente não pertence ao escritório'); END;`);db.prepare('INSERT INTO migracoes_aplicadas(chave) VALUES(?)').run(key);})();
}
