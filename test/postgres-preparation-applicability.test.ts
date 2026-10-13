import {expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
const mocks=vi.hoisted(()=>({documents:vi.fn(),report:vi.fn(),query:vi.fn()}));
vi.mock('../src/postgres-documentos.js',()=>({listarDocumentosClientePostgres:mocks.documents}));
vi.mock('../src/postgres-consolidacao.js',()=>({prepararRelatorioPublicacaoPostgres:mocks.report}));
vi.mock('../src/postgres-backup-gate.js',()=>({comEscritorArquivosPostgres:async(_pool:unknown,work:(signal:AbortSignal)=>Promise<unknown>)=>work(new AbortController().signal)}));
vi.mock('../src/postgres-transaction.js',()=>({withPostgresOfficeTransaction:async(_pool:unknown,_office:unknown,work:(client:unknown)=>Promise<unknown>)=>work({query:mocks.query})}));
import {prepararEnviosPostgres} from '../src/postgres-preparacao-envios.js';

it.each([
  {desatualizado:true,status:'confirmado',incluir_envio:true},
  {desatualizado:false,status:'rejeitado',incluir_envio:true},
  {desatualizado:false,status:'confirmado',incluir_envio:false},
])('bloqueia aplicabilidade atual incompatível antes de gerar/reservar: %j',async state=>{
  mocks.query.mockReset().mockResolvedValue({rows:[{cliente_id:9,contato_id:12,numero_registro:'DF1',tipos_json:[]}],rowCount:1});
  mocks.documents.mockReset().mockResolvedValue([{numero_registro:'DF1',...state}]);mocks.report.mockReset();
  await expect(prepararEnviosPostgres({} as Pool,3,9)).resolves.toEqual({preparados:0,bloqueados:1});
  expect(mocks.documents).toHaveBeenCalledWith(expect.anything(),3,9);expect(mocks.report).not.toHaveBeenCalled();expect(mocks.query).toHaveBeenCalledTimes(1);
});
