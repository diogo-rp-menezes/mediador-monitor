import {expect,it} from 'vitest';
import {validarTipoDestinatario} from '../src/preferencias-envio.js';

it.each([[],['Todos os tipos'],['CCT'],'["CCT"]'])('aceita preferências compatíveis %j',tipos=>{
  expect(()=>validarTipoDestinatario(tipos,'CCT')).not.toThrow();
});
it.each([['ACT'],{},null,'invalid','{}'])('nega preferências incompatíveis ou inválidas %j',tipos=>{
  expect(()=>validarTipoDestinatario(tipos,'CCT')).toThrow();
});
