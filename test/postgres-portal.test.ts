import {expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import {abrirPortalDocumentoPostgres,confirmarCienciaPortalPostgres,listarPortalDocumentosPostgres} from '../src/postgres-publicacoes.js';
import {hashBytes} from '../src/relatorios.js';

const ctx={escritorio_id:3,cliente_id:8};
it('lista apenas publicações ativas e ciência do usuário atual',async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValue({rows:[{id:5,base:'DF000001/2026',ciencia_confirmada:false}],rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(listarPortalDocumentosPostgres(pool,ctx,2)).resolves.toEqual([{id:5,base:'DF000001/2026',ciencia_confirmada:false}]);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("p.estado='ativa'"),[3,8,2]);expect(client.query).toHaveBeenCalledWith('COMMIT');
});

it('serve PDF íntegro e registra abertura e download com ator/contexto/IP',async()=>{
  const bytes=Buffer.from('%PDF-1.7\nportal'),hash=hashBytes(bytes);
  const client={query:vi.fn().mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rows:[{id:5,base:'DF000001/2026',versao:'v1',hash_pdf:hash,pdf:bytes}],rowCount:1})
    .mockResolvedValue({rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(abrirPortalDocumentoPostgres(pool,ctx,2,5,true,{ip:'127.0.0.1'})).resolves.toEqual({nome:'DF000001_2026.pdf',bytes});
  expect(client.query).toHaveBeenNthCalledWith(4,expect.stringContaining('p.cliente_id=$3'),[5,3,8,2]);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auditoria_acessos_publicacoes'),[3,8,5,'v1',2,'abertura_autorizada','PDF disponibilizado ao usuário autenticado','127.0.0.1','','']);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auditoria_acessos_publicacoes'),[3,8,5,'v1',2,'download_servido','download autorizado','127.0.0.1','','']);
});

it('registra acesso negado e não entrega PDF com hash adulterado',async()=>{
  const bytes=Buffer.from('%PDF-1.7\ncorrompido');
  const client={query:vi.fn().mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rows:[{id:5,base:'DF000001/2026',versao:'v1',hash_pdf:'wrong',pdf:bytes}],rowCount:1})
    .mockResolvedValue({rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(abrirPortalDocumentoPostgres(pool,ctx,2,5,false)).rejects.toMatchObject({status:409});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auditoria_acessos_publicacoes'),[3,8,5,'v1',2,'acesso_negado','hash do PDF não confere','','','']);
  expect(client.query).toHaveBeenCalledWith('COMMIT');
});

it('audita publicação inexistente sem revelar se pertence a outro cliente',async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rows:[],rowCount:0}).mockResolvedValue({rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(abrirPortalDocumentoPostgres(pool,ctx,2,999,false)).rejects.toMatchObject({status:404});
  expect(client.query).toHaveBeenCalledWith('COMMIT');
});

it('registra ciência explícita somente para usuário atual do cliente',async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rowCount:null}).mockResolvedValueOnce({rows:[{versao:'v1'}],rowCount:1}).mockResolvedValue({rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(confirmarCienciaPortalPostgres(pool,ctx,2,5)).resolves.toEqual({ok:true});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auditoria_acessos_publicacoes'),[3,8,5,'v1',2,'','','']);
});
