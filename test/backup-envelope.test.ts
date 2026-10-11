import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,readdir,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {transformarBackup} from '../src/backup-envelope.js';

async function fixture(work:(dir:string)=>Promise<void>){
  const dir=await mkdtemp(join(tmpdir(),'mediador-backup-test-'));
  try{await work(dir);}finally{expect(resolve(dir).startsWith(resolve(tmpdir())+sep)).toBe(true);await rm(dir,{recursive:true,force:true});}
}
it('cifra bytes por stream com aleatoriedade e recupera conteúdo sem alterar origem',async()=>fixture(async dir=>{
  const bytes=randomBytes(2*1024*1024+7),key=randomBytes(32),source=join(dir,'source.dump');await writeFile(source,bytes);
  await transformarBackup(source,join(dir,'a.enc'),key,'cifrar');await transformarBackup(source,join(dir,'b.enc'),key,'cifrar');
  expect((await readFile(join(dir,'a.enc'))).equals(await readFile(join(dir,'b.enc')))).toBe(false);
  await transformarBackup(join(dir,'a.enc'),join(dir,'restored.dump'),key,'decifrar');
  expect((await readFile(join(dir,'restored.dump'))).equals(bytes)).toBe(true);expect((await readFile(source)).equals(bytes)).toBe(true);
  expect((await readdir(dir)).some(name=>name.endsWith('.tmp'))).toBe(false);
}));
it('recusa chave incorreta e adulterações sem publicar bytes não autenticados',async()=>fixture(async dir=>{
  const source=join(dir,'source'),encrypted=join(dir,'encrypted'),key=randomBytes(32);await writeFile(source,'Conteúdo privado do backup');
  await transformarBackup(source,encrypted,key,'cifrar');const bytes=await readFile(encrypted);
  await expect(transformarBackup(encrypted,join(dir,'wrong'),randomBytes(32),'decifrar')).rejects.toThrow();
  for(const index of [0,20,52,bytes.length-17,bytes.length-1]){
    const changed=Buffer.from(bytes);changed[index]^=1;await writeFile(join(dir,'changed'),changed);
    await expect(transformarBackup(join(dir,'changed'),join(dir,'result'),key,'decifrar')).rejects.toThrow();
    await expect(lstat(join(dir,'result'))).rejects.toMatchObject({code:'ENOENT'});
  }
  await writeFile(join(dir,'changed'),bytes.subarray(0,20));await expect(transformarBackup(join(dir,'changed'),join(dir,'result'),key,'decifrar')).rejects.toThrow();
  expect((await readdir(dir)).some(name=>name.endsWith('.tmp'))).toBe(false);await expect(lstat(join(dir,'wrong'))).rejects.toMatchObject({code:'ENOENT'});
}));
it('preserva destinos existentes e recusa origem igual, diretório ou chave inválida',async()=>fixture(async dir=>{
  const source=join(dir,'source'),destination=join(dir,'destination'),key=randomBytes(32);await writeFile(source,'original');await writeFile(destination,'preservado');
  await expect(transformarBackup(source,destination,key,'cifrar')).rejects.toThrow();expect(await readFile(destination,'utf8')).toBe('preservado');
  await expect(transformarBackup(source,source,key,'cifrar')).rejects.toThrow();expect(await readFile(source,'utf8')).toBe('original');
  await expect(transformarBackup(dir,join(dir,'bad'),key,'cifrar')).rejects.toThrow();
  await expect(transformarBackup(source,join(dir,'bad'),Buffer.alloc(1),'cifrar')).rejects.toThrow();
  expect((await readdir(dir)).some(name=>name.endsWith('.tmp'))).toBe(false);
}));
it('autentica e recupera arquivo vazio',async()=>fixture(async dir=>{
  const key=randomBytes(32);await writeFile(join(dir,'source'),'');await transformarBackup(join(dir,'source'),join(dir,'enc'),key,'cifrar');
  await transformarBackup(join(dir,'enc'),join(dir,'restored'),key,'decifrar');expect((await readFile(join(dir,'restored'))).length).toBe(0);
}));
