import {it,expect,vi} from 'vitest';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Pool} from 'pg';
import {tratarGestaoPostgres} from '../src/postgres-gestao-http.js';
import {prepararEnviosPostgres} from '../src/postgres-preparacao-envios.js';
vi.mock('../src/postgres-preparacao-envios.js',()=>({prepararEnviosPostgres:vi.fn(async()=>({preparados:0,bloqueados:0}))}));
it('deriva ator da sessão após leitura do corpo e rejeita origem fornecida pelo cliente',async()=>{
  const client={query:vi.fn(async()=>({rows:[],rowCount:1})),release:vi.fn()},pool={connect:vi.fn(async()=>client)} as unknown as Pool;
  const access={validarRequisicao:vi.fn(),identidade:vi.fn(async()=>({usuario_id:7,nome:'Operador',ativo:true,papel_plataforma:null})),
    resolverContexto:vi.fn(async()=>({tipo:'escritorio',escritorio_id:3,cliente_id:null,papel:'operador'})),csrf:vi.fn(),event:vi.fn(()=>({ip:'127.0.0.1',request_id:'request-1'}))};
  const req={method:'POST'} as IncomingMessage,res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
  const run=(body:unknown)=>tratarGestaoPostgres(req,res,pool,new URL('http://localhost/api/contexto/envios/preparar'),access as never,async()=>body);
  await expect(run({origem:{tipo:'sistema'}})).rejects.toThrow();expect(prepararEnviosPostgres).not.toHaveBeenCalled();
  await run({cliente_id:2});expect(prepararEnviosPostgres).toHaveBeenCalledWith(pool,3,2,undefined,
    {origem:{tipo:'usuario',usuario_id:7},evento:{ip:'127.0.0.1',request_id:'request-1'}});
  expect(access.identidade).toHaveBeenCalledTimes(3);expect(access.csrf).toHaveBeenCalledTimes(3);
});
