import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import type {ArquivoCapturado} from './scraper.js';
import {arquivoPermitido,hashBytes} from './relatorio-core.js';
import {detectarFormato,lerDocumento,extrairCabecalho} from './documento.js';
import {ErroCadastro} from './cadastros.js';

export function conferirBytesOriginalColetado(file:{path:string;hash:string;bytes:number}){
  const bytes=readFileSync(arquivoPermitido(file.path));
  if(bytes.length!==file.bytes||hashBytes(bytes)!==file.hash)throw new ErroCadastro('Original coletado alterado ou sem integridade.',409);
}

/** Validate the actual original rather than trusting the scraper descriptor. No file is moved/deleted here. */
export async function validarOriginalColetado(numero:string,file:ArquivoCapturado,signal:AbortSignal){
  signal.throwIfAborted();
  if(!/^[a-f0-9]{64}$/.test(file.hash)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>50*1024*1024)
    throw new ErroCadastro('Descritor do original inválido.',409);
  const path=arquivoPermitido(file.path),bytes=readFileSync(path);
  if(bytes.length!==file.bytes||hashBytes(bytes)!==file.hash||detectarFormato(bytes)==='desconhecido')
    throw new ErroCadastro('Original coletado inválido ou sem integridade.',409);
  const header=extrairCabecalho(await lerDocumento(path));
  signal.throwIfAborted();
  if(header.numeroRegistro!==numero)throw new ErroCadastro('Número do registro não confirmado no original.',409);
  const validated={path,hash:file.hash,bytes:file.bytes,original:basename(file.original).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,200)};
  conferirBytesOriginalColetado(validated);
  return validated;
}


