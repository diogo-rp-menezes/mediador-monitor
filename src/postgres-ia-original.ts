import {openSync,fstatSync,readSync,closeSync} from 'node:fs';
import {arquivoPermitido,hashBytes} from './relatorio-core.js';
/** Bound allocation/read and hash the same bytes later parsed by the extractor. */
export function lerOriginalIaPostgres(path:string,hash:string):Buffer{
  const fd=openSync(arquivoPermitido(path),'r');
  try{
    const info=fstatSync(fd);if(!info.isFile()||info.size<1||info.size>20*1024*1024)throw new Error('Original inválido ou excessivo.');
    const bytes=Buffer.alloc(info.size);let offset=0;
    while(offset<bytes.length){const read=readSync(fd,bytes,offset,bytes.length-offset,null);if(!read)throw new Error('Original alterado durante leitura.');offset+=read;}
    if(readSync(fd,Buffer.alloc(1),0,1,null)||hashBytes(bytes)!==hash)throw new Error('Original divergente.');
    return bytes;
  }finally{closeSync(fd);}
}


