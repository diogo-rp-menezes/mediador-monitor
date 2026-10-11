import {expect,it,vi} from 'vitest';
import {converterValorLegado,importarNucleoIsoladoPostgres} from '../src/postgres-import-core.js';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Pool} from 'pg';

it('converte booleanos, JSON e datas UTC sem alterar timestamps bigint',()=>{
  expect(converterValorLegado(1,'boolean')).toBe(true);
  expect(converterValorLegado(0,'boolean')).toBe(false);
  expect(converterValorLegado(1n,'boolean')).toBe(true);
  expect(converterValorLegado(2147483647n,'integer')).toBe(2147483647);
  expect(()=>converterValorLegado(2147483648n,'integer')).toThrow();
  expect(converterValorLegado(9223372036854775807n,'bigint')).toBe('9223372036854775807');
  expect(()=>converterValorLegado(2,'boolean')).toThrow();
  expect(converterValorLegado('{"chave":1}','jsonb')).toEqual({chave:1});
  expect(()=>converterValorLegado('inválido','jsonb')).toThrow();
  expect(converterValorLegado('2026-10-09 12:34:56','timestamp with time zone')).toEqual(new Date('2026-10-09T12:34:56Z'));
  expect(()=>converterValorLegado('inválido','timestamp with time zone')).toThrow();
  expect(converterValorLegado(123456789,'bigint')).toBe('123456789');
  expect(converterValorLegado(null,'boolean')).toBeNull();
});
it('recusa o banco operacional antes de qualquer mutação e desfaz a transação',async()=>{
  const root=mkdtempSync(join(tmpdir(),'import-core-'));
  try{
    const source=join(root,'source.db'),db=new Database(source);db.exec('CREATE TABLE escritorios(id INTEGER)');db.close();
    const query=vi.fn(async(sql:string)=>({rows:sql==='SELECT current_database() nome'?[{nome:'mediador'}]:[],rowCount:0}));
    const client={query,release:vi.fn()},pool={connect:vi.fn(async()=>client)} as unknown as Pool;
    await expect(importarNucleoIsoladoPostgres(pool,source)).rejects.toThrow('banco isolado');
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query.mock.calls.some(([sql])=>/INSERT|DELETE|UPDATE/.test(sql))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  }finally{rmSync(root,{recursive:true,force:true});}
});
