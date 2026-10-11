import {afterEach,expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import {obterSmtpPostgres,obterSmtpSecretoPostgres,salvarSmtpPostgres} from '../src/postgres-smtp.js';

const key=Buffer.alloc(32,7).toString('base64');
afterEach(()=>{vi.unstubAllEnvs();});
const config={ativo:true,host:'smtp.example.test',porta:587,secure:false,usuario:'mailer',remetente:'alerts@example.test',senha_cifrada:'',versao:1};

it('reutiliza o PoolClient conectado sem tentar conectar novamente',async()=>{
  const client={connect:vi.fn(async()=>{throw new Error('already connected');}),release:vi.fn(),query:vi.fn(async()=>({rows:[config],rowCount:1}))} as unknown as PoolClient;
  await expect(obterSmtpSecretoPostgres(client,4)).resolves.toMatchObject({host:'smtp.example.test',senha:''});
  expect(client.connect).not.toHaveBeenCalled();
});

it('não revela a senha na vista e retorna padrão neutro sem configuração',async()=>{
  const query=vi.fn(async(sql:string,values?:unknown[])=>({rows:sql.includes('SELECT ativo')&&values?.[0]===4?[config]:[],rowCount:sql.includes('SELECT ativo')&&values?.[0]===4?1:0}));const client={query,release:vi.fn()};
  const pool={query,connect:vi.fn(async()=>client)} as unknown as Pool;
  await expect(obterSmtpPostgres(pool,4)).resolves.toEqual({ativo:true,host:config.host,porta:587,secure:false,usuario:'mailer',remetente:config.remetente,temSenha:false,versao:1});
  await expect(obterSmtpPostgres(pool,5)).resolves.toEqual({ativo:false,host:'',porta:587,secure:false,usuario:'',remetente:'',temSenha:false,versao:0});
});

it('cifra a senha, preserva quando omitida e nunca a inclui na vista',async()=>{
  vi.stubEnv('CREDENTIALS_MASTER_KEY',key);
  const encrypted={...config,senha_cifrada:'',versao:1};
  const client={query:vi.fn()
    .mockResolvedValueOnce({rows:[{...encrypted,senha_cifrada:'existing-cipher'}],rowCount:1})
    .mockResolvedValueOnce({rowCount:1})
    .mockResolvedValueOnce({rows:[{...encrypted,senha_cifrada:expect.any(String),versao:2}],rowCount:1})} as unknown as PoolClient;
  const result=await salvarSmtpPostgres(client,4,{ativo:true,host:config.host,porta:587,secure:false,usuario:'mailer',remetente:config.remetente,senha:'senha-super-secreta'});
  const stored=(client.query as ReturnType<typeof vi.fn>).mock.calls[1][1][7] as string;
  expect(stored).not.toContain('senha-super-secreta');expect(result).not.toHaveProperty('senha');expect(result.temSenha).toBe(true);
  const row={...config,senha_cifrada:stored,versao:2};
  const readClient={query:vi.fn().mockResolvedValue({rows:[row],rowCount:1})} as unknown as PoolClient;
  await expect(obterSmtpSecretoPostgres(readClient,4)).resolves.toMatchObject({senha:'senha-super-secreta'});
  await expect(salvarSmtpPostgres({query:vi.fn().mockResolvedValue({rows:[row],rowCount:1})} as unknown as PoolClient,4,{ativo:true,host:config.host,porta:587,secure:false,usuario:'mailer',remetente:config.remetente})).resolves.toMatchObject({temSenha:true});
});

it('exige chave mestra para persistir senha e valida porta',async()=>{
  vi.stubEnv('CREDENTIALS_MASTER_KEY','');
  const client={query:vi.fn().mockResolvedValue({rows:[],rowCount:0})} as unknown as PoolClient;
  await expect(salvarSmtpPostgres(client,4,{ativo:false,host:'',porta:70000,secure:false,usuario:'',remetente:'alerts@example.test'})).rejects.toBeDefined();
});
