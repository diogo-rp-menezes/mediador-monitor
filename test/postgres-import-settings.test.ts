import {expect,it} from 'vitest';
import {cifrarAjusteImportado,decifrarAjusteImportado,desativarAjusteLegado} from '../src/postgres-import-settings.js';

it.each(['agendamento','llm'])('desativa %s sem alterar a configuração original',name=>{
  const raw={ativo:true,apiKey:'segredo',cron:'* * * * *'};
  expect(desativarAjusteLegado(name,raw)).toEqual({...raw,ativo:false});expect(raw.ativo).toBe(true);
});
it('desativa ambos os canais e preserva seus valores para revisão',()=>{
  const raw={email:{ativo:true,password:'senha'},slack:{ativo:true,webhook:'webhook'}};
  expect(desativarAjusteLegado('notificacoes',raw)).toEqual({email:{ativo:false,password:'senha'},slack:{ativo:false,webhook:'webhook'}});
  expect(raw.email.ativo).toBe(true);
  expect(desativarAjusteLegado('navegador',{headless:true})).toEqual({headless:true});
  expect(()=>desativarAjusteLegado('desconhecido',{})).toThrow();
  expect(()=>desativarAjusteLegado('llm',null)).toThrow();
  expect(()=>desativarAjusteLegado('notificacoes',{email:'invalido'})).toThrow();
});
it('cifra todo o valor com nonce aleatório e autentica chave e nome do ajuste',()=>{
  const key=Buffer.alloc(32,3),value={ativo:false,apiKey:'segredo-que-nao-pode-vazar'};
  const first=cifrarAjusteImportado('llm',value,key),second=cifrarAjusteImportado('llm',value,key);
  expect(first.valor_cifrado).not.toBe(second.valor_cifrado);
  expect(JSON.stringify(first)).not.toContain(value.apiKey);
  expect(decifrarAjusteImportado('llm',first,key)).toEqual(value);
  expect(()=>decifrarAjusteImportado('notificacoes',first,key)).toThrow();
  expect(()=>decifrarAjusteImportado('llm',first,Buffer.alloc(32,4))).toThrow();
  const bytes=Buffer.from(first.valor_cifrado,'base64');bytes[bytes.length-1]^=1;
  expect(()=>decifrarAjusteImportado('llm',{...first,valor_cifrado:bytes.toString('base64')},key)).toThrow();
  expect(()=>cifrarAjusteImportado('llm',value,Buffer.alloc(16))).toThrow();
});
