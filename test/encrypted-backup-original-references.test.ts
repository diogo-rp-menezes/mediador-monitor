import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,readdir,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {criarPacoteBackup} from '../src/backup-package.js';
import {referenciasOriginaisBackupCifrado} from '../src/encrypted-backup-original-references.js';
import {inventariarOriginais} from '../src/postgres-original-inventory.js';

it('protege cópia renomeada por hash com origem removida e preserva pacote',async()=>{
  const root=await mkdtemp(join(tmpdir(),'encrypted-retention-test-')),key=Buffer.alloc(32,9);
  try{
    const bytes=Buffer.from('original de teste'),hash=createHash('sha256').update(bytes).digest('hex');
    const source=join(root,'source.pdf'),origin=join(root,'old','original.pdf'),pack=join(root,'package');
    await writeFile(source,bytes);
    await criarPacoteBackup([{source,path:'files/'+'a'.repeat(64)+'.bin',references:[origin]}],pack,key);
    const manifest=await readFile(join(pack,'manifest.enc'));
    const references=await referenciasOriginaisBackupCifrado(pack,key);
    expect(references.has(resolve(origin).toLowerCase())).toBe(true);expect(references.has('hash:'+hash)).toBe(true);
    const candidate=join(root,`DF000001_2026-${hash.slice(0,12)}.pdf`);
    await writeFile(candidate,bytes);await utimes(candidate,new Date(0),new Date(0));
    expect((await inventariarOriginais(root,new Set())).candidatos).toHaveLength(1);
    expect((await inventariarOriginais(root,references)).candidatos).toHaveLength(0);
    expect(await readFile(join(pack,'manifest.enc'))).toEqual(manifest);
    expect((await readdir(pack)).sort()).toEqual(['000000.enc','manifest.enc']);
  }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
});
it('recusa pacote sem mapa, chave incorreta e conteúdo adulterado',async()=>{
  const root=await mkdtemp(join(tmpdir(),'encrypted-retention-negative-')),key=Buffer.alloc(32,9);
  try{
    const source=join(root,'source');await writeFile(source,'test');
    await criarPacoteBackup([{source,path:'database/main.dump'}],join(root,'v1'),key);
    await expect(referenciasOriginaisBackupCifrado(join(root,'v1'),key)).rejects.toThrow('v2');
    const pack=join(root,'v2');await criarPacoteBackup([{source,path:'files/'+'a'.repeat(64)+'.bin',references:[source]}],pack,key);
    await expect(referenciasOriginaisBackupCifrado(pack,Buffer.alloc(32,1))).rejects.toThrow();
    await writeFile(join(pack,'000000.enc'),'corrupt');
    await expect(referenciasOriginaisBackupCifrado(pack,key)).rejects.toThrow();
  }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
});
