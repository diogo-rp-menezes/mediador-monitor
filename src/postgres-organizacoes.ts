import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ClienteSchema, ContatoSchema, ErroCadastro, cnpjValido, normalizarCnpj } from './cadastros.js';
import { withPostgresGlobalTransaction, withPostgresOfficeTransaction } from './postgres-transaction.js';
import { MonitoramentoSchema } from './monitoramentos-escritorio.js';

export interface PostgresQueryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}
function isPool(db:PostgresQueryable):db is Pool{return typeof (db as Pool).connect==='function'&&typeof (db as PoolClient).release!=='function';}

export interface EscritorioPostgres {
  id: number;
  nome: string;
  cnpj: string | null;
  email: string;
  telefone: string;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
  clientes_total?: number;
  usuarios_total?: number;
}

export interface ClientePostgres {
  id: number;
  escritorio_id: number;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  uf: string;
  municipio: string;
  ativo: boolean;
  modo_envio: 'revisao' | 'automatico';
  criado_em: Date;
  atualizado_em: Date;
}

export interface UsuarioPostgres {
  id: number;
  nome: string;
  email: string;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

const EscritorioInputSchema = z.object({
  nome: z.string().trim().min(2).max(250),
  cnpj: z.string().trim().transform(normalizarCnpj).refine(cnpjValido, 'CNPJ inválido'),
  email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).default(''),
  telefone: z.string().trim().max(500).default(''),
  ativo: z.boolean().default(true)
}).strict();
const UsuarioInputSchema = z.object({
  nome: z.string().trim().min(2).max(250),
  email: z.string().trim().toLowerCase().email().max(254),
  ativo: z.boolean().default(true)
}).strict();

function idValido(id: number): number {
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Identificador inválido.');
  return id;
}

async function auditarIdentidadePostgres(db: PoolClient, acao: string, atorId: number | null,
  entidade: string, entidadeId: string | number, detalhes: Record<string, unknown>, escritorioId: number | null = null,
  clienteId: number | null = null): Promise<void> {
  await db.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES($1,$2,$3,$4,$5,'','',$6,$7::jsonb)`,
  [atorId, acao, escritorioId, clienteId, Date.now(), randomUUID(), JSON.stringify({entidade,entidade_id:String(entidadeId),...detalhes})]);
}

/** Read-only first port of organization queries. Callers pass the request transaction client. */
export async function listarEscritoriosPostgres(db: PostgresQueryable): Promise<EscritorioPostgres[]> {
  if(isPool(db))return withPostgresGlobalTransaction(db,client=>listarEscritoriosPostgres(client));
  const result = await db.query<EscritorioPostgres & QueryResultRow>(`
    SELECT e.id, e.nome, e.cnpj, e.email, e.telefone, e.ativo, e.criado_em, e.atualizado_em,
      (SELECT count(*)::integer FROM clientes c WHERE c.escritorio_id=e.id) AS clientes_total,
      (SELECT count(*)::integer FROM usuarios_escritorios ue WHERE ue.escritorio_id=e.id AND ue.ativo) AS usuarios_total
    FROM escritorios e
    ORDER BY lower(e.nome), e.id`);
  return result.rows;
}

export async function obterEscritorioPostgres(db: PostgresQueryable, id: number): Promise<EscritorioPostgres | null> {
  const result = await db.query<EscritorioPostgres & QueryResultRow>(
    'SELECT id,nome,cnpj,email,telefone,ativo,criado_em,atualizado_em FROM escritorios WHERE id=$1', [idValido(id)]);
  return result.rows[0] ?? null;
}

export async function listarClientesPostgres(db: PostgresQueryable, escritorioId: number): Promise<ClientePostgres[]> {
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>listarClientesPostgres(client,escritorioId));
  const result = await db.query<ClientePostgres & QueryResultRow>(`
    SELECT id, escritorio_id, razao_social, nome_fantasia, cnpj, uf, municipio, ativo, modo_envio, criado_em, atualizado_em
    FROM clientes WHERE escritorio_id=$1 ORDER BY lower(razao_social), id`, [idValido(escritorioId)]);
  return result.rows;
}

export async function obterClientePostgres(db:PostgresQueryable,escritorioId:number,id:number):Promise<Record<string,unknown>>{
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>obterClientePostgres(client,escritorioId,id));
  idValido(escritorioId);idValido(id);
  const client=await db.query(`SELECT id,escritorio_id,razao_social,nome_fantasia,cnpj,uf,municipio,ativo,modo_envio,criado_em,atualizado_em,dados_cnpj_json
    FROM clientes WHERE id=$1 AND escritorio_id=$2`,[id,escritorioId]);
  if(!client.rows[0])throw new ErroCadastro('Cliente não encontrado.',404);
  const [unions,contacts]=await Promise.all([
    db.query(`SELECT cs.sindicato_id,cs.categoria,cs.uf,cs.municipio,cs.principal,cs.enquadramento_confirmado,s.nome,s.cnpj,s.ativo
      FROM clientes_sindicatos cs JOIN sindicatos s ON s.id=cs.sindicato_id WHERE cs.cliente_id=$1 ORDER BY cs.principal DESC,lower(s.nome)`,[id]),
    db.query(`SELECT cc.contato_id,cc.funcao,cc.receber_email,cc.tipos_json,c.nome,c.email,c.telefone,c.cargo,c.ativo
      FROM clientes_contatos cc JOIN contatos c ON c.id=cc.contato_id AND c.escritorio_id=cc.escritorio_id
      WHERE cc.cliente_id=$1 AND cc.escritorio_id=$2 ORDER BY lower(c.nome)`,[id,escritorioId])
  ]);
  return {...client.rows[0],sindicatos:unions.rows,contatos:contacts.rows.map(row=>({...row,tipos:row.tipos_json,tipos_json:undefined}))};
}

export async function salvarClientePostgres(db:PoolClient,escritorioId:number,id:number|null,raw:unknown,atorId:number){
  idValido(escritorioId);idValido(atorId);if(id!==null)idValido(id);
  const data=ClienteSchema.parse(raw);
  if(data.dados_cnpj&&data.dados_cnpj.cnpj!==data.cnpj)throw new ErroCadastro('Os dados consultados pertencem a outro CNPJ. Consulte novamente ou remova a consulta.');
  const before=id===null?null:await obterClientePostgres(db,escritorioId,id);
  const lookup=await db.query('SELECT id FROM clientes WHERE cnpj=$1 AND id IS DISTINCT FROM $2',[data.cnpj,id]);
  if(lookup.rowCount)throw new ErroCadastro('Já existe um cliente com este CNPJ.',409);
  try{
    let clientId:number;
    if(id===null){
      const inserted=await db.query<{id:number}&QueryResultRow>(`INSERT INTO clientes(escritorio_id,razao_social,nome_fantasia,cnpj,uf,municipio,ativo,modo_envio,dados_cnpj_json)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,[escritorioId,data.razao_social,data.nome_fantasia,data.cnpj,data.uf,data.municipio,data.ativo,data.modo_envio,data.dados_cnpj===undefined?null:JSON.stringify(data.dados_cnpj)]);
      clientId=inserted.rows[0].id;
    }else{
      clientId=id;
      const json=data.dados_cnpj===undefined?(before as Record<string,unknown>).dados_cnpj_json??null:data.dados_cnpj===null?null:JSON.stringify(data.dados_cnpj);
      await db.query(`UPDATE clientes SET razao_social=$1,nome_fantasia=$2,cnpj=$3,uf=$4,municipio=$5,ativo=$6,modo_envio=$7,dados_cnpj_json=$8::jsonb,atualizado_em=now()
        WHERE id=$9 AND escritorio_id=$10`,[data.razao_social,data.nome_fantasia,data.cnpj,data.uf,data.municipio,data.ativo,data.modo_envio,json,clientId,escritorioId]);
    }
    if(data.sindicatos){
      for(const link of data.sindicatos){
        const available=await db.query('SELECT 1 FROM monitoramentos_escritorios WHERE escritorio_id=$1 AND sindicato_id=$2 UNION SELECT 1 FROM clientes_sindicatos WHERE cliente_id=$3 AND sindicato_id=$2',[escritorioId,link.sindicato_id,clientId]);
        if(!available.rowCount)throw new ErroCadastro('Sindicato não configurado neste escritório.',404);
      }
      await db.query('DELETE FROM clientes_sindicatos WHERE cliente_id=$1',[clientId]);
      for(const link of data.sindicatos)await db.query(`INSERT INTO clientes_sindicatos(cliente_id,sindicato_id,categoria,uf,municipio,principal,enquadramento_confirmado)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[clientId,link.sindicato_id,link.categoria,link.uf,link.municipio,link.principal,link.enquadramento_confirmado]);
    }
    if(data.contatos){
      for(const link of data.contatos){const exists=await db.query('SELECT 1 FROM contatos WHERE id=$1 AND escritorio_id=$2',[link.contato_id,escritorioId]);if(!exists.rowCount)throw new ErroCadastro('Contato não encontrado neste escritório.',404);}
      await db.query('DELETE FROM clientes_contatos WHERE cliente_id=$1 AND escritorio_id=$2',[clientId,escritorioId]);
      for(const link of data.contatos)await db.query(`INSERT INTO clientes_contatos(cliente_id,contato_id,escritorio_id,funcao,receber_email,tipos_json)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[clientId,link.contato_id,escritorioId,link.funcao,link.receber_email,JSON.stringify(link.tipos)]);
    }
    const after=await obterClientePostgres(db,escritorioId,clientId);
    await db.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json)
      VALUES($1,'cliente',$2,'salvar',$3::jsonb)`,[escritorioId,String(clientId),JSON.stringify({antes:before,depois:after,ator_id:atorId,origem:'servico_postgres'})]);
    return clientId;
  }catch(error){if((error as {code?:string}).code==='23505')throw new ErroCadastro('Já existe um cliente com este CNPJ ou vínculo duplicado.',409);throw error;}
}

export async function listarContatosPostgres(db:PostgresQueryable,escritorioId:number):Promise<Record<string,unknown>[]>{
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>listarContatosPostgres(client,escritorioId));
  idValido(escritorioId);
  const result=await db.query(`SELECT c.id,c.escritorio_id,c.nome,c.email,c.telefone,c.cargo,c.ativo,c.criado_em,c.atualizado_em,
    COALESCE(jsonb_agg(jsonb_build_object('id',cl.id,'razao_social',cl.razao_social,'receber_email',cc.receber_email,'funcao',cc.funcao))
      FILTER(WHERE cl.id IS NOT NULL),'[]'::jsonb) AS clientes
    FROM contatos c LEFT JOIN clientes_contatos cc ON cc.contato_id=c.id AND cc.escritorio_id=c.escritorio_id
    LEFT JOIN clientes cl ON cl.id=cc.cliente_id AND cl.escritorio_id=cc.escritorio_id WHERE c.escritorio_id=$1
    GROUP BY c.id ORDER BY lower(c.nome),c.id`,[escritorioId]);
  return result.rows;
}

export async function obterContatoPostgres(db:PostgresQueryable,escritorioId:number,id:number):Promise<Record<string,unknown>>{
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>obterContatoPostgres(client,escritorioId,id));
  idValido(escritorioId);idValido(id);const result=await db.query(`SELECT c.* FROM contatos c WHERE c.id=$1 AND c.escritorio_id=$2`,[id,escritorioId]);
  if(!result.rows[0])throw new ErroCadastro('Contato não encontrado.',404);return result.rows[0];
}

export async function salvarContatoPostgres(db:PoolClient,escritorioId:number,id:number|null,raw:unknown,atorId:number){
  idValido(escritorioId);idValido(atorId);if(id!==null)idValido(id);const data=ContatoSchema.parse(raw);
    const before=id===null?null:await obterContatoPostgres(db,escritorioId,id);
  try{
    const result=id===null?await db.query<{id:number}&QueryResultRow>(`INSERT INTO contatos(escritorio_id,nome,email,telefone,cargo,ativo) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [escritorioId,data.nome,data.email,data.telefone,data.cargo,data.ativo]):await db.query<{id:number}&QueryResultRow>(`UPDATE contatos SET nome=$1,email=$2,telefone=$3,cargo=$4,ativo=$5,atualizado_em=now()
      WHERE id=$6 AND escritorio_id=$7 RETURNING id`,[data.nome,data.email,data.telefone,data.cargo,data.ativo,id,escritorioId]);
    const contactId=result.rows[0]?.id;if(!contactId)throw new ErroCadastro('Contato não encontrado.',404);
    await db.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json) VALUES($1,'contato',$2,'salvar',$3::jsonb)`,
      [escritorioId,String(contactId),JSON.stringify({antes:before,depois:data,ator_id:atorId,origem:'servico_postgres'})]);return contactId;
  }catch(error){if((error as {code?:string}).code==='23505')throw new ErroCadastro('Já existe um contato com este e-mail neste escritório.',409);throw error;}
}

export async function listarCatalogoSindicatosPostgres(db:PostgresQueryable,escritorioId:number):Promise<Record<string,unknown>[]>{
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>listarCatalogoSindicatosPostgres(client,escritorioId));
  idValido(escritorioId);
  const result=await db.query(`SELECT s.id,s.nome,s.cnpj,
    (SELECT count(*)::integer FROM clientes_sindicatos cs JOIN clientes c ON c.id=cs.cliente_id AND c.escritorio_id=$1
      WHERE cs.sindicato_id=s.id) AS clientes_total
    FROM sindicatos s ORDER BY lower(s.nome),s.id`,[escritorioId]);
  return result.rows;
}

const monitoramentoView=(row:Record<string,unknown>)=>{const {tipos_json,...data}=row;return {...data,tipos:tipos_json,ativo:Boolean(row.ativo)};};
export async function listarMonitoramentosPostgres(db:PostgresQueryable,escritorioId:number):Promise<Record<string,unknown>[]>{
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>listarMonitoramentosPostgres(client,escritorioId));
  idValido(escritorioId);
  const result=await db.query(`SELECT m.*,s.nome sindicato_nome,s.cnpj sindicato_cnpj FROM monitoramentos_escritorios m
    JOIN sindicatos s ON s.id=m.sindicato_id WHERE m.escritorio_id=$1 ORDER BY lower(m.nome),m.id`,[escritorioId]);
  return result.rows.map(row=>monitoramentoView(row));
}
export async function obterMonitoramentoPostgres(db:PostgresQueryable,escritorioId:number,id:number):Promise<Record<string,unknown>>{
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>obterMonitoramentoPostgres(client,escritorioId,id));
  idValido(escritorioId);idValido(id);
  const result=await db.query('SELECT * FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2',[id,escritorioId]);
  if(!result.rows[0])throw new ErroCadastro('Monitoramento não encontrado.',404);
  return monitoramentoView(result.rows[0]);
}
export async function salvarMonitoramentoPostgres(db:PoolClient,escritorioId:number,id:number|null,raw:unknown){
  idValido(escritorioId);if(id!==null)idValido(id);
  const data=MonitoramentoSchema.parse(raw);
  const union=await db.query('SELECT id FROM sindicatos WHERE id=$1',[data.sindicato_id]);if(!union.rowCount)throw new ErroCadastro('Sindicato não encontrado.',404);
  if(id!==null){const current=await obterMonitoramentoPostgres(db,escritorioId,id);if((current as Record<string,unknown>).sindicato_id!==data.sindicato_id)throw new ErroCadastro('Sindicato do monitoramento não pode ser alterado.',409);}
  const duplicate=await db.query('SELECT id FROM monitoramentos_escritorios WHERE escritorio_id=$1 AND sindicato_id=$2 AND id IS DISTINCT FROM $3',[escritorioId,data.sindicato_id,id]);
  if(duplicate.rowCount)throw new ErroCadastro('Este sindicato já está configurado neste escritório.',409);
  const values=[data.nome,data.cnpj_filtro,data.categoria,data.uf,JSON.stringify(data.tipos),data.vigencia,data.titulo,data.ativo];
  try{
    if(id===null){const result=await db.query<{id:number}&QueryResultRow>(`INSERT INTO monitoramentos_escritorios
      (escritorio_id,sindicato_id,nome,cnpj_filtro,categoria,uf,tipos_json,vigencia,titulo,ativo)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING id`,[escritorioId,data.sindicato_id,...values]);return result.rows[0].id;}
    await db.query(`UPDATE monitoramentos_escritorios SET nome=$1,cnpj_filtro=$2,categoria=$3,uf=$4,tipos_json=$5::jsonb,
      vigencia=$6,titulo=$7,ativo=$8,atualizado_em=now() WHERE id=$9 AND escritorio_id=$10`,[...values,id,escritorioId]);return id;
  }catch(error){if((error as {code?:string}).code==='23505')throw new ErroCadastro('Este sindicato já está configurado neste escritório.',409);throw error;}
}
export async function excluirMonitoramentoPostgres(db:PoolClient,escritorioId:number,id:number){
  idValido(escritorioId);idValido(id);
  const result=await db.query<{sindicato_id:number}&QueryResultRow>('SELECT sindicato_id FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2 FOR UPDATE',[id,escritorioId]);
  const unionId=result.rows[0]?.sindicato_id;if(!unionId)throw new ErroCadastro('Monitoramento não encontrado.',404);
  const linked=await db.query(`SELECT 1 FROM clientes_sindicatos cs JOIN clientes c ON c.id=cs.cliente_id AND c.escritorio_id=$2
    WHERE cs.sindicato_id=$1 LIMIT 1`,[unionId,escritorioId]);
  if(linked.rowCount)throw new ErroCadastro('Sindicato vinculado a clientes. Inative o monitoramento para preservar os vínculos.',409);
  await db.query('DELETE FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2',[id,escritorioId]);
}

/** Creates or updates an office and appends its audit record in the same transaction. */
export async function salvarEscritorioPostgres(db: PoolClient, id: number | null, raw: unknown): Promise<number> {
  const data = EscritorioInputSchema.parse(raw);
  if (id !== null) idValido(id);
  let antes: EscritorioPostgres | null = null;
  if (id !== null) {
    antes = await obterEscritorioPostgres(db, id);
    if (!antes) throw new ErroCadastro('Escritório não encontrado.', 404);
  }
  try {
    const result = id === null
      ? await db.query<{id:number} & QueryResultRow>(
        'INSERT INTO escritorios(nome,cnpj,email,telefone,ativo) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [data.nome,data.cnpj,data.email,data.telefone,data.ativo])
      : await db.query<{id:number} & QueryResultRow>(
        'UPDATE escritorios SET nome=$1,cnpj=$2,email=$3,telefone=$4,ativo=$5,atualizado_em=now() WHERE id=$6 RETURNING id',
        [data.nome,data.cnpj,data.email,data.telefone,data.ativo,id]);
    const officeId = result.rows[0]?.id;
    if (!officeId) throw new ErroCadastro('Escritório não encontrado.', 404);
    const depois = await obterEscritorioPostgres(db, officeId);
    await db.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json)
      VALUES($1,'escritorio',$2,'salvar',$3::jsonb)`,
    [officeId,String(officeId),JSON.stringify({antes,depois,origem:'servico_postgres'})]);
    return officeId;
  } catch (error) {
    if ((error as {code?:string}).code === '23505') throw new ErroCadastro('Já existe um escritório com este CNPJ.', 409);
    throw error;
  }
}

export async function inativarEscritorioPostgres(db: PoolClient, id: number): Promise<void> {
  const officeId=idValido(id);
  const antes=await obterEscritorioPostgres(db,officeId);
  if(!antes)throw new ErroCadastro('Escritório não encontrado.',404);
  if(!antes.ativo)return;
  await db.query('UPDATE escritorios SET ativo=false,atualizado_em=now() WHERE id=$1',[officeId]);
  const depois=await obterEscritorioPostgres(db,officeId);
  await db.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json)
    VALUES($1,'escritorio',$2,'inativar',$3::jsonb)`,
  [officeId,String(officeId),JSON.stringify({antes,depois,origem:'servico_postgres'})]);
}

export async function obterUsuarioPostgres(db: PostgresQueryable, id: number): Promise<UsuarioPostgres | null> {
  const result = await db.query<UsuarioPostgres & QueryResultRow>(
    'SELECT id,nome,email,ativo,criado_em,atualizado_em FROM usuarios WHERE id=$1', [idValido(id)]);
  return result.rows[0] ?? null;
}

export async function salvarUsuarioPostgres(db: PoolClient, id: number | null, raw: unknown, atorId: number | null): Promise<number> {
  const data=UsuarioInputSchema.parse(raw);
  if(id!==null)idValido(id);
  if(atorId!==null)idValido(atorId);
  let antes:UsuarioPostgres|null=null;
  if(id!==null){antes=await obterUsuarioPostgres(db,id);if(!antes)throw new ErroCadastro('Usuário não encontrado.',404);}
  try {
    const result=id===null
      ? await db.query<{id:number}&QueryResultRow>('INSERT INTO usuarios(nome,email,ativo) VALUES($1,$2,$3) RETURNING id',[data.nome,data.email,data.ativo])
      : await db.query<{id:number}&QueryResultRow>('UPDATE usuarios SET nome=$1,email=$2,ativo=$3,atualizado_em=now() WHERE id=$4 RETURNING id',[data.nome,data.email,data.ativo,id]);
    const userId=result.rows[0]?.id;
    if(!userId)throw new ErroCadastro('Usuário não encontrado.',404);
    const depois=await obterUsuarioPostgres(db,userId);
    await auditarIdentidadePostgres(db,'usuario_salvar',atorId,'usuario',userId,{antes,depois});
    return userId;
  } catch(error) {
    if((error as {code?:string}).code==='23505')throw new ErroCadastro('Já existe um usuário com este e-mail.',409);
    throw error;
  }
}

export async function vincularUsuarioEscritorioPostgres(db:PoolClient,usuarioId:number,escritorioId:number,
  papel:'administrador'|'operador',atorId:number|null):Promise<void>{
  idValido(usuarioId);idValido(escritorioId);if(atorId!==null)idValido(atorId);
  z.enum(['administrador','operador']).parse(papel);
  const user=await obterUsuarioPostgres(db,usuarioId);
  if(!user)throw new ErroCadastro('Usuário não encontrado.',404);
  if(!user.ativo)throw new ErroCadastro('Usuário inativo.',409);
  const office=await obterEscritorioPostgres(db,escritorioId);
  if(!office)throw new ErroCadastro('Escritório não encontrado.',404);
  if(!office.ativo)throw new ErroCadastro('Escritório inativo.',409);
  await db.query(`INSERT INTO usuarios_escritorios(usuario_id,escritorio_id,papel) VALUES($1,$2,$3)
    ON CONFLICT(usuario_id,escritorio_id) DO UPDATE SET papel=excluded.papel,ativo=true,atualizado_em=now()`,[usuarioId,escritorioId,papel]);
  await auditarIdentidadePostgres(db,'usuario_escritorio_vincular',atorId,'usuario_escritorio',`${usuarioId}:${escritorioId}`,{papel},escritorioId);
}

export async function vincularUsuarioClientePostgres(db:PoolClient,usuarioId:number,clienteId:number,atorId:number|null):Promise<void>{
  idValido(usuarioId);idValido(clienteId);if(atorId!==null)idValido(atorId);
  const user=await obterUsuarioPostgres(db,usuarioId);
  if(!user)throw new ErroCadastro('Usuário não encontrado.',404);
  if(!user.ativo)throw new ErroCadastro('Usuário inativo.',409);
  const result=await db.query<{escritorio_id:number;ativo:boolean}&QueryResultRow>('SELECT escritorio_id,ativo FROM clientes WHERE id=$1',[clienteId]);
  const client=result.rows[0];
  if(!client)throw new ErroCadastro('Cliente não encontrado.',404);
  if(!client.ativo)throw new ErroCadastro('Cliente inativo.',409);
  const office=await obterEscritorioPostgres(db,client.escritorio_id);
  if(!office?.ativo)throw new ErroCadastro('Escritório inativo.',409);
  await db.query(`INSERT INTO usuarios_clientes(usuario_id,cliente_id,escritorio_id) VALUES($1,$2,$3)
    ON CONFLICT(usuario_id,cliente_id) DO UPDATE SET escritorio_id=excluded.escritorio_id,ativo=true,atualizado_em=now()`,
  [usuarioId,clienteId,client.escritorio_id]);
  await auditarIdentidadePostgres(db,'usuario_cliente_vincular',atorId,'usuario_cliente',`${usuarioId}:${clienteId}`,
    {escritorio_id:client.escritorio_id},client.escritorio_id,clienteId);
}

export async function revogarVinculoPostgres(db:PoolClient,usuarioId:number,tipo:'escritorio'|'cliente',alvoId:number,atorId:number|null):Promise<void>{
  idValido(usuarioId);idValido(alvoId);if(atorId!==null)idValido(atorId);
  z.enum(['escritorio','cliente']).parse(tipo);
  const user=await obterUsuarioPostgres(db,usuarioId);
  if(!user)throw new ErroCadastro('Usuário não encontrado.',404);
  const table=tipo==='escritorio'?'usuarios_escritorios':'usuarios_clientes';
  const field=tipo==='escritorio'?'escritorio_id':'cliente_id';
  const result=await db.query(`UPDATE ${table} SET ativo=false,atualizado_em=now() WHERE usuario_id=$1 AND ${field}=$2 AND ativo=true RETURNING escritorio_id`,[usuarioId,alvoId]);
  const row=result.rows[0] as {escritorio_id:number}|undefined;
  if(!row)throw new ErroCadastro('Vínculo ativo não encontrado.',404);
  await auditarIdentidadePostgres(db,`usuario_${tipo}_revogar`,atorId,`usuario_${tipo}`,`${usuarioId}:${alvoId}`,
    {},row.escritorio_id,tipo==='cliente'?alvoId:null);
}

export async function listarVinculosUsuarioPostgres(db:PostgresQueryable,usuarioId:number):Promise<{
  escritorios:Array<{id:number;nome:string;papel:'administrador'|'operador'}>;
  clientes:Array<{id:number;razao_social:string;escritorio_id:number}>;
}>{
  if(isPool(db))return withPostgresGlobalTransaction(db,client=>listarVinculosUsuarioPostgres(client,usuarioId));
  idValido(usuarioId);
  const user=await obterUsuarioPostgres(db,usuarioId);
  if(!user)throw new ErroCadastro('Usuário não encontrado.',404);
  if(!user.ativo)return {escritorios:[],clientes:[]};
  const offices=await db.query<{id:number;nome:string;papel:'administrador'|'operador'}&QueryResultRow>(`SELECT e.id,e.nome,v.papel FROM usuarios_escritorios v
    JOIN escritorios e ON e.id=v.escritorio_id WHERE v.usuario_id=$1 AND v.ativo AND e.ativo ORDER BY lower(e.nome),e.id`,[usuarioId]);
  const clients=await db.query<{id:number;razao_social:string;escritorio_id:number}&QueryResultRow>(`SELECT c.id,c.razao_social,c.escritorio_id FROM usuarios_clientes v
    JOIN clientes c ON c.id=v.cliente_id AND c.escritorio_id=v.escritorio_id JOIN escritorios e ON e.id=c.escritorio_id
    WHERE v.usuario_id=$1 AND v.ativo AND c.ativo AND e.ativo ORDER BY lower(c.razao_social),c.id`,[usuarioId]);
  return {escritorios:offices.rows,clientes:clients.rows};
}

export async function buscarUsuarioPorEmailPostgres(db:PostgresQueryable,email:string):Promise<UsuarioPostgres|null>{
  const normalized=z.string().trim().toLowerCase().email().max(254).parse(email);
  const result=await db.query<UsuarioPostgres&QueryResultRow>(
    'SELECT id,nome,email,ativo,criado_em,atualizado_em FROM usuarios WHERE lower(email)=lower($1)',[normalized]);
  return result.rows[0]??null;
}

export async function listarUsuariosDoEscritorioPostgres(db:PostgresQueryable,escritorioId:number):Promise<{
  funcionarios:Array<{id:number;nome:string;email:string;papel:'administrador'|'operador';ativo:boolean}>;
  representantes:Array<{id:number;nome:string;email:string;cliente_id:number;ativo:boolean}>;
}>{
  if(isPool(db))return withPostgresOfficeTransaction(db,escritorioId,client=>listarUsuariosDoEscritorioPostgres(client,escritorioId));
  idValido(escritorioId);
  const [employees,representatives]=await Promise.all([
    db.query<{id:number;nome:string;email:string;papel:'administrador'|'operador';ativo:boolean}&QueryResultRow>(`SELECT u.id,u.nome,u.email,v.papel,v.ativo
      FROM usuarios_escritorios v JOIN usuarios u ON u.id=v.usuario_id WHERE v.escritorio_id=$1 ORDER BY lower(u.nome),u.id`,[escritorioId]),
    db.query<{id:number;nome:string;email:string;cliente_id:number;ativo:boolean}&QueryResultRow>(`SELECT u.id,u.nome,u.email,v.cliente_id,v.ativo
      FROM usuarios_clientes v JOIN usuarios u ON u.id=v.usuario_id WHERE v.escritorio_id=$1 ORDER BY lower(u.nome),u.id,v.cliente_id`,[escritorioId])
  ]);
  return {funcionarios:employees.rows,representantes:representatives.rows};
}

export async function excluirEscritorioPostgres(pool:Pool,id:number):Promise<void>{
  const officeId=idValido(id);
  if(officeId===1)throw new ErroCadastro('O escritório inicial deve ser preservado durante a migração.',409);
  try{
    await withPostgresGlobalTransaction(pool,async client=>{
      const before=await obterEscritorioPostgres(client,officeId);
      if(!before)throw new ErroCadastro('Escritório não encontrado.',404);
      await client.query('DELETE FROM escritorios WHERE id=$1',[officeId]);
      await client.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json)
        VALUES(NULL,'escritorio',$1,'excluir',$2::jsonb)`,[String(officeId),JSON.stringify({antes:before,origem:'servico_postgres'})]);
    });
  }catch(error){
    if(['23503','23514'].includes((error as {code?:string}).code??''))
      throw new ErroCadastro('Escritório possui cadastros ou histórico vinculado. Inative-o para preservar os dados.',409);
    throw error;
  }
}

export async function protegerUltimoAdministradorEscritorioPostgres(client:PoolClient,escritorioId:number,usuarioId:number,
  proximoPapel:'administrador'|'operador'|'revogado'):Promise<void>{
  idValido(escritorioId);idValido(usuarioId);
  await client.query('SELECT pg_advisory_xact_lock($1,$2)',[817204614,escritorioId]);
  if(proximoPapel==='administrador')return;
  const current=await client.query(`SELECT 1 FROM usuarios_escritorios v JOIN usuarios u ON u.id=v.usuario_id
    WHERE v.usuario_id=$1 AND v.escritorio_id=$2 AND v.papel='administrador' AND v.ativo=true AND u.ativo=true`,[usuarioId,escritorioId]);
  if(!current.rowCount)return;
  const other=await client.query(`SELECT 1 FROM usuarios_escritorios v JOIN usuarios u ON u.id=v.usuario_id
    WHERE v.escritorio_id=$1 AND v.usuario_id<>$2 AND v.papel='administrador' AND v.ativo=true AND u.ativo=true LIMIT 1`,[escritorioId,usuarioId]);
  if(!other.rowCount)throw new ErroCadastro('Mantenha ao menos um administrador ativo neste escritório.',409);
}


