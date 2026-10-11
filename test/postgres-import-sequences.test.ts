import {it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {sincronizarSequenciaImportacao} from '../src/postgres-import-sequences.js';

it('preserva reservas de sequência acima dos registros, incluindo a próxima chamada ainda não consumida',async()=>{
  for(const called of [true,false]){
    const query=vi.fn().mockResolvedValueOnce({rows:[{nome:'usuarios_id_seq'}]})
      .mockResolvedValueOnce({rows:[{valor:'9000',is_called:called}]}).mockResolvedValueOnce({rows:[{valor:'3'}]}).mockResolvedValueOnce({rows:[]});
    await sincronizarSequenciaImportacao({query} as unknown as PoolClient,'usuarios','id');
    expect(query).toHaveBeenLastCalledWith('SELECT setval($1::regclass,$2::bigint,false)',['public."usuarios_id_seq"',called?'9001':'9000']);
  }
});
it('avança acima do maior ID usando inteiros de 64 bits sem arredondamento',async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{nome:'auditoria_seguranca_id_seq'}]})
    .mockResolvedValueOnce({rows:[{valor:'1',is_called:false}]}).mockResolvedValueOnce({rows:[{valor:'9007199254740993'}]}).mockResolvedValueOnce({rows:[]});
  await sincronizarSequenciaImportacao({query} as unknown as PoolClient,'auditoria_seguranca','id');
  expect(query).toHaveBeenLastCalledWith('SELECT setval($1::regclass,$2::bigint,false)',['public."auditoria_seguranca_id_seq"','9007199254740994']);
});
