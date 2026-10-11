import { describe, expect, it, vi } from 'vitest';
import type { QueryResult } from 'pg';
import { excluirMonitoramentoPostgres, inativarEscritorioPostgres, listarCatalogoSindicatosPostgres, listarClientesPostgres, listarContatosPostgres, listarEscritoriosPostgres, listarMonitoramentosPostgres, listarVinculosUsuarioPostgres, obterClientePostgres, obterEscritorioPostgres, obterUsuarioPostgres, obterMonitoramentoPostgres, salvarClientePostgres, salvarContatoPostgres, salvarMonitoramentoPostgres, salvarEscritorioPostgres, salvarUsuarioPostgres, vincularUsuarioEscritorioPostgres, type PostgresQueryable } from '../src/postgres-organizacoes.js';
import { withPostgresTransaction } from '../src/postgres-transaction.js';
import type { Pool, PoolClient } from 'pg';

function queryStub(rows: Record<string, unknown>[] = []): PostgresQueryable {
  return { query: vi.fn(async () => ({ rows, command: 'SELECT', rowCount: rows.length, oid: 0, fields: [] }) as unknown as QueryResult) };
}

it('reutiliza PoolClient realista com connect e release sem reconectar ao listar vínculos',async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({rows:[{id:7,ativo:true}],rowCount:1}).mockResolvedValue({rows:[],rowCount:0}),connect:vi.fn(async()=>{throw new Error('already connected');}),release:vi.fn()} as unknown as PoolClient;
  await expect(listarVinculosUsuarioPostgres(client,7)).resolves.toEqual({escritorios:[],clientes:[]});
  expect(client.connect).not.toHaveBeenCalled();
});

describe('consultas PostgreSQL de organizações', () => {
  it('lista escritórios com contagens e ordem estável', async () => {
    const db = queryStub([{ id: 4, nome: 'Gconta', clientes_total: 3, usuarios_total: 2 }]);
    await expect(listarEscritoriosPostgres(db)).resolves.toEqual([{ id: 4, nome: 'Gconta', clientes_total: 3, usuarios_total: 2 }]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY lower(e.nome), e.id'));
  });

  it('busca escritório por parâmetro e retorna null quando ausente', async () => {
    const db = queryStub();
    await expect(obterEscritorioPostgres(db, 7)).resolves.toBeNull();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id=$1'), [7]);
  });

  it('lista somente clientes do escritório informado e rejeita ids inválidos', async () => {
    const db = queryStub([{ id: 11, escritorio_id: 7, razao_social: 'Empresa A' }]);
    await expect(listarClientesPostgres(db, 7)).resolves.toEqual([{ id: 11, escritorio_id: 7, razao_social: 'Empresa A' }]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE escritorio_id=$1'), [7]);
    await expect(listarClientesPostgres(db, 0)).rejects.toThrow('Identificador inválido');
  });

  it('lista contatos sempre filtrando pelo escritório ativo do contexto',async()=>{
    const db=queryStub([{id:2,escritorio_id:8,nome:'Contato',clientes:[]}]);
    await expect(listarContatosPostgres(db,8)).resolves.toEqual([{id:2,escritorio_id:8,nome:'Contato',clientes:[]}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE c.escritorio_id=$1'),[8]);
  });

  it('não revela cliente existente fora do escritório consultado',async()=>{
    const db=queryStub();
    await expect(obterClientePostgres(db,20,10)).rejects.toMatchObject({status:404});
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id=$1 AND escritorio_id=$2'),[10,20]);
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('não permite atualizar contato pertencente a outro escritório',async()=>{
    const db=queryStub();
    await expect(salvarContatoPostgres(db as never,20,10,{nome:'Contato Teste',email:'teste@example.test'},3)).rejects.toMatchObject({status:404});
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE c.id=$1 AND c.escritorio_id=$2'),[10,20]);
  });

  it('audita cadastro do cliente na mesma conexão e conserva escopo explícito',async()=>{
    const after={id:5,escritorio_id:20,razao_social:'Empresa Teste',cnpj:'11222333000181',dados_cnpj_json:null};
    const db=queryStub();let call=0;
    vi.mocked(db.query).mockImplementation(async()=>{
      call++;
      const rows=call===1?[]:call===2?[{id:5}]:call===3?[after]:call===4?[{sindicatos:[],contatos:[]}]:[];
      return {rows,command:'SELECT',rowCount:rows.length,oid:0,fields:[]} as unknown as QueryResult;
    });
    await expect(salvarClientePostgres(db as never,20,null,{razao_social:'Empresa Teste',cnpj:'11222333000181'},3)).resolves.toBe(5);
    expect(db.query).toHaveBeenNthCalledWith(1,expect.stringContaining('SELECT id FROM clientes WHERE cnpj=$1'),['11222333000181',null]);
    expect(db.query).toHaveBeenNthCalledWith(2,expect.stringContaining('INSERT INTO clientes(escritorio_id'),[20,'Empresa Teste','','11222333000181','','',true,'revisao',null]);
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO auditoria_clientes'),[20,'5',expect.any(String)]);
  });

  it('normaliza conflito de e-mail de contato do tenant para 409',async()=>{
    const db=queryStub();vi.mocked(db.query).mockRejectedValueOnce(Object.assign(new Error('duplicate'),{code:'23505'}));
    await expect(salvarContatoPostgres(db as never,20,null,{nome:'Contato Teste',email:'x@example.test'},3)).rejects.toMatchObject({status:409});
  });

  it('catálogo de sindicatos expõe somente identidade e contagem do escritório',async()=>{
    const db=queryStub([{id:4,nome:'Sindicato X',cnpj:'123',clientes_total:2}]);
    await expect(listarCatalogoSindicatosPostgres(db,7)).resolves.toEqual([{id:4,nome:'Sindicato X',cnpj:'123',clientes_total:2}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('c.escritorio_id=$1'),[7]);
    expect(db.query).toHaveBeenCalledWith(expect.not.stringContaining('m.cnpj_filtro'),[7]);
  });

  it('lista monitoramentos somente do tenant e normaliza tipos/ativo',async()=>{
    const db=queryStub([{id:3,escritorio_id:7,tipos_json:['Convenção Coletiva'],ativo:true}]);
    await expect(listarMonitoramentosPostgres(db,7)).resolves.toEqual([{id:3,escritorio_id:7,ativo:true,tipos:['Convenção Coletiva']}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE m.escritorio_id=$1'),[7]);
  });

  it('não revela monitoramento pertencente a outro escritório',async()=>{
    const db=queryStub();
    await expect(obterMonitoramentoPostgres(db,8,3)).rejects.toMatchObject({status:404});
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id=$1 AND escritorio_id=$2'),[3,8]);
  });

  it('não permite trocar sindicato ou excluir monitoramento associado a clientes',async()=>{
    const item={id:3,escritorio_id:8,sindicato_id:5,nome:'Sindicato X',cnpj_filtro:'',categoria:'cat',uf:'DF',tipos_json:['Convenção Coletiva'],vigencia:'',titulo:'Teste',ativo:true};
    const edit=queryStub([item]);
    await expect(salvarMonitoramentoPostgres(edit as never,8,3,{sindicato_id:6,nome:'Sindicato Y',tipos:['Convenção Coletiva'],categoria:'cat'},4)).rejects.toMatchObject({status:409});
    const deletion=queryStub([item,{id:5},{id:1}]);
    await expect(excluirMonitoramentoPostgres(deletion as never,8,3)).rejects.toMatchObject({status:409});
  });

  it('cria escritório e registra auditoria na mesma conexão transacional', async () => {
    const row = { id: 8, nome: 'Escritório Novo', cnpj: '11222333000181', email: 'contato@example.test', telefone: '', ativo: true };
    const db = queryStub([{ id: 8 }, row]);
    await expect(salvarEscritorioPostgres(db as never, null, { nome: row.nome, cnpj: row.cnpj, email: row.email })).resolves.toBe(8);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO escritorios'), [row.nome,row.cnpj,row.email,'',true]);
    expect(db.query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO auditoria_clientes'), [8,'8',expect.any(String)]);
  });

  it('converte conflito de CNPJ em resposta de cadastro duplicado', async () => {
    const db = queryStub();
    vi.mocked(db.query).mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(salvarEscritorioPostgres(db as never, null, { nome: 'Escritório Novo', cnpj: '11222333000181' }))
      .rejects.toThrow('Já existe um escritório com este CNPJ.');
  });

  it('inativa escritório ativo e registra auditoria; não repete operação inativa', async () => {
    const active = { id: 8, nome: 'Escritório', cnpj: '11222333000181', email: '', telefone: '', ativo: true };
    const inactive = { ...active, ativo: false };
    const db = queryStub([active, inactive]);
    await inativarEscritorioPostgres(db as never, 8);
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('SET ativo=false'), [8]);
    expect(db.query).toHaveBeenNthCalledWith(4, expect.stringContaining('INSERT INTO auditoria_clientes'), [8,'8',expect.any(String)]);
    const alreadyInactive = queryStub([inactive]);
    await inativarEscritorioPostgres(alreadyInactive as never, 8);
    expect(alreadyInactive.query).toHaveBeenCalledOnce();
  });

  it('normaliza e-mail global do usuário e audita na mesma conexão', async () => {
    const db = queryStub([{ id: 9 }, { id: 9, nome: 'Usuária Nova', email: 'new@example.test', ativo: true }]);
    await expect(salvarUsuarioPostgres(db as never, null, { nome: 'Usuária Nova', email: ' NEW@EXAMPLE.TEST ' }, null)).resolves.toBe(9);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO usuarios'), ['Usuária Nova','new@example.test',true]);
    expect(db.query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO auditoria_seguranca'),
      [null,'usuario_salvar',null,null,expect.any(Number),expect.any(String),expect.any(String)]);
  });

  it('reativa vínculo de escritório e conserva o papel no próprio vínculo', async () => {
    const db = queryStub([
      { id: 5, nome: 'Operador', email: 'op@example.test', ativo: true },
      { id: 3, nome: 'Escritório', ativo: true }
    ]);
    await vincularUsuarioEscritorioPostgres(db as never, 5, 3, 'operador', null);
    expect(db.query).toHaveBeenNthCalledWith(3, expect.stringContaining('ON CONFLICT(usuario_id,escritorio_id)'), [5,3,'operador']);
    expect(db.query).toHaveBeenNthCalledWith(4, expect.stringContaining('INSERT INTO auditoria_seguranca'),
      [null,'usuario_escritorio_vincular',3,null,expect.any(Number),expect.any(String),expect.any(String)]);
  });

  it('usuário inativo não recebe contextos elegíveis', async () => {
    const db = queryStub([{ id: 5, nome: 'Inativo', email: 'inactive@example.test', ativo: false }]);
    await expect(listarVinculosUsuarioPostgres(db, 5)).resolves.toEqual({ escritorios: [], clientes: [] });
    expect(db.query).toHaveBeenCalledOnce();
  });
});

describe('transações PostgreSQL', () => {
  function poolStub() {
    const client = { query: vi.fn(async () => ({})), release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) };
    return { pool: pool as unknown as Pool, client };
  }

  it('commits o trabalho e libera a conexão dedicada', async () => {
    const { pool, client } = poolStub();
    await expect(withPostgresTransaction(pool, async () => 'feito')).resolves.toBe('feito');
    expect(client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('faz rollback em erro e preserva a conexão ao pool', async () => {
    const { pool, client } = poolStub();
    await expect(withPostgresTransaction(pool, async () => { throw new Error('falhou'); })).rejects.toThrow('falhou');
    expect(client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});

