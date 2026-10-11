import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { openDb } from '../src/db.js';
import { migrarCadastros, salvarCliente, salvarContato } from '../src/cadastros.js';
import { excluirEscritorio, listarEscritorios, listarVinculosUsuario, migrarOrganizacoes, obterEscritorio,
  obterUsuario, revogarVinculo, salvarEscritorio, salvarUsuario, vincularUsuarioCliente, vincularUsuarioEscritorio } from '../src/organizacoes.js';

const bancos: Database.Database[] = [];
const banco = () => { const db = openDb(':memory:'); bancos.push(db); return db; };
const escritorio = { nome: 'Escritório Alfa', cnpj: '11.222.333/0001-81', email: 'alfa@example.test' };
const usuario = { nome: 'Maria Silva', email: 'maria@example.test' };
const cliente = { razao_social: 'Empresa Beta', cnpj: '11.444.777/0001-61' };
function clienteDoEscritorio(db: Database.Database, escritorioId: number, cnpj = cliente.cnpj) {
  return Number(db.prepare('INSERT INTO clientes(razao_social,cnpj,escritorio_id) VALUES (?,?,?)')
    .run(cliente.razao_social, cnpj, escritorioId).lastInsertRowid);
}
afterEach(() => { for (const db of bancos.splice(0)) db.close(); });

describe('migração de organizações', () => {
  it('atribui dados antigos ao escritório inicial sem modificar seus conteúdos e vínculos', () => {
    const db = new Database(':memory:'); bancos.push(db); db.pragma('foreign_keys=ON');
    db.exec(`CREATE TABLE registros(numero_registro TEXT PRIMARY KEY,watch TEXT,extracao_json TEXT,notificado INTEGER);
      CREATE TABLE sindicatos(id INTEGER PRIMARY KEY,nome TEXT,cnpj TEXT,ativo INTEGER);
      INSERT INTO registros VALUES('DF000001/2020','Legado','{"campos":{"salario":"preservar"}}',1);`);
    migrarCadastros(db);
    const cid = salvarCliente(db, null, cliente);
    const tid = salvarContato(db, null, { nome: 'Contato existente', email: 'existente@example.test' });
    db.prepare('INSERT INTO clientes_contatos(cliente_id,contato_id) VALUES (?,?)').run(cid, tid);
    const antes = db.prepare('SELECT * FROM registros').get();
    migrarOrganizacoes(db);
    expect(db.prepare('SELECT * FROM registros').get()).toEqual(antes);
    expect(db.prepare('SELECT escritorio_id FROM clientes WHERE id=?').get(cid)).toEqual({ escritorio_id: 1 });
    expect(db.prepare('SELECT escritorio_id FROM contatos WHERE id=?').get(tid)).toEqual({ escritorio_id: 1 });
    expect(db.prepare('SELECT cliente_id,contato_id FROM clientes_contatos').get()).toEqual({ cliente_id: cid, contato_id: tid });
    expect(listarEscritorios(db)).toHaveLength(1);
  });
  it('é idempotente e não cria contas ou altera um escritório já editado', () => {
    const db = banco(); salvarEscritorio(db, 1, { ...escritorio, nome: 'Nome conferido' });
    migrarOrganizacoes(db); migrarOrganizacoes(db);
    expect(obterEscritorio(db, 1).nome).toBe('Nome conferido');
    expect(db.prepare('SELECT COUNT(*) total FROM usuarios').get()).toEqual({ total: 0 });
    expect(db.prepare("SELECT COUNT(*) total FROM migracoes_aplicadas WHERE chave='001-organizacoes-identidade'").get()).toEqual({ total: 1 });
    expect(db.prepare("SELECT COUNT(*) total FROM auditoria_clientes WHERE entidade='migracao'").get()).toEqual({ total: 1 });
  });
  it('reverte DDL e backfill quando a migração falha', () => {
    const db = new Database(':memory:'); bancos.push(db);
    db.exec('CREATE TABLE clientes(id INTEGER PRIMARY KEY); CREATE TABLE contatos(id INTEGER PRIMARY KEY);');
    expect(() => migrarOrganizacoes(db)).toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='escritorios'").get()).toBeUndefined();
    expect(db.prepare('PRAGMA table_info(clientes)').all().map((r: any) => r.name)).toEqual(['id']);
    expect(db.prepare('SELECT COUNT(*) total FROM migracoes_aplicadas').get()).toEqual({ total: 0 });
  });
  it('mantém os novos cadastros locais no escritório inicial e bloqueia proprietários inválidos', () => {
    const db = banco(), cid = salvarCliente(db, null, cliente);
    const tid = salvarContato(db, null, { nome: 'Contato', email: 'contato@example.test' });
    expect(db.prepare('SELECT escritorio_id FROM clientes WHERE id=?').get(cid)).toEqual({ escritorio_id: 1 });
    expect(db.prepare('SELECT escritorio_id FROM contatos WHERE id=?').get(tid)).toEqual({ escritorio_id: 1 });
    expect(() => clienteDoEscritorio(db, 999, '04.252.011/0001-10')).toThrow(/FOREIGN KEY/);
    expect(() => db.prepare('UPDATE clientes SET escritorio_id=NULL WHERE id=?').run(cid)).toThrow(/Escritório obrigatório/);
  });
});

describe('cadastro de escritórios', () => {
  it('cria, normaliza, atualiza, inativa e exclui cadastro sem dependências', () => {
    const db = banco(), id = salvarEscritorio(db, null, escritorio);
    expect(obterEscritorio(db, id)).toMatchObject({ nome: escritorio.nome, cnpj: '11222333000181', ativo: true });
    salvarEscritorio(db, id, { ...escritorio, nome: 'Nome atualizado', ativo: false });
    expect(obterEscritorio(db, id)).toMatchObject({ nome: 'Nome atualizado', ativo: false });
    excluirEscritorio(db, id);
    expect(() => obterEscritorio(db, id)).toThrow(/não encontrado/);
    expect(db.prepare("SELECT acao FROM auditoria_clientes WHERE entidade='escritorio' AND entidade_id=? ORDER BY id").all(String(id)))
      .toEqual([{ acao: 'salvar' }, { acao: 'salvar' }, { acao: 'excluir' }]);
  });
  it('bloqueia CNPJ inválido, duplicado, ID inexistente e campos não reconhecidos', () => {
    const db = banco(); salvarEscritorio(db, null, escritorio);
    expect(() => salvarEscritorio(db, null, escritorio)).toThrow(/CNPJ/);
    expect(() => salvarEscritorio(db, null, { ...escritorio, cnpj: '123' })).toThrow(/CNPJ/);
    expect(() => salvarEscritorio(db, 999, escritorio)).toThrow(/não encontrado/);
    expect(() => salvarEscritorio(db, null, { ...escritorio, superadmin: true })).toThrow();
  });
  it('preserva o escritório inicial e escritórios com clientes ou vínculos revogados', () => {
    const db = banco(), id = salvarEscritorio(db, null, escritorio);
    expect(() => excluirEscritorio(db, 1)).toThrow(/preservado/);
    clienteDoEscritorio(db, id);
    expect(() => excluirEscritorio(db, id)).toThrow(/Inative/);
    const outro = salvarEscritorio(db, null, { ...escritorio, cnpj: '04.252.011/0001-10' });
    const uid = salvarUsuario(db, null, usuario);
    vincularUsuarioEscritorio(db, uid, outro, 'operador'); revogarVinculo(db, uid, 'escritorio', outro);
    expect(() => excluirEscritorio(db, outro)).toThrow(/Inative/);
  });
});

describe('identidades e vínculos', () => {
  it('mantém usuário separado do contato, com e-mail normalizado e sem privilégios globais', () => {
    const db = banco(); salvarContato(db, null, { nome: usuario.nome, email: usuario.email });
    const uid = salvarUsuario(db, null, { ...usuario, email: ' MARIA@example.test ' });
    expect(obterUsuario(db, uid).email).toBe(usuario.email);
    expect(listarVinculosUsuario(db, uid)).toEqual({ escritorios: [], clientes: [] });
    expect(() => salvarUsuario(db, null, usuario)).toThrow(/e-mail/);
    expect(() => salvarUsuario(db, uid, { ...usuario, papel: 'superadmin' })).toThrow();
  });
  it('permite papéis diferentes por escritório, atualiza vínculo e revoga sem apagar histórico', () => {
    const db = banco(), uid = salvarUsuario(db, null, usuario), eid = salvarEscritorio(db, null, escritorio);
    vincularUsuarioEscritorio(db, uid, 1, 'administrador'); vincularUsuarioEscritorio(db, uid, eid, 'operador');
    expect(listarVinculosUsuario(db, uid).escritorios).toHaveLength(2);
    vincularUsuarioEscritorio(db, uid, eid, 'administrador');
    expect(db.prepare('SELECT papel FROM usuarios_escritorios WHERE usuario_id=? AND escritorio_id=?').get(uid, eid)).toEqual({ papel: 'administrador' });
    revogarVinculo(db, uid, 'escritorio', eid);
    expect(listarVinculosUsuario(db, uid).escritorios).toHaveLength(1);
    expect(db.prepare('SELECT ativo FROM usuarios_escritorios WHERE usuario_id=? AND escritorio_id=?').get(uid, eid)).toEqual({ ativo: 0 });
    expect(() => revogarVinculo(db, uid, 'escritorio', eid)).toThrow(/não encontrado/);
    vincularUsuarioEscritorio(db, uid, eid, 'operador');
    expect(listarVinculosUsuario(db, uid).escritorios).toHaveLength(2);
  });
  it('deriva o escritório da empresa e permite múltiplas empresas sem vínculo de funcionário', () => {
    const db = banco(), uid = salvarUsuario(db, null, usuario), eid = salvarEscritorio(db, null, escritorio);
    const cid = clienteDoEscritorio(db, eid), outro = salvarCliente(db, null, { ...cliente, cnpj: '04.252.011/0001-10' });
    vincularUsuarioCliente(db, uid, cid); vincularUsuarioCliente(db, uid, outro); vincularUsuarioCliente(db, uid, cid);
    expect(listarVinculosUsuario(db, uid)).toMatchObject({ escritorios: [], clientes: expect.arrayContaining([
      expect.objectContaining({ id: cid, escritorio_id: eid }), expect.objectContaining({ id: outro, escritorio_id: 1 })
    ]) });
    expect(listarVinculosUsuario(db, uid).clientes).toHaveLength(2);
    revogarVinculo(db, uid, 'cliente', cid);
    expect(listarVinculosUsuario(db, uid).clientes).toHaveLength(1);
  });
  it('rejeita entidades inexistentes, papel arbitrário e novas associações com entidades inativas', () => {
    const db = banco(), uid = salvarUsuario(db, null, usuario), eid = salvarEscritorio(db, null, escritorio);
    expect(() => vincularUsuarioEscritorio(db, 999, eid, 'operador')).toThrow(/não encontrado/);
    expect(() => vincularUsuarioEscritorio(db, uid, 999, 'operador')).toThrow(/não encontrado/);
    expect(() => vincularUsuarioEscritorio(db, uid, eid, 'superadmin' as any)).toThrow();
    expect(() => vincularUsuarioCliente(db, uid, 999)).toThrow(/não encontrado/);
    const cid = salvarCliente(db, null, { ...cliente, ativo: false });
    expect(() => vincularUsuarioCliente(db, uid, cid)).toThrow(/Cliente inativo/);
    salvarEscritorio(db, eid, { ...escritorio, ativo: false });
    expect(() => vincularUsuarioEscritorio(db, uid, eid, 'operador')).toThrow(/Escritório inativo/);
    salvarUsuario(db, uid, { ...usuario, ativo: false });
    expect(() => vincularUsuarioEscritorio(db, uid, 1, 'operador')).toThrow(/Usuário inativo/);
  });
  it('oculta vínculos quando escritório, empresa ou usuário são inativados', () => {
    const db = banco(), uid = salvarUsuario(db, null, usuario), eid = salvarEscritorio(db, null, escritorio);
    const cid = clienteDoEscritorio(db, eid); vincularUsuarioCliente(db, uid, cid); vincularUsuarioEscritorio(db, uid, eid, 'operador');
    db.prepare('UPDATE clientes SET ativo=0 WHERE id=?').run(cid);
    expect(listarVinculosUsuario(db, uid).clientes).toHaveLength(0);
    db.prepare('UPDATE clientes SET ativo=1 WHERE id=?').run(cid);
    salvarEscritorio(db, eid, { ...escritorio, ativo: false });
    expect(listarVinculosUsuario(db, uid)).toEqual({ escritorios: [], clientes: [] });
    salvarEscritorio(db, eid, escritorio); salvarUsuario(db, uid, { ...usuario, ativo: false });
    expect(listarVinculosUsuario(db, uid)).toEqual({ escritorios: [], clientes: [] });
  });
});

describe('integridade de propriedade', () => {
  it('impede vínculo de empresa com escritório diferente mesmo por SQL direto', () => {
    const db = banco(), uid = salvarUsuario(db, null, usuario), eid = salvarEscritorio(db, null, escritorio);
    const cid = clienteDoEscritorio(db, eid);
    expect(() => db.prepare('INSERT INTO usuarios_clientes(usuario_id,cliente_id,escritorio_id) VALUES (?,?,?)').run(uid, cid, 1)).toThrow(/FOREIGN KEY/);
  });
  it('impede associação e alteração de contatos de outro escritório', () => {
    const db = banco(), eid = salvarEscritorio(db, null, escritorio), cid = clienteDoEscritorio(db, eid);
    const tid = salvarContato(db, null, { nome: 'Contato inicial', email: 'contato@example.test' });
    expect(() => db.prepare('INSERT INTO clientes_contatos(cliente_id,contato_id) VALUES (?,?)').run(cid, tid)).toThrow(/diferentes/);
    const local = salvarCliente(db, null, { ...cliente, cnpj: '04.252.011/0001-10', contatos: [{ contato_id: tid }] });
    expect(() => db.prepare('UPDATE clientes_contatos SET cliente_id=? WHERE cliente_id=?').run(cid, local)).toThrow(/diferentes/);
  });
  it('bloqueia transferência de propriedade fora de um fluxo explícito', () => {
    const db = banco(), eid = salvarEscritorio(db, null, escritorio), cid = salvarCliente(db, null, cliente);
    const tid = salvarContato(db, null, { nome: 'Contato inicial', email: 'contato@example.test' });
    expect(() => db.prepare('UPDATE clientes SET escritorio_id=? WHERE id=?').run(eid, cid)).toThrow(/Transferência/);
    expect(() => db.prepare('UPDATE contatos SET escritorio_id=? WHERE id=?').run(eid, tid)).toThrow(/Transferência/);
  });
});
