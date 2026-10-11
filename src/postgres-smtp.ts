import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import {ErroCadastro} from './cadastros.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';

export type SmtpPostgresInput={ativo:boolean;host:string;porta:number;secure:boolean;usuario:string;remetente:string;senha?:string;limparSenha?:boolean};
export type SmtpPostgresView=Omit<SmtpPostgresInput,'senha'|'limparSenha'>&{temSenha:boolean;versao:number};
export type SmtpPostgresSecret=SmtpPostgresView&{senha:string};
const schema=z.object({ativo:z.boolean(),host:z.string().trim().max(500),porta:z.number().int().min(1).max(65535),secure:z.boolean(),usuario:z.string().trim().max(500),remetente:z.string().trim().max(998),senha:z.string().max(4000).optional(),limparSenha:z.boolean().optional()}).strict().superRefine((value,ctx)=>{if(value.ativo&&(!value.remetente||!z.string().email().safeParse(value.remetente).success))ctx.addIssue({code:'custom',path:['remetente'],message:'Informe um remetente de e-mail válido.'});});
const key=()=>{const value=Buffer.from(process.env.CREDENTIALS_MASTER_KEY||'','base64');if(value.length!==32)throw new ErroCadastro('Defina CREDENTIALS_MASTER_KEY (Base64 de 32 bytes) para proteger credenciais SMTP.',503);return value;};
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');}
function decrypt(value:string){try{const bytes=Buffer.from(value,'base64');if(bytes.length<28)throw new Error('short');const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');}catch{throw new ErroCadastro('Não foi possível decifrar a credencial SMTP. Verifique a chave mestra configurada.',503);}}
async function read(client:Pool|PoolClient,officeId:number){const result=await client.query<{ativo:boolean;host:string;porta:number;secure:boolean;usuario:string;remetente:string;senha_cifrada:string;versao:number}&QueryResultRow>(`SELECT ativo,host,porta,secure,usuario,remetente,senha_cifrada,versao FROM configuracoes_smtp_escritorio WHERE escritorio_id=$1`,[officeId]);return result.rows[0]??null;}
function isPool(client:Pool|PoolClient):client is Pool{return typeof (client as Pool).connect==='function'&&typeof (client as PoolClient).release!=='function';}
export async function obterSmtpPostgres(client:Pool|PoolClient,officeId:number):Promise<SmtpPostgresView>{
  if(isPool(client))return withPostgresOfficeTransaction(client,officeId,tx=>obterSmtpPostgres(tx,officeId));
  const row=await read(client,officeId);return {ativo:row?.ativo??false,host:row?.host??'',porta:row?.porta??587,secure:row?.secure??false,usuario:row?.usuario??'',remetente:row?.remetente??'',temSenha:!!row?.senha_cifrada,versao:row?.versao??0};
}
export async function obterSmtpSecretoPostgres(client:Pool|PoolClient,officeId:number):Promise<SmtpPostgresSecret|null>{
  if(isPool(client))return withPostgresOfficeTransaction(client,officeId,tx=>obterSmtpSecretoPostgres(tx,officeId));
  const row=await read(client,officeId);if(!row||!row.ativo||!row.host||!row.remetente)return null;return {ativo:row.ativo,host:row.host,porta:row.porta,secure:row.secure,usuario:row.usuario,remetente:row.remetente,temSenha:!!row.senha_cifrada,versao:row.versao,senha:row.senha_cifrada?decrypt(row.senha_cifrada):''};
}
export async function salvarSmtpPostgres(client:PoolClient,officeId:number,input:unknown):Promise<SmtpPostgresView>{const data=schema.parse(input),old=await read(client,officeId);const password=data.limparSenha?'':data.senha??(old?.senha_cifrada?decrypt(old.senha_cifrada):'');if(data.ativo&&!data.host)throw new ErroCadastro('Informe servidor SMTP e remetente antes de ativar.',400);if(data.usuario&&!password)throw new ErroCadastro('Informe a senha SMTP do usuário configurado.',400);const encrypted=password?encrypt(password):'';await client.query(`INSERT INTO configuracoes_smtp_escritorio(escritorio_id,ativo,host,porta,secure,usuario,remetente,senha_cifrada,versao,atualizado_em)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,now()) ON CONFLICT(escritorio_id) DO UPDATE SET ativo=excluded.ativo,host=excluded.host,porta=excluded.porta,secure=excluded.secure,usuario=excluded.usuario,remetente=excluded.remetente,senha_cifrada=excluded.senha_cifrada,versao=configuracoes_smtp_escritorio.versao+1,atualizado_em=now()`,[officeId,data.ativo,data.host,data.porta,data.secure,data.usuario,data.remetente,encrypted]);return obterSmtpPostgres(client,officeId);}

