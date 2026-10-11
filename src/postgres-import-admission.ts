import {createHash} from 'node:crypto';

export type EstadoEsperadoImportacao={origem_hash:string;destino_hash:string};
export function conferirEstadoEsperadoImportacao(expected:EstadoEsperadoImportacao,source:string,destination?:string){
  if(!expected||!/^([a-f0-9]{64})$/.test(expected.origem_hash)||!/^([a-f0-9]{64})$/.test(expected.destino_hash))
    throw new Error('Estado esperado de importação inválido.');
  if(expected.origem_hash!==source)throw new Error('Origem diverge do estado revisado.');
  if(destination!==undefined&&expected.destino_hash!==destination)throw new Error('Destino diverge do estado revisado.');
}
/** Bind retries to the same reviewed before-state, while checking the receipt's after-state separately. */
export function vincularOpcoesEstadoImportacao(optionsHash:string,expected?:EstadoEsperadoImportacao){
  if(!expected)return optionsHash;
  conferirEstadoEsperadoImportacao(expected,expected.origem_hash);
  return createHash('sha256').update(JSON.stringify({opcoes:optionsHash,origem:expected.origem_hash,destino:expected.destino_hash})).digest('hex');
}

