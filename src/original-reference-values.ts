import {basename,resolve} from 'node:path';
/** Conservative reference matching; snapshots are consumed internally, never included in reports. */
export function adicionarReferenciasOriginais(references:Set<string>,value:unknown){
  if(typeof value==='string'){
    references.add(resolve(value).toLowerCase());references.add('nome:'+basename(value).toLowerCase());
  }else if(Array.isArray(value))value.forEach(item=>adicionarReferenciasOriginais(references,item));
  else if(value&&typeof value==='object')Object.values(value).forEach(item=>adicionarReferenciasOriginais(references,item));
}
