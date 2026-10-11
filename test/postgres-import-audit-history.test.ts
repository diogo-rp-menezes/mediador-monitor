import {expect,it} from 'vitest';
import {resolverEscritorioAuditoria} from '../src/postgres-import-audit-history.js';
const lookup=(table:'clientes'|'contatos',id:number)=>id===10?2:undefined;

it.each([
  ['cliente','10',{},2],['contato','10',{},2],['documento_cliente','10:DF000001/2026',{},2],
  ['usuario_cliente','5:10',{},2],['usuario_escritorio','5:2',{},2],['escritorio','2',{},2],
  ['cliente','99',{antes:{escritorio_id:3}},3],
] as const)('associa evento %s por evidência específica',(entity,id,details,expected)=>{
  expect(resolverEscritorioAuditoria(entity,id,details,lookup)).toBe(expected);
});
it.each([
  ['usuario','10',{escritorio_id:2}],['migracao','inicial',{escritorio_id:2}],['desconhecido','10',{escritorio_id:2}],
  ['cliente','99',{}],['cliente','10',{antes:{escritorio_id:3}}],
  ['usuario_escritorio','5:2',{escritorio_id:3}],['contato','99',{antes:{escritorio_id:2},depois:{escritorio_id:3}}],
] as const)('não atribui evento global ou contraditório %s',(entity,id,details)=>{
  expect(resolverEscritorioAuditoria(entity,id,details,lookup)).toBeUndefined();
});
