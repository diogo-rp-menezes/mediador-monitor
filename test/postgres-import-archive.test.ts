import {expect,it,vi} from 'vitest';
import {codificarLinhaLegada,decodificarLinhaLegada,preservarLegadoIsolado} from '../src/postgres-import-archive.js';
import type {PoolClient} from 'pg';
import type Database from 'better-sqlite3';

it('preserva tipos SQLite e inteiros de 64 bits sem perdas ou ambiguidade de objetos',()=>{
  const row={inteiro:9223372036854775807n,negativo:-9223372036854775808n,real:1.25,zero:-0,texto:'{"tipo":"blob","valor":"AA=="}',vazio:'',nulo:null,binario:Buffer.from([0,255,128])};
  const encoded=codificarLinhaLegada(row);
  expect(encoded.inteiro).toEqual({tipo:'inteiro',valor:'9223372036854775807'});
  expect(decodificarLinhaLegada(JSON.parse(JSON.stringify(encoded)))).toEqual(row);
  expect(()=>codificarLinhaLegada({valor:Infinity})).toThrow();
  expect(()=>codificarLinhaLegada({valor:{invalido:true}})).toThrow();
});
it('arquivo privado também recusa banco operacional antes de criar schema',async()=>{
  const query=vi.fn(async()=>({rows:[{nome:'mediador'}]}));
  await expect(preservarLegadoIsolado({} as Database.Database,{query} as unknown as PoolClient,['sessoes_usuarios'])).rejects.toThrow('banco isolado');
  expect(query).toHaveBeenCalledOnce();
});
