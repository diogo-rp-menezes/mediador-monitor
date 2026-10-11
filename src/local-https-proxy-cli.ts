import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {criarProxyHttpsLocal} from './local-https-proxy.js';

try{
  const publicUrl=process.env.AUTH_PUBLIC_URL??'https://localhost:3443';
  const port=Number(new URL(publicUrl).port||443);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Porta HTTPS inválida.');
  const certPath=process.env.LOCAL_TLS_CERT,keyPath=process.env.LOCAL_TLS_KEY;
  if(!certPath||!keyPath)throw new Error('Defina LOCAL_TLS_CERT e LOCAL_TLS_KEY com certificado e chave locais.');
  const server=criarProxyHttpsLocal({cert:readFileSync(certPath),key:readFileSync(keyPath),upstreamPort:Number(process.env.UI_PORT||3000),publicUrl});
  server.on('error',()=>{console.error('Não foi possível iniciar o proxy HTTPS local.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`HTTPS local: ${new URL(publicUrl).origin}`));
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.close();server.closeAllConnections();});
}catch{
  console.error('Proxy HTTPS local indisponível. Confira origem HTTPS de loopback, portas, LOCAL_TLS_CERT e LOCAL_TLS_KEY.');process.exitCode=1;
}
