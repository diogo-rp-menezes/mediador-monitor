import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import type {Pool} from 'pg';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {withPostgresTransaction} from './postgres-transaction.js';

export function configuracaoLocal(env:NodeJS.ProcessEnv=process.env){
  const port=Number(env.UI_PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Porta local inválida.');
  const url=new URL(env.AUTH_PUBLIC_URL||`http://localhost:${port}`);
  if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('A operação local exige origem localhost ou 127.0.0.1.');
  return {port,origin:url.origin,keyConfigured:!!env.CREDENTIALS_MASTER_KEY&&Buffer.from(env.CREDENTIALS_MASTER_KEY,'base64').length===32};
}

/** Read-only preflight: never migrates, bootstraps users, imports or consumes queues. */
export async function verificarAmbienteLocal(pool:Pool,env:NodeJS.ProcessEnv=process.env,migrationPool:Pool=pool){
  const config=configuracaoLocal(env),checks:Array<{item:string;ok:boolean;detalhe:string}>=[];
  await validarPapelRuntimePostgres(pool);
  checks.push({item:'Papel runtime',ok:true,detalhe:'Sem superusuário, bypass RLS, herança ou associação a outros papéis.'});
  const known=await withPostgresTransaction(migrationPool,async client=>{
    await client.query('SET TRANSACTION READ ONLY');
    return new Map((await client.query('SELECT version,checksum FROM mediador_schema_migrations')).rows.map(row=>[row.version,row.checksum]));
  });
  await withPostgresTransaction(pool,async client=>{
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SELECT set_config('app.escritorio_id', '', true),set_config('app.global_access', 'true', true)");
    const files=readdirSync(resolve('migrations/postgres')).filter(file=>/^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
    const missing=files.filter(file=>!known.has(file));
    const changed=files.filter(file=>known.has(file)&&known.get(file)!==createHash('sha256').update(readFileSync(resolve('migrations/postgres',file),'utf8')).digest('hex'));
    checks.push({item:'Migrações',ok:!missing.length&&!changed.length,detalhe:missing.length?`Pendentes: ${missing.join(', ')}`:changed.length?'Checksum de migração aplicada diverge.':`${files.length} migrações conferidas.`});
    const tables=['clientes','contatos','clientes_documentos','envios_clientes','publicacoes_documentos','auditoria_acessos_publicacoes'];
    const protectedTables=(await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relrowsecurity AND c.relforcerowsecurity",[tables])).rows;
    checks.push({item:'Isolamento RLS',ok:protectedTables.length===tables.length,detalhe:`${protectedTables.length}/${tables.length} tabelas privadas com RLS obrigatório.`});
    const identity=(await client.query("SELECT EXISTS(SELECT 1 FROM usuarios u JOIN credenciais_usuarios c ON c.usuario_id=u.id JOIN papeis_plataforma p ON p.usuario_id=u.id WHERE u.ativo=true AND p.papel='administrador_plataforma') ok")).rows[0].ok;
    checks.push({item:'Conta administrativa',ok:identity,detalhe:identity?'Conta ativa com credencial cadastrada.':'Nenhuma conta administrativa ativa com credencial no PostgreSQL. Em instalação existente, conclua a importação de identidades; bootstrap é para instalação nova.'});
  });
  checks.push({item:'Chave de credenciais',ok:config.keyConfigured,detalhe:config.keyConfigured?'Formato de 32 bytes presente; custódia não verificada.':'Defina CREDENTIALS_MASTER_KEY em Base64 de 32 bytes.'});
  checks.push({item:'Chromium',ok:existsSync(chromium.executablePath()),detalhe:'Necessário para coleta e geração de PDF.'});
  checks.push({item:'Build',ok:existsSync(resolve('dist/server.js')),detalhe:'Execute npm run build após atualizar o código.'});
  return {pronto:checks.every(check=>check.ok),origem:config.origin,checks};
}
