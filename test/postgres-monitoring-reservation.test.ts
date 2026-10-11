import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {concluirMonitoramentoPostgres,reservarMonitoramentoPostgres} from '../src/postgres-monitoring-reservation.js';
function pool(query:ReturnType<typeof vi.fn>){return {connect:vi.fn(async()=>({query,release:vi.fn()}))} as unknown as Pool;}
it('rejeita token/formato inválido antes de abrir transação',async()=>{
  const query=vi.fn(),db=pool(query);
  await expect(concluirMonitoramentoPostgres(db,1,1,'invalido','concluida')).rejects.toMatchObject({status:400});
  expect(db.connect).not.toHaveBeenCalled();
});
it('não reserva em escritório indisponível e encerra transação',async()=>{
  const query=vi.fn().mockResolvedValue({rowCount:0,rows:[]});
  expect(await reservarMonitoramentoPostgres(pool(query),1)).toBeNull();
  expect(query).toHaveBeenCalledWith('COMMIT');
  expect(query.mock.calls.some(([sql])=>String(sql).includes('SKIP LOCKED'))).toBe(false);
});
it('faz rollback quando token não corresponde à execução ativa',async()=>{
  const query=vi.fn().mockResolvedValue({rowCount:0,rows:[]});
  await expect(concluirMonitoramentoPostgres(pool(query),1,1,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','concluida')).rejects.toMatchObject({status:409});
  expect(query).toHaveBeenCalledWith('ROLLBACK');expect(query).not.toHaveBeenCalledWith('COMMIT');
});
