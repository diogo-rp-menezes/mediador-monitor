import Database from 'better-sqlite3';
import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {planejarReferenciasIdentidade,TABELAS_IDS_IMPORTACAO,type PlanoIdentidade} from './postgres-import-references.js';
import {planejarChavesImportacao,conferirCoberturaChavesImportacao} from './postgres-import-keys.js';

type Identity={id:number;chave:string|null};
export function mapearIdentidadesLegadas(source:Identity[],target:Identity[]){
  const sourceIds=new Set<number>();let maximum=0;
  for(const row of [...source,...target]){
    if(!Number.isSafeInteger(row.id)||row.id<1)throw new Error('ID de identidade inválido.');
    maximum=Math.max(maximum,row.id);
  }
  for(const row of source){if(sourceIds.has(row.id))throw new Error('ID legado duplicado.');sourceIds.add(row.id);}
  if(new Set(target.map(row=>row.id)).size!==target.length)throw new Error('ID de destino duplicado.');
  const used=new Set(target.map(row=>row.id));let next=maximum+1;
  const keys=new Map<string,Identity[]>();
  for(const row of target)if(row.chave)keys.set(row.chave,[...(keys.get(row.chave)??[]),row]);
  const sourceKeys=new Map<string,number>();
  for(const row of source)if(row.chave)sourceKeys.set(row.chave,(sourceKeys.get(row.chave)??0)+1);
  return [...source].sort((a,b)=>a.id-b.id).map(row=>{
    if(!Number.isSafeInteger(row.id)||row.id<1)throw new Error('ID legado inválido.');
    if(row.chave&&(sourceKeys.get(row.chave)??0)>1)return {origem_id:row.id,destino_id:null,acao:'conflito_chave_origem'};
    const matches=row.chave?keys.get(row.chave)??[]:[];
    if(matches.length>1)return {origem_id:row.id,destino_id:null,acao:'conflito_chave_destino'};
    if(matches.length===1)return {origem_id:row.id,destino_id:matches[0].id,acao:'revisar_identidade_existente'};
    const id=used.has(row.id)?next++:row.id;used.add(id);
    if(!Number.isSafeInteger(id))throw new Error('Espaço de IDs esgotado.');
    return {origem_id:row.id,destino_id:id,acao:id===row.id?'inserir_preservando_id':'inserir_remapeando_id'};
  });
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function chaveContatoConciliacao(row:Record<string,unknown>,officePlans?:PlanoIdentidade){
  const originalOffice=Number(row.escritorio_id);
  if(!Number.isSafeInteger(originalOffice)||originalOffice<1)throw new Error('Escritório de contato inválido.');
  const office=officePlans?officePlans.mapeamentos.find(mapping=>mapping.origem_id===originalOffice)?.destino_id:originalOffice;
  const email=String(row.email??'').trim().toLowerCase();
  return office&&email?JSON.stringify([office,email]):null;
}
/** Caller holds both read snapshots and, for execution, destination table locks. */
export async function gerarMapasConciliacao(db:Database.Database,client:PoolClient){
  const naturalKeys:Record<string,string>={escritorios:'cnpj',usuarios:'email',clientes:'cnpj',sindicatos:'cnpj'};
  const mappings:PlanoIdentidade[]=[];const sourceEvidence=[],targetEvidence=[];
  const known=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
  for(const table of TABELAS_IDS_IMPORTACAO.filter(table=>known.has(table))){
    const naturalKey=naturalKeys[table];
    const normalize=(row:Record<string,unknown>,sourceRow:boolean):Identity=>({id:Number(row.id),
      chave:table==='contatos'?chaveContatoConciliacao(row,sourceRow?mappings.find(plan=>plan.tabela==='escritorios'):undefined)
        :naturalKey?String(row[naturalKey]??'').trim().toLowerCase()||null:null});
    const fields=table==='contatos'?'id,email,escritorio_id':naturalKey?`id,${naturalKey}`:'id';
    const original=(db.prepare(`SELECT ${fields} FROM ${table} ORDER BY id`).safeIntegers().all() as Record<string,unknown>[]).map(row=>normalize(row,true));
    const destination=(await client.query(`SELECT ${fields} FROM ${table} ORDER BY id`)).rows.map(row=>normalize(row,false));
    sourceEvidence.push({tabela:table,linhas:original});targetEvidence.push({tabela:table,linhas:destination});
    mappings.push({tabela:table,mapeamentos:mapearIdentidadesLegadas(original,destination)});
  }
  return {mappings,sourceHash:hash(sourceEvidence),targetHash:hash(targetEvidence)};
}
export async function planejarConciliacaoPostgres(pool:Pool,sourcePath:string,outputPath:string){
  const source=resolve(sourcePath),output=resolve(outputPath);
  if(source.toLowerCase()===output.toLowerCase())throw new Error('Relatório não pode substituir o banco de origem.');
  const db=new Database(source,{readonly:true,fileMustExist:true});let client:PoolClient|undefined;
  try{
    client=await pool.connect();
    db.exec('BEGIN');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SELECT set_config('app.global_access','true',true),set_config('app.escritorio_id','',true)");
    const role=(await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    if(role.rolsuper||role.rolbypassrls)throw new Error('Planejamento exige papel runtime sem BYPASSRLS.');
    const {mappings,sourceHash,targetHash}=await gerarMapasConciliacao(db,client);
    const references=planejarReferenciasIdentidade(db,mappings);
    const keys=await planejarChavesImportacao(db,client,mappings);
    const coverage=await conferirCoberturaChavesImportacao(client);
    const audit=(await client.query('SELECT count(*)::integer total,COALESCE(max(id),0)::text ultimo_id FROM auditoria_seguranca')).rows[0];
    const report={gerado_em:new Date().toISOString(),somente_leitura:true,origem:source,
      origem_identidades_hash:sourceHash,destino_identidades_hash:targetHash,identidades:mappings,referencias_identidades:references,chaves_textuais_compostas:keys,auditoria_destino:audit,
      revisoes_chaves:keys.flatMap(table=>table.itens.filter(row=>row.acao!=='inserir').map(row=>({tabela:table.tabela,colunas:table.colunas,...row}))),
      cobertura_restricoes_unicas:coverage,restricoes_sem_plano:coverage.filter(index=>index.cobertura==='restricao_sem_plano'),
      revisoes_obrigatorias:mappings.flatMap(table=>table.mapeamentos.filter(row=>row.acao.startsWith('conflito')||row.acao==='revisar_identidade_existente').map(row=>({tabela:table.tabela,...row}))),
      executavel:false,pendencias:['Validar atributos, credenciais e escritório de empresas com identidade existente; reutilizações permanecem bloqueadas.','Habilitar a execução operacional no destino atual; conciliação aditiva e checkpoint já foram validados em destino de teste ocupado.','Resolver revisões de chaves textuais/compostas antes de executar; colisões e cobertura das restrições já estão inventariadas.','Preparar backup, conferência do destino e procedimento de execução/reversão para a migração real.','Preservar auditoria do destino; não reutilizar IDs de eventos nem apagar histórico.']};
    await client.query('COMMIT');db.exec('COMMIT');
    mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    return report;
  }catch(error){try{await client?.query('ROLLBACK');}catch{}throw error;}
  finally{client?.release();db.close();}
}

