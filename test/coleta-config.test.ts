import {it,expect} from 'vitest';
import {configuracaoColeta} from '../src/coleta-config.js';
const values={headless:true,canal:'',timeout_ms:45000,formulario_timeout_ms:15000,max_paginas:10};
it('expõe somente opções operacionais válidas e recusa limites inválidos',()=>{
  expect(configuracaoColeta(values)).toEqual(values);
  for(const value of [{...values,timeout_ms:NaN},{...values,max_paginas:0},{...values,formulario_timeout_ms:-1},{...values,canal:'chrome\nsecret'},{...values,api_key:'secret'}])expect(()=>configuracaoColeta(value)).toThrow();
});
