import {constants} from 'node:fs';
import {lstat,realpath,mkdir,readdir,copyFile,mkdtemp,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {recuperarPacoteBackup} from './backup-package.js';
import {validarRelatorioForaDoPacote} from './backup-report-path.js';

/** Copies ciphertext only to the destination; authenticates all copied payloads before success. */
export async function copiarPacoteBackup(source:string,destination:string,key:Buffer){
  if(key.length!==32)throw new Error('Chave inválida.');
  const input=resolve(source),stat=await lstat(input);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Origem inválida.');
  const root=await realpath(input),output=join(await realpath(dirname(resolve(destination))),basename(resolve(destination)));
  validarRelatorioForaDoPacote(root,output);
  const names=(await readdir(root)).sort();
  if(names.length<2||names.length>10001||!names.includes('manifest.enc')||names.some(name=>!/^\d{6}\.enc$/.test(name)&&name!=='manifest.enc'))throw new Error('Inventário inválido.');
  await mkdir(output,{mode:0o700});
  let staging:string|undefined;
  try{
    let bytes=0;
    for(const name of names){
      const path=join(root,name),before=await lstat(path);
      if(!before.isFile()||before.isSymbolicLink())throw new Error('Arquivo irregular.');
      if(name==='manifest.enc'&&before.size>8*1024*1024)throw new Error('Manifesto excedido.');
      await copyFile(path,join(output,name),constants.COPYFILE_EXCL);
      await chmod(join(output,name),0o600);
      const after=await lstat(path);
      if(!after.isFile()||after.isSymbolicLink()||after.size!==before.size||after.ino!==before.ino||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw new Error('Origem alterada durante cópia.');
      bytes+=before.size;
    }
    if(JSON.stringify((await readdir(root)).sort())!==JSON.stringify(names))throw new Error('Inventário alterado durante cópia.');
    staging=await mkdtemp(join(tmpdir(),'mediador-copy-private-'));
    const recovered=await recuperarPacoteBackup(output,join(staging,'verified'),key);
    return {path:output,files:recovered.files,bytes};
  }catch{
    // mkdir above succeeded exclusively: only this newly owned destination can be removed.
    await rm(output,{recursive:true,force:true});throw new Error('Cópia do pacote não concluída.');
  }finally{if(staging)await rm(staging,{recursive:true,force:true});}
}
