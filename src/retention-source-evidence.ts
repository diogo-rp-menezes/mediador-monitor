import {realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';

export const evidenceSchema=z.object({formato:z.literal('fontes-retencao-v1'),identidades:z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(10000),postgres:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
export type EvidenciaFontesRetencao=z.infer<typeof evidenceSchema>;
export async function evidenciarFontesRetencao(sources:{tipo:string;path:string}[]):Promise<EvidenciaFontesRetencao>{
  const identities=new Set<string>();
  for(const source of sources){
    const path=await realpath(source.path),canonical=process.platform==='win32'?path.toLowerCase():path;
    identities.add(createHash('sha256').update(JSON.stringify([source.tipo,canonical])).digest('hex'));
  }
  return {formato:'fontes-retencao-v1',identidades:[...identities].sort()};
}
export function conferirFontesPreservadas(previous:EvidenciaFontesRetencao,current:EvidenciaFontesRetencao|undefined){
  evidenceSchema.parse(previous);
  if(!current)throw new Error('Evidência atual de fontes ausente.');
  evidenceSchema.parse(current);const ids=new Set(current.identidades);
  if(previous.postgres&&previous.postgres!==current.postgres)throw new Error('Banco PostgreSQL anterior omitido ou substituído.');
  if(previous.identidades.some(id=>!ids.has(id)))throw new Error('Fonte de proteção anterior omitida ou substituída.');
}
