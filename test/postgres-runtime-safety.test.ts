import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {validarPapelRuntimePostgres} from '../src/postgres-runtime-safety.js';

const role={nome:'runtime',super:false,bypass:false,herda:false,membro:false};
const pool=(rows:unknown[])=>({query:vi.fn().mockResolvedValue({rows})}) as unknown as Pool;
it('aceita somente papel runtime independente e sem privilégios',async()=>{
  await expect(validarPapelRuntimePostgres(pool([role]))).resolves.toEqual({nome:'runtime',validado:true});
  for(const key of ['super','bypass','herda','membro'])
    await expect(validarPapelRuntimePostgres(pool([{...role,[key]:true}]))).rejects.toThrow('Runtime exige');
  await expect(validarPapelRuntimePostgres(pool([]))).rejects.toThrow('Runtime exige');
});
