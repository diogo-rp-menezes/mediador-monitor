import { expect,it,vi } from 'vitest';
import type { IncomingMessage,ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { criarAcessoHttpPostgres } from '../src/postgres-auth-http.js';
import { tratarGestaoPostgres } from '../src/postgres-gestao-http.js';

function fixture(){
  const query=vi.fn();const client={query,release:vi.fn()};
  const pool={query,connect:vi.fn(async()=>client)} as unknown as Pool;
  const access=criarAcessoHttpPostgres(pool,{publicUrl:'http://localhost:3000'});
  const req={method:'GET',headers:{host:'localhost:3000'},socket:{remoteAddress:'127.0.0.1'}} as unknown as IncomingMessage;
  const res={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
  return {pool,access,req,res};
}

it('consulta CNPJ exige sessão antes de acessar o provedor',async()=>{
  const {pool,access,req,res}=fixture();
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/clientes/consulta-cnpj/11222333000181'),access,async()=>({}))).rejects.toMatchObject({status:401});
});
it.each(['suporte','cliente'])('consulta CNPJ recusa contexto %s antes de acessar o provedor',async papel=>{
  const {pool,access,req,res}=fixture();
  const fetchSpy=vi.spyOn(globalThis,'fetch');
  try{
    const restricted={...access,validarRequisicao:vi.fn(),identidade:vi.fn(async()=>({usuario_id:3,papel_plataforma:null})),resolverContexto:vi.fn(async()=>({tipo:papel==='cliente'?'cliente':'escritorio',escritorio_id:22,papel}))};
    await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/clientes/consulta-cnpj/11222333000181'),restricted as never,async()=>({}))).rejects.toMatchObject({status:403});
    expect(fetchSpy).not.toHaveBeenCalled();
  }finally{fetchSpy.mockRestore();}
});

it('resumo de escritório exige sessão antes de consultar indicadores',async()=>{
  const {pool,access,req,res}=fixture();
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/resumo'),access,async()=>({}))).rejects.toMatchObject({status:401});
});

it('resumo recusa contexto de empresa antes de consultar indicadores internos',async()=>{
  const {pool,access,req,res}=fixture();
  const mockedAccess={...access,validarRequisicao:vi.fn(),
    identidade:vi.fn(async()=>({usuario_id:3})),
    resolverContexto:vi.fn(async()=>({tipo:'cliente',escritorio_id:22,cliente_id:9,papel:'gestor'}))};
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/resumo'),mockedAccess as never,async()=>({})))
    .rejects.toMatchObject({status:403});
  expect(pool.query).not.toHaveBeenCalled();
  expect(pool.connect).not.toHaveBeenCalled();
});

it.each(['/api/contexto/publicacoes/auditoria','/api/portal/documentos/1','/api/portal/documentos/9','/api/portal/documentos/10'])('reconhece publicação %s e exige sessão',async path=>{
  const {pool,access,req,res}=fixture();
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000'+path),access,async()=>({}))).rejects.toMatchObject({status:401});
});
it('reconhece revogação da primeira publicação',async()=>{
  const {pool,access,req,res}=fixture();req.method='POST';req.headers['content-type']='application/json';
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/publicacoes/1/revogar'),access,async()=>({}))).rejects.toMatchObject({status:401});
});

it('não intercepta rotas fora do namespace de gestão',async()=>{
  const {pool,access,req,res}=fixture();
  vi.mocked(pool.query).mockResolvedValue({rows:[],rowCount:0,command:'SELECT',oid:0,fields:[]} as never);
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/clientes'),access,async()=>({}))).resolves.toBe(false);
  expect(pool.query).not.toHaveBeenCalled();
});

it('valida o Host antes de consultar a identidade ou o banco',async()=>{
  const {pool,access,req,res}=fixture();
  req.headers.host='attacker.example.test';
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://attacker.example.test/api/plataforma/escritorios'),access,async()=>({})))
    .rejects.toMatchObject({status:403});
  expect(pool.query).not.toHaveBeenCalled();
});

it('exige sessão autenticada nas rotas de gestão reconhecidas',async()=>{
  const {pool,access,req,res}=fixture();
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/plataforma/escritorios'),access,async()=>({})))
    .rejects.toMatchObject({status:401});
});

it('mantém o caminho de cadastro tenant-scoped sob contexto validado e permissão',async()=>{
  const {pool,access,req,res}=fixture();
  vi.mocked(pool.query).mockResolvedValue({rows:[],rowCount:0,command:'SELECT',oid:0,fields:[]} as never);
  const mockedAccess={...access,identidade:vi.fn(async()=>({usuario_id:3,nome:'Admin',email:'a@example.test',ativo:true,
    sessao_hash:'hash',expira_em:Date.now()+60000,papel_plataforma:null})),
    resolverContexto:vi.fn(async()=>({tipo:'escritorio' as const,escritorio_id:22,cliente_id:null,papel:'administrador' as const})),
    csrf:vi.fn(),validarRequisicao:vi.fn(),event:vi.fn(()=>({ip:'127.0.0.1'}))};
  const result=await tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/clientes'),mockedAccess as never,async()=>({}));
  expect(result).toBe(true);
  expect(mockedAccess.resolverContexto).toHaveBeenCalledOnce();
  expect(res.writeHead).toHaveBeenCalledWith(200,expect.any(Object));
});

it('exige sessão para rotas de aplicabilidade documental no contexto',async()=>{
  const {pool,access,req,res}=fixture();
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/clientes/9/documentos'),access,async()=>({})))
    .rejects.toMatchObject({status:401});
});

it('exige sessão nas rotas PostgreSQL de interpretação e vínculo',async()=>{
  const {pool,access,req,res}=fixture();
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/interpretacoes'),access,async()=>({})))
    .rejects.toMatchObject({status:401});
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/vinculos'),access,async()=>({})))
    .rejects.toMatchObject({status:401});
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/interpretacoes/consolidar'),access,async()=>({})))
    .rejects.toMatchObject({status:401});
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/revisoes'),access,async()=>({})))
    .rejects.toMatchObject({status:401});
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/relatorio?cliente=1&base=DF000001%2F2026&formato=md'),access,async()=>({})))
    .rejects.toMatchObject({status:401});
});

it('expõe apenas vista SMTP e exige permissão administrativa do escritório',async()=>{
  const {pool,access,req,res}=fixture();
  req.method='GET';
  const mockedAccess={...access,identidade:vi.fn(async()=>({usuario_id:3,nome:'Admin',email:'a@example.test',ativo:true,
    sessao_hash:'hash',expira_em:Date.now()+60000,papel_plataforma:null})),
    resolverContexto:vi.fn(async()=>({tipo:'escritorio' as const,escritorio_id:22,cliente_id:null,papel:'administrador' as const})),
    csrf:vi.fn(),validarRequisicao:vi.fn(),event:vi.fn(()=>({ip:'127.0.0.1'}))};
  vi.mocked(pool.query).mockResolvedValue({rows:[{ativo:true,host:'smtp.example.test',porta:587,secure:false,usuario:'mailer',remetente:'alerts@example.test',senha_cifrada:'must-not-leak',versao:2}],rowCount:1,command:'SELECT',oid:0,fields:[]} as never);
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/smtp'),mockedAccess as never,async()=>({}))).resolves.toBe(true);
  const payload=JSON.parse(vi.mocked(res.end).mock.calls[0][0] as string);
  expect(payload).toMatchObject({ativo:true,temSenha:true,versao:2});expect(JSON.stringify(payload)).not.toContain('must-not-leak');
  mockedAccess.resolverContexto=vi.fn(async()=>({tipo:'escritorio' as const,escritorio_id:22,cliente_id:null,papel:'operador' as const}));
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/smtp'),mockedAccess as never,async()=>({}))).rejects.toMatchObject({status:403});
});

it('lista publicações sem retornar PDF e restringe publicar/revogar à permissão documental',async()=>{
  const {pool,access,req,res}=fixture();req.method='GET';
  const mockedAccess={...access,identidade:vi.fn(async()=>({usuario_id:3,nome:'Admin',email:'a@example.test',ativo:true,sessao_hash:'hash',expira_em:Date.now()+60000,papel_plataforma:null})),
    resolverContexto:vi.fn(async()=>({tipo:'escritorio' as const,escritorio_id:22,cliente_id:null,papel:'administrador' as const})),csrf:vi.fn(),validarRequisicao:vi.fn(),event:vi.fn(()=>({ip:'127.0.0.1'}))};
  vi.mocked(pool.query).mockResolvedValue({rows:[{id:5,cliente_id:9,razao_social:'Cliente',base:'DF000001/2026',versao:'v1',hash_pdf:'abc',estado:'ativa'}],rowCount:1,command:'SELECT',oid:0,fields:[]} as never);
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/publicacoes'),mockedAccess as never,async()=>({}))).resolves.toBe(true);
  const payload=vi.mocked(res.end).mock.calls[0][0] as string;expect(payload).toContain('Cliente');expect(payload).not.toContain('"pdf":');expect(payload).not.toContain('relatorio_json');
  req.method='POST';mockedAccess.resolverContexto=vi.fn(async()=>({tipo:'escritorio' as const,escritorio_id:22,cliente_id:null,papel:'operador' as const}));
  const body=vi.fn(async()=>({cliente_id:9,base:'DF000001/2026'}));
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/contexto/publicacoes'),mockedAccess as never,body)).rejects.toMatchObject({status:403});
  expect(body).not.toHaveBeenCalled();
});

it('portal de publicações exige contexto cliente mesmo para identidade autenticada',async()=>{
  const {pool,access,req,res}=fixture();req.method='GET';
  const mockedAccess={...access,identidade:vi.fn(async()=>({usuario_id:2,nome:'Cliente',email:'c@example.test',ativo:true,sessao_hash:'hash',expira_em:Date.now()+60000,papel_plataforma:null})),
    resolverContexto:vi.fn(async()=>({tipo:'cliente' as const,escritorio_id:22,cliente_id:9,papel:'cliente' as const})),csrf:vi.fn(),validarRequisicao:vi.fn(),event:vi.fn(()=>({ip:'127.0.0.1'}))};
  vi.mocked(pool.query).mockResolvedValue({rows:[{id:5,base:'DF000001/2026',ciencia_confirmada:false}],rowCount:1,command:'SELECT',oid:0,fields:[]} as never);
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/portal/documentos'),mockedAccess as never,async()=>({}))).resolves.toBe(true);
  expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("p.estado='ativa'"),[22,9,2]);
  mockedAccess.resolverContexto=vi.fn(async()=>({tipo:'escritorio' as const,escritorio_id:22,cliente_id:null,papel:'administrador' as const}));
  await expect(tratarGestaoPostgres(req,res,pool,new URL('http://localhost:3000/api/portal/documentos'),mockedAccess as never,async()=>({}))).rejects.toMatchObject({status:403});
});
