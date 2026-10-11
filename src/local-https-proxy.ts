import https from 'node:https';
import http, {type IncomingHttpHeaders} from 'node:http';

const hopHeaders=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function clean(headers:IncomingHttpHeaders){
  const blocked=new Set([...hopHeaders,...String(headers.connection??'').split(',').map(v=>v.trim().toLowerCase())]);
  return Object.fromEntries(Object.entries(headers).filter(([key])=>!blocked.has(key)));
}

/** Local TLS terminator. No static files, dynamic upstreams or external listeners. */
export function criarProxyHttpsLocal(options:{cert:Buffer;key:Buffer;upstreamPort:number;publicUrl:string}){
  const origin=new URL(options.publicUrl);
  if(origin.protocol!=='https:'||!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
    throw new Error('HTTPS local exige origem HTTPS de loopback sem caminho ou credenciais.');
  if(!Number.isInteger(options.upstreamPort)||options.upstreamPort<1||options.upstreamPort>65535)throw new Error('Porta da aplicação inválida.');
  const server=https.createServer({cert:options.cert,key:options.key,minVersion:'TLSv1.2'},(req,res)=>{
    if(req.headers.host!==origin.host){res.writeHead(421);res.end();return;}
    if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return;}
    const headers=clean(req.headers);
    for(const key of Object.keys(headers))if(key==='forwarded'||key.startsWith('x-forwarded-'))delete headers[key];
    headers.host=origin.host;
    headers['x-forwarded-for']=req.socket.remoteAddress??'127.0.0.1';
    headers['x-forwarded-proto']='https';headers['x-forwarded-host']=origin.host;
    const upstream=http.request({host:'127.0.0.1',port:options.upstreamPort,path:req.url,method:req.method,headers},response=>{
      res.writeHead(response.statusCode??502,clean(response.headers));response.pipe(res);
      response.on('error',()=>res.destroy());
    });
    upstream.setTimeout(30000,()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent){res.writeHead(502);res.end('Aplicação local indisponível.');}else res.destroy();});
    req.on('aborted',()=>upstream.destroy());req.on('error',()=>upstream.destroy());
    res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});
    req.pipe(upstream);
  });
  server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return server;
}
