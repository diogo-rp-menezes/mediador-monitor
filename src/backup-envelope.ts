import {createCipheriv,createDecipheriv,randomBytes,hkdfSync} from 'node:crypto';
import {open,lstat,link,unlink} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable,Writable} from 'node:stream';

const MAGIC=Buffer.from('MEDIADOR-BACKUP-1\n','ascii'),SALT_BYTES=32,IV_BYTES=12,TAG_BYTES=16;
const HEADER_BYTES=MAGIC.length+SALT_BYTES+IV_BYTES;
const INFO=Buffer.from('mediador-backup-envelope-v1','ascii');
function derive(key:Buffer,salt:Buffer){
  if(key.length!==32)throw new Error('Chave de backup deve ter 32 bytes.');
  return Buffer.from(hkdfSync('sha256',key,salt,INFO,32));
}

/** Writes a private sibling and publishes without overwrite only after successful authentication. */
export async function transformarBackup(input:string,output:string,key:Buffer,mode:'cifrar'|'decifrar'){
  if(mode!=='cifrar'&&mode!=='decifrar')throw new Error('Operação de backup inválida.');
  if(key.length!==32)throw new Error('Chave de backup deve ter 32 bytes.');
  const sourcePath=resolve(input),destination=resolve(output);
  if(sourcePath.toLowerCase()===destination.toLowerCase())throw new Error('Origem e destino devem ser diferentes.');
  const stat=await lstat(sourcePath);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Origem deve ser arquivo regular.');
  const temporary=join(dirname(destination),`.mediador-backup-${randomBytes(16).toString('hex')}.tmp`);
  const source=await open(sourcePath,'r');let target:Awaited<ReturnType<typeof open>>|undefined;
  try{
    const opened=await source.stat();
    if(opened.ino!==stat.ino||opened.size!==stat.size||opened.mtimeMs!==stat.mtimeMs)throw new Error('Origem mudou antes da leitura.');
    target=await open(temporary,'wx',0o600);
    const read=(start:number,end:number)=>Readable.from((async function*(){
      let position=start;
      while(position<end){const chunk=Buffer.alloc(Math.min(65536,end-position));const {bytesRead}=await source.read(chunk,0,chunk.length,position);if(!bytesRead)throw new Error('Origem truncada.');position+=bytesRead;yield chunk.subarray(0,bytesRead);}
    })());
    const write=(start:number)=>{let position=start;return new Writable({write(chunk:Buffer,_encoding,done){void(async()=>{let offset=0;while(offset<chunk.length){const {bytesWritten}=await target!.write(chunk,offset,chunk.length-offset,position);if(!bytesWritten)throw new Error('Gravação incompleta.');offset+=bytesWritten;position+=bytesWritten;}})().then(()=>done(),done);}});};
    const writeBytes=async(bytes:Buffer,position:number)=>{let offset=0;while(offset<bytes.length){const {bytesWritten}=await target!.write(bytes,offset,bytes.length-offset,position+offset);if(!bytesWritten)throw new Error('Gravação incompleta.');offset+=bytesWritten;}};
    const readBytes=async(bytes:Buffer,position:number)=>{let offset=0;while(offset<bytes.length){const {bytesRead}=await source.read(bytes,offset,bytes.length-offset,position+offset);if(!bytesRead)throw new Error('Backup truncado.');offset+=bytesRead;}};
    if(mode==='cifrar'){
      const salt=randomBytes(SALT_BYTES),iv=randomBytes(IV_BYTES),header=Buffer.concat([MAGIC,salt,iv]);
      await writeBytes(header,0);
      const cipher=createCipheriv('aes-256-gcm',derive(key,salt),iv);cipher.setAAD(header);
      await pipeline(read(0,opened.size),cipher,write(HEADER_BYTES));
      const tag=cipher.getAuthTag();await writeBytes(tag,HEADER_BYTES+opened.size);
    }else{
      if(opened.size<HEADER_BYTES+TAG_BYTES)throw new Error('Backup cifrado incompleto.');
      const header=Buffer.alloc(HEADER_BYTES),tag=Buffer.alloc(TAG_BYTES);
      await readBytes(header,0);await readBytes(tag,opened.size-TAG_BYTES);
      if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Formato de backup cifrado inválido.');
      const salt=header.subarray(MAGIC.length,MAGIC.length+SALT_BYTES),iv=header.subarray(MAGIC.length+SALT_BYTES);
      const decipher=createDecipheriv('aes-256-gcm',derive(key,salt),iv);decipher.setAAD(header);decipher.setAuthTag(tag);
      if(opened.size===HEADER_BYTES+TAG_BYTES){decipher.final();}
      else await pipeline(read(HEADER_BYTES,opened.size-TAG_BYTES),decipher,write(0));
    }
    const after=await source.stat();
    if(after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)throw new Error('Origem mudou durante a leitura.');
    await target.sync();await target.close();target=undefined;
    // link is atomic and refuses an existing destination, including a symlink.
    await link(temporary,destination);
    return {path:destination,bytes:(await lstat(destination)).size};
  }catch{
    throw new Error('Backup não concluído: confira chave, integridade, origem e destino inexistente.');
  }finally{
    await source.close();await target?.close().catch(()=>{});await unlink(temporary).catch(()=>{});
  }
}
