import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import type {Pool} from 'pg';
import {z} from 'zod';
import {withPostgresTransaction} from './postgres-transaction.js';
import type {ArquivoPacoteBackup} from './backup-package.js';
import {validarSnapshotBackup} from './postgres-backup-snapshot.js';

const original=z.object({arquivo_path:z.string().min(1),arquivo_hash:z.string().regex(/^[a-f0-9]{64}$/)});
const attachment=z.object({path:z.string().min(1),hash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative()});
const snapshotSchema=z.object({anexos:z.array(attachment).min(1)});
export type ReferenciaArquivoBackup={source:string;sha256:string;bytes?:number};
export const caminhoLogicoArquivoBackup=(source:string)=>`files/${createHash('sha256').update(resolve(source).toLowerCase()).digest('hex')}.bin`;

/** Deliberately selects known storage fields, never arbitrary strings from snapshots. */
export async function lerReferenciasBackupPostgres(pool:Pool,snapshot?:string):Promise<ReferenciaArquivoBackup[]>{
  if(snapshot!==undefined)validarSnapshotBackup(snapshot);
  return withPostgresTransaction(pool,async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    if(snapshot)await client.query(`SET TRANSACTION SNAPSHOT '${snapshot}'`);
    await client.query("SELECT set_config('app.escritorio_id','',true),set_config('app.global_access','true',true)");
    const originals=(await client.query('SELECT arquivo_path,arquivo_hash FROM registros WHERE arquivo_path IS NOT NULL ORDER BY numero_registro')).rows;
    const snapshots=(await client.query('SELECT snapshot_json FROM envios_clientes WHERE snapshot_json IS NOT NULL ORDER BY id')).rows;
    const refs:ReferenciaArquivoBackup[]=originals.map(row=>{const item=original.parse(row);return {source:item.arquivo_path,sha256:item.arquivo_hash};});
    for(const row of snapshots){const parsed=snapshotSchema.parse(typeof row.snapshot_json==='string'?JSON.parse(row.snapshot_json):row.snapshot_json);for(const item of parsed.anexos)refs.push({source:item.path,sha256:item.hash,bytes:item.bytes});}
    return refs;
  });
}

/** A read-only inventory, not a cross-files/database snapshot or permission to delete. */
export async function inventariarArquivosBackup(references:ReferenciaArquivoBackup[],allowedRoots:string[]){
  if(!allowedRoots.length)throw new Error('Raízes de backup obrigatórias.');
  const roots=[];
  for(const root of allowedRoots){const path=resolve(root),stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||resolve(await realpath(path)).toLowerCase()!==path.toLowerCase())throw new Error('Raiz de backup irregular.');roots.push(path);}
  const inside=(path:string,root:string)=>{const rel=relative(root,path);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
  const unique=new Map<string,{source:string;sha256:string;bytes:number}>();
  const aliases=new Map<string,Set<string>>();
  for(const reference of references){
    if(!/^[a-f0-9]{64}$/.test(reference.sha256)||!reference.source||reference.bytes!==undefined&&(!Number.isSafeInteger(reference.bytes)||reference.bytes<0))throw new Error('Referência inválida.');
    const source=resolve(reference.source),canonical=resolve(await realpath(source)),stat=await lstat(source);
    if(!stat.isFile()||stat.isSymbolicLink()||source.toLowerCase()!==canonical.toLowerCase()||!roots.some(root=>inside(source,root)))throw new Error('Arquivo fora das raízes permitidas.');
    const identity=canonical.toLowerCase(),previous=unique.get(identity);
    const names=aliases.get(identity)??new Set<string>();names.add(reference.source);aliases.set(identity,names);
    if(previous){if(previous.sha256!==reference.sha256||reference.bytes!==undefined&&previous.bytes!==reference.bytes)throw new Error('Referências conflitantes.');continue;}
    const digest=createHash('sha256');for await(const chunk of createReadStream(source))digest.update(chunk);
    const after=await lstat(source);
    if(digest.digest('hex')!==reference.sha256||reference.bytes!==undefined&&stat.size!==reference.bytes||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||after.ino!==stat.ino)throw new Error('Arquivo ausente, alterado ou divergente.');
    unique.set(identity,{source,sha256:reference.sha256,bytes:stat.size});
  }
  const verified=[...unique.values()].sort((a,b)=>a.source.localeCompare(b.source));
  const files:ArquivoPacoteBackup[]=verified.map(item=>({source:item.source,path:caminhoLogicoArquivoBackup(item.source),references:[...aliases.get(item.source.toLowerCase())!],sha256:item.sha256,bytes:item.bytes}));
  return {files,referencias:references.length,arquivos:files.length,bytes:verified.reduce((sum,item)=>sum+item.bytes,0)};
}

