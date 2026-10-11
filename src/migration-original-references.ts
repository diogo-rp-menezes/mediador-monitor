import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {z} from 'zod';
import {conferirAssinaturaManifestoMigracao} from './postgres-migration-manifest.js';
import {adicionarReferenciasOriginais} from './original-reference-values.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const schema=z.object({
  formato:z.literal('ensaio-migracao-v1'),estado:z.literal('validado'),execucao_no_destino_atual:z.literal(false),
  origem:z.object({snapshot:z.string().min(1),arquivo_hash:hash}),
  destino:z.object({backup:z.string().min(1),backup_hash:hash}),
  originais:z.array(z.object({origem:z.string().min(1),copia:z.string().min(1),hash})),
});
/** Retention evidence only: archived bytes are checked, without requiring the live source to remain unchanged. */
export function referenciasOriginaisPacote(path:string,key:Buffer){
  const file=resolve(path),folder=dirname(file),raw=JSON.parse(readFileSync(file,'utf8'));
  const manifest=schema.parse(raw);
  conferirAssinaturaManifestoMigracao(raw,key);
  const check=(path:string,expectedPath:string,expectedHash:string)=>{
    if(resolve(path)!==expectedPath||createHash('sha256').update(readFileSync(path)).digest('hex')!==expectedHash)
      throw new Error('Arquivo do pacote divergente.');
  };
  check(manifest.origem.snapshot,join(folder,'origem.sqlite'),manifest.origem.arquivo_hash);
  check(manifest.destino.backup,join(folder,'destino-antes.dump'),manifest.destino.backup_hash);
  const references=new Set<string>();
  for(const original of manifest.originais){
    check(original.copia,join(folder,'originais',original.hash+'.bin'),original.hash);
    adicionarReferenciasOriginais(references,original.origem);
    references.add('hash:'+original.hash);
  }
  return references;
}
