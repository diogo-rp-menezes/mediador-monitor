import {expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import {detalheInstrumentoPostgres,listarCatalogoInterpretacoesPostgres,salvarVinculoContextoPostgres} from '../src/postgres-interpretacoes.js';

it('lista somente documentos e vínculos disponíveis no escritório',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[],rowCount:0});
  query.mockImplementation(async(sql:string)=>sql.includes('AS cliente_original_id')?{rows:[{numero_registro:'DF000001/2026',tipo:'Convenção Coletiva'}],rowCount:1}:{rows:[],rowCount:0});
  const client={query,release:vi.fn()};const pool={query,connect:vi.fn(async()=>client)} as unknown as Pool;
  await expect(listarCatalogoInterpretacoesPostgres(pool,12)).resolves.toEqual({documentos:[{numero_registro:'DF000001/2026',tipo:'Convenção Coletiva'}],vinculos:[]});
  expect(pool.query).toHaveBeenNthCalledWith(4,expect.stringContaining('d.escritorio_id=$1'),[12]);
  expect(pool.query).toHaveBeenNthCalledWith(5,expect.stringContaining('v.escritorio_id=$1'),[12]);
});

it('oculta aditivo fora do escopo antes de tentar salvar vínculo',async()=>{
  const client={query:vi.fn().mockResolvedValue({rows:[],rowCount:0})} as unknown as PoolClient;
  await expect(salvarVinculoContextoPostgres(client,3,4,{aditivo:'DF000010/2026',base:'DF000001/2026',justificativa:'Vínculo confirmado após conferência',revisao:0}))
    .rejects.toMatchObject({status:404});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('d.escritorio_id=$2'),['DF000010/2026',3]);
});

it('exige revisão atual e bloqueia vínculo obsoleto em edição concorrente',async()=>{
  const client={query:vi.fn()
    .mockResolvedValueOnce({rows:[{tipo:'Termo Aditivo de Convenção Coletiva'}],rowCount:1})
    .mockResolvedValueOnce({rows:[{tipo:'Convenção Coletiva'}],rowCount:1})
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[{revisao:2}],rowCount:1})} as unknown as PoolClient;
  await expect(salvarVinculoContextoPostgres(client,3,4,{aditivo:'DF000010/2026',base:'DF000001/2026',justificativa:'Vínculo confirmado após conferência',revisao:1}))
    .rejects.toMatchObject({status:409});
  expect(client.query).toHaveBeenNthCalledWith(3,expect.stringContaining('pg_advisory_xact_lock'),[817204617,'3:DF000010/2026']);
});

it('recusa detalhes de instrumento sem vínculo no escritório e não seleciona caminhos privados',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[],rowCount:0});
  const client={query,release:vi.fn()};const pool={connect:vi.fn(async()=>client)} as unknown as Pool;
  await expect(detalheInstrumentoPostgres(pool,12,'DF000001/2026')).rejects.toMatchObject({status:404});
  const call=query.mock.calls.find(([sql])=>sql.includes('FROM registros r'))!;
  expect(call[0]).toContain('d.escritorio_id=$2');
  expect(call[0]).not.toContain('arquivo_path');
  expect(call[1]).toEqual(['DF000001/2026',12]);
});
