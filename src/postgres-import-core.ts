import Database from 'better-sqlite3';
import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {withPostgresGlobalTransaction} from './postgres-transaction.js';
import {preservarLegadoIsolado} from './postgres-import-archive.js';
import {converterEstadoEnvioLegado,converterEstadoNotificacaoLegada} from './postgres-import-deliveries.js';
import {importarAjustesIsolados} from './postgres-import-settings.js';
import {importarAuditoriaCadastrosIsolada} from './postgres-import-audit-history.js';
import {referenciasIdentidades,remapearReferenciasIdentidade,criarPlanosIdsIsolados,TABELAS_IDS_IMPORTACAO,type PlanoIdentidade} from './postgres-import-references.js';
import {identificarOrigemImportacao,identificarOpcoesImportacao,identificarDestinoImportacao,conferirCheckpointImportacao,persistirProvenienciaImportacao,capturarLinhasPreexistentes,conferirLinhasPreexistentes} from './postgres-import-checkpoint.js';
import {conferirCoberturaChavesImportacao,planejarChavesImportacao} from './postgres-import-keys.js';
import {gerarMapasConciliacao} from './postgres-import-reconcile.js';
import {sincronizarSequenciaImportacao} from './postgres-import-sequences.js';
import {conferirEstadoEsperadoImportacao,vincularOpcoesEstadoImportacao,type EstadoEsperadoImportacao} from './postgres-import-admission.js';
import {conferirArquivosPacoteMigracao} from './postgres-migration-package.js';
import {bloquearSqliteParaCorte} from './sqlite-cutover-lock.js';
import {BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY} from './postgres-backup-gate.js';
import {ErroCadastro} from './cadastros.js';

export const CORE_IMPORT_TABLES=['escritorios','usuarios','clientes','contatos','credenciais_usuarios','papeis_plataforma','usuarios_escritorios','usuarios_clientes','sindicatos','registros','clientes_contatos','clientes_sindicatos','registros_sindicatos','monitoramentos_escritorios','execucoes','execucoes_escritorio','vinculos_escritorio','interpretacoes_escritorio','versoes_interpretacao','historico_interpretacoes_legado','configuracoes_smtp_escritorio','publicacoes_documentos','auditoria_acessos_publicacoes','clientes_documentos','auditoria_seguranca'] as const;
type Column={column_name:string;data_type:string;is_identity:string;is_nullable:string;column_default:string|null};
const DELIVERY_TABLES=['envios_clientes','tentativas_envio','notificacoes_publicacoes'] as const;
const IMPORT_TABLES=[...CORE_IMPORT_TABLES,...DELIVERY_TABLES] as const;
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
export function converterValorLegado(value:unknown,type:string):unknown{
  if(value===null)return null;
  if(type==='boolean'){
    if(value===0||value===0n||value===false)return false;if(value===1||value===1n||value===true)return true;
    throw new Error('Booleano legado inválido.');
  }
  if(type==='jsonb'||type==='json')return typeof value==='string'?JSON.parse(value):value;
  if(type==='timestamp with time zone'){
    const raw=String(value),date=new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(raw)?raw.replace(' ','T')+'Z':raw);
    if(!Number.isFinite(date.getTime()))throw new Error('Data legada inválida.');return date;
  }
  if(type==='bigint')return String(value);
  if(type==='integer'||type==='smallint'){
    const number=Number(value),max=type==='smallint'?32767:2147483647;
    if(!Number.isSafeInteger(number)||number< -max-1||number>max)throw new Error('Inteiro legado fora do intervalo do destino.');
    return number;
  }
  return value;
}
function canonical(value:unknown):unknown{
  if(value instanceof Date)return value.toISOString();if(Buffer.isBuffer(value))return {base64:value.toString('base64')};
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
const digest=(rows:unknown[])=>createHash('sha256').update(rows.map(row=>JSON.stringify(canonical(row))).sort().join('\n')).digest('hex');
type ResumoTabela={tabela:string;linhas:number;hash:string};
export type ResultadoImportacaoIsolada={database:string;tabelas:ResumoTabela[];arquivadas:ResumoTabela[];
  auditoria_cadastros:(ResumoTabela&{somente_arquivo:number})|null;pendentes:{tabela:string;linhas:number}[];
  preservacao_completa:true;escopo:'nucleo_e_arquivo';completo:false;
  checkpoint:{etapa:'nucleo_e_arquivo';retomado:boolean;origem_hash:string};
  referencias_historicas:'ids_da_origem_com_mapa_privado';destino_preexistente_preservado:boolean};

/** Validation namespace by default; an operational import requires a fully verified signed package. */
export async function importarNucleoIsoladoPostgres(pool:Pool,sourcePath:string,options:{credentialsKey?:Buffer;identityPlans?:PlanoIdentidade[];conciliarDestino?:boolean;estadoEsperado?:EstadoEsperadoImportacao;manifestoOperacional?:string;bloquearOrigemParaCorte?:boolean}={}):Promise<ResultadoImportacaoIsolada>{
  const credentialsKey=options.credentialsKey??Buffer.from(process.env.CREDENTIALS_MASTER_KEY||'','base64');
  const pacote=options.manifestoOperacional?conferirArquivosPacoteMigracao(options.manifestoOperacional,credentialsKey):undefined;
  if(options.bloquearOrigemParaCorte&&!pacote)throw new Error('Bloqueio da origem exige pacote operacional validado.');
  if(pacote&&(!options.conciliarDestino||options.identityPlans||options.estadoEsperado||resolve(sourcePath)!==resolve(pacote.manifest.origem.snapshot)||!pacote.manifest.ensaio.estado_revisado_validado))throw new Error('Importação operacional exige snapshot e opções do pacote revisado.');
  const estadoEsperado=pacote?{origem_hash:pacote.manifest.origem.conteudo_hash,destino_hash:pacote.manifest.destino.conteudo_hash}:options.estadoEsperado;
  const escopoOperacional=pacote?{manifesto:pacote.file,key:credentialsKey}:undefined;
  const source=resolve(sourcePath),db=new Database(source,{readonly:true,fileMustExist:true});
  try{
    db.exec('BEGIN');
    return await withPostgresGlobalTransaction(pool,async client=>{
      const database=(await client.query('SELECT current_database() nome')).rows[0].nome as string;
      if(pacote){
        if(database!==pacote.manifest.destino.database)throw new Error('Destino não corresponde ao pacote operacional.');
        if((await client.query('SELECT pg_try_advisory_xact_lock_shared($1,$2) AS adquirido',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0]?.adquirido!==true)throw new ErroCadastro('Backup em andamento. Importação não iniciada.',409);
        const others=Number((await client.query('SELECT count(*)::text n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n);
        if(others!==0)throw new Error('Pare outros processos PostgreSQL antes da importação operacional.');
        if(options.bloquearOrigemParaCorte){bloquearSqliteParaCorte(pacote.manifest.origem.path,pacote.manifest.assinatura);bloquearSqliteParaCorte(pacote.manifest.origem.snapshot,pacote.manifest.assinatura);}
      }else{
        if(!/^mediador_import_test_[a-f0-9]{32}$/.test(database))throw new Error('A importação inicial exige banco isolado gerado pelo validador.');
        if((await client.query('SELECT pg_try_advisory_xact_lock_shared($1,$2) AS adquirido',[BACKUP_WRITER_NAMESPACE,BACKUP_WRITER_KEY])).rows[0]?.adquirido!==true)throw new ErroCadastro('Backup em andamento. Importação não iniciada.',409);
      }
      if(options.conciliarDestino&&options.identityPlans)throw new Error('Conciliação calcula seus mapas a partir do destino; mapas manuais não são aceitos.');
      await client.query('SELECT pg_advisory_xact_lock(817204619)');
      const coverage=await conferirCoberturaChavesImportacao(client);
      if(coverage.some(index=>index.cobertura==='restricao_sem_plano'))throw new Error('Destino contém restrições únicas sem plano de conciliação.');
      const hasCheckpoint=(await client.query("SELECT to_regclass('importacao_privada.lotes') existe")).rows[0].existe;
      const saved=hasCheckpoint?(await client.query('SELECT * FROM importacao_privada.lotes WHERE id=1')).rows[0]:undefined;
      if(hasCheckpoint&&!saved)throw new Error('Checkpoint de importação incompleto.');
      const mode=options.conciliarDestino?'conciliacao':'destino_vazio';
      if(saved&&saved.modo!==mode)throw new Error('Modo diverge do checkpoint de importação.');
      // Freeze destination rows before calculating mappings against an occupied database.
      const beforeHash=options.conciliarDestino||estadoEsperado?await identificarDestinoImportacao(client):undefined;
      const sourceHash=identificarOrigemImportacao(db,source);
      if(estadoEsperado)conferirEstadoEsperadoImportacao(estadoEsperado,sourceHash,saved?undefined:beforeHash);
      const effectivePlans:PlanoIdentidade[]=options.identityPlans??saved?.planos_json??(options.conciliarDestino?(await gerarMapasConciliacao(db,client)).mappings:criarPlanosIdsIsolados(db));
      if(effectivePlans.some(plan=>!(TABELAS_IDS_IMPORTACAO as readonly string[]).includes(plan.tabela)))throw new Error('Tabela de mapeamento sem conversão definida.');
      const baseOptionsHash=vincularOpcoesEstadoImportacao(identificarOpcoesImportacao(effectivePlans,credentialsKey,mode),estadoEsperado);
      const optionsHash=pacote?createHash('sha256').update(baseOptionsHash+pacote.manifest.assinatura).digest('hex'):baseOptionsHash;
      if(saved){
        conferirCheckpointImportacao(saved,{origem_hash:sourceHash,opcoes_hash:optionsHash,destino_hash:await identificarDestinoImportacao(client)});
        const receipt=saved.relatorio_json as ResultadoImportacaoIsolada;
        return {...receipt,checkpoint:{...receipt.checkpoint,retomado:true}};
      }
      const targetTables=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows;
      const baseline=options.conciliarDestino?await capturarLinhasPreexistentes(client):null;
      if(!options.conciliarDestino)for(const {table_name} of targetTables){
        if(table_name==='mediador_schema_migrations')continue;
        if(table_name==='escritorios'){
          const seed=(await client.query('SELECT id,nome,cnpj,email,telefone,ativo FROM escritorios')).rows;
          if(seed.length!==1||seed[0].id!==1||seed[0].nome!=='Escritório inicial'||seed[0].cnpj!==null||seed[0].email!==''||seed[0].telefone!==''||seed[0].ativo!==true)throw new Error('Destino isolado contém escritórios não iniciais.');
        }else if(Number((await client.query(`SELECT count(*) n FROM ${quote(table_name)}`)).rows[0].n)!==0)throw new Error(`Destino isolado não vazio: ${table_name}`);
      }
      const known=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
      if(!known.has('escritorios'))throw new Error('Origem sem escritórios.');
      const offices=db.prepare('SELECT id FROM escritorios').all();if(!offices.length)throw new Error('Origem sem escritório cadastrado.');
      if(options.conciliarDestino){
        if(effectivePlans.some(plan=>plan.mapeamentos.some(mapping=>!['inserir_preservando_id','inserir_remapeando_id'].includes(mapping.acao))))throw new Error('Conciliação exige revisão de identidades existentes.');
        const keys=await planejarChavesImportacao(db,client,effectivePlans);
        if(keys.some(table=>table.itens.some(item=>item.acao!=='inserir')))throw new Error('Conciliação exige revisão de chaves existentes.');
      }else await client.query('DELETE FROM escritorios WHERE id=1');
      const report:{tabela:string;linhas:number;hash:string}[]=[];
      {
        for(const table of TABELAS_IDS_IMPORTACAO.filter(table=>known.has(table))){
          const sourceIds=db.prepare(`SELECT id FROM ${quote(table)}`).safeIntegers().all() as {id:bigint}[];
          const mapped=sourceIds.map(row=>remapearReferenciasIdentidade(row,[{coluna:'id',tabela:table}],effectivePlans).id);
          if(new Set(mapped).size!==mapped.length)throw new Error('Mapeamento funde identidades distintas.');
        }
      }
      for(const table of IMPORT_TABLES){
        if(!known.has(table))continue;
        const sourceColumns=(db.prepare(`PRAGMA table_info(${quote(table)})`).all() as {name:string}[]).map(column=>column.name);
        const columns=(await client.query<Column>(`SELECT column_name,data_type,is_identity,is_nullable,column_default FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,[table])).rows;
        if(!columns.length)throw new Error(`Tabela destino ausente: ${table}`);
        const targetNames=new Set(columns.map(column=>column.column_name));
        if(sourceColumns.some(column=>!targetNames.has(column)))throw new Error(`Colunas sem conversão em ${table}.`);
        const derivedOffice=table==='clientes_contatos'||table==='clientes_documentos'||table==='tentativas_envio';
        const selected=columns.filter(column=>sourceColumns.includes(column.column_name)||(derivedOffice&&column.column_name==='escritorio_id'));
        if(columns.some(column=>!selected.includes(column)&&column.is_nullable==='NO'&&!column.column_default&&column.is_identity!=='YES'))throw new Error(`Coluna obrigatória sem conversão em ${table}.`);
        const imported:Record<string,unknown>[]=[];
        const previous=(await client.query(`SELECT ${selected.map(column=>quote(column.column_name)).join(',')} FROM ${quote(table)}`)).rows;
        const references=referenciasIdentidades(db,table);
        if((TABELAS_IDS_IMPORTACAO as readonly string[]).includes(table))references.push({coluna:'id',tabela:table});
        for(const raw of db.prepare(`SELECT * FROM ${quote(table)}`).safeIntegers().iterate() as Iterable<Record<string,unknown>>){
          const row=table==='envios_clientes'?converterEstadoEnvioLegado(raw):table==='notificacoes_publicacoes'?converterEstadoNotificacaoLegada(raw):{...raw};
          if(derivedOffice){
            if(table==='tentativas_envio'){
              const delivery=db.prepare('SELECT escritorio_id FROM envios_clientes WHERE id=?').get(row.envio_id) as {escritorio_id:number}|undefined;
              if(!delivery)throw new Error('Tentativa sem envio de origem.');
              row.escritorio_id=delivery.escritorio_id;
            }else{
            const customer=db.prepare('SELECT escritorio_id FROM clientes WHERE id=?').get(row.cliente_id) as {escritorio_id:number}|undefined;
            if(!customer)throw new Error('Cliente ausente ao derivar escritório.');
            if(table==='clientes_contatos'){
              const contact=db.prepare('SELECT escritorio_id FROM contatos WHERE id=?').get(row.contato_id) as {escritorio_id:number}|undefined;
              if(!contact||customer.escritorio_id!==contact.escritorio_id)throw new Error('Vínculo cliente/contato cruza escritórios.');
            }
            row.escritorio_id=customer.escritorio_id;
            }
          }
          if(table==='registros'&&typeof row.arquivo_path==='string'&&!isAbsolute(row.arquivo_path))row.arquivo_path=[resolve(row.arquivo_path),resolve(dirname(source),row.arquivo_path)].find(existsSync)??resolve(row.arquivo_path);
          if(table==='registros'&&row.arquivo_path){
            if(typeof row.arquivo_path!=='string'||!existsSync(row.arquivo_path)||typeof row.arquivo_hash!=='string'||createHash('sha256').update(readFileSync(row.arquivo_path)).digest('hex')!==row.arquivo_hash.toLowerCase())throw new Error('Original ausente ou com hash divergente durante a importação.');
          }
          if(derivedOffice&&!references.some(reference=>reference.coluna==='escritorio_id'))references.push({coluna:'escritorio_id',tabela:'escritorios'});
          const remapped=remapearReferenciasIdentidade(row,references,effectivePlans);
          const converted=Object.fromEntries(selected.map(column=>[column.column_name,converterValorLegado(remapped[column.column_name],column.data_type)]));
          const values=selected.map(column=>column.data_type==='jsonb'||column.data_type==='json'?converted[column.column_name]===null?null:JSON.stringify(converted[column.column_name]):converted[column.column_name]);
          await client.query(`INSERT INTO ${quote(table)} (${selected.map(column=>quote(column.column_name)).join(',')}) VALUES (${values.map((_,index)=>'$'+(index+1)).join(',')})`,values);
          imported.push(converted);
        }
        const stored=(await client.query(`SELECT ${selected.map(column=>quote(column.column_name)).join(',')} FROM ${quote(table)}`)).rows;
        if(previous.length+imported.length!==stored.length||digest([...previous,...imported])!==digest(stored))throw new Error(`Equivalência de conteúdo falhou em ${table}.`);
        for(const column of columns.filter(column=>column.is_identity==='YES'))await sincronizarSequenciaImportacao(client,table,column.column_name);
        report.push({tabela:table,linhas:imported.length,hash:digest(imported)});
      }
      if(known.has('ajustes'))report.push(await importarAjustesIsolados(db,client,credentialsKey,escopoOperacional));
      const audit=known.has('auditoria_clientes')?await importarAuditoriaCadastrosIsolada(db,client,effectivePlans,escopoOperacional):null;
      if(audit)report.push(audit);
      const pending=[...known].filter(table=>!table.startsWith('sqlite_')&&table!=='ajustes'&&!IMPORT_TABLES.includes(table as typeof IMPORT_TABLES[number])).sort().map(table=>({tabela:table,linhas:Number((db.prepare(`SELECT count(*) n FROM ${quote(table)}`).get() as {n:number}).n)}));
      const archiveTables=[...pending.map(table=>table.tabela),...DELIVERY_TABLES.filter(table=>known.has(table)),...(known.has('ajustes')?['ajustes']:[])];
      const archived=await preservarLegadoIsolado(db,client,archiveTables,escopoOperacional);
      await persistirProvenienciaImportacao(client,effectivePlans);
      if(baseline)await conferirLinhasPreexistentes(client,baseline);
      if(identificarOrigemImportacao(db,source)!==sourceHash)throw new Error('Originais mudaram durante a importação.');
      if(pacote)conferirArquivosPacoteMigracao(pacote.file,credentialsKey);
      const result:ResultadoImportacaoIsolada={database,tabelas:report,arquivadas:archived,auditoria_cadastros:audit,pendentes:pending,preservacao_completa:true,escopo:'nucleo_e_arquivo',completo:false,
        checkpoint:{etapa:'nucleo_e_arquivo',retomado:false,origem_hash:sourceHash},referencias_historicas:'ids_da_origem_com_mapa_privado',destino_preexistente_preservado:!!baseline};
      await client.query(`CREATE TABLE importacao_privada.lotes(id integer PRIMARY KEY CHECK(id=1),origem_hash text NOT NULL,opcoes_hash text NOT NULL,
        destino_hash text NOT NULL,relatorio_json jsonb NOT NULL,modo text NOT NULL,planos_json jsonb NOT NULL,concluido_em timestamptz NOT NULL DEFAULT now())`);
      await client.query('INSERT INTO importacao_privada.lotes(id,origem_hash,opcoes_hash,destino_hash,relatorio_json,modo,planos_json) VALUES(1,$1,$2,$3,$4::jsonb,$5,$6::jsonb)',
        [sourceHash,optionsHash,await identificarDestinoImportacao(client),JSON.stringify(result),mode,JSON.stringify(effectivePlans)]);
      return result;
    });
  }finally{db.close();}
}

