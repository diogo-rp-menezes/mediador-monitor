import {BlockList,isIP} from 'node:net';
import type {IncomingMessage} from 'node:http';

/** Explicit network allowlist; invalid configuration fails startup. Empty list trusts no proxy. */
export function criarResolvedorIp(trustedCidrs:string=''){
  const networks=new BlockList(),items=trustedCidrs.trim()?trustedCidrs.split(','):[];
  if(items.length>100)throw new Error('Lista de proxies confiáveis excessiva.');
  for(const item of items){
    const parts=item.trim().split('/'),address=parts[0],family=isIP(address);
    if(parts.length>2||!family||address.includes('%'))throw new Error('Proxy confiável deve ser IP ou CIDR válido.');
    const kind=family===4?'ipv4':'ipv6';
    if(parts.length===1)networks.addAddress(address,kind);
    else{
      if(!/^(0|[1-9]\d*)$/.test(parts[1]))throw new Error('Prefixo de proxy inválido.');
      const prefix=Number(parts[1]);if(prefix>(family===4?32:128))throw new Error('Prefixo de proxy inválido.');
      networks.addSubnet(address,prefix,kind);
    }
  }
  const trusted=(ip:string)=>{const family=isIP(ip);return !!family&&!ip.includes('%')&&networks.check(ip,family===4?'ipv4':'ipv6');};
  return (req:IncomingMessage)=>{
    const socket=req.socket.remoteAddress??'';
    if(!items.length||!trusted(socket))return socket;
    const header=req.headers['x-forwarded-for'];
    if(typeof header!=='string'||header.length>4096)return socket;
    const raw=req.rawHeaders??[];let copies=0;
    for(let i=0;i<raw.length;i+=2)if(raw[i].toLowerCase()==='x-forwarded-for')copies++;
    if(copies>1)return socket;
    const chain=header.split(',').map(value=>value.trim());
    if(!chain.length||chain.length>32||chain.some(ip=>!isIP(ip)||ip.includes('%')))return socket;
    // Walk toward the client only while the directly preceding hop is trusted.
    let current=socket;
    for(let i=chain.length-1;i>=0&&trusted(current);i--)current=chain[i];
    return current;
  };
}

let cachedConfig:string|undefined,cachedResolver:ReturnType<typeof criarResolvedorIp>|undefined;
export function resolverIpRequisicao(req:IncomingMessage){
  const config=process.env.AUTH_TRUSTED_PROXY_CIDRS??'';
  if(config!==cachedConfig||!cachedResolver){cachedResolver=criarResolvedorIp(config);cachedConfig=config;}
  return cachedResolver(req);
}
