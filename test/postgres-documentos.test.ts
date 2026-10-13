import {expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {listarDocumentosClientePostgres,originalDocumentoClientePostgres} from '../src/postgres-documentos.js';
function testPool(query:ReturnType<typeof vi.fn>){const client={query,release:vi.fn()};return{query,connect:vi.fn(async()=>client)} as unknown as Pool;}

it('não revela decisões de documento de outro tenant',async()=>{
  const pool=testPool(vi.fn(async()=>({rows:[],rowCount:0})));
  await expect(listarDocumentosClientePostgres(pool,22,5)).rejects.toMatchObject({status:404});
  expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id=$1 AND escritorio_id=$2'),[5,22]);
});

it('serve somente original associado ao cliente e verifica caminho permitido e SHA-256',async()=>{
  const dir=mkdtempSync(join(process.cwd(),'data',`pg-original-${randomUUID()}-`));
  try{
    const path=join(dir,'documento.pdf'),bytes=Buffer.from('%PDF-1.7\nconteudo'),hash=createHash('sha256').update(bytes).digest('hex');
    writeFileSync(path,bytes);
    const pool=testPool(vi.fn().mockResolvedValue({rows:[{arquivo_path:path,arquivo_hash:hash}],rowCount:1}));
    const result=await originalDocumentoClientePostgres(pool,22,5,'DOC/1');
    expect(result).toMatchObject({bytes,hash,nome:'DOC_1.pdf',tipo:'application/pdf'});
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('d.escritorio_id=$1 AND d.cliente_id=$2'),[22,5,'DOC/1']);
    const bad=testPool(vi.fn().mockResolvedValue({rows:[{arquivo_path:path,arquivo_hash:'wrong'}],rowCount:1}));
    await expect(originalDocumentoClientePostgres(bad,22,5,'DOC/1')).rejects.toMatchObject({status:409});
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it('rejeita caminho de original fora das pastas locais permitidas',async()=>{
  const pool=testPool(vi.fn().mockResolvedValue({rows:[{arquivo_path:join(process.cwd(),'package.json'),arquivo_hash:'x'}],rowCount:1}));
  await expect(originalDocumentoClientePostgres(pool,22,5,'DOC-2')).rejects.toMatchObject({status:403});
});

it('marca decisão obsoleta como candidata e escopa a consulta ao escritório',async()=>{
  const pool=testPool(vi.fn()
    .mockResolvedValueOnce({rows:[],rowCount:null})
    .mockResolvedValueOnce({rows:[],rowCount:null})
    .mockResolvedValueOnce({rows:[],rowCount:null})
    .mockResolvedValueOnce({rows:[{id:5}],rowCount:1})
    .mockResolvedValueOnce({rows:[{cliente_id:5,numero_registro:'DOC-1',status:'confirmado',motivo:'ok',contexto_hash:'old',origem:'manual',responsavel:'Ana',justificativa:'aplica',atualizado_em:new Date('2026-01-01T00:00:00Z'),incluir_envio:true,tipo:'Acordo',vigencia:'',arquivo_disponivel:false}],rowCount:1})
    .mockResolvedValueOnce({rows:[{cnpj:'11222333000181',uf:'DF',municipio:'Brasília'}],rowCount:1})
    .mockResolvedValueOnce({rows:[{arquivo_hash:'hash',documento_meta_json:{cnpjs:[]},tipo:'Acordo',vigencia:''}],rowCount:1})
    .mockResolvedValueOnce({rows:[],rowCount:0}));
  const [item]=await listarDocumentosClientePostgres(pool,22,5) as Array<Record<string,unknown>>;
  expect(item).toMatchObject({status:'candidato',desatualizado:true,origem:'regra',responsavel:null,justificativa:null,incluir_envio:true});
  expect(item.versao).toMatch(/^[a-f0-9]{64}$/);
  expect(pool.query).toHaveBeenNthCalledWith(4,expect.stringContaining('WHERE id=$1 AND escritorio_id=$2'),[5,22]);
  expect(pool.query).toHaveBeenNthCalledWith(5,expect.stringContaining('d.escritorio_id=$2'),[5,22]);
});
