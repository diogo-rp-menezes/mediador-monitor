import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

const format='mediador-chaves-backup-v1';
const base64=(bytes:number)=>z.string().refine(value=>{const decoded=Buffer.from(value,'base64');return decoded.length===bytes&&decoded.toString('base64')===value;});
const payload=z.object({BACKUP_ENCRYPTION_KEY:base64(32),CREDENTIALS_MASTER_KEY:base64(32)}).strict();
const envelope=z.object({formato:z.literal(format),iv:base64(12),tag:base64(16),cifrado:z.string().min(1).max(4096).refine(value=>Buffer.from(value,'base64').toString('base64')===value)}).strict();
export type ChavesBackup={backupKey:Buffer;credentialsKey:Buffer};
function validate(keys:ChavesBackup,recovery:Buffer){
  if([keys.backupKey,keys.credentialsKey,recovery].some(key=>key.length!==32)||timingSafeEqual(keys.backupKey,keys.credentialsKey)||timingSafeEqual(keys.backupKey,recovery)||timingSafeEqual(keys.credentialsKey,recovery))throw new Error('Use três chaves distintas de 32 bytes.');
}
/** Encrypted key copy only; never persists or reports plaintext keys. */
export function criarCopiaChavesBackup(keys:ChavesBackup,recovery:Buffer){
  validate(keys,recovery);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',recovery,iv);cipher.setAAD(Buffer.from(format));
  const clear=Buffer.from(JSON.stringify({BACKUP_ENCRYPTION_KEY:keys.backupKey.toString('base64'),CREDENTIALS_MASTER_KEY:keys.credentialsKey.toString('base64')}));
  try{
    const encrypted=Buffer.concat([cipher.update(clear),cipher.final()]);
    return JSON.stringify({formato:format,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),cifrado:encrypted.toString('base64')})+'\n';
  }finally{clear.fill(0);}
}
/** Caller owns the recovered buffers and must clear them after use. */
export function recuperarCopiaChavesBackup(input:string,recovery:Buffer):ChavesBackup{
  let clear:Buffer|undefined,backupKey:Buffer|undefined,credentialsKey:Buffer|undefined;
  try{
    if(input.length>8192||recovery.length!==32)throw new Error();
    const value=envelope.parse(JSON.parse(input)),cipher=createDecipheriv('aes-256-gcm',recovery,Buffer.from(value.iv,'base64'));
    cipher.setAAD(Buffer.from(format));cipher.setAuthTag(Buffer.from(value.tag,'base64'));
    clear=Buffer.concat([cipher.update(Buffer.from(value.cifrado,'base64')),cipher.final()]);
    const data=payload.parse(JSON.parse(clear.toString('utf8')));
    backupKey=Buffer.from(data.BACKUP_ENCRYPTION_KEY,'base64');credentialsKey=Buffer.from(data.CREDENTIALS_MASTER_KEY,'base64');validate({backupKey,credentialsKey},recovery);
    return {backupKey,credentialsKey};
  }catch{
    backupKey?.fill(0);credentialsKey?.fill(0);throw new Error('Cópia de chaves inválida, adulterada ou chave de recuperação incompatível.');
  }finally{clear?.fill(0);}
}
