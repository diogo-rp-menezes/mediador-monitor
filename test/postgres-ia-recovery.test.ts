import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {recuperarAnalisePostgres} from '../src/postgres-ia-recovery.js';
import {tratarGestaoPostgres} from '../src/postgres-gestao-http.js';
it('exige confirmação, justificativa e corpo estrito antes de conectar',async()=>{
  const connect=vi.fn(),pool={connect} as unknown as Pool;
  for(const body of [{justificativa:'Motivo completo',consumidor_encerrado:false},{justificativa:'curto',consumidor_encerrado:true},{justificativa:'Motivo completo',consumidor_encerrado:true,ator_id:99}])
    await expect(recuperarAnalisePostgres(pool,1,body,async()=>{})).rejects.toThrow();
  expect(connect).not.toHaveBeenCalled();
});
it('nega suporte e usuário de escritório na listagem e recuperação antes do banco',async()=>{
  for(const role of ['suporte',null])for(const [method,path] of [['GET','/api/plataforma/ia/tentativas'],['POST','/api/plataforma/ia/tentativas/1/recuperar'],['POST','/api/plataforma/ia/solicitacoes/1/recuperar']]){
    const connect=vi.fn(),access={validarRequisicao:vi.fn(),identidade:async()=>({usuario_id:7,papel_plataforma:role}),resolverContexto:vi.fn(),csrf:vi.fn()};
    await expect(tratarGestaoPostgres({method} as IncomingMessage,{} as ServerResponse,{connect} as unknown as Pool,new URL('http://localhost'+path),access as never,async()=>({}))).rejects.toMatchObject({status:403});
    expect(connect).not.toHaveBeenCalled();expect(access.resolverContexto).not.toHaveBeenCalled();
  }
});
it('revalida identidade e CSRF após corpo, sem confiar no administrador inicial',async()=>{
  const connect=vi.fn(),access={validarRequisicao:vi.fn(),identidade:vi.fn().mockResolvedValueOnce({usuario_id:7,papel_plataforma:'administrador_plataforma'}).mockResolvedValueOnce({usuario_id:7,papel_plataforma:null}),resolverContexto:vi.fn(),csrf:vi.fn()};
  await expect(tratarGestaoPostgres({method:'POST'} as IncomingMessage,{} as ServerResponse,{connect} as unknown as Pool,new URL('http://localhost/api/plataforma/ia/tentativas/1/recuperar'),access as never,async()=>({justificativa:'Processo encerrado e verificado',consumidor_encerrado:true}))).rejects.toMatchObject({status:403});
  expect(access.identidade).toHaveBeenCalledTimes(2);expect(access.csrf).toHaveBeenCalledOnce();expect(connect).not.toHaveBeenCalled();
});
it('recuperação HTTP audita administrador revalidado com CSRF e reverte falha da auditoria',async()=>{
  for(const failAudit of [false,true]){
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('pg_try_advisory_lock'))return {rows:[{adquirido:true}]};
      if(sql.includes('pg_advisory_unlock'))return {rows:[{liberado:true}]};
      if(sql.startsWith('SELECT numero_registro FROM tentativas'))return {rows:[{numero_registro:'DF999980/2026'}]};
      if(sql.startsWith('SELECT numero_registro,analise_status'))return {rows:[{numero_registro:'DF999980/2026',analise_status:'analisando',arquivo_hash:'a'.repeat(64)}]};
      if(sql.startsWith('SELECT * FROM tentativas'))return {rows:[{id:1,numero_registro:'DF999980/2026',status_anterior:'analisado',arquivo_hash:'a'.repeat(64),inicio_anterior:null}]};
      if(failAudit&&sql.includes('INSERT INTO auditoria'))throw new Error('audit');return {rows:[]};
    });
    const client={query,on:vi.fn(),removeListener:vi.fn(),release:vi.fn()},pool={options:{max:2},connect:async()=>client} as unknown as Pool;
    const access={validarRequisicao:vi.fn(),identidade:vi.fn(async()=>({usuario_id:7,papel_plataforma:'administrador_plataforma'})),resolverContexto:vi.fn(),csrf:vi.fn(),event:()=>({ip:'127.0.0.1',request_id:'sintetico'})};
    const response={writeHead:vi.fn(),end:vi.fn()} as unknown as ServerResponse;
    const run=()=>tratarGestaoPostgres({method:'POST'} as IncomingMessage,response,pool,new URL('http://localhost/api/plataforma/ia/tentativas/1/recuperar'),access as never,async()=>({justificativa:'Processo encerrado e conferido',consumidor_encerrado:true}));
    if(failAudit){await expect(run()).rejects.toThrow('audit');expect(query).toHaveBeenCalledWith('ROLLBACK');}
    else{await run();expect(access.identidade).toHaveBeenCalledTimes(2);expect(access.csrf).toHaveBeenCalledTimes(2);
      const call=query.mock.calls.find(([sql])=>sql.includes('INSERT INTO auditoria'))!;expect((call as unknown as [string,unknown[]])[1][0]).toBe(7);
      expect(String(vi.mocked(response.end).mock.calls[0][0])).toContain('falhou');}
  }
});
