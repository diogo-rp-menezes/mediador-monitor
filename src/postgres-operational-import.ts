import type {Pool} from 'pg';
import {conferirArquivosPacoteMigracao} from './postgres-migration-package.js';
import {importarNucleoIsoladoPostgres} from './postgres-import-core.js';

/** Imports data; explicit CLI option persists source cutover locks. Never switches HTTP or starts queues. */
export async function importarPacoteOperacionalPostgres(pool:Pool,manifestPath:string,key:Buffer,options:{bloquearOrigemParaCorte?:boolean}={}){
  const {manifest}=conferirArquivosPacoteMigracao(manifestPath,key);
  return importarNucleoIsoladoPostgres(pool,manifest.origem.snapshot,{
    credentialsKey:key,conciliarDestino:true,manifestoOperacional:manifestPath,bloquearOrigemParaCorte:options.bloquearOrigemParaCorte
  });
}

