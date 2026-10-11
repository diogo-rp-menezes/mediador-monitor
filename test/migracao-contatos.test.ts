import { afterEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrarContatosPorEscritorio } from '../src/migracao-contatos.js';
import { openDb } from '../src/db.js';
import { salvarContato } from '../src/cadastros.js';
import { salvarEscritorio } from '../src/organizacoes.js';
const bancos:Database.Database[]=[];
afterEach(()=>{for(const db of bancos.splice(0))db.close();});
function legado(){
  const db=new Database(':memory:');bancos.push(db);db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE migracoes_aplicadas(chave TEXT PRIMARY KEY);
    CREATE TABLE escritorios(id INTEGER PRIMARY KEY);INSERT INTO escritorios VALUES(1),(2);
    CREATE TABLE contatos(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      telefone TEXT NOT NULL DEFAULT '',cargo TEXT NOT NULL DEFAULT '',ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT 'antigo',atualizado_em TEXT NOT NULL DEFAULT 'antigo',escritorio_id INTEGER REFERENCES escritorios(id));
    CREATE INDEX idx_contatos_escritorio ON contatos(escritorio_id);
    CREATE TRIGGER contatos_escritorio_imutavel BEFORE UPDATE OF escritorio_id ON contatos
      WHEN NEW.escritorio_id<>OLD.escritorio_id BEGIN SELECT RAISE(ABORT,'Transferência bloqueada');END;
    CREATE TABLE clientes_contatos(cliente_id INTEGER,contato_id INTEGER REFERENCES contatos(id));
    CREATE TABLE envios_clientes(id INTEGER PRIMARY KEY,contato_id INTEGER REFERENCES contatos(id),snapshot_json TEXT);
    CREATE TABLE tentativas_envio(id INTEGER PRIMARY KEY,envio_id INTEGER REFERENCES envios_clientes(id));
    CREATE TRIGGER conferir_contato BEFORE INSERT ON clientes_contatos WHEN NOT EXISTS(SELECT id FROM contatos WHERE id=NEW.contato_id)
      BEGIN SELECT RAISE(ABORT,'Contato ausente');END;
    INSERT INTO contatos(id,nome,email,escritorio_id) VALUES(3,'Contato histórico','a@example.test',1),(70,'Excluído','apagado@example.test',1);
    DELETE FROM contatos WHERE id=70;
    INSERT INTO clientes_contatos VALUES(9,3);
    INSERT INTO envios_clientes VALUES(8,3,'{"email":"a@example.test"}');INSERT INTO tentativas_envio VALUES(1,8);`);
  return db;
}
it('preserva IDs, datas, vínculos, envios, tentativas e sequência; é idempotente',()=>{
  const db=legado(),antes=db.prepare('SELECT * FROM contatos').all(),envios=db.prepare('SELECT * FROM envios_clientes').all();
  migrarContatosPorEscritorio(db);migrarContatosPorEscritorio(db);
  expect(db.prepare('SELECT * FROM contatos').all()).toEqual(antes);
  expect(db.prepare('SELECT * FROM envios_clientes').all()).toEqual(envios);
  expect(db.prepare('SELECT * FROM clientes_contatos').all()).toEqual([{cliente_id:9,contato_id:3}]);
  expect(db.prepare('SELECT * FROM tentativas_envio').all()).toEqual([{id:1,envio_id:8}]);
  expect(db.pragma('foreign_key_check')).toEqual([]);expect(db.pragma('foreign_keys',{simple:true})).toBe(1);
  const novo=db.prepare('INSERT INTO contatos(nome,email,escritorio_id) VALUES (?,?,?)').run('Contato B','A@EXAMPLE.TEST',2);
  expect(Number(novo.lastInsertRowid)).toBeGreaterThan(70);
  expect(()=>db.prepare('INSERT INTO contatos(nome,email,escritorio_id) VALUES (?,?,?)').run('Duplicado','A@EXAMPLE.TEST',1)).toThrow(/UNIQUE/);
  expect(()=>db.prepare('UPDATE contatos SET escritorio_id=2 WHERE id=3').run()).toThrow(/Transferência/);
  expect(()=>db.prepare('INSERT INTO clientes_contatos VALUES(10,999)').run()).toThrow(/Contato ausente/);
});
it('falha sem perder tabela, histórico ou triggers e restaura foreign_keys',()=>{
  const db=legado();db.prepare('UPDATE contatos SET escritorio_id=NULL WHERE id=3').run();
  expect(()=>migrarContatosPorEscritorio(db)).toThrow(/NOT NULL/);
  expect(db.prepare('SELECT id FROM contatos').all()).toEqual([{id:3}]);
  expect(db.prepare('SELECT * FROM migracoes_aplicadas').all()).toEqual([]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='contatos_novo'").get()).toBeUndefined();
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='conferir_contato'").get()).toBeTruthy();
  expect(db.pragma('foreign_keys',{simple:true})).toBe(1);
});
it('serviço permite e-mail repetido entre escritórios e edição mantém escopo inclusive no painel global',()=>{
  const db=openDb(':memory:');bancos.push(db);const b=salvarEscritorio(db,null,{nome:'Escritório B',cnpj:'04252011000110'});
  salvarContato(db,null,{nome:'Contato A',email:'igual@example.test'},1);
  const id=salvarContato(db,null,{nome:'Contato B',email:'IGUAL@example.test'},b);
  expect(()=>salvarContato(db,null,{nome:'Duplicado',email:'igual@example.test'},b)).toThrow(/Já existe/);
  expect(salvarContato(db,id,{nome:'Contato B editado',email:'igual@example.test'})).toBe(id);
  expect(()=>db.prepare('INSERT INTO contatos(nome,email,escritorio_id) VALUES (?,?,NULL)').run('Inválido','outro@example.test')).toThrow(/NOT NULL/);
});
