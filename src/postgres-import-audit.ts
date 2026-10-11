import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Pool } from 'pg';

export interface LegacyImportAudit {
  generatedAt: string;
  source: string;
  destination: { database: string; server: string };
  sourceTables: Record<string, number>;
  destinationTables: Record<string, number>;
  sourceChecks: Record<string, number>;
  missingFiles: string[];
  invalidFiles: string[];
  sourceFingerprint: string;
  readyForImport: boolean;
  blockers: string[];
}

const tables = ['registros','execucoes','sindicatos','clientes','contatos','escritorios','usuarios','usuarios_escritorios','usuarios_clientes','clientes_contatos','clientes_sindicatos','registros_sindicatos','monitoramentos_escritorios','vinculos_escritorio','interpretacoes_escritorio','versoes_interpretacao','publicacoes_documentos','auditoria_acessos_publicacoes','notificacoes_publicacoes','clientes_documentos','envios_clientes','tentativas_envio','auditoria_clientes','auditoria_seguranca','papeis_plataforma','sessoes_usuarios','recuperacoes_acesso','concessoes_suporte','configuracoes_smtp_escritorio','credenciais_usuarios'];

export async function auditarImportacaoLegada(pool: Pool, sourcePath: string, outputPath: string): Promise<LegacyImportAudit> {
  const source = resolve(sourcePath);
  if (!existsSync(source)) throw new Error(`Banco SQLite não encontrado: ${source}`);
  const sqlite = new Database(source, { readonly: true, fileMustExist: true });
  try {
    sqlite.exec('BEGIN');
    const known = new Set((sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]).map(x=>x.name));
    const sourceDigest=createHash('sha256');
    const sourceTables: Record<string,number> = {};
    const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
    for (const table of known){
      const columns=sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as {name:string;type:string;pk:number}[];
      sourceDigest.update(JSON.stringify({table,columns}));
      let count=0;
      for(const row of sqlite.prepare(`SELECT * FROM ${quote(table)} ORDER BY ${columns.map(column=>quote(column.name)).join(',')}`).iterate()){
        sourceDigest.update(JSON.stringify(row));sourceDigest.update('\n');count++;
      }
      sourceTables[table]=count;
    }
    const sourceChecks: Record<string,number> = {};
    sourceChecks.violacoes_foreign_key=Array.from(sqlite.prepare('PRAGMA foreign_key_check').iterate()).length;
    const check = (key: string, sql: string) => { sourceChecks[key] = Number((sqlite.prepare(sql).get() as {n:number}).n); };
    if (known.has('clientes_documentos')) check('documentos_cliente_sem_cliente', 'SELECT COUNT(*) n FROM clientes_documentos d LEFT JOIN clientes c ON c.id=d.cliente_id WHERE c.id IS NULL');
    if (known.has('clientes_contatos')) check('relacoes_cliente_contato_orfas', 'SELECT COUNT(*) n FROM clientes_contatos cc LEFT JOIN clientes c ON c.id=cc.cliente_id LEFT JOIN contatos ct ON ct.id=cc.contato_id WHERE c.id IS NULL OR ct.id IS NULL');
    if (known.has('vinculos_escritorio')) check('vinculos_aditivo_sem_registro', 'SELECT COUNT(*) n FROM vinculos_escritorio v LEFT JOIN registros r ON r.numero_registro=v.aditivo WHERE r.numero_registro IS NULL');
    if (known.has('publicacoes_documentos')) check('publicacoes_sem_cliente_ou_escritorio', 'SELECT COUNT(*) n FROM publicacoes_documentos p LEFT JOIN clientes c ON c.id=p.cliente_id AND c.escritorio_id=p.escritorio_id WHERE c.id IS NULL');
    const missingFiles: string[] = [], invalidFiles: string[] = [];
    if (known.has('registros')) {
      const cols = new Set((sqlite.prepare('PRAGMA table_info(registros)').all() as {name:string}[]).map(x=>x.name));
      if (cols.has('arquivo_path')) {
        for (const row of sqlite.prepare("SELECT numero_registro, arquivo_path, arquivo_hash FROM registros WHERE arquivo_path IS NOT NULL AND arquivo_path <> ''").all() as {numero_registro:string;arquivo_path:string;arquivo_hash:string|null}[]) {
          const path = isAbsolute(row.arquivo_path) ? row.arquivo_path : [resolve(row.arquivo_path),resolve(dirname(source),row.arquivo_path)].find(existsSync)??resolve(row.arquivo_path);
          if (!existsSync(path)) { missingFiles.push(row.numero_registro); continue; }
          if (!row.arquivo_hash || createHash('sha256').update(readFileSync(path)).digest('hex') !== row.arquivo_hash.toLowerCase()) invalidFiles.push(row.numero_registro);
        }
      }
    }
    // O inventário precisa enxergar todas as linhas mesmo com RLS habilitado. A
    // configuração global é local à conexão e é descartada no COMMIT/ROLLBACK.
    const pg=await pool.connect();
    let destination:{current_database:string;server_addr:string|null;server_port:number|null};
    let runtimeRole:{rolname:string;rolsuper:boolean;rolbypassrls:boolean}|undefined;
    const destinationTables: Record<string,number> = {};
    let onlyInitialOffice=false;
    try {
      await pg.query('BEGIN');
      await pg.query("SELECT set_config('app.escritorio_id', '', true)");
      await pg.query("SELECT set_config('app.global_access', 'true', true)");
      destination=(await pg.query<{current_database:string;server_addr:string|null;server_port:number|null}>('SELECT current_database(), inet_server_addr()::text AS server_addr, inet_server_port() AS server_port')).rows[0];
      runtimeRole=(await pg.query<{rolname:string;rolsuper:boolean;rolbypassrls:boolean}>('SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
      const pgTables=await pg.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'");
      for (const {table_name} of pgTables.rows) {
        if (table_name === 'mediador_schema_migrations') continue;
        const count=await pg.query(`SELECT COUNT(*)::int AS n FROM "${table_name.replaceAll('"','""')}"`);
        destinationTables[table_name]=count.rows[0].n;
      }
      if(destinationTables.escritorios===1){
        const initial=await pg.query("SELECT id,nome,cnpj,email,telefone,ativo FROM escritorios");
        const row=initial.rows[0];
        onlyInitialOffice=!!row&&row.id===1&&row.nome==='Escritório inicial'&&row.cnpj===null&&row.email===''&&row.telefone===''&&row.ativo===true;
      }
      await pg.query('COMMIT');
    } catch (error) {
      try { await pg.query('ROLLBACK'); } catch {/* preserve original error */}
      throw error;
    } finally { pg.release(); }
    const blockers: string[] = [];
    if (Object.values(sourceChecks).some(n=>n>0)) blockers.push('Há vínculos órfãos no SQLite.');
    if (missingFiles.length) blockers.push(`Há ${missingFiles.length} arquivo(s) de registro ausente(s).`);
    if (invalidFiles.length) blockers.push(`Há ${invalidFiles.length} arquivo(s) sem hash válido.`);
    // A migração inicial cria apenas o escritório 1 para manter compatibilidade com
    // instalações vazias. Esse único registro não representa uma importação prévia.
    const populated=Object.entries(destinationTables).some(([table,count])=>count>0&&!(table==='escritorios'&&count===1&&onlyInitialOffice));
    if (populated) blockers.push('O destino PostgreSQL contém dados; esta auditoria não permite importação sobreposta.');
    if (runtimeRole?.rolsuper || runtimeRole?.rolbypassrls) blockers.push('A conexão PostgreSQL atual usa papel superusuário ou BYPASSRLS; execute a auditoria com PGAPPUSER para validar isolamento.');
    const fingerprint = sourceDigest.update(JSON.stringify({sourceChecks,missingFiles,invalidFiles})).digest('hex');
    const report: LegacyImportAudit = {
      generatedAt:new Date().toISOString(), source,
      destination:{database:destination.current_database,server:`${destination.server_addr ?? 'socket'}:${destination.server_port ?? ''}`},
      sourceTables,destinationTables,sourceChecks,missingFiles,invalidFiles,sourceFingerprint:fingerprint,
      readyForImport:blockers.length===0,blockers
    };
    const output = resolve(outputPath); mkdirSync(dirname(output),{recursive:true}); writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'w'});
    sqlite.exec('COMMIT');
    return report;
  } finally { sqlite.close(); }
}

