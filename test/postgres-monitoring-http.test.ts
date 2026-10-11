import {it,expect,vi} from 'vitest';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Pool} from 'pg';
import {tratarGestaoPostgres} from '../src/postgres-gestao-http.js';
import {comExclusividadeMonitoramentoPostgres} from '../src/postgres-monitoring-lock.js';
vi.mock('../src/postgres-monitoring-lock.js',()=>({comExclusividadeMonitoramentoPostgres:vi.fn(async(_pool,_office,work)=>({adquirido:true,result:await work(new AbortController().signal)}))}));
function fixture(papel='operador'){
  const query=vi.fn(async(sql:string)=>sql.includes('INSERT INTO execucoes_escritorio')?{rowCount:1,rows:[{id:8}]}:sql.includes("status IN ('solicitada'")?{rowCount:0,rows:[]}:{rowCount:1,rows:[]});
  const client={query,release:vi.fn()},pool={connect:vi.fn(async()=>client)} as unknown as Pool;
  const access={validarRequisicao:vi.fn(),identidade:vi.fn(async()=>({usuario_id:7,nome:'Operador',ativo:true,papel_plataforma:null})),resolverContexto:vi.fn(async()=>({tipo:'escritorio',escritorio_id:3,cliente_id:null,papel})),csrf:vi.fn(),event:vi.fn(()=>({ip:'127.0.0.1',request_id:'teste'}))};
  const req={method:'POST',headers:{},socket:{}} as IncomingMessage,res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
  const run=(path:string,body:unknown={monitoramento_id:2})=>tratarGestaoPostgres(req,res,pool,new URL('http://localhost'+path),access as never,async()=>body);
  return {query,access,req,res,run};
}
it('solicita com ator/contexto da sessão, revalida após corpo e audita antes do commit',async()=>{
  const f=fixture();expect(await f.run('/api/contexto/execucoes')).toBe(true);
  expect(f.access.identidade).toHaveBeenCalledTimes(2);expect(f.access.csrf).toHaveBeenCalledTimes(2);
  const insert=f.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO execucoes_escritorio'));
  expect(insert).toBeDefined();
  expect(f.res.writeHead).toHaveBeenCalledWith(202,expect.anything());
  const statements=f.query.mock.calls.map(([sql])=>sql);
  expect(statements.findIndex(sql=>sql.includes('INSERT INTO auditoria_seguranca'))).toBeLessThan(statements.indexOf('COMMIT'));
});
it('nega mutação a suporte e CSRF inválido antes de acessar transação',async()=>{
  const support=fixture('suporte');await expect(support.run('/api/contexto/execucoes')).rejects.toMatchObject({status:403});expect(support.query).not.toHaveBeenCalled();
  const csrf=fixture();csrf.access.csrf.mockImplementation(()=>{throw new Error('CSRF');});
  await expect(csrf.run('/api/contexto/execucoes')).rejects.toThrow('CSRF');expect(csrf.query).not.toHaveBeenCalled();
});
it('cancela com corpo estrito e faz rollback se auditoria falhar',async()=>{
  const f=fixture();await expect(f.run('/api/contexto/execucoes/1/cancelar',{ator:9})).rejects.toThrow();expect(f.query).not.toHaveBeenCalled();
  f.query.mockImplementation(async(sql:string)=>{if(sql.includes('INSERT INTO auditoria_seguranca'))throw new Error('auditoria');return {rowCount:1,rows:[]};});
  await expect(f.run('/api/contexto/execucoes/1/cancelar',{})).rejects.toThrow('auditoria');
  expect(f.query).toHaveBeenCalledWith('ROLLBACK');expect(f.query).not.toHaveBeenCalledWith('COMMIT');
});
it('recuperação exige administrador, confirmação de encerramento e auditoria atômica',async()=>{
  const input={justificativa:'Processo anterior encerrado',consumidor_encerrado:true};
  const operator=fixture();await expect(operator.run('/api/contexto/execucoes/1/recuperar',input)).rejects.toMatchObject({status:403});expect(operator.query).not.toHaveBeenCalled();
  const admin=fixture('administrador');
  await expect(admin.run('/api/contexto/execucoes/1/recuperar',{justificativa:'Processo encerrado'})).rejects.toThrow();expect(admin.query).not.toHaveBeenCalled();
  await admin.run('/api/contexto/execucoes/1/recuperar',input);
  expect(admin.access.identidade).toHaveBeenCalledTimes(4);
  expect(admin.query).toHaveBeenCalledWith('COMMIT');
  const failure=fixture('administrador');failure.query.mockImplementation(async sql=>{if(sql.includes('INSERT INTO auditoria_seguranca'))throw new Error('auditoria');return {rowCount:1,rows:[]};});
  await expect(failure.run('/api/contexto/execucoes/1/recuperar',input)).rejects.toThrow('auditoria');expect(failure.query).toHaveBeenCalledWith('ROLLBACK');
});
it('recuperação recusa exclusividade ocupada sem atualizar estado',async()=>{
  vi.mocked(comExclusividadeMonitoramentoPostgres).mockResolvedValueOnce({adquirido:false});
  const admin=fixture('administrador');
  await expect(admin.run('/api/contexto/execucoes/1/recuperar',{justificativa:'Processo anterior encerrado',consumidor_encerrado:true})).rejects.toMatchObject({status:409});
  expect(admin.query).not.toHaveBeenCalled();
});
it('agenda exige administrador, revalida contexto e audita; operador só lê',async()=>{
  const input={ativa:true,intervalo_minutos:60},operator=fixture();operator.req.method='PUT';
  await expect(operator.run('/api/contexto/agendas/2',input)).rejects.toMatchObject({status:403});expect(operator.query).not.toHaveBeenCalled();
  const admin=fixture('administrador');admin.req.method='PUT';await admin.run('/api/contexto/agendas/2',input);
  expect(admin.access.identidade).toHaveBeenCalledTimes(2);expect(admin.access.csrf).toHaveBeenCalledTimes(2);
  expect(admin.query).toHaveBeenCalledWith(expect.stringContaining('SET agenda_ativa'),[2,3,true,60,null]);
  expect(admin.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auditoria_seguranca'),expect.arrayContaining(['MONITORAMENTO_AGENDA_SALVA']));
  operator.req.method='GET';await operator.run('/api/contexto/agendas');expect(operator.res.writeHead).toHaveBeenCalledWith(200,expect.anything());
  const failure=fixture('administrador');failure.req.method='PUT';failure.query.mockImplementation(async sql=>{if(sql.includes('INSERT INTO auditoria'))throw new Error('audit');return {rowCount:1,rows:[]};});
  await expect(failure.run('/api/contexto/agendas/2',input)).rejects.toThrow('audit');expect(failure.query).toHaveBeenCalledWith('ROLLBACK');
});
it('limites exigem administrador e CSRF e auditoria falha reverte a edição',async()=>{
  const input={limite_hora:null,duracao_segundos:null,volume_mib:null},operator=fixture();operator.req.method='PUT';
  await expect(operator.run('/api/contexto/limites-monitoramento',input)).rejects.toMatchObject({status:403});expect(operator.query).not.toHaveBeenCalled();
  const admin=fixture('administrador');admin.req.method='PUT';await admin.run('/api/contexto/limites-monitoramento',input);
  expect(admin.access.csrf).toHaveBeenCalledTimes(2);expect(admin.access.identidade).toHaveBeenCalledTimes(2);
  expect(admin.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO limites_monitoramento_escritorio'),[3,null,null,null]);
  const failure=fixture('administrador');failure.req.method='PUT';failure.query.mockImplementation(async sql=>{if(sql.includes('INSERT INTO auditoria'))throw new Error('audit');return {rowCount:1,rows:[]};});
  await expect(failure.run('/api/contexto/limites-monitoramento',input)).rejects.toThrow('audit');expect(failure.query).toHaveBeenCalledWith('ROLLBACK');
});
