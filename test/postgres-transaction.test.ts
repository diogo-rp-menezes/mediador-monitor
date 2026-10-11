import { describe, expect, it, vi } from 'vitest';
import { withPostgresTransaction,withPostgresGlobalTransaction, withPostgresOfficeTransaction } from '../src/postgres-transaction.js';
import {EventEmitter} from 'node:events';

function fakePool(){
  const calls:string[]=[];const client={query:vi.fn(async(sql:string)=>{calls.push(sql);return{rows:[]};}),release:vi.fn()};
  return{pool:{connect:vi.fn(async()=>client)} as never,client,calls};
}

describe('PostgreSQL transaction scope',()=>{
  it.each(['error','end'])('rejects lost connection during callback (%s), waits for work and destroys client',async event=>{
    const client=Object.assign(new EventEmitter(),{query:vi.fn(async()=>({rows:[]})),release:vi.fn()});
    let finished=false;
    await expect(withPostgresTransaction({connect:async()=>client} as never,async()=>{
      client.emit(event,new Error('Conexão perdida'));
      await Promise.resolve();finished=true;expect(client.release).not.toHaveBeenCalled();return 'must not return';
    })).rejects.toThrow(/Conexão/);
    expect(finished).toBe(true);expect(client.query.mock.calls).toEqual([['BEGIN']]);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
    expect(client.listenerCount('error')).toBe(0);expect(client.listenerCount('end')).toBe(0);
  });
  it('destroys client after rollback fails while preserving original failure',async()=>{
    const client=Object.assign(new EventEmitter(),{query:vi.fn(async(sql:string)=>{if(sql==='ROLLBACK')throw new Error('rollback lost');return {rows:[]};}),release:vi.fn()});
    await expect(withPostgresTransaction({connect:async()=>client} as never,async()=>{throw new Error('original');})).rejects.toThrow('original');
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });
  it('sets office scope transaction-locally and commits on the same connection',async()=>{
    const f=fakePool();const result=await withPostgresOfficeTransaction(f.pool,42,async client=>{await client.query('SELECT 1');return 'ok';});
    expect(result).toBe('ok');expect(f.calls[0]).toBe('BEGIN');expect(f.calls[1]).toContain("set_config('app.global_access', 'false', true)");expect(f.calls[2]).toContain("set_config('app.escritorio_id', $1, true)");expect(f.calls[3]).toBe('SELECT 1');expect(f.calls[4]).toBe('COMMIT');expect(f.client.release).toHaveBeenCalledOnce();
  });
  it('rolls back failed scoped work, clearing the transaction-local setting',async()=>{
    const f=fakePool();await expect(withPostgresOfficeTransaction(f.pool,2,async()=>{throw new Error('fail');})).rejects.toThrow('fail');
    expect(f.calls).toEqual(['BEGIN',"SELECT set_config('app.global_access', 'false', true)","SELECT set_config('app.escritorio_id', $1, true)",'ROLLBACK']);
  });
  it('marks global authentication work only within one transaction',async()=>{
    const f=fakePool();await withPostgresGlobalTransaction(f.pool,async client=>{await client.query('SELECT 1');});
    expect(f.calls).toEqual(['BEGIN',"SELECT set_config('app.escritorio_id', '', true)","SELECT set_config('app.global_access', 'true', true)",'SELECT 1','COMMIT']);
  });
  it('rejects invalid scopes before borrowing a connection',async()=>{
    const f=fakePool();await expect(withPostgresOfficeTransaction(f.pool,0,async()=>undefined)).rejects.toThrow();expect(f.pool.connect).not.toHaveBeenCalled();
  });
});
