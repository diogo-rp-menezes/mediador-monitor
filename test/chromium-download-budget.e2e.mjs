import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {controlarDownloadsChromium} from '../dist/chromium-download-budget.js';
const root=resolve(tmpdir()),dir=mkdtempSync(join(root,'mediador-transfer-test-'));assert.ok(dir.startsWith(root+sep+'mediador-transfer-test-'));
let sent=0,browser,guard;
const server=createServer((req,res)=>{
  if(req.url.startsWith('/?')||req.url==='/'){const name=new URL(req.url,'http://localhost').searchParams.get('file')||'download';res.end(`<a href="/${name}">Download</a>`);return;}
  if(!['/download','/unknown','/small'].includes(req.url)){res.writeHead(404);res.end();return;}
  const headers={'content-type':'application/octet-stream','content-disposition':'attachment; filename="synthetic.bin"'};
  if(req.url==='/small'){res.writeHead(200,{...headers,'content-length':'512'});res.end(Buffer.alloc(512));return;}
  if(req.url!=='/unknown')headers['content-length']='1048576';res.writeHead(200,headers);
  const timer=setInterval(()=>{sent+=1024;res.write(Buffer.alloc(1024));if(sent>=1048576){clearInterval(timer);res.end();}},10);
  res.on('close',()=>clearInterval(timer));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  browser=await chromium.launch({headless:true,downloadsPath:dir});const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);let exceeded=false;
  guard=await controlarDownloadsChromium({browser,context,page},dir,1024,()=>{exceeded=true;});
  const pending=page.waitForEvent('download');await page.getByText('Download',{exact:true}).click();const download=await pending;
  const failure=await download.failure();assert.ok(failure);assert.equal(exceeded,true);assert.ok(sent<1048576);
  assert.throws(()=>guard.conferir(),/volume/);
  console.log(`Chromium local: download cancelado durante transferência; ${sent} de 1048576 bytes enviados pelo servidor sintético.`);
  await browser.close();await guard.encerrar();sent=0;
  browser=await chromium.launch({headless:true,downloadsPath:dir});const unknownContext=await browser.newContext({acceptDownloads:true}),unknownPage=await unknownContext.newPage();
  await unknownPage.goto(`http://127.0.0.1:${server.address().port}/?file=unknown`);
  guard=await controlarDownloadsChromium({browser,context:unknownContext,page:unknownPage},dir,16384,()=>{});
  const unknownPending=unknownPage.waitForEvent('download');await unknownPage.getByText('Download',{exact:true}).click();const unknownDownload=await unknownPending;
  assert.ok(await unknownDownload.failure());assert.ok(sent>=16384&&sent<1048576);assert.throws(()=>guard.conferir(),/volume/);
  console.log(`Chromium local: tamanho desconhecido interrompido após ${sent} bytes, antes do término.`);
  await browser.close();await guard.encerrar();
  browser=await chromium.launch({headless:true,downloadsPath:dir});const smallContext=await browser.newContext({acceptDownloads:true}),smallPage=await smallContext.newPage();
  await smallPage.goto(`http://127.0.0.1:${server.address().port}/?file=small`);
  guard=await controlarDownloadsChromium({browser,context:smallContext,page:smallPage},dir,1024,()=>{throw new Error('Download pequeno não deve ser interrompido');});
  const smallPending=smallPage.waitForEvent('download');await smallPage.getByText('Download',{exact:true}).click();const smallDownload=await smallPending;
  assert.equal(await smallDownload.failure(),null);const stream=await smallDownload.createReadStream();let copied=0;for await(const chunk of stream)copied+=chunk.length;
  assert.equal(copied,512);guard.conferir();console.log('Chromium local: arquivo dentro do limite recebido e stream Playwright preservado.');
}finally{
  await browser?.close();await guard?.encerrar();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});
}
