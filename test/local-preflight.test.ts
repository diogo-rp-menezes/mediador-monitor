import {it,expect} from 'vitest';
import {configuracaoLocal} from '../src/local-preflight.js';
it.each(['https://example.com','http://localhost/path','http://user:secret@localhost','http://localhost/?x=1'])('recusa origem fora do contrato local: %s',origin=>{
  expect(()=>configuracaoLocal({AUTH_PUBLIC_URL:origin})).toThrow();
});
it('valida porta e informa somente presença da chave',()=>{
  expect(()=>configuracaoLocal({UI_PORT:'0'})).toThrow();
  const result=configuracaoLocal({UI_PORT:'3001',CREDENTIALS_MASTER_KEY:Buffer.alloc(32,1).toString('base64')});
  expect(result).toEqual({port:3001,origin:'http://localhost:3001',keyConfigured:true});
});
