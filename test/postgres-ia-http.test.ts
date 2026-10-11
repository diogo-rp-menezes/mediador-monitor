import {it,expect,vi} from 'vitest';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Pool} from 'pg';
import {tratarGestaoPostgres} from '../src/postgres-gestao-http.js';
import * as settings from '../src/postgres-ia-settings.js';
import * as probe from '../src/ia-connection-test.js';
function fixture(role:string|null){
  const query=vi.fn(async()=>({rows:[],rowCount:1})),pool={connect:vi.fn(async()=>({query,release:vi.fn()}))} as unknown as Pool;
  const access={validarRequisicao:vi.fn(),identidade:vi.fn(async()=>({usuario_id:7,nome:'Teste',papel_plataforma:role})),resolverContexto:vi.fn(),csrf:vi.fn(),event:vi.fn(()=>({request_id:'teste'}))};
  const req={method:'PUT'} as IncomingMessage,res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
  const run=(path='/api/plataforma/ia',body:unknown={ativo:true,base_url:'https://provider.example.invalid/v1',modelo:'teste',api_key:'segredo-ficticio',versao:0})=>tratarGestaoPostgres(req,res,pool,new URL('http://localhost'+path),access as never,async()=>body);
  return {query,access,req,res,run};
}
it('nega suporte e usuários de escritório antes do banco, sem exigir contexto de escritório',async()=>{
  for(const role of ['suporte',null]){const f=fixture(role);await expect(f.run()).rejects.toMatchObject({status:403});expect(f.query).not.toHaveBeenCalled();expect(f.access.resolverContexto).not.toHaveBeenCalled();}
});
it('revalida administrador, exige CSRF e não inclui segredo no retorno/auditoria; falha audita reverte',async()=>{
  vi.stubEnv('CREDENTIALS_MASTER_KEY',Buffer.alloc(32,7).toString('base64'));
  try{
    const f=fixture('administrador_plataforma');await f.run();expect(f.access.identidade).toHaveBeenCalledTimes(2);expect(f.access.csrf).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(f.res.end).mock.calls[0][0])).not.toContain('segredo-ficticio');
    const audits=f.query.mock.calls.filter(([sql])=>sql.includes('INSERT INTO auditoria'));expect(JSON.stringify(audits)).not.toContain('segredo-ficticio');
    const failure=fixture('administrador_plataforma');failure.query.mockImplementation(async sql=>{if(sql.includes('INSERT INTO auditoria'))throw new Error('audit');return {rows:[],rowCount:1};});
    await expect(failure.run()).rejects.toThrow('audit');expect(failure.query).toHaveBeenCalledWith('ROLLBACK');
  }finally{vi.unstubAllEnvs();}
});

it('teste de conexão exige administrador/CSRF, usa versão salva e audita sem chave',async()=>{
  const config=vi.spyOn(settings,'obterIaConfiguradaPostgres').mockResolvedValue({ativo:false,base_url:'https://example.invalid/v1',modelo:'modelo',api_key:'segredo-ficticio',versao:2});
  const view=vi.spyOn(settings,'obterIaPostgres').mockResolvedValue({ativo:false,base_url:'https://example.invalid/v1',modelo:'modelo',tem_chave:true,versao:2});
  const test=vi.spyOn(probe,'testarConexaoIa').mockResolvedValue({ok:true,ms:12,mensagem:'Conexão confirmada.'});
  try{
    const denied=fixture('suporte');denied.req.method='POST';await expect(denied.run('/api/plataforma/ia/testar',{versao:2})).rejects.toMatchObject({status:403});expect(test).not.toHaveBeenCalled();
    const f=fixture('administrador_plataforma');f.req.method='POST';
    await expect(f.run('/api/plataforma/ia/testar',{versao:1})).rejects.toMatchObject({status:409});expect(test).not.toHaveBeenCalled();
    await f.run('/api/plataforma/ia/testar',{versao:2});expect(test).toHaveBeenCalledOnce();expect(f.access.resolverContexto).not.toHaveBeenCalled();
    expect(String(vi.mocked(f.res.end).mock.calls[0][0])).not.toContain('segredo-ficticio');
    expect(JSON.stringify(f.query.mock.calls.filter(([sql])=>sql.includes('INSERT INTO auditoria')))).not.toContain('segredo-ficticio');
    view.mockResolvedValue({...await settings.obterIaPostgres({} as never),versao:3});
    await expect(f.run('/api/plataforma/ia/testar',{versao:2})).rejects.toMatchObject({status:409});expect(f.query).toHaveBeenLastCalledWith('COMMIT');
    const csrf=fixture('administrador_plataforma');csrf.req.method='POST';csrf.access.csrf.mockImplementation(()=>{throw new Error('CSRF');});
    await expect(csrf.run('/api/plataforma/ia/testar',{versao:2})).rejects.toThrow('CSRF');expect(csrf.query).not.toHaveBeenCalled();
  }finally{config.mockRestore();view.mockRestore();test.mockRestore();}
});

it('opções locais de coleta são somente leitura para administrador e não expõem segredos',async()=>{
  const denied=fixture('suporte');denied.req.method='GET';await expect(denied.run('/api/plataforma/coleta')).rejects.toMatchObject({status:403});
  const f=fixture('administrador_plataforma');f.req.method='GET';await f.run('/api/plataforma/coleta');
  expect(f.access.resolverContexto).not.toHaveBeenCalled();expect(f.query).not.toHaveBeenCalled();
  const data=JSON.parse(String(vi.mocked(f.res.end).mock.calls[0][0]));
  expect(Object.keys(data).sort()).toEqual(['canal','formulario_timeout_ms','headless','max_paginas','origem','slack_contextual','timeout_ms'].sort());
  f.req.method='PUT';await f.run('/api/plataforma/coleta');expect(f.res.writeHead).toHaveBeenLastCalledWith(405,expect.anything());
});
