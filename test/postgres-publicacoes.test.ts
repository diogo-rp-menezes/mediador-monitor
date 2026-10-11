import {expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {publicarDocumentoPostgres,revogarPublicacaoPostgres} from '../src/postgres-publicacoes.js';

const prep=vi.hoisted(()=>vi.fn());
vi.mock('../src/postgres-consolidacao.js',()=>({prepararRelatorioPublicacaoPostgres:prep}));
const report={numero:'DF000001/2026',base:'DF000001/2026',tipo:'Convenção Coletiva',vigencia:'2026',versao:'v1',analise:{padrao:{campos:{}}},consolidado:null,analisado_em:'',arquivos:[]};
const view={relatorio:report,cliente:{razao_social:'Cliente',cnpj:'11222333000181'},fingerprint:'f1'};

it('revalida relatório antes de persistir PDF e cria fila e auditorias em uma transação',async()=>{
  prep.mockReset().mockResolvedValue(view).mockResolvedValue(view);
  const client={query:vi.fn()
    .mockResolvedValueOnce({rowCount:null})
    .mockResolvedValueOnce({rowCount:null})
    .mockResolvedValueOnce({rowCount:null})
    .mockResolvedValueOnce({rowCount:null})
    .mockResolvedValueOnce({rowCount:1})
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[{id:44}],rowCount:1})
    .mockResolvedValueOnce({rows:[{id:44,cliente_id:9}],rowCount:1})
    .mockResolvedValueOnce({rowCount:2})
    .mockResolvedValueOnce({rowCount:1})
    .mockResolvedValueOnce({rowCount:1})
    .mockResolvedValueOnce({rowCount:null}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  const pdf=Buffer.from('%PDF-1.7\ntest');
  await expect(publicarDocumentoPostgres(pool,3,7,{cliente_id:9,base:'DF000001/2026'},{ip:'127.0.0.1'}, {pdf:async()=>pdf}))
    .resolves.toEqual({id:44,versao:'v1',hash_pdf:expect.any(String),notificacoes_enfileiradas:2});
  expect(prep).toHaveBeenCalledTimes(2);expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO publicacoes_documentos'),expect.arrayContaining([3,9,'DF000001/2026','v1']));
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notificacoes_publicacoes'),[44,3,9]);
  expect(client.query).toHaveBeenCalledWith('COMMIT');expect(client.release).toHaveBeenCalledOnce();
});

it('não publica se a versão muda enquanto o PDF é gerado',async()=>{
  prep.mockReset().mockResolvedValueOnce(view).mockResolvedValueOnce({...view,fingerprint:'f2'});
  const pool={connect:vi.fn()} as unknown as Pool;
  await expect(publicarDocumentoPostgres(pool,3,7,{cliente_id:9,base:'DF000001/2026'},{},{pdf:async()=>Buffer.from('%PDF')})).rejects.toMatchObject({status:409});
  expect(pool.connect).not.toHaveBeenCalled();
});

it('revoga somente publicação do escritório e cancela avisos ainda pendentes',async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rows:[{id:44,cliente_id:9,versao:'v1',estado:'ativa'}],rowCount:1})
    .mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rowCount:2}).mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rowCount:null}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(revogarPublicacaoPostgres(pool,3,44,7,{ip:'127.0.0.1'})).resolves.toEqual({ok:true});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("estado='cancelado'"),[44,3]);expect(client.query).toHaveBeenCalledWith('COMMIT');
});
