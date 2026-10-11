import {writeFile} from 'node:fs/promises';
import {env} from './config.js';
import {criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {inventariarReferenciasOriginaisPostgres,inventariarOriginais} from './postgres-original-inventory.js';
import {referenciasOriginaisPacote} from './migration-original-references.js';
import {lerCatalogoBackupsRetencao,referenciasCatalogoBackups} from './backup-retention-catalog.js';
import {validarRelatorioForaDoPacote} from './backup-report-path.js';
import {revalidarInventarioOriginais} from './original-inventory-revalidation.js';
import {conferirCoberturaBackups} from './backup-retention-coverage.js';
import {evidenciarFontesRetencao} from './retention-source-evidence.js';
const args=process.argv.slice(2);
let output:string|undefined,sqlite:string|undefined,catalog:string|undefined,previous:string|undefined,minAgeDays:number|undefined;const manifests:string[]=[],backups:string[]=[],backupRoots:string[]=[];
for(let i=0;i<args.length;i+=2){
  const flag=args[i],value=args[i+1];
  if(!value||value.startsWith('--'))throw new Error('Argumentos de inventário inválidos.');
  if(flag==='--output'&&!output)output=value;
  else if(flag==='--sqlite-source'&&!sqlite)sqlite=value;
  else if(flag==='--manifest')manifests.push(value);
  else if(flag==='--backup-package')backups.push(value);
  else if(flag==='--backup-catalog'&&!catalog)catalog=value;
  else if(flag==='--backup-root')backupRoots.push(value);
  else if(flag==='--revalidate-report'&&!previous)previous=value;
  else if(flag==='--min-age-days'&&minAgeDays===undefined){
    if(!/^[1-9]\d{0,3}$/.test(value)||Number(value)>3650)throw new Error('Idade mínima deve ser inteira entre 1 e 3650 dias.');
    minAgeDays=Number(value);
  }
  else throw new Error('Argumentos de inventário inválidos.');
}
if(!output)throw new Error('Uso: postgres:originais:inventariar -- --output arquivo.json [--min-age-days dias] [--sqlite-source origem.db] [--manifest manifesto.json] [--backup-package pasta-cifrada-v2] [--backup-catalog catalogo.json] [--backup-root pasta-dedicada] [--revalidate-report inventario-anterior.json]');
for(const backup of backups)validarRelatorioForaDoPacote(backup,output);
const pool=criarPoolPostgresRuntime();
try{
  const backupSources=[...backups.map(pasta=>({pasta,chave_env:'BACKUP_ENCRYPTION_KEY'})),...(catalog?await lerCatalogoBackupsRetencao(catalog):[])];
  for(const backup of backupSources)validarRelatorioForaDoPacote(backup.pasta,output);
  for(const root of backupRoots)validarRelatorioForaDoPacote(root,output);
  const coverage=await conferirCoberturaBackups(backupRoots,backupSources);
  const protectedBackups=await referenciasCatalogoBackups(backupSources);
  const sourceEvidence=await evidenciarFontesRetencao([
    ...backupSources.map(source=>({tipo:'pacote-cifrado',path:source.pasta})),
    ...backupRoots.map(path=>({tipo:'raiz-backups',path})),
    ...manifests.map(path=>({tipo:'manifesto-migracao',path})),
    ...(sqlite?[{tipo:'origem-sqlite',path:sqlite}]:[])
  ]);
  await validarPapelRuntimePostgres(pool);
  const databaseInventory=await inventariarReferenciasOriginaisPostgres(pool);
  const references=databaseInventory.references;sourceEvidence.postgres=databaseInventory.databaseHash;
  if(sqlite){
    const {referenciasOriginaisSqlite}=await import('./sqlite-original-references.js');
    for(const reference of referenciasOriginaisSqlite(sqlite))references.add(reference);
  }
  for(const manifest of manifests){
    for(const reference of referenciasOriginaisPacote(manifest,Buffer.from(process.env.CREDENTIALS_MASTER_KEY??'','base64')))references.add(reference);
  }
  for(const reference of protectedBackups.references)references.add(reference);
  const result=previous?await revalidarInventarioOriginais(previous,env.downloadDir,references,{evidenciaFontes:sourceEvidence,minAgeDays}):await inventariarOriginais(env.downloadDir,references,{minAgeDays});
  const afterCoverage=await conferirCoberturaBackups(backupRoots,backupSources);
  if(JSON.stringify(coverage)!==JSON.stringify(afterCoverage))throw new Error('Cobertura mudou durante o inventário.');
  const inventory={...result,evidencia_fontes:sourceEvidence,fontes:{postgres:true,sqlite:!!sqlite,pacotes_migracao:manifests.length,backups_cifrados:protectedBackups.pacotes},
    cobertura_backups:{conferida:coverage.raizes>0,raizes:coverage.raizes,pacotes_descobertos:coverage.pacotes,limitada_as_raizes_informadas:true}};
  await writeFile(output,JSON.stringify(inventory,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Conferência de originais salva, sem exclusão ou alteração de arquivos.');
}catch{console.error('Inventário não concluído. Verifique banco, permissões, pasta e destino ainda inexistente.');process.exitCode=1;}
finally{await pool.end();}

