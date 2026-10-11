import {expect,it,vi} from 'vitest';
vi.mock('../src/postgres-backup-gate.js',()=>({comEscritorArquivosPostgres:async(_pool:unknown,work:(signal:AbortSignal)=>Promise<unknown>)=>work(new AbortController().signal)}));
import type {Pool,PoolClient} from 'pg';
import {prepararNotificacoesPublicacaoPostgres,processarNotificacoesPublicacaoPostgres,recuperarNotificacoesPublicacaoPresasPostgres} from '../src/postgres-notificacoes-publicacoes.js';

it('prepara notificação só para publicação ativa e grava destinatários atuais do cliente',async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({rows:[{id:4,cliente_id:8}],rowCount:1}).mockResolvedValueOnce({rowCount:2})} as unknown as PoolClient;
  await expect(prepararNotificacoesPublicacaoPostgres(client,3,4)).resolves.toBe(2);
  expect(client.query).toHaveBeenNthCalledWith(1,expect.stringContaining("p.estado='ativa'"),[4,3]);
  expect(client.query).toHaveBeenNthCalledWith(2,expect.stringContaining('ON CONFLICT(publicacao_id,destino) DO NOTHING'),[4,3,8]);
});

it('nega publicação de outro escritório ao preparar notificação',async()=>{
  const client={query:vi.fn().mockResolvedValue({rows:[],rowCount:0})} as unknown as PoolClient;
  await expect(prepararNotificacoesPublicacaoPostgres(client,99,4)).rejects.toMatchObject({status:404});
  expect(client.query).toHaveBeenCalledOnce();
});

it.each([true,false])('confere aceite SMTP (%s) ao enviar link autenticado sem anexo',async(accepted)=>{
  const leasing={query:vi.fn(async(sql:string)=>sql.includes('RETURNING n.id')?{rows:[{id:11,publicacao_id:4,escritorio_id:3,cliente_id:8,usuario_id:2,destino:'cliente@example.test',tentativas:1,razao_social:'Cliente',base:'DF000001/2026',versao:'v1'}],rowCount:1}:{rowCount:1,rows:[]}),release:vi.fn()};
  const smtpClient={query:vi.fn(async(sql:string)=>sql.includes('SELECT ativo')?{rows:[{ativo:true,host:'smtp.test',porta:587,secure:false,usuario:'',remetente:'notifica@example.test',senha_cifrada:'',versao:1}],rowCount:1}:{rowCount:null}),release:vi.fn()};
  const finish={query:vi.fn().mockResolvedValue({rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValueOnce(leasing).mockResolvedValueOnce(smtpClient).mockResolvedValue(finish),query:vi.fn()} as unknown as Pool;
  const sendMail=vi.fn(async(message:Record<string,unknown>)=>{expect(message.to).toBe('cliente@example.test');expect(message.text).toContain('https://app.example.test/acesso');expect(message).not.toHaveProperty('attachments');return {accepted:accepted?['cliente@example.test']:[]};});
  await expect(processarNotificacoesPublicacaoPostgres(pool,3,{publicUrl:'https://app.example.test',sendMail})).resolves.toEqual({enviadas:accepted?1:0,falhas:accepted?0:1,canceladas:0});
  expect(sendMail).toHaveBeenCalledOnce();
  if(accepted)expect(finish.query).toHaveBeenCalledWith(expect.stringContaining("estado='enviado'"),[11,3]);
  else expect(finish.query).not.toHaveBeenCalledWith(expect.stringContaining("estado='enviado'"),expect.anything());
});

it('recupera notificações cujo worker parou como incerto',async()=>{
  const client={query:vi.fn(async(sql:string)=>sql.includes('UPDATE notificacoes_publicacoes')?{rows:[{id:11}],rowCount:1}:{rowCount:null,rows:[]}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(recuperarNotificacoesPublicacaoPresasPostgres(pool,3,900)).resolves.toBe(1);
  expect(client.query).toHaveBeenNthCalledWith(4,expect.stringContaining('iniciado_em<now()'),[3,900]);
});
