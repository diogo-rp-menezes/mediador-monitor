import {readFileSync} from 'node:fs';
import {conferirAssinaturaManifestoMigracao} from './postgres-migration-manifest.js';

export type EscopoOperacionalImportacao={manifesto:string;key:Buffer};
/** Sub-converters retain their default namespace guard and require a signed scope outside it. */
export function conferirEscopoConversorImportacao(database:string,scope?:EscopoOperacionalImportacao){
  if(!scope){
    if(!/^mediador_import_test_[a-f0-9]{32}$/.test(database))throw new Error('Conversor exige banco isolado ou pacote operacional assinado.');
    return;
  }
  const manifest=JSON.parse(readFileSync(scope.manifesto,'utf8'));
  conferirAssinaturaManifestoMigracao(manifest,scope.key);
  if(manifest.formato!=='ensaio-migracao-v1'||manifest.estado!=='validado'||manifest.destino?.database!==database||manifest.ensaio?.estado_revisado_validado!==true)
    throw new Error('Escopo operacional do conversor inválido.');
}

