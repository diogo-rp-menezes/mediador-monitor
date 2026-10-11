import {EventEmitter} from 'node:events';
import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {comExclusividadeMonitoramentoPostgres} from '../src/postgres-monitoring-lock.js';
function fixture(acquired=true){
  const client=Object.assign(new EventEmitter(),{query:vi.fn(async(sql:string)=>({rows:[sql.includes('try_advisory')?{adquirido:acquired}:{liberado:true}]})),release:vi.fn()});
  const pool={options:{max:2},connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  return {client,pool};
}
it('recusa bloqueio ocupado sem executar trabalho',async()=>{
  const {client,pool}=fixture(false),work=vi.fn();
  expect(await comExclusividadeMonitoramentoPostgres(pool,3,work)).toEqual({adquirido:false});
  expect(work).not.toHaveBeenCalled();expect(client.query).toHaveBeenCalledOnce();expect(client.release).toHaveBeenCalledOnce();
});
it('aguarda o trabalho encerrar após cancelamento antes de liberar o bloqueio',async()=>{
  const {client,pool}=fixture(),stop=new AbortController();let started!:()=>void,release!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;}),pending=new Promise<void>(resolve=>{release=resolve;});
  const running=comExclusividadeMonitoramentoPostgres(pool,3,async signal=>{started();await pending;expect(signal.aborted).toBe(true);return 7;},stop.signal);
  await ready;stop.abort();expect(client.release).not.toHaveBeenCalled();expect(client.query).toHaveBeenCalledTimes(2);
  release();expect(await running).toEqual({adquirido:true,result:7});expect(client.query).toHaveBeenCalledTimes(4);expect(client.release).toHaveBeenCalledWith(undefined);
});
it('perda da conexão interrompe trabalho e descarta conexão sem devolver bloqueio ao pool',async()=>{
  const {client,pool}=fixture();
  await expect(comExclusividadeMonitoramentoPostgres(pool,3,async signal=>{client.emit('error',new Error('Perdida'));expect(signal.aborted).toBe(true);})).rejects.toThrow('exclusividade perdida');
  expect(client.query).toHaveBeenCalledTimes(2);expect(client.release).toHaveBeenCalledWith(expect.any(Error));
});
it('recusa pool sem capacidade para manter bloqueio e executar transações',async()=>{
  const {pool}=fixture();pool.options.max=1;
  await expect(comExclusividadeMonitoramentoPostgres(pool,3,vi.fn())).rejects.toThrow('pelo menos 2');
});
it('libera participação no backup quando o escritório já está ocupado',async()=>{
  const {pool,client}=fixture();client.query.mockImplementationOnce(async()=>({rows:[{adquirido:true}]})).mockImplementationOnce(async()=>({rows:[{adquirido:false}]}));
  const work=vi.fn();expect(await comExclusividadeMonitoramentoPostgres(pool,3,work)).toEqual({adquirido:false});expect(work).not.toHaveBeenCalled();
  expect(client.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock_shared($1,$2) AS liberado',expect.any(Array));expect(client.release).toHaveBeenCalledWith(undefined);
});
