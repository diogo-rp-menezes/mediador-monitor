import Database from 'better-sqlite3';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import type {Pool} from 'pg';

const direct=new Set(['escritorios','usuarios','clientes','contatos','credenciais_usuarios','usuarios_escritorios','usuarios_clientes','papeis_plataforma','registros','sindicatos','registros_sindicatos','monitoramentos_escritorios','execucoes','execucoes_escritorio','vinculos_escritorio','interpretacoes_escritorio','versoes_interpretacao','publicacoes_documentos','auditoria_acessos_publicacoes','configuracoes_smtp_escritorio','historico_interpretacoes_legado']);
const derived=new Set(['clientes_contatos','clientes_documentos','clientes_sindicatos','tentativas_envio','auditoria_clientes']);
const historical=new Set(['consolidacoes_cct','vinculos_aditivos','revisoes_pendencias','auditoria_revisoes','migracoes_aplicadas']);
const operational=new Set(['sessoes_usuarios','recuperacoes_acesso','concessoes_suporte','limites_autenticacao','envios_clientes','notificacoes_publicacoes']);
type Column={table_name:string;column_name:string;data_type:string;is_nullable:string;column_default:string|null;is_identity:string};

/** Read-only conversion inventory. Contains schema/counts, never credential or row values. */
export async function planejarImportacaoPostgres(pool:Pool,sourcePath:string,outputPath:string){
  const source=resolve(sourcePath),db=new Database(source,{readonly:true,fileMustExist:true});
  try{
    db.exec('BEGIN');
    const target=(await pool.query<Column>(`SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[];
    const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
    const tables=names.map(({name})=>{
      const columns=(db.prepare(`PRAGMA table_info(${quote(name)})`).all() as {name:string;type:string}[]);
      const count=Number((db.prepare(`SELECT count(*) n FROM ${quote(name)}`).get() as {n:number}).n);
      const policy=direct.has(name)?'converter':derived.has(name)?'derivar_escritorio':historical.has(name)?'preservar_historico':operational.has(name)?'preservar_sem_reativar':name==='auditoria_seguranca'?'conciliar_auditoria':name==='ajustes'?'mapear_configuracoes':'nao_mapeada';
      const destination=target.filter(column=>column.table_name===name);
      const sourceNames=new Set(columns.map(column=>column.name)),targetNames=new Set(destination.map(column=>column.column_name));
      return {origem:name,linhas:count,politica:policy,destino:destination.length?name:null,colunas_origem:columns,
        colunas_destino:destination.map(({table_name,...column})=>column),
        colunas_sem_destino:columns.filter(column=>!targetNames.has(column.name)).map(column=>column.name),
        colunas_obrigatorias_sem_origem:destination.filter(column=>!sourceNames.has(column.column_name)&&column.is_nullable==='NO'&&!column.column_default&&column.is_identity!=='YES').map(column=>column.column_name)};
    });
    const report={gerado_em:new Date().toISOString(),origem:source,somente_leitura:true,tabelas:tables,
      bloqueios:tables.filter(table=>table.politica==='nao_mapeada'||(table.politica==='converter'&&!table.destino)).map(table=>`Mapeamento ausente: ${table.origem}`),
      observacoes:['Conversões de booleanos, JSON, datas, BLOBs e sequências precisam de validação por coluna.',
        'Sessões, recuperação, concessões e filas não podem ser reativadas por cópia direta.',
        'Históricos legados precisam de preservação sem substituir interpretações privadas atuais.',
        'Auditoria do destino deve ser preservada e conciliada com mapeamento de identidades.',
        'Este inventário não executa importação nem certifica equivalência.']};
    db.exec('COMMIT');
    const output=resolve(outputPath);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    return report;
  }finally{db.close();}
}

