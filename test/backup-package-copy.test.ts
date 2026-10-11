import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,readdir,lstat,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {criarPacoteBackup,recuperarPacoteBackup} from '../src/backup-package.js';
import {copiarPacoteBackup} from '../src/backup-package-copy.js';

it('copia somente bytes cifrados e recupera após remover o pacote original',async()=>{
  const root=await mkdtemp(join(tmpdir(),'package-copy-test-')),key=Buffer.alloc(32,3);
  try{
    const source=join(root,'original'),pack=join(root,'pack'),copy=join(root,'copy');await writeFile(source,'conteúdo privado');
    await criarPacoteBackup([{source,path:'files/'+'a'.repeat(64)+'.bin',references:['origem.pdf']}],pack,key);
    const originalManifest=await readFile(join(pack,'manifest.enc')),originalBlob=await readFile(join(pack,'000000.enc'));
    const result=await copiarPacoteBackup(pack,copy,key);
    expect(result.files).toBe(1);expect(result.bytes).toBe(originalManifest.length+originalBlob.length);
    expect((await readdir(copy)).sort()).toEqual(['000000.enc','manifest.enc']);
    expect(await readFile(join(copy,'manifest.enc'))).toEqual(originalManifest);
    expect(await readFile(join(copy,'000000.enc'))).toEqual(originalBlob);
    expect(await readFile(join(pack,'manifest.enc'))).toEqual(originalManifest);
    await rm(pack,{recursive:true});await rm(source);
    const recovered=await recuperarPacoteBackup(copy,join(root,'recovered'),key);
    expect(recovered.references).toEqual([{origin:'origem.pdf',path:'files/'+'a'.repeat(64)+'.bin'}]);
    expect(await readFile(join(recovered.path,'files','a'.repeat(64)+'.bin'),'utf8')).toBe('conteúdo privado');
  }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
});
it('recusa chave incorreta e adulteração, limpando destino criado',async()=>{
  const root=await mkdtemp(join(tmpdir(),'package-copy-invalid-')),key=Buffer.alloc(32,3);
  try{
    const source=join(root,'original'),pack=join(root,'pack'),copy=join(root,'copy');await writeFile(source,'original');
    await criarPacoteBackup([{source,path:'main.dump'}],pack,key);
    await expect(copiarPacoteBackup(pack,copy,Buffer.alloc(32,4))).rejects.toThrow();await expect(lstat(copy)).rejects.toMatchObject({code:'ENOENT'});
    await writeFile(join(pack,'000000.enc'),'adulterado');
    await expect(copiarPacoteBackup(pack,copy,key)).rejects.toThrow();await expect(lstat(copy)).rejects.toMatchObject({code:'ENOENT'});
  }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
});
it('preserva destino existente e recusa pasta dentro da origem antes de modificar',async()=>{
  const root=await mkdtemp(join(tmpdir(),'package-copy-existing-')),key=Buffer.alloc(32,3);
  try{
    const source=join(root,'original'),pack=join(root,'pack'),copy=join(root,'copy');await writeFile(source,'original');
    await criarPacoteBackup([{source,path:'main.dump'}],pack,key);await mkdir(copy);await writeFile(join(copy,'keep'),'preservado');
    await expect(copiarPacoteBackup(pack,copy,key)).rejects.toThrow();expect(await readFile(join(copy,'keep'),'utf8')).toBe('preservado');
    await expect(copiarPacoteBackup(pack,join(pack,'nested'),key)).rejects.toThrow();
    expect((await readdir(pack)).sort()).toEqual(['000000.enc','manifest.enc']);
  }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
});
