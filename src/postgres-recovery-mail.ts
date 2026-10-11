import nodemailer from 'nodemailer';
import {z} from 'zod';
const schema=z.object({host:z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/),port:z.coerce.number().int().min(1).max(65535),
  from:z.string().email(),user:z.string().max(1000),password:z.string().max(4000),secure:z.enum(['0','1'])});
/** Platform identity transport, unrelated to office SMTP or imported legacy settings. */
export function criarEntregaRecuperacaoPostgres(publicUrl:string,env:NodeJS.ProcessEnv=process.env){
  if(env.AUTH_SMTP_ENABLED!==undefined&&!['0','1'].includes(env.AUTH_SMTP_ENABLED))throw new Error('AUTH_SMTP_ENABLED deve ser 0 ou 1.');
  if(env.AUTH_SMTP_ENABLED!=='1')return undefined;
  const cfg=schema.parse({host:env.AUTH_SMTP_HOST,port:env.AUTH_SMTP_PORT??587,from:env.AUTH_SMTP_FROM,
    user:env.AUTH_SMTP_USER??'',password:env.AUTH_SMTP_PASS??'',secure:env.AUTH_SMTP_SECURE??'0'});
  if(!!cfg.user!==!!cfg.password)throw new Error('Configure usuário e senha SMTP juntos.');
  const origin=new URL(publicUrl);
  if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!(origin.protocol==='https:'||origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))throw new Error('Origem de recuperação inválida.');
  return async(destination:string,token:string)=>{
    z.string().email().parse(destination);z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(token);
    const transport=nodemailer.createTransport({host:cfg.host,port:cfg.port,secure:cfg.secure==='1',requireTLS:cfg.secure!=='1',
      ...(cfg.user?{auth:{user:cfg.user,pass:cfg.password}}:{}),connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,
      tls:{rejectUnauthorized:true}});
    const link=new URL('/login',origin);link.hash=`recuperar=${token}`;
    try{
      await transport.sendMail({from:cfg.from,to:destination,subject:'[Mediador Monitor] Recuperar acesso',
        text:`Use o link abaixo para definir uma nova senha. Ele expira em 30 minutos e pode ser usado uma única vez.\n\n${link.href}\n\nSe você não solicitou, ignore esta mensagem.`,disableFileAccess:true,disableUrlAccess:true});
    }catch{throw new Error('Entrega de recuperação indisponível.');}
    finally{transport.close();}
  };
}

