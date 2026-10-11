import {lstat,readdir,realpath,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {FonteBackupRetencao} from './backup-retention-catalog.js';
const identity=(path:string)=>process.platform==='win32'?path.toLowerCase():path;

/** Dedicated roots contain only direct package directories. Authentication is performed separately. */
export async function conferirCoberturaBackups(roots:string[],sources:FonteBackupRetencao[]){
  if(roots.length>100)throw new Error('Excesso de pastas de backup.');
  const known=new Set<string>();
  for(const source of sources)known.add(identity(await realpath(source.pasta)));
  const unique=new Set<string>(),packages=new Map<string,string>();
  for(const root of roots){
    const rootStat=await lstat(root);
    if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('Pasta de backups irregular.');
    const canonical=await realpath(root),id=identity(canonical);
    if(unique.has(id))continue;unique.add(id);
    const children=await readdir(canonical);
    if(children.length>1000)throw new Error('Excesso de pacotes.');
    for(const name of children){
      const path=join(canonical,name),stat=await lstat(path);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Pasta deve conter somente diretórios de pacotes.');
      const packageId=identity(await realpath(path));
      if(!known.has(packageId))throw new Error('Pacote de backup fora do catálogo informado.');
      const manifest=join(path,'manifest.enc'),manifestStat=await lstat(manifest);
      if(!manifestStat.isFile()||manifestStat.isSymbolicLink()||manifestStat.size>8*1024*1024)throw new Error('Manifesto irregular.');
      packages.set(packageId,createHash('sha256').update(await readFile(manifest)).digest('hex'));
    }
  }
  return {raizes:unique.size,pacotes:packages.size,evidencia:[...packages].sort(([a],[b])=>a.localeCompare(b))};
}
