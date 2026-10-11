import {mkdtemp,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recuperarPacoteBackup} from './backup-package.js';
import {adicionarReferenciasOriginais} from './original-reference-values.js';

/** Retention evidence only; never imports the dump or authorizes deletion. */
export async function referenciasOriginaisBackupCifrado(source:string,key:Buffer){
  if(key.length!==32)throw new Error('Chave inválida.');
  const staging=await mkdtemp(join(tmpdir(),'mediador-retention-private-'));
  try{
    const recovered=await recuperarPacoteBackup(source,join(staging,'recovered'),key);
    if(!recovered.references)throw new Error('Inventário exige pacote v2 com referências autenticadas.');
    const references=new Set<string>(),hashed=new Set<string>();
    for(const reference of recovered.references){
      if(!/^files\/[a-f0-9]{64}\.bin$/.test(reference.path))throw new Error('Referência de arquivo desconhecida.');
      adicionarReferenciasOriginais(references,reference.origin);
      if(!hashed.has(reference.path)){
        const digest=createHash('sha256');
        for await(const chunk of createReadStream(join(recovered.path,...reference.path.split('/'))))digest.update(chunk);
        references.add('hash:'+digest.digest('hex'));hashed.add(reference.path);
      }
    }
    return references;
  }finally{await rm(staging,{recursive:true,force:true});}
}
