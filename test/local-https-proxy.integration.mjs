import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import http from 'node:http';
import https from 'node:https';
import {criarProxyHttpsLocal} from '../dist/local-https-proxy.js';
import {criarResolvedorIp} from '../dist/request-ip.js';
if(!process.env.MEDIADOR_SMTP_TEST_CERT){
  const certDir=mkdtempSync(join(tmpdir(),'mediador-smtp-test-'));
  try{
    const candidates=process.env.OPENSSL_BIN?[process.env.OPENSSL_BIN]:['openssl','C:/Program Files/Git/usr/bin/openssl.exe','C:/Program Files/Git/mingw64/bin/openssl.exe'];
    const openssl=candidates.find(path=>{try{execFileSync(path,['version'],{stdio:'ignore',windowsHide:true});return true;}catch{return false;}});
    assert.ok(openssl,'Defina OPENSSL_BIN ou instale OpenSSL/Git para Windows.');
    const cert=join(certDir,'cert.pem'),key=join(certDir,'key.pem');
    execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore',windowsHide:true});
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{stdio:'inherit',windowsHide:true,env:{...process.env,NODE_EXTRA_CA_CERTS:cert,MEDIADOR_SMTP_TEST_CERT:cert,MEDIADOR_SMTP_TEST_KEY:key}});
    if(result.error)throw result.error;
    process.exitCode=result.status??1;
  }finally{assert.equal(resolve(certDir).startsWith(resolve(tmpdir())+sep),true);rmSync(certDir,{recursive:true,force:true});}
}else{


let proxy;const observed=[];const resolveIp=criarResolvedorIp('127.0.0.1');
const app=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{observed.push({url:req.url,body,ip:resolveIp(req),headers:req.headers});res.writeHead(200,{'content-type':'application/octet-stream','set-cookie':'sessao=teste; HttpOnly; Secure; SameSite=Lax'});res.end(Buffer.from([0,1,2,255]));});});
function request(port,path='/',headers={},body=''){
 return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',servername:'localhost',port,path,method:body?'POST':'GET',headers:{host:'localhost:3443',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);});req.on('error',reject);req.end(body);});
}
try{
 app.listen(0,'127.0.0.1');await once(app,'listening');
 const options={cert:readFileSync(process.env.MEDIADOR_SMTP_TEST_CERT),key:readFileSync(process.env.MEDIADOR_SMTP_TEST_KEY),upstreamPort:app.address().port,publicUrl:'https://localhost:3443'};
 for(const url of ['http://localhost:3443','https://example.com','https://localhost/path','https://user:pass@localhost'])assert.throws(()=>criarProxyHttpsLocal({...options,publicUrl:url}));
 proxy=criarProxyHttpsLocal(options);proxy.listen(0,'127.0.0.1');await once(proxy,'listening');const port=proxy.address().port;
 const result=await request(port,'/api/contexto?pagina=2',{'x-forwarded-for':'203.0.113.55','x-forwarded-proto':'http',forwarded:'for=203.0.113.55','x-forwarded-extra':'malicioso'},'corpo de teste');
 assert.equal(result.status,200);assert.deepEqual(result.body,Buffer.from([0,1,2,255]));assert.match(result.headers['set-cookie'][0],/Secure/);
 assert.equal(observed[0].url,'/api/contexto?pagina=2');assert.equal(observed[0].body,'corpo de teste');assert.equal(observed[0].ip,'127.0.0.1');
 assert.equal(observed[0].headers['x-forwarded-proto'],'https');assert.equal(observed[0].headers.forwarded,undefined);assert.equal(observed[0].headers['x-forwarded-extra'],undefined);
 assert.equal((await request(port,'/',{host:'example.com'})).status,421);
 assert.equal((await request(port,'//example.com')).status,400);assert.equal(observed.length,1);
 await new Promise(resolve=>app.close(resolve));
 assert.equal((await request(port)).status,502);
 console.log('OK: HTTPS com certificado validado, encaminhamento de corpo/bytes/cookie, IP sem cabeçalho forjado, origem inválida recusada e upstream indisponível.');
}finally{
 if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
 app.closeAllConnections();if(app.listening)await new Promise(resolve=>app.close(resolve));
}
}

