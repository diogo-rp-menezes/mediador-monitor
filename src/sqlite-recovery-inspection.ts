import Database from 'better-sqlite3';
import {resolve} from 'node:path';
import {sqliteBloqueadoParaCorte} from './sqlite-cutover-lock.js';

/** Dedicated maintenance reader: never calls openDb, migrations, auth, workers or transports. */
export function inspecionarSqliteRecuperacao(sourcePath:string){
  if(!sourcePath||sourcePath===':memory:'||!sqliteBloqueadoParaCorte(sourcePath))throw new Error('Consulta de recuperação exige um arquivo SQLite bloqueado para corte.');
  const source=resolve(sourcePath),db=new Database(source,{readonly:true,fileMustExist:true});
  try{
    db.pragma('query_only = ON');db.exec('BEGIN');
    const integrity=db.pragma('quick_check') as Record<string,unknown>[];
    if(!integrity.length||integrity.some(row=>Object.values(row)[0]!=='ok'))throw new Error('Integridade SQLite não conferida.');
    const tables=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
    const contagens:Record<string,string|null>={};
    for(const table of ['escritorios','usuarios','clientes','contatos','registros','publicacoes_documentos'])
      contagens[table]=tables.has(table)?String((db.prepare(`SELECT count(*) n FROM "${table}"`).safeIntegers().get() as {n:bigint}).n):null;
    const estados=(table:string,column:string,allowed:string[])=>{
      if(!tables.has(table))return null;
      const result:Record<string,string>={};
      const rows=db.prepare(`SELECT CASE WHEN "${column}" IN (${allowed.map(()=>'?').join(',')}) THEN "${column}" ELSE 'outros' END estado,count(*) n FROM "${table}" GROUP BY 1`).safeIntegers().all(...allowed) as {estado:string;n:bigint}[];
      for(const row of rows)result[row.estado]=String(row.n);
      return result;
    };
    const filas={envios:estados('envios_clientes','status',['bloqueado','preparando','revisao','na_fila','enviando','enviado','falhou','cancelado','incerto']),
      notificacoes:estados('notificacoes_publicacoes','estado',['pendente','enviando','enviado','falhou','incerto','cancelado'])};
    if(!sqliteBloqueadoParaCorte(source))throw new Error('Bloqueio removido durante a inspeção.');
    return {modo:'consulta_recuperacao',origem:source,somente_leitura:true,integridade:'ok',bloqueio_preservado:true,
      contagens,filas,conciliacao_concluida:false,filas_liberadas:false};
  }finally{db.close();}
}
