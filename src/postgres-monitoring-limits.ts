/** Shared default with optional office override; counters live in PostgreSQL, not process memory. */
import {ErroCadastro} from './cadastros.js';
export class ErroLimiteVolumeMonitoramento extends ErroCadastro{
  constructor(){super('Limite de volume de originais por execução excedido.',409);}
}
export function limiteVolumeMonitoramentoBytes(office:number,environment:NodeJS.ProcessEnv=process.env){
  const value=environment[`PGMONITOR_MAX_MIB_OFFICE_${office}`]??environment.PGMONITOR_MAX_MIB??'200';
  if(!/^[1-9]\d*$/.test(value)||Number(value)>1024)throw new Error('Volume de monitoramento deve ser inteiro entre 1 e 1024 MiB.');
  return Number(value)*1024*1024;
}
/** Counts original bytes per completed query, including reused files; rejects malformed evidence. */
export function conferirVolumeMonitoramento(collections:Record<string,{originais?:{bytes:number}[]}>,incoming:{bytes:number}[],limit:number){
  if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Limite de volume inválido.');
  let total=0;
  for(const list of [...Object.values(collections).map(value=>value.originais??[]),incoming]){
    if(!Array.isArray(list))throw new Error('Evidência de volume inválida.');
    for(const file of list){
      if(!Number.isSafeInteger(file.bytes)||file.bytes<1)throw new Error('Evidência de volume inválida.');
      total+=file.bytes;
      if(!Number.isSafeInteger(total)||total>limit)throw new ErroLimiteVolumeMonitoramento();
    }
  }
  return total;
}
export function limiteHoraMonitoramento(office:number,environment:NodeJS.ProcessEnv=process.env){
  const value=environment[`PGMONITOR_LIMIT_HOUR_OFFICE_${office}`]??environment.PGMONITOR_LIMIT_HOUR??'20';
  if(!/^[1-9]\d*$/.test(value)||Number(value)>1000)throw new Error('Limite de monitoramento por hora deve ser inteiro entre 1 e 1000.');
  return Number(value);
}

export function limiteDuracaoMonitoramentoMs(office:number,environment:NodeJS.ProcessEnv=process.env){
  const value=environment[`PGMONITOR_MAX_SECONDS_OFFICE_${office}`]??environment.PGMONITOR_MAX_SECONDS??'900';
  if(!/^[1-9]\d*$/.test(value)||Number(value)<10||Number(value)>3600)throw new Error('Duração de monitoramento deve ser inteira entre 10 e 3600 segundos.');
  return Number(value)*1000;
}

