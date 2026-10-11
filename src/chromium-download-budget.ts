import type {Sessao} from './scraper.js';
import {ErroLimiteVolumeMonitoramento} from './postgres-monitoring-limits.js';

/** Reacts to Chromium progress; event batching means this is not an exact wire-byte ceiling. */
export async function controlarDownloadsChromium(session:Sessao,path:string,maxBytes:number,onExceeded:()=>void){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Orçamento de transferência inválido.');
  const pageClient=await session.context.newCDPSession(session.page);
  let contextId:string|undefined;
  try{contextId=(await pageClient.send('Target.getTargetInfo')).targetInfo.browserContextId;}
  finally{await pageClient.detach();}
  if(!contextId)throw new Error('Contexto isolado de download não identificado.');
  const client=await session.browser.newBrowserCDPSession();
  const downloads=new Map<string,number>();let received=0,exceeded=false;
  const pending=new Set<Promise<unknown>>();
  const begin=(event:{guid:string})=>{downloads.set(event.guid,0);};
  const progress=(event:{guid:string;receivedBytes:number;totalBytes:number})=>{
    if(!downloads.has(event.guid)||exceeded)return;
    const old=downloads.get(event.guid)!;
    if(!Number.isFinite(event.receivedBytes)||event.receivedBytes<0){exceeded=true;onExceeded();return;}
    const current=Math.max(old,event.receivedBytes);received+=current-old;downloads.set(event.guid,current);
    if(received>maxBytes||current>50*1024*1024||event.totalBytes>50*1024*1024||
      event.totalBytes>0&&received-current+event.totalBytes>maxBytes){
      exceeded=true;
      const cancellation=client.send('Browser.cancelDownload',{guid:event.guid,browserContextId:contextId}).catch(()=>{});
      pending.add(cancellation);void cancellation.finally(()=>pending.delete(cancellation));
      onExceeded();
    }
  };
  client.on('Browser.downloadWillBegin',begin);client.on('Browser.downloadProgress',progress);
  try{await client.send('Browser.setDownloadBehavior',{behavior:'allowAndName',browserContextId:contextId,downloadPath:path,eventsEnabled:true});}
  catch(error){client.off('Browser.downloadWillBegin',begin);client.off('Browser.downloadProgress',progress);await client.detach().catch(()=>{});throw error;}
  return {
    conferir:()=>{if(exceeded)throw new ErroLimiteVolumeMonitoramento();},
    encerrar:async()=>{client.off('Browser.downloadWillBegin',begin);client.off('Browser.downloadProgress',progress);await Promise.allSettled([...pending]);await client.detach().catch(()=>{});}
  };
}

