import {open,unlink} from 'node:fs/promises';
import type {Readable} from 'node:stream';
import {ErroLimiteVolumeMonitoramento} from './postgres-monitoring-limits.js';
/** Bounded local copy; Playwright may already have buffered the remote download. */
export async function copiarDownloadLimitado(stream:Readable,path:string,maxBytes:number,signal?:AbortSignal){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new ErroLimiteVolumeMonitoramento();
  signal?.throwIfAborted();
  const file=await open(path,'wx');let bytes=0,complete=false;
  const abort=()=>stream.destroy(new Error('Download interrompido.'));
  signal?.addEventListener('abort',abort,{once:true});
  try{
    signal?.throwIfAborted();
    for await(const chunk of stream){
      signal?.throwIfAborted();const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      if(bytes+buffer.length>maxBytes)throw new ErroLimiteVolumeMonitoramento();
      let offset=0;while(offset<buffer.length){const written=await file.write(buffer,offset,buffer.length-offset);offset+=written.bytesWritten;}
      bytes+=buffer.length;
    }
    signal?.throwIfAborted();complete=true;return bytes;
  }finally{
    signal?.removeEventListener('abort',abort);stream.destroy();await file.close();
    if(!complete)await unlink(path);
  }
}
