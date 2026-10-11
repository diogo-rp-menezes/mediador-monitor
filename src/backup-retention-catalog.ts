import {readFile,lstat,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {referenciasOriginaisBackupCifrado} from './encrypted-backup-original-references.js';

const schema=z.object({
  formato:z.literal('catalogo-backups-retencao-v1'),
  pacotes:z.array(z.object({
    pasta:z.string().min(1).max(4096),
    chave_env:z.string().regex(/^BACKUP_ENCRYPTION_KEY(?:_[A-Z0-9_]+)?$/)
  }).strict()).min(1).max(1000)
}).strict();
export type FonteBackupRetencao={pasta:string;chave_env:string};

/** The catalog contains locations and environment variable names, never key values. */
export async function lerCatalogoBackupsRetencao(file:string):Promise<FonteBackupRetencao[]>{
  const path=resolve(file),stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error('Catálogo inválido.');
  const catalog=schema.parse(JSON.parse(await readFile(path,'utf8')));
  return catalog.pacotes.map(item=>({...item,pasta:resolve(dirname(path),item.pasta)}));
}

/** All sources must validate; there is no partial result when any key/package fails. */
export async function referenciasCatalogoBackups(sources:FonteBackupRetencao[],environment:NodeJS.ProcessEnv=process.env){
  const unique=new Map<string,FonteBackupRetencao>();
  for(const source of sources){
    // Validate direct callers as well as catalog input.
    schema.shape.pacotes.element.parse(source);
    const canonical=await realpath(source.pasta);
    const id=process.platform==='win32'?canonical.toLowerCase():canonical;
    const previous=unique.get(id);
    if(previous&&previous.chave_env!==source.chave_env)throw new Error('Chaves conflitantes para o mesmo pacote.');
    unique.set(id,source);
  }
  const references=new Set<string>();
  for(const source of unique.values()){
    const encoded=environment[source.chave_env]??'',key=Buffer.from(encoded,'base64');
    try{
      if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded)||key.length!==32||key.toString('base64')!==encoded)throw new Error('Chave de backup inválida.');
      for(const reference of await referenciasOriginaisBackupCifrado(source.pasta,key))references.add(reference);
    }finally{key.fill(0);}
  }
  return {references,pacotes:unique.size};
}
