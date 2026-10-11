import Database from 'better-sqlite3';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync,existsSync,constants} from 'node:fs';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {backupPostgresConfig,criarBackupPostgres,comBackupRestauradoIsolado} from './postgres-backup.js';
import {criarPoolPostgres} from './postgres.js';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {identificarOrigemImportacao,identificarDestinoImportacao} from './postgres-import-checkpoint.js';
import {importarNucleoIsoladoPostgres} from './postgres-import-core.js';
import {assinarManifestoMigracao} from './postgres-migration-manifest.js';
import {conferirArquivosPacoteMigracao} from './postgres-migration-package.js';

const fileHash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
/** Durable local package and rehearsal; application databases are never imported into or replaced. */
export async function ensaiarMigracaoOperacional(sourcePath:string,outputPath?:string){
  const key=Buffer.from(process.env.CREDENTIALS_MASTER_KEY??'','base64');
  if(key.length!==32)throw new Error('Configure uma CREDENTIALS_MASTER_KEY persistente de 32 bytes antes do ensaio operacional.');
  const source=resolve(sourcePath),folder=resolve(outputPath??join('data','migration-rehearsal-'+randomUUID()));
  mkdirSync(dirname(folder),{recursive:true});mkdirSync(folder);
  const sqliteCopy=join(folder,'origem.sqlite'),originals=join(folder,'originais');mkdirSync(originals);
  let sourceHash:string;const files:{registro:string;origem:string;copia:string;hash:string}[]=[];
  const db=new Database(source,{readonly:true,fileMustExist:true});
  try{
    db.exec('BEGIN');sourceHash=identificarOrigemImportacao(db,source);await db.backup(sqliteCopy);
    const copied=new Set<string>();
    for(const row of db.prepare("SELECT numero_registro,arquivo_path,arquivo_hash FROM registros WHERE arquivo_path IS NOT NULL AND arquivo_path<>'' ORDER BY numero_registro").all() as {numero_registro:string;arquivo_path:string;arquivo_hash:string}[]){
      const path=isAbsolute(row.arquivo_path)?row.arquivo_path:[resolve(row.arquivo_path),resolve(dirname(source),row.arquivo_path)].find(existsSync);
      if(!path)throw new Error('Original ausente ao preparar pacote.');
      const hash=fileHash(path),copy=join(originals,hash+'.bin');
      if(hash!==row.arquivo_hash.toLowerCase())throw new Error('Original alterado ao preparar pacote.');
      if(!copied.has(hash)){copyFileSync(path,copy,constants.COPYFILE_EXCL);copied.add(hash);}
      if(fileHash(copy)!==hash)throw new Error('Cópia de original divergente.');
      files.push({registro:row.numero_registro,origem:path,copia:copy,hash});
    }
  }finally{db.close();}
  const copyDb=new Database(sqliteCopy,{readonly:true,fileMustExist:true});
  try{copyDb.exec('BEGIN');if(identificarOrigemImportacao(copyDb,sqliteCopy)!==sourceHash)throw new Error('Snapshot SQLite divergiu da origem.');}finally{copyDb.close();}
  const admin=criarPoolPostgres(),config=backupPostgresConfig(process.env,join(folder,'destino-antes.dump'));
  try{
    if((await admin.query('SELECT current_database() nome')).rows[0].nome!==config.database)throw new Error('Configuração de backup diverge da conexão PostgreSQL.');
    const destinationHash=await withPostgresGlobalTransaction(admin,async client=>{
      const before=await identificarDestinoImportacao(client);
      await criarBackupPostgres(config);
      if(await identificarDestinoImportacao(client)!==before)throw new Error('Destino mudou durante o backup.');
      return before;
    });
    const restoreConfig={container:config.container,database:config.database,user:config.user,backup:config.output};
    const rehearsal=await comBackupRestauradoIsolado(restoreConfig,async database=>{
      const restored=criarPoolPostgres({...process.env,PGDATABASE:database});
      try{
        if(await withPostgresGlobalTransaction(restored,identificarDestinoImportacao)!==destinationHash)throw new Error('Restauração divergiu do destino antes da migração.');
        const importOptions={credentialsKey:key,conciliarDestino:true,estadoEsperado:{origem_hash:sourceHash,destino_hash:destinationHash}};
        const rejectChangedState=async(field:'origem_hash'|'destino_hash')=>{
          const altered={...importOptions,estadoEsperado:{...importOptions.estadoEsperado,[field]:'0'.repeat(64)}};
          let rejected=false;
          try{await importarNucleoIsoladoPostgres(restored,sqliteCopy,altered);}catch{rejected=true;}
          if(!rejected)throw new Error('Importação aceitou estado revisado divergente.');
        };
        await rejectChangedState('origem_hash');await rejectChangedState('destino_hash');
        if(await withPostgresGlobalTransaction(restored,identificarDestinoImportacao)!==destinationHash)throw new Error('Rejeição alterou o destino restaurado.');
        const result=await importarNucleoIsoladoPostgres(restored,sqliteCopy,importOptions);
        if(!(await importarNucleoIsoladoPostgres(restored,sqliteCopy,importOptions)).checkpoint.retomado)throw new Error('Retomada do ensaio falhou.');
        await rejectChangedState('destino_hash');
        return {tabelas:result.tabelas.length,linhas:result.tabelas.reduce((sum,table)=>sum+table.linhas,0),
          preservacao_destino:result.destino_preexistente_preservado,retomada_validada:true,estado_revisado_validado:true};
      }finally{await restored.end();}
    });
    // Restore once more to exercise returning to the exact pre-migration data snapshot.
    await comBackupRestauradoIsolado(restoreConfig,async database=>{
      const restored=criarPoolPostgres({...process.env,PGDATABASE:database});
      try{if(await withPostgresGlobalTransaction(restored,identificarDestinoImportacao)!==destinationHash)throw new Error('Ensaio de reversão divergiu do backup.');}
      finally{await restored.end();}
    });
    const current=new Database(source,{readonly:true,fileMustExist:true});
    try{current.exec('BEGIN');if(identificarOrigemImportacao(current,source)!==sourceHash)throw new Error('Origem mudou durante o ensaio; gere um novo pacote.');}finally{current.close();}
    if(await withPostgresGlobalTransaction(admin,identificarDestinoImportacao)!==destinationHash)throw new Error('Destino atual mudou durante o ensaio; gere um novo pacote.');
    const manifest={formato:'ensaio-migracao-v1',gerado_em:new Date().toISOString(),estado:'validado',execucao_no_destino_atual:false,
      origem:{path:source,snapshot:sqliteCopy,conteudo_hash:sourceHash,arquivo_hash:fileHash(sqliteCopy)},
      destino:{database:config.database,backup:config.output,backup_hash:fileHash(config.output),conteudo_hash:destinationHash},
      originais:files,chave_credenciais_incluida:false,chave_verificador:createHmac('sha256',key).update('mediador-migration-rehearsal-v1').digest('hex'),
      ensaio:rehearsal,reversao_por_restauracao_validada:true,limites:['O hash de conteúdo confere colunas e linhas, não permissões, políticas RLS ou funções.','O dump não inclui donos nem concessões de privilégios; é necessário reaplicar o papel runtime na restauração.','A chave de credenciais permanece na configuração local e deve ser preservada separadamente.','Os originais são copiados; a restauração deve recolocá-los nos caminhos registrados antes de retomar o servidor.']};
    const signed={...manifest,assinatura:assinarManifestoMigracao(manifest,key)};
    const path=join(folder,'manifesto.json');writeFileSync(path,JSON.stringify(signed,null,2)+'\n',{flag:'wx'});
    return {path,manifest:signed};
  }finally{await admin.end();}
}

export async function verificarPacoteMigracao(path:string){
  const {file,manifest}=conferirArquivosPacoteMigracao(path,Buffer.from(process.env.CREDENTIALS_MASTER_KEY??'','base64'));
  const pool=criarPoolPostgres();
  try{
    if((await pool.query('SELECT current_database() nome')).rows[0].nome!==manifest.destino.database)throw new Error('Banco configurado diverge do pacote.');
    if(await withPostgresGlobalTransaction(pool,identificarDestinoImportacao)!==manifest.destino.conteudo_hash)throw new Error('Destino diverge do pacote ensaiado.');
  }finally{await pool.end();}
  return {manifesto:file,assinatura_validada:true,arquivos_validados:true,origem_conferida:true,destino_conferido:true};
}

