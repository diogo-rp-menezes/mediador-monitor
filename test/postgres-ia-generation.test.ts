import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {CAMPOS_CCT,NAO_CONSTA_CCT} from '../src/cct-template.js';
import {gerarExtracaoIaPostgres,validarRespostaIaPostgres} from '../src/postgres-ia-generation.js';
const tipo='Convenção Coletiva',campos=()=>Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,NAO_CONSTA_CCT]));
it('recusa campos omitidos/desconhecidos e citações fabricadas sem corrigir resposta',()=>{
  const fields=campos(),id=CAMPOS_CCT[0].id;
  expect(validarRespostaIaPostgres({campos:fields},tipo,'original').padrao?.campos).toEqual(fields);
  delete fields[id];expect(()=>validarRespostaIaPostgres({campos:fields},tipo,'original')).toThrow();
  expect(()=>validarRespostaIaPostgres({campos:{...campos(),inventado:'valor'}},tipo,'original')).toThrow();
  expect(()=>validarRespostaIaPostgres({campos:campos(),evidencias:{[id]:{citacao:'citação inexistente'}}},tipo,'original')).toThrow();
});
it('valida citações literais de aditivo e rejeita instrumento incompatível',()=>{
  const raw={alteracoes:[{campo:CAMPOS_CCT[0].id,acao:'revisar',valor:'Regra adicional',clausula:'Cláusula 1',citacao:'Regra adicional'}]};
  expect(validarRespostaIaPostgres(raw,'Termo Aditivo de Convenção Coletiva','Regra adicional').aditivo?.alteracoes).toHaveLength(1);
  expect(()=>validarRespostaIaPostgres(raw,'Termo Aditivo de Convenção Coletiva','Outro texto')).toThrow();
  expect(()=>validarRespostaIaPostgres({campos:campos()},'Acordo Coletivo','Original')).toThrow();
});
it('transporta JSON para provedor local e recusa redirect, erro, resposta excessiva e interrupção',async()=>{
  let mode='ok',hits=0,body='',auth='';
  const server=createServer(async(req,res)=>{
    hits++;auth=String(req.headers.authorization);body='';for await(const chunk of req)body+=chunk;
    if(mode==='redirect'){res.writeHead(302,{location:'/secret'});res.end();return;}
    if(mode==='error'){res.statusCode=500;res.end('segredo no erro');return;}
    if(mode==='large'){res.end('x'.repeat(2*1024*1024+1));return;}
    if(mode==='slow'){setTimeout(()=>res.end('{}'),150);return;}
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({campos:campos()})}}]}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const config={base_url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,modelo:'teste',api_key:'chave-sintetica'};
  try{
    const result=await gerarExtracaoIaPostgres('Original',tipo,config,AbortSignal.timeout(1000));expect(result).toEqual({campos:campos()});
    expect(auth).toBe('Bearer chave-sintetica');expect(JSON.parse(body).model).toBe('teste');
    mode='redirect';const previous=hits;await expect(gerarExtracaoIaPostgres('Original',tipo,config,AbortSignal.timeout(1000))).rejects.toMatchObject({motivo:'provedor_indisponivel'});expect(hits).toBe(previous+1);
    mode='error';await expect(gerarExtracaoIaPostgres('Original',tipo,config,AbortSignal.timeout(1000))).rejects.toThrow('provedor_indisponivel');
    mode='large';await expect(gerarExtracaoIaPostgres('Original',tipo,config,AbortSignal.timeout(1000))).rejects.toMatchObject({motivo:'resposta_invalida'});
    mode='slow';await expect(gerarExtracaoIaPostgres('Original',tipo,config,AbortSignal.timeout(30))).rejects.toMatchObject({motivo:'provedor_indisponivel'});
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
