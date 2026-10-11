import {EventEmitter} from 'node:events';
import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {comEscritorArquivosPostgres} from '../src/postgres-backup-gate.js';
function fixture(acquired=true){const client=Object.assign(new EventEmitter(),{query:vi.fn(async(sql:string)=>({rows:[sql.includes('try_advisory')?{adquirido:acquired}:{liberado:true}]})),release:vi.fn()});return {client,pool:{options:{max:2},connect:async()=>client} as unknown as Pool};}
it('recusa pausa ativa sem iniciar geração nem reservar trabalho',async()=>{const {client,pool}=fixture(false),work=vi.fn();await expect(comEscritorArquivosPostgres(pool,work)).rejects.toMatchObject({status:409});expect(work).not.toHaveBeenCalled();expect(client.query).toHaveBeenCalledOnce();});
it('mantém participação até salvar todo o trabalho e libera também após falha',async()=>{const {client,pool}=fixture();await expect(comEscritorArquivosPostgres(pool,async()=>{expect(client.query).toHaveBeenCalledOnce();expect(client.release).not.toHaveBeenCalled();throw new Error('Gravação falhou');})).rejects.toThrow('Gravação falhou');expect(client.query).toHaveBeenCalledTimes(2);expect(client.release).toHaveBeenCalledWith(undefined);});
it('perda da conexão cancela sinal e descarta conexão somente após callback encerrar',async()=>{const {client,pool}=fixture();await expect(comEscritorArquivosPostgres(pool,async signal=>{client.emit('error',new Error('Perdida'));expect(signal.aborted).toBe(true);expect(client.release).not.toHaveBeenCalled();})).rejects.toThrow();expect(client.query).toHaveBeenCalledOnce();expect(client.release).toHaveBeenCalledWith(expect.any(Error));});
it('liberação incerta impede sucesso e destrói conexão',async()=>{const {client,pool}=fixture();client.query.mockImplementationOnce(async()=>({rows:[{adquirido:true}]})).mockImplementationOnce(async()=>({rows:[{liberado:false}]}));await expect(comEscritorArquivosPostgres(pool,async()=>7)).rejects.toThrow('liberar');expect(client.release).toHaveBeenCalledWith(expect.any(Error));});
it('HTTP e preparação aninhada reutilizam participação sem consumir outra conexão',async()=>{const {client,pool}=fixture();expect(await comEscritorArquivosPostgres(pool,async outer=>comEscritorArquivosPostgres(pool,async inner=>{expect(inner).toBe(outer);expect(client.query).toHaveBeenCalledOnce();return 7;}))).toBe(7);expect(client.query).toHaveBeenCalledTimes(2);expect(client.release).toHaveBeenCalledOnce();});
it('erro ao adquirir participação descarta conexão potencialmente incerta',async()=>{const {client,pool}=fixture();client.query.mockRejectedValueOnce(new Error('Conexão interrompida'));const work=vi.fn();await expect(comEscritorArquivosPostgres(pool,work)).rejects.toThrow('interrompida');expect(work).not.toHaveBeenCalled();expect(client.release).toHaveBeenCalledWith(expect.any(Error));});

it('concorrência reserva conexão para o trabalho e não esgota pool com participações',async()=>{
  const {pool}=fixture();let active=0,maximum=0;
  await Promise.all(Array.from({length:8},()=>comEscritorArquivosPostgres(pool,async()=>{
    active++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,2));active--;
  })));
  expect(maximum).toBe(1);
});

it('falha de conexão libera vaga para a próxima participação',async()=>{
  const {pool}=fixture();const connect=vi.spyOn(pool,'connect');connect.mockRejectedValueOnce(new Error('Indisponível') as never);
  await expect(comEscritorArquivosPostgres(pool,async()=>1)).rejects.toThrow('Indisponível');
  await expect(comEscritorArquivosPostgres(pool,async()=>2)).resolves.toBe(2);
});
