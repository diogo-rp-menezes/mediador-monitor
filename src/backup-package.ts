import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,writeFile,readFile,lstat,unlink,rm,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {z} from 'zod';
import {transformarBackup} from './backup-envelope.js';

const logical=z.string().min(1).max(240).refine(value=>value.split('/').every(part=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)&&!part.endsWith('.')&&!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)),'Caminho lógico inválido');
const entry=z.object({path:logical,blob:z.string().regex(/^\d{6}\.enc$/),bytes:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const reference=z.string().min(1).max(4096).refine(value=>!value.includes('\0'));
const schema=z.discriminatedUnion('format',[
  z.object({format:z.literal('mediador-package-v1'),files:z.array(entry).min(1).max(10000)}).strict(),
  z.object({format:z.literal('mediador-package-v2'),files:z.array(entry.extend({references:z.array(reference).max(10000).optional()}).strict()).min(1).max(10000)}).strict()
]);
type Manifest=z.infer<typeof schema>;
export type ArquivoPacoteBackup={source:string;path:string;references?:string[];sha256?:string;bytes?:number};
export type ReferenciaRecuperadaBackup={origin:string;path:string};
function mapping(files:ArquivoPacoteBackup[]):ReferenciaRecuperadaBackup[]{
  const aliases=new Map<string,string>();
  for(const file of files)for(const alias of file.references??[]){reference.parse(alias);if(aliases.has(alias))throw new Error('Referência de origem duplicada.');aliases.set(alias,file.path);}
  return [...aliases].map(([origin,path])=>({origin,path}));
}
async function hash(path:string){const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);return digest.digest('hex');}
function validatePaths(paths:string[]){
  const used=new Set<string>();
  for(const path of paths){logical.parse(path);const folded=path.toLowerCase();if(used.has(folded))throw new Error('Caminho duplicado.');used.add(folded);}
  for(const path of used){const parts=path.split('/');parts.pop();while(parts.length){if(used.has(parts.join('/')))throw new Error('Conflito entre arquivo e diretório.');parts.pop();}}
}
async function regular(path:string){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Arquivo irregular.');return stat;}

/** Explicit inputs only: caller must freeze writers and inventory all required files. */
export async function criarPacoteBackup(files:ArquivoPacoteBackup[],destination:string,key:Buffer){
  if(key.length!==32||files.length<1||files.length>10000)throw new Error('Parâmetros de pacote inválidos.');
  validatePaths(files.map(file=>file.path));
  mapping(files);
  for(const file of files){if(file.sha256!==undefined&&!/^[a-f0-9]{64}$/.test(file.sha256)||file.bytes!==undefined&&(!Number.isSafeInteger(file.bytes)||file.bytes<0))throw new Error('Integridade esperada inválida.');}
  const root=resolve(destination);await mkdir(root,{mode:0o700});
  try{
    const manifest:Manifest=files.some(file=>file.references!==undefined)?{format:'mediador-package-v2',files:[]}:{format:'mediador-package-v1',files:[]};
    for(const [index,file] of files.entries()){
      const blob=`${String(index).padStart(6,'0')}.enc`,target=join(root,blob);
      await transformarBackup(file.source,target,key,'cifrar');
      if(file.sha256!==undefined||file.bytes!==undefined){
        const verification=join(root,'verify.private');
        await transformarBackup(target,verification,key,'decifrar');
        if(file.sha256!==undefined&&await hash(verification)!==file.sha256||file.bytes!==undefined&&(await regular(verification)).size!==file.bytes)throw new Error('Cópia divergente do inventário.');
        await unlink(verification);
      }
      manifest.files.push({path:file.path,blob,bytes:(await regular(target)).size,sha256:await hash(target),...(file.references?{references:file.references}:{})});
    }
    const plain=join(root,'manifest.private');
    schema.parse(manifest);const serialized=JSON.stringify(manifest);if(Buffer.byteLength(serialized)>7*1024*1024)throw new Error('Manifesto excedido.');
    await writeFile(plain,serialized,{flag:'wx',mode:0o600});
    await transformarBackup(plain,join(root,'manifest.enc'),key,'cifrar');await unlink(plain);
    return {path:root,files:manifest.files.length};
  }catch{await rm(root,{recursive:true,force:true});throw new Error('Pacote não criado.');}
}

/** Restores files into a new directory; does not import SQL or rewrite database paths. */
export async function recuperarPacoteBackup(source:string,destination:string,key:Buffer){
  if(key.length!==32)throw new Error('Chave inválida.');
  const root=resolve(source),output=resolve(destination),stat=await lstat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink()||output.toLowerCase()===root.toLowerCase()||output.toLowerCase().startsWith(root.toLowerCase()+'\\')||output.toLowerCase().startsWith(root.toLowerCase()+'/'))throw new Error('Diretório inválido.');
  await mkdir(output,{mode:0o700});
  try{
    const encrypted=join(root,'manifest.enc');if((await regular(encrypted)).size>8*1024*1024)throw new Error('Manifesto excedido.');
    const plain=join(output,'manifest.private');await transformarBackup(encrypted,plain,key,'decifrar');
    const manifest=schema.parse(JSON.parse(await readFile(plain,'utf8')));await unlink(plain);
    validatePaths(manifest.files.map(file=>file.path));
    const references=manifest.format==='mediador-package-v2'?mapping(manifest.files.map(file=>({...file,source:''}))):undefined;
    const expected=new Set(['manifest.enc',...manifest.files.map(file=>file.blob)]);
    if(expected.size!==manifest.files.length+1)throw new Error('Blob duplicado.');
    const names=await readdir(root);if(names.length!==expected.size||names.some(name=>!expected.has(name)))throw new Error('Inventário divergente.');
    // Verify every encrypted file before recovering any application payload.
    for(const file of manifest.files){const path=join(root,file.blob);if((await regular(path)).size!==file.bytes||await hash(path)!==file.sha256)throw new Error('Integridade divergente.');}
    for(const file of manifest.files){const target=join(output,...file.path.split('/'));await mkdir(dirname(target),{recursive:true,mode:0o700});await transformarBackup(join(root,file.blob),target,key,'decifrar');}
    return {path:output,files:manifest.files.length,...(references?{references}:{})};
  }catch{await rm(output,{recursive:true,force:true});throw new Error('Pacote não recuperado: confira chave, integridade e inventário.');}
}
