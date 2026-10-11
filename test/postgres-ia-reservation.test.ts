import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {reservarAnalisePostgres,falharAnalisePostgres} from '../src/postgres-ia-reservation.js';
it('recusa identificadores, tokens e mensagens arbitrárias antes de conectar',async()=>{
  const connect=vi.fn(),pool={connect} as unknown as Pool;
  await expect(reservarAnalisePostgres(pool,'')).rejects.toThrow();
  await expect(falharAnalisePostgres(pool,0,'invalid','resposta_invalida')).rejects.toThrow();
  await expect(falharAnalisePostgres(pool,1,'2eac7c35-d18f-43e7-8cf9-4e05b176df81','erro com segredo' as never)).rejects.toThrow();
  expect(connect).not.toHaveBeenCalled();
});
it('IA ausente não cria tentativa e devolve conexão após transação global',async()=>{
  const query=vi.fn(async()=>({rows:[]})),release=vi.fn(),pool={connect:async()=>({query,release})} as unknown as Pool;
  expect(await reservarAnalisePostgres(pool,'DF000001/2026')).toBeNull();
  expect(query.mock.calls.map(call=>call[0])).not.toContain('INSERT INTO tentativas_analise');
  expect(query).toHaveBeenCalledWith("SELECT set_config('app.global_access', 'true', true)");
  expect(query).toHaveBeenCalledWith('COMMIT');expect(release).toHaveBeenCalledOnce();
});
