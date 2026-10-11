import { z } from 'zod';
import { ErroCadastro } from './cadastros.js';

/** Empty preferences preserve the legacy default of receiving every instrument type. */
export function validarTipoDestinatario(tiposJson:unknown,tipo:string):void {
  let raw:unknown=tiposJson;
  if(typeof raw==='string'){
    try{raw=JSON.parse(raw);}catch{throw new ErroCadastro('Preferências do contato inválidas.',409);}
  }
  const parsed=z.array(z.string()).safeParse(raw);
  if(!parsed.success)throw new ErroCadastro('Preferências do contato inválidas.',409);
  const tipos=parsed.data;
  if(tipos.length&&!tipos.includes('Todos os tipos')&&!tipos.includes(tipo))
    throw new ErroCadastro('O contato não recebe este tipo de instrumento.',409);
}
