import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {conferirAssinaturaManifestoMigracao} from './postgres-migration-manifest.js';
import {identificarOrigemImportacao} from './postgres-import-checkpoint.js';
import type {ensaiarMigracaoOperacional} from './postgres-migration-rehearsal.js';

/** Checks package bytes and source, without requiring the target to still have its before-state on retries. */
export function conferirArquivosPacoteMigracao(path:string,key:Buffer){
  const file=resolve(path),folder=dirname(file);
  const manifest=JSON.parse(readFileSync(file,'utf8')) as Awaited<ReturnType<typeof ensaiarMigracaoOperacional>>['manifest'];
  if(!manifest||manifest.formato!=='ensaio-migracao-v1'||manifest.estado!=='validado'||manifest.execucao_no_destino_atual!==false)
    throw new Error('Formato de pacote inválido.');
  conferirAssinaturaManifestoMigracao(manifest,key);
  const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
  if(resolve(manifest.origem.snapshot)!==join(folder,'origem.sqlite')||resolve(manifest.destino.backup)!==join(folder,'destino-antes.dump'))throw new Error('Caminhos de pacote divergentes.');
  if(hash(manifest.origem.snapshot)!==manifest.origem.arquivo_hash||hash(manifest.destino.backup)!==manifest.destino.backup_hash)throw new Error('Snapshot ou backup do pacote foi alterado.');
  for(const original of manifest.originais){
    if(!/^[a-f0-9]{64}$/.test(original.hash)||resolve(original.copia)!==join(folder,'originais',original.hash+'.bin')||hash(original.copia)!==original.hash)throw new Error('Original copiado foi alterado.');
  }
  for(const source of [manifest.origem.path,manifest.origem.snapshot]){
    const db=new Database(source,{readonly:true,fileMustExist:true});
    try{db.exec('BEGIN');if(identificarOrigemImportacao(db,source)!==manifest.origem.conteudo_hash)throw new Error('Origem diverge do pacote ensaiado.');}finally{db.close();}
  }
  return {file,manifest};
}

