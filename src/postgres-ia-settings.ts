import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {ErroCadastro} from './cadastros.js';
const name='ia_runtime',format='ia-plataforma-v1';
const content=z.object({ativo:z.boolean(),base_url:z.string().trim().max(2048),modelo:z.string().trim().max(200),api_key:z.string().max(4000)}).strict();
const input=content.omit({api_key:true}).extend({api_key:z.string().max(4000).optional(),limpar_chave:z.boolean().optional(),versao:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1)}).strict();
type Content=z.infer<typeof content>;
type Envelope={formato:string;versao:number;cifrado:string};
const envelopeSchema=z.object({formato:z.literal(format),versao:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  cifrado:z.string().min(40).max(100000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();
const master=()=>{const key=Buffer.from(process.env.CREDENTIALS_MASTER_KEY??'','base64');if(key.length!==32)throw new ErroCadastro('Configure a chave mestra de credenciais para a IA.',503);return key;};
const aad=(version:number)=>Buffer.from(`${name}:${format}:${version}`);
function decode(value:Envelope):Content{
  try{
    if(value.formato!==format||!Number.isSafeInteger(value.versao)||value.versao<1)throw new Error('Envelope inválido.');
    const raw=Buffer.from(value.cifrado,'base64');if(raw.length<28)throw new Error('Envelope inválido.');
    const cipher=createDecipheriv('aes-256-gcm',master(),raw.subarray(0,12));cipher.setAAD(aad(value.versao));cipher.setAuthTag(raw.subarray(12,28));
    return content.parse(JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8')));
  }catch{throw new ErroCadastro('Configuração IA indisponível ou chave mestra divergente.',503);}
}
async function read(client:PoolClient):Promise<Envelope|undefined>{
  const row=(await client.query('SELECT valor_json FROM ajustes_plataforma WHERE chave=$1',[name])).rows[0];
  if(!row)return undefined;
  const value=envelopeSchema.safeParse(row.valor_json);
  if(!value.success)throw new ErroCadastro('Envelope de configuração IA inválido.',503);
  return value.data;
}
const empty=():Content=>({ativo:false,base_url:'',modelo:'',api_key:''});
const view=(value:Content,version:number)=>({ativo:value.ativo,base_url:value.base_url,modelo:value.modelo,tem_chave:!!value.api_key,versao:version});
export async function obterIaPostgres(client:PoolClient){const row=await read(client);return view(row?decode(row):empty(),row?.versao??0);}
/** Internal worker only. HTTP must use obterIaPostgres, which never exposes api_key. */
export async function obterIaConfiguradaPostgres(client:PoolClient){const row=await read(client);return row?{...decode(row),versao:row.versao}:null;}
export async function obterIaSecretaPostgres(client:PoolClient){const config=await obterIaConfiguradaPostgres(client);return config?.ativo?config:null;}
export async function salvarIaPostgres(client:PoolClient,raw:unknown){
  const data=input.parse(raw);
  if(data.limpar_chave&&data.api_key!==undefined)throw new ErroCadastro('Escolha informar ou limpar a chave.',400);
  if(data.base_url){
    let url:URL;try{url=new URL(data.base_url);}catch{throw new ErroCadastro('Endereço de IA inválido.',400);}
    if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))
      throw new ErroCadastro('IA exige HTTPS ou HTTP de loopback, sem credenciais, query ou fragmento na URL.',400);
  }
  if(data.ativo&&(!data.base_url||!data.modelo))throw new ErroCadastro('Informe endereço e modelo antes de ativar a IA.',400);
  // Serializes even the first write, when there is no row to lock yet.
  await client.query('SELECT pg_advisory_xact_lock(817204623)');
  const old=await read(client);
  if((old?.versao??0)!==data.versao)throw new ErroCadastro('Configuração IA alterada; atualize antes de salvar.',409);
  const previous=old?decode(old):empty(),next:Content={ativo:data.ativo,base_url:data.base_url.replace(/\/+$/,''),modelo:data.modelo,
    api_key:data.limpar_chave?'':data.api_key??previous.api_key};
  const version=data.versao+1,iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',master(),iv);cipher.setAAD(aad(version));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(next),'utf8'),cipher.final()]);
  const envelope:Envelope={formato:format,versao:version,cifrado:Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64')};
  await client.query(`INSERT INTO ajustes_plataforma(chave,valor_json) VALUES($1,$2::jsonb)
    ON CONFLICT(chave) DO UPDATE SET valor_json=EXCLUDED.valor_json,atualizado_em=now()`,[name,JSON.stringify(envelope)]);
  return view(next,version);
}

