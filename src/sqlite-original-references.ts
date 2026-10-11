import Database from 'better-sqlite3';
import {adicionarReferenciasOriginais} from './original-reference-values.js';
/** Maintenance reader only: no openDb, migrations, cutover changes or queue processing. */
export function referenciasOriginaisSqlite(path:string){
  if(!path||path===':memory:')throw new Error('Informe arquivo SQLite existente.');
  const db=new Database(path,{readonly:true,fileMustExist:true});
  try{
    db.pragma('query_only = ON');db.exec('BEGIN');
    const check=db.pragma('quick_check') as Record<string,unknown>[];
    if(!check.length||check.some(row=>Object.values(row)[0]!=='ok'))throw new Error('Integridade SQLite não conferida.');
    const references=new Set<string>();
    for(const row of db.prepare('SELECT arquivo_path FROM registros WHERE arquivo_path IS NOT NULL').all() as {arquivo_path:string}[])
      adicionarReferenciasOriginais(references,row.arquivo_path);
    const hasSnapshots=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='envios_clientes'").get();
    if(hasSnapshots)for(const row of db.prepare('SELECT snapshot_json FROM envios_clientes WHERE snapshot_json IS NOT NULL').all() as {snapshot_json:string}[])
      adicionarReferenciasOriginais(references,JSON.parse(row.snapshot_json));
    db.exec('COMMIT');return references;
  }finally{db.close();}
}
