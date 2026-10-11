import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Pool,PoolClient,QueryResultRow } from 'pg';
import { ErroCadastro,normalizarCnpj,normalizarTexto } from './cadastros.js';
import { withPostgresOfficeTransaction } from './postgres-transaction.js';
import { arquivoPermitido,hashBytes } from './relatorio-core.js';

type Link=Record<string,unknown>&{categoria:string;uf:string;municipio:string;cnpj:string;enquadramento_confirmado:boolean};
type Meta={cnpjs:string[];categoria:string;abrangencia:string;inicio:string;fim:string};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readMeta=(raw:unknown):Meta=>{
  if(raw&&typeof raw==='object')return raw as Meta;
  if(typeof raw==='string'){try{return JSON.parse(raw) as Meta;}catch{/* invalid JSON remains an empty candidate */}}
  return {cnpjs:[],categoria:'',abrangencia:'',inicio:'',fim:''};
};

async function contextHash(db:{query:PoolClient['query']},clientId:number,number:string){
  const c=(await db.query('SELECT cnpj,uf,municipio FROM clientes WHERE id=$1',[clientId])).rows[0];
  const d=(await db.query('SELECT arquivo_hash,documento_meta_json,tipo,vigencia FROM registros WHERE numero_registro=$1',[number])).rows[0];
  if(!c||!d)throw new ErroCadastro('Documento ou cliente não encontrado.',404);
  const links=await db.query(`SELECT cs.cliente_id,cs.sindicato_id,cs.categoria,cs.uf,cs.municipio,cs.principal,cs.enquadramento_confirmado,
    s.cnpj,true AS ativo FROM clientes_sindicatos cs JOIN sindicatos s ON s.id=cs.sindicato_id
    WHERE cs.cliente_id=$1 AND cs.sindicato_id IN (SELECT sindicato_id FROM registros_sindicatos WHERE numero_registro=$2) ORDER BY cs.sindicato_id`,[clientId,number]);
  return digest({cliente:c,doc:d,vinculos:links.rows});
}

async function listDocs(db:{query:PoolClient['query']},officeId:number,clientId:number){
  const client=await db.query('SELECT id FROM clientes WHERE id=$1 AND escritorio_id=$2',[clientId,officeId]);
  if(!client.rowCount)throw new ErroCadastro('Cliente não encontrado.',404);
  const result=await db.query(`SELECT d.cliente_id,d.numero_registro,d.status,d.motivo,d.contexto_hash,d.origem,d.responsavel,d.justificativa,
    d.atualizado_em,d.incluir_envio,r.tipo,r.vigencia,(r.arquivo_path IS NOT NULL) AS arquivo_disponivel
    FROM clientes_documentos d JOIN registros r ON r.numero_registro=d.numero_registro
    WHERE d.cliente_id=$1 AND d.escritorio_id=$2 ORDER BY r.primeira_vez DESC,d.numero_registro`,[clientId,officeId]);
  const rows=[];
  for(const row of result.rows){
    const current=await contextHash(db,clientId,String(row.numero_registro)),stale=current!==row.contexto_hash;
    const version=digest({row,atual:current});
    rows.push({...row,incluir_envio:undefined,arquivo_disponivel:Boolean(row.arquivo_disponivel),desatualizado:stale,versao:version,
      status:stale?'candidato':row.status,origem:stale?'regra':row.origem,
      motivo:stale?'Documento ou vínculos alterados. Atualize e confira a aplicabilidade.':row.motivo,
      responsavel:stale?null:row.responsavel,justificativa:stale?null:row.justificativa});
  }
  return rows;
}

export async function listarDocumentosClientePostgres(pool:Pool,officeId:number,clientId:number){
  return withPostgresOfficeTransaction(pool,officeId,client=>listDocs(client,officeId,clientId));
}

export async function originalDocumentoClientePostgres(pool:Pool,officeId:number,clientId:number,number:string){
  return withPostgresOfficeTransaction(pool,officeId,async client=>{
  const result=await client.query<{arquivo_path:string|null;arquivo_hash:string|null}&QueryResultRow>(`SELECT r.arquivo_path,r.arquivo_hash
    FROM clientes_documentos d JOIN registros r ON r.numero_registro=d.numero_registro
    WHERE d.escritorio_id=$1 AND d.cliente_id=$2 AND d.numero_registro=$3`,[officeId,clientId,number]);
  const row=result.rows[0];if(!row)throw new ErroCadastro('Documento não relacionado ao cliente.',404);
  if(!row.arquivo_path)throw new ErroCadastro('Original não localizado.',404);
  const bytes=readFileSync(arquivoPermitido(row.arquivo_path));
  if(!row.arquivo_hash||hashBytes(bytes)!==row.arquivo_hash)throw new ErroCadastro('Original sem integridade confirmada. Atualize o documento.',409);
  const pdf=bytes.subarray(0,4).toString('latin1')==='%PDF';
  return {bytes,hash:row.arquivo_hash,nome:number.replace(/[^A-Z0-9_-]/gi,'_')+(pdf?'.pdf':'.doc'),tipo:pdf?'application/pdf':'application/msword'};
  });
}

function validDate(value:string){
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}

export async function atualizarDocumentosClientePostgres(pool:Pool,officeId:number,clientId:number){
  return withPostgresOfficeTransaction(pool,officeId,async client=>{
    const exists=await client.query('SELECT cnpj,uf,municipio,ativo,criado_em FROM clientes WHERE id=$1 AND escritorio_id=$2 FOR UPDATE',[clientId,officeId]);
    const customer=exists.rows[0];if(!customer)throw new ErroCadastro('Cliente não encontrado.',404);
    const old=await client.query('SELECT numero_registro,contexto_hash FROM clientes_documentos WHERE cliente_id=$1 AND escritorio_id=$2',[clientId,officeId]);
    for(const row of old.rows){
      const current=await contextHash(client,clientId,String(row.numero_registro));
      if(current!==row.contexto_hash)await client.query(`UPDATE clientes_documentos SET status='candidato',motivo='Documento ou vínculos alterados. Confira novamente a aplicabilidade.',
        origem='regra',responsavel=NULL,justificativa=NULL,contexto_hash=$1,atualizado_em=now() WHERE cliente_id=$2 AND numero_registro=$3`,[current,clientId,row.numero_registro]);
    }
    if(!customer.ativo)return 0;
    const docs=await client.query(`SELECT r.numero_registro,r.tipo,r.documento_meta_json,r.arquivo_hash,r.vigencia,r.primeira_vez,
      (EXISTS(SELECT 1 FROM clientes_sindicatos cs JOIN registros_sindicatos rs ON rs.sindicato_id=cs.sindicato_id
        WHERE cs.cliente_id=c.id AND rs.numero_registro=r.numero_registro)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.documento_meta_json->'cnpjs')='array'
        THEN r.documento_meta_json->'cnpjs' ELSE '[]'::jsonb END) AS n(cnpj) WHERE n.cnpj=c.cnpj)) AS corresponde
      FROM clientes c CROSS JOIN registros r WHERE c.id=$1 AND c.escritorio_id=$2 AND r.documento_meta_json IS NOT NULL`,[clientId,officeId]);
    let updated=0;
    for(const doc of docs.rows){
      if(!doc.corresponde)continue;
      const hash=await contextHash(client,clientId,String(doc.numero_registro));
      const previous=await client.query('SELECT contexto_hash,incluir_envio FROM clientes_documentos WHERE cliente_id=$1 AND numero_registro=$2 FOR UPDATE',[clientId,doc.numero_registro]);
      if(previous.rows[0]?.contexto_hash===hash)continue;
      const meta=readMeta(doc.documento_meta_json),relevant=await client.query(`SELECT cs.categoria,cs.uf,cs.municipio,cs.enquadramento_confirmado,s.cnpj
        FROM clientes_sindicatos cs JOIN sindicatos s ON s.id=cs.sindicato_id JOIN registros_sindicatos rs ON rs.sindicato_id=cs.sindicato_id
        WHERE cs.cliente_id=$1 AND rs.numero_registro=$2`,[clientId,doc.numero_registro]) as {rows:Link[]};
      const today=new Date().toISOString().slice(0,10);
      const inForce=validDate(meta.inicio)&&validDate(meta.fim)&&meta.inicio<=meta.fim&&meta.inicio<=today&&meta.fim>=today;
      const agreement=/acordo coletivo/i.test(String(doc.tipo??''));
      const confirmed=inForce&&(agreement?meta.cnpjs?.map(normalizarCnpj).includes(normalizarCnpj(customer.cnpj)):
        relevant.rows.some(link=>{
          const category=normalizarTexto(link.categoria),city=normalizarTexto(link.municipio||customer.municipio),state=link.uf||customer.uf;
          const ambiguous=/exclu|exceto|ressalv|salvo|excetu/i.test(`${meta.categoria} ${meta.abrangencia}`);
          return link.enquadramento_confirmado&&!!category&&!!city&&!!state&&!!link.cnpj&&!ambiguous&&
            normalizarCnpj(link.cnpj)&&meta.cnpjs?.map(normalizarCnpj).includes(normalizarCnpj(link.cnpj))&&
            normalizarTexto(meta.categoria)===category&&meta.abrangencia.split(/[,;]/).some(item=>item.trim().replace(/[.]$/,'')===`${city}/${state.toLowerCase()}`);
        }));
      const reason=confirmed?'CNPJ e escopo documental conferidos por regras determinísticas.':'Confira categoria, município/UF, vigência e partes do documento antes de liberar o envio.';
      const include=Boolean(previous.rows[0]?.incluir_envio)||new Date(doc.primeira_vez).getTime()>=new Date(customer.criado_em).getTime();
      await client.query(`INSERT INTO clientes_documentos(cliente_id,numero_registro,escritorio_id,status,motivo,contexto_hash,incluir_envio)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(cliente_id,numero_registro) DO UPDATE SET status=excluded.status,motivo=excluded.motivo,
        contexto_hash=excluded.contexto_hash,origem='regra',responsavel=NULL,justificativa=NULL,incluir_envio=excluded.incluir_envio,atualizado_em=now()`,
      [clientId,doc.numero_registro,officeId,confirmed?'confirmado':'candidato',reason,hash,include]);updated++;
    }
    return updated;
  });
}

export async function decidirDocumentoClientePostgres(pool:Pool,officeId:number,clientId:number,number:string,
  data:{status:'confirmado'|'rejeitado';responsavel:string;justificativa:string;versao:string},actorId:number){
  if(!data.responsavel.trim()||!data.justificativa.trim())throw new ErroCadastro('Informe responsável e justificativa da decisão.');
  await withPostgresOfficeTransaction(pool,officeId,async client=>{
    await client.query('SELECT id FROM clientes WHERE id=$1 AND escritorio_id=$2 FOR UPDATE',[clientId,officeId]);
    await atualizarDocumentosClientePostgresWithin(client,officeId,clientId);
    const view=await listDocs(client,officeId,clientId),row=view.find(item=>item.numero_registro===number) as Record<string,unknown>|undefined;
    if(!row)throw new ErroCadastro('Documento não relacionado ao cliente.',404);
    if(row.desatualizado||row.versao!==data.versao)throw new ErroCadastro('Documento, vínculos ou decisão alterados. Atualize a lista e confira novamente.',409);
    const original=data.status==='confirmado'?await validarOriginalWithin(client,officeId,clientId,number):null;
    const before=await client.query('SELECT * FROM clientes_documentos WHERE cliente_id=$1 AND numero_registro=$2',[clientId,number]);
    await client.query(`UPDATE clientes_documentos SET status=$1,origem='manual',responsavel=$2,justificativa=$3,incluir_envio=true,atualizado_em=now()
      WHERE cliente_id=$4 AND numero_registro=$5 AND escritorio_id=$6`,[data.status,data.responsavel.trim().slice(0,250),data.justificativa.trim().slice(0,2000),clientId,number,officeId]);
    await client.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json)
      VALUES($1,'documento_cliente',$2,$3,$4::jsonb)`,[officeId,`${clientId}:${number}`,data.status,
      JSON.stringify({antes:before.rows[0],responsavel:data.responsavel,justificativa:data.justificativa,hash_original:original?.hash??null,ator_id:actorId,origem:'servico_postgres'})]);
  });
}

async function validarOriginalWithin(client:PoolClient,officeId:number,clientId:number,number:string){
  const result=await client.query<{arquivo_path:string|null;arquivo_hash:string|null}&QueryResultRow>(`SELECT r.arquivo_path,r.arquivo_hash
    FROM clientes_documentos d JOIN registros r ON r.numero_registro=d.numero_registro
    WHERE d.escritorio_id=$1 AND d.cliente_id=$2 AND d.numero_registro=$3`,[officeId,clientId,number]);
  const row=result.rows[0];if(!row)throw new ErroCadastro('Documento não relacionado ao cliente.',404);
  if(!row.arquivo_path)throw new ErroCadastro('Original não localizado. Baixe o documento antes de confirmar a aplicabilidade.',409);
  const bytes=readFileSync(arquivoPermitido(row.arquivo_path));
  if(!row.arquivo_hash||hashBytes(bytes)!==row.arquivo_hash)throw new ErroCadastro('Original sem integridade confirmada. Atualize o documento antes de confirmar.',409);
  return {hash:row.arquivo_hash};
}

async function atualizarDocumentosClientePostgresWithin(client:PoolClient,officeId:number,clientId:number){
  // Reuse the public transaction implementation against the checked-out client without nesting BEGIN.
  const exists=await client.query('SELECT cnpj,uf,municipio,ativo,criado_em FROM clientes WHERE id=$1 AND escritorio_id=$2',[clientId,officeId]);
  if(!exists.rows[0])throw new ErroCadastro('Cliente não encontrado.',404);
  const previous=await client.query('SELECT numero_registro,contexto_hash FROM clientes_documentos WHERE cliente_id=$1 AND escritorio_id=$2',[clientId,officeId]);
  for(const row of previous.rows){
    const current=await contextHash(client,clientId,String(row.numero_registro));
    if(current!==row.contexto_hash)await client.query(`UPDATE clientes_documentos SET status='candidato',motivo='Documento ou vínculos alterados. Confira novamente a aplicabilidade.',
      contexto_hash=$1,origem='regra',responsavel=NULL,justificativa=NULL,atualizado_em=now() WHERE cliente_id=$2 AND numero_registro=$3`,[current,clientId,row.numero_registro]);
  }
  const candidates=await client.query(`SELECT r.numero_registro FROM registros r WHERE r.documento_meta_json IS NOT NULL AND
    (EXISTS(SELECT 1 FROM clientes_sindicatos cs JOIN registros_sindicatos rs ON rs.sindicato_id=cs.sindicato_id WHERE cs.cliente_id=$1 AND rs.numero_registro=r.numero_registro)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.documento_meta_json->'cnpjs')='array' THEN r.documento_meta_json->'cnpjs' ELSE '[]'::jsonb END) n(cnpj)
       WHERE n.cnpj=$2))`,[clientId,exists.rows[0].cnpj]);
  for(const doc of candidates.rows){
    const hash=await contextHash(client,clientId,String(doc.numero_registro));
    const current=await client.query('SELECT contexto_hash FROM clientes_documentos WHERE cliente_id=$1 AND numero_registro=$2 FOR UPDATE',[clientId,doc.numero_registro]);
    if(current.rows[0]?.contexto_hash===hash)continue;
    await client.query(`INSERT INTO clientes_documentos(cliente_id,numero_registro,escritorio_id,status,motivo,contexto_hash)
      VALUES($1,$2,$3,'candidato','Documento relacionado; confirme a aplicabilidade.', $4)
      ON CONFLICT(cliente_id,numero_registro) DO UPDATE SET status='candidato',motivo='Documento ou vínculos alterados. Confira novamente a aplicabilidade.',
        contexto_hash=excluded.contexto_hash,origem='regra',responsavel=NULL,justificativa=NULL,atualizado_em=now()`,[clientId,doc.numero_registro,officeId,hash]);
  }
}


