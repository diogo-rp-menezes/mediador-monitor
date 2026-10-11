import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Db } from './db.js';
import { contextoDocumentoCliente, ErroCadastro, exigirCadastroEscritorio } from './cadastros.js';
import { arquivoPermitido, hashBytes } from './relatorios.js';

interface Documento {
  cliente_id:number;numero_registro:string;status:string;motivo:string;contexto_hash:string;origem:string;
  responsavel:string|null;justificativa:string|null;atualizado_em:string;incluir_envio:number;
  tipo:string;vigencia:string;arquivo_disponivel:number;
}
export function listarDocumentosContexto(db:Db,escritorioId:number,clienteId:number) {
  exigirCadastroEscritorio(db,'clientes',clienteId,escritorioId);
  const rows=db.prepare(`SELECT d.cliente_id,d.numero_registro,d.status,d.motivo,d.contexto_hash,d.origem,
    d.responsavel,d.justificativa,d.atualizado_em,d.incluir_envio,r.tipo,r.vigencia,r.arquivo_path IS NOT NULL arquivo_disponivel
    FROM clientes_documentos d JOIN registros r ON r.numero_registro=d.numero_registro
    WHERE d.cliente_id=? ORDER BY r.primeira_vez DESC,d.numero_registro`).all(clienteId) as Documento[];
  return rows.map(row=>{
    const atual=contextoDocumentoCliente(db,clienteId,row.numero_registro),desatualizado=atual!==row.contexto_hash;
    const versao=createHash('sha256').update(JSON.stringify({row,atual})).digest('hex');
    return {...row,incluir_envio:undefined,arquivo_disponivel:!!row.arquivo_disponivel,desatualizado,versao,
      status:desatualizado?'candidato':row.status,origem:desatualizado?'regra':row.origem,
      motivo:desatualizado?'Documento ou vínculos alterados. Atualize e confira a aplicabilidade.':row.motivo,
      responsavel:desatualizado?null:row.responsavel,justificativa:desatualizado?null:row.justificativa};
  });
}
export function obterDocumentoContexto(db:Db,escritorioId:number,clienteId:number,numero:string) {
  const row=listarDocumentosContexto(db,escritorioId,clienteId).find(d=>d.numero_registro===numero);
  if(!row)throw new ErroCadastro('Documento não relacionado ao cliente.',404);
  return row;
}
export function originalDocumentoContexto(db:Db,escritorioId:number,clienteId:number,numero:string) {
  obterDocumentoContexto(db,escritorioId,clienteId,numero);
  const row=db.prepare('SELECT arquivo_path,arquivo_hash FROM registros WHERE numero_registro=?').get(numero) as {arquivo_path:string|null;arquivo_hash:string|null};
  if(!row.arquivo_path)throw new ErroCadastro('Original não localizado.',404);
  const bytes=readFileSync(arquivoPermitido(row.arquivo_path));
  if(!row.arquivo_hash||hashBytes(bytes)!==row.arquivo_hash)throw new ErroCadastro('Original sem integridade confirmada. Atualize o documento.',409);
  const pdf=bytes.subarray(0,4).toString('latin1')==='%PDF';
  return {bytes,nome:numero.replace(/[^A-Z0-9_-]/gi,'_')+(pdf?'.pdf':'.doc'),tipo:pdf?'application/pdf':'application/msword',hash:row.arquivo_hash};
}
