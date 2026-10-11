import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { openDb, type Db } from '../src/db.js';
import { criarConsultaCnpj } from '../src/consulta-cnpj.js';
import { detalheCliente, migrarCadastros, salvarCliente, salvarContato } from '../src/cadastros.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/cnpj-resposta.json', import.meta.url), 'utf8'));
const cnpj = fixture.cnpj;
const cliente = { razao_social: 'Cliente manual', cnpj, municipio: 'Brasília', uf: 'DF' };
const bancos: Db[] = [];
const banco = () => { const db = openDb(':memory:'); bancos.push(db); return db; };
const resposta = (obj: unknown = fixture) => new Response(JSON.stringify(obj), { headers: { 'content-type': 'application/json' } });
afterEach(() => bancos.splice(0).forEach(db => db.close()));

describe('consulta por CNPJ', () => {
  it('consulta a URL fixa com CNPJ normalizado, seleciona dados e registra a fonte/data', async () => {
    const fetch = vi.fn(async () => resposta());
    const consultar = criarConsultaCnpj({ fetch, agora: () => new Date('2026-10-09T00:00:00Z') });
    const dados = await consultar('11.222.333/0001-81');
    expect(fetch.mock.calls[0][0]).toBe('https://brasilapi.com.br/api/cnpj/v1/11222333000181');
    expect(dados).toMatchObject({ cnpj, razao_social: fixture.razao_social, fonte: 'BrasilAPI / Minha Receita', consultado_em: '2026-10-09T00:00:00.000Z',
      endereco: { logradouro: 'RUA DO COMÉRCIO', cep: '70000000' }, cnae_principal: { codigo: '4711302' }, situacao_cadastral: 'ATIVA' });
    expect(dados).not.toHaveProperty('qsa'); expect(dados).not.toHaveProperty('email');
  });
  it('recusa CNPJ inválido antes de qualquer acesso externo', async () => {
    const fetch = vi.fn(async () => resposta());
    await expect(criarConsultaCnpj({ fetch })('11222333000182')).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aceita CNPJ alfanumérico sem eliminar letras', async () => {
    const fetch = vi.fn(async () => resposta({ ...fixture, cnpj: '12ABC34501DE35' }));
    const d = await criarConsultaCnpj({ fetch })('12.abc.345/01de-35');
    expect(d.cnpj).toBe('12ABC34501DE35');
    expect(fetch.mock.calls[0][0]).toContain('/12ABC34501DE35');
  });
  it('não aplica dados de outro CNPJ nem dados sem razão social', async () => {
    for (const raw of [{ ...fixture, cnpj: '11444777000161' }, { ...fixture, razao_social: '' }]) {
      await expect(criarConsultaCnpj({ fetch: async () => resposta(raw) })(cnpj)).rejects.toMatchObject({ status: 502 });
    }
  });
  it.each([[404, 404], [429, 429], [403, 503], [500, 503]])('explica a falha HTTP %i sem gravar ou inventar dados', async (upstream, esperado) => {
    await expect(criarConsultaCnpj({ fetch: async () => new Response('{}', { status: upstream }) })(cnpj)).rejects.toMatchObject({ status: esperado });
  });
  it('trata perda de rede ou JSON inválido mantendo a alternativa manual', async () => {
    for (const fetch of [async () => { throw new Error('offline'); }, async () => new Response('<html>Erro</html>')]) {
      await expect(criarConsultaCnpj({ fetch })(cnpj)).rejects.toMatchObject({ status: 502 });
    }
  });
  it('interrompe a consulta no timeout', async () => {
    const fetch: typeof globalThis.fetch = async (_input, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    await expect(criarConsultaCnpj({ fetch, timeoutMs: 5 })(cnpj)).rejects.toMatchObject({ status: 504 });
  });
  it('compartilha consultas simultâneas e expira o cache em 15 minutos sem permitir alteração do cache', async () => {
    let date = new Date('2026-10-09T00:00:00Z');
    const fetch = vi.fn(async () => resposta());
    const consultar = criarConsultaCnpj({ fetch, agora: () => date });
    const [a, b] = await Promise.all([consultar(cnpj), consultar(cnpj)]);
    expect(fetch).toHaveBeenCalledTimes(1); a.razao_social = 'Alterado';
    expect(b.razao_social).toBe(fixture.razao_social);
    expect((await consultar(cnpj)).razao_social).toBe(fixture.razao_social);
    date = new Date(date.getTime() + 15 * 60 * 1000);
    expect((await consultar(cnpj)).consultado_em).toBe('2026-10-09T00:15:00.000Z');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('falhas não ficam no cache e não impedem uma nova consulta', async () => {
    let erro = true;
    const fetch = vi.fn(async () => erro ? new Response('{}', { status: 503 }) : resposta());
    const consultar = criarConsultaCnpj({ fetch });
    await expect(consultar(cnpj)).rejects.toMatchObject({ status: 503 }); erro = false;
    expect((await consultar(cnpj)).cnpj).toBe(cnpj); expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('cadastro com consulta', () => {
  it('migra clientes da 0.4.0 sem apagar cadastro e reaplica com segurança', () => {
    const db = new Database(':memory:'); bancos.push(db);
    db.exec(`CREATE TABLE registros(numero_registro TEXT PRIMARY KEY, watch TEXT);
      CREATE TABLE sindicatos(id INTEGER PRIMARY KEY, nome TEXT, cnpj TEXT, ativo INTEGER);
      CREATE TABLE clientes(id INTEGER PRIMARY KEY,razao_social TEXT,nome_fantasia TEXT,cnpj TEXT,uf TEXT,municipio TEXT,ativo INTEGER,modo_envio TEXT,criado_em TEXT,atualizado_em TEXT);
      INSERT INTO clientes VALUES(7,'Cliente preservado','','${cnpj}','DF','Brasília',1,'revisao','2026-01-01','2026-01-01');`);
    migrarCadastros(db); migrarCadastros(db);
    expect(detalheCliente(db,7)).toMatchObject({ id: 7, razao_social: 'Cliente preservado', dados_cnpj: null });
  });
  it('salva a consulta após conferência, preserva vínculos nas edições e limpa ao trocar CNPJ', async () => {
    const db = banco(), dados = await criarConsultaCnpj({ fetch: async () => resposta() })(cnpj);
    const contato = salvarContato(db,null,{ nome: 'Contato escolhido', email: 'rh@example.test' });
    const id = salvarCliente(db,null,{ ...cliente, dados_cnpj: dados, contatos: [{ contato_id: contato }] });
    expect(detalheCliente(db,id).dados_cnpj?.endereco.cep).toBe('70000000');
    expect(db.prepare('SELECT COUNT(*) n FROM contatos').get()).toEqual({ n: 1 });
    salvarCliente(db,id,{ ...cliente, razao_social: 'Razão corrigida' });
    expect(detalheCliente(db,id).dados_cnpj?.razao_social).toBe(fixture.razao_social);
    expect(detalheCliente(db,id).contatos).toHaveLength(1);
    expect(db.prepare("SELECT COUNT(*) n FROM auditoria_clientes WHERE entidade='cliente'").get()).toEqual({ n: 2 });
    salvarCliente(db,id,{ ...cliente, cnpj: '11.444.777/0001-61' });
    expect(detalheCliente(db,id).dados_cnpj).toBeNull();
  });
  it('bloqueia consulta de outra empresa e permite cadastro inteiramente manual', async () => {
    const db = banco(), dados = await criarConsultaCnpj({ fetch: async () => resposta() })(cnpj);
    expect(() => salvarCliente(db,null,{ ...cliente, cnpj: '11444777000161', dados_cnpj: dados })).toThrow(/outro CNPJ/);
    const id = salvarCliente(db,null,cliente);
    expect(detalheCliente(db,id).dados_cnpj).toBeNull();
  });
});
