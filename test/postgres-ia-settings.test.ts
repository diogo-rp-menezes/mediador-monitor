import {it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {obterIaPostgres,obterIaSecretaPostgres,salvarIaPostgres} from '../src/postgres-ia-settings.js';
function fixture(){
  const values=new Map<string,unknown>([['llm',{ativo:false,origem:'migracao-sqlite'}]]);
  const query=vi.fn(async(sql:string,args?:unknown[])=>{
    if(sql.startsWith('SELECT valor_json'))return {rows:values.has(String(args![0]))?[{valor_json:values.get(String(args![0]))}]:[]};
    if(sql.startsWith('INSERT INTO ajustes'))values.set(String(args![0]),JSON.parse(String(args![1])));
    return {rows:[]};
  });return {client:{query} as unknown as PoolClient,query,values};
}
const base={ativo:true,base_url:'https://provider.example.invalid/v1',modelo:'modelo-teste',versao:0};
it('cifra toda configuração, omite chave na vista, preserva importado e mantém chave ao editar',async()=>{
  vi.stubEnv('CREDENTIALS_MASTER_KEY',Buffer.alloc(32,7).toString('base64'));
  try{
    const f=fixture();expect((await obterIaPostgres(f.client)).ativo).toBe(false);expect(await obterIaSecretaPostgres(f.client)).toBeNull();
    const saved=await salvarIaPostgres(f.client,{...base,api_key:'segredo-ficticio'});
    expect(saved).toEqual({...base,versao:1,tem_chave:true});expect(JSON.stringify(f.values.get('ia_runtime'))).not.toContain('segredo-ficticio');
    expect(JSON.stringify(f.values.get('ia_runtime'))).not.toContain(base.base_url);
    expect(await obterIaPostgres(f.client)).toEqual(saved);expect((await obterIaSecretaPostgres(f.client))?.api_key).toBe('segredo-ficticio');
    await salvarIaPostgres(f.client,{...base,versao:1,modelo:'novo-modelo'});expect((await obterIaSecretaPostgres(f.client))?.api_key).toBe('segredo-ficticio');
    expect(f.values.get('llm')).toEqual({ativo:false,origem:'migracao-sqlite'});
    await expect(salvarIaPostgres(f.client,{...base,versao:1})).rejects.toMatchObject({status:409});
    await salvarIaPostgres(f.client,{...base,versao:2,limpar_chave:true});expect((await obterIaPostgres(f.client)).tem_chave).toBe(false);
  }finally{vi.unstubAllEnvs();}
});
it('recusa adulteração de versão e chave mestra divergente',async()=>{
  vi.stubEnv('CREDENTIALS_MASTER_KEY',Buffer.alloc(32,7).toString('base64'));
  try{
    const f=fixture();await salvarIaPostgres(f.client,{...base,api_key:'ficticio'});
    vi.stubEnv('CREDENTIALS_MASTER_KEY',Buffer.alloc(32,8).toString('base64'));
    await expect(obterIaPostgres(f.client)).rejects.toMatchObject({status:503});
    vi.stubEnv('CREDENTIALS_MASTER_KEY',Buffer.alloc(32,7).toString('base64'));
    (f.values.get('ia_runtime') as {versao:number}).versao=2;
    await expect(obterIaSecretaPostgres(f.client)).rejects.toMatchObject({status:503});
    f.values.set('ia_runtime',null);await expect(obterIaPostgres(f.client)).rejects.toMatchObject({status:503});
  }finally{vi.unstubAllEnvs();}
});
it('recusa URL insegura/credenciais e corpo ambíguo antes de acessar banco',async()=>{
  const f=fixture();
  for(const base_url of ['http://provider.example.invalid/v1','https://user:pass@provider.example.invalid','https://provider.example.invalid?token=abc','file:///tmp'])
    await expect(salvarIaPostgres(f.client,{...base,base_url})).rejects.toMatchObject({status:400});
  await expect(salvarIaPostgres(f.client,{...base,api_key:'x',limpar_chave:true})).rejects.toMatchObject({status:400});
  await expect(salvarIaPostgres(f.client,{...base,ator_id:7})).rejects.toThrow();expect(f.query).not.toHaveBeenCalled();
});
