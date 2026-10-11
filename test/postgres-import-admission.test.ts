import {it,expect} from 'vitest';
import {conferirEstadoEsperadoImportacao,vincularOpcoesEstadoImportacao} from '../src/postgres-import-admission.js';
const source='a'.repeat(64),destination='b'.repeat(64),state={origem_hash:source,destino_hash:destination};
it('rejeita alterações de origem ou destino após revisão e hashes inválidos',()=>{
  expect(()=>conferirEstadoEsperadoImportacao(state,source,destination)).not.toThrow();
  expect(()=>conferirEstadoEsperadoImportacao(state,'c'.repeat(64),destination)).toThrow('Origem diverge');
  expect(()=>conferirEstadoEsperadoImportacao(state,source,'c'.repeat(64))).toThrow('Destino diverge');
  expect(()=>conferirEstadoEsperadoImportacao({...state,destino_hash:''},source)).toThrow('inválido');
});
it('vincula a retomada ao mesmo estado anterior sem exigir o hash anterior após importação',()=>{
  expect(()=>conferirEstadoEsperadoImportacao(state,source)).not.toThrow();
  const hash=vincularOpcoesEstadoImportacao(source,state);
  expect(vincularOpcoesEstadoImportacao(source,{...state})).toBe(hash);
  expect(vincularOpcoesEstadoImportacao(source,{...state,destino_hash:'c'.repeat(64)})).not.toBe(hash);
  expect(vincularOpcoesEstadoImportacao(source)).toBe(source);
  expect(hash).not.toBe(source);
});
