import {lstat,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {inventariarOriginais} from './postgres-original-inventory.js';
import {evidenceSchema,conferirFontesPreservadas,type EvidenciaFontesRetencao} from './retention-source-evidence.js';

const candidate=z.object({nome:z.string().regex(/^[A-Z]{2}\d{6}_\d{4}-[a-f0-9]{12}\.(pdf|doc)$/),path:z.string().min(1),bytes:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/),modificado_em:z.string().datetime()}).strict();
const schema=z.object({formato:z.literal('inventario-originais-v1'),somente_leitura:z.literal(true),autoriza_exclusao:z.literal(false),pasta:z.string().min(1),criado_em:z.string().datetime(),min_age_days:z.number().int().min(1).max(3650),ignorados:z.number().int().nonnegative(),candidatos:z.array(candidate).max(100000),fontes:z.unknown().optional(),cobertura_backups:z.unknown().optional(),evidencia_fontes:evidenceSchema.optional()}).strict();

/** A previous report is evidence to compare, never authority for a file operation. */
export async function revalidarInventarioOriginais(report:string,root:string,references:Set<string>,options:{now?:number;evidenciaFontes?:EvidenciaFontesRetencao;minAgeDays?:number}={}){
  const stat=await lstat(report);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024)throw new Error('Inventário anterior inválido.');
  const previous=schema.parse(JSON.parse(await readFile(report,'utf8')));
  if(options.minAgeDays!==undefined&&options.minAgeDays!==previous.min_age_days)throw new Error('Revalidação deve preservar a idade mínima anterior.');
  if(previous.evidencia_fontes)conferirFontesPreservadas(previous.evidencia_fontes,options.evidenciaFontes);
  const current=await inventariarOriginais(root,references,{minAgeDays:previous.min_age_days,now:options.now});
  if(resolve(previous.pasta)!==current.pasta)throw new Error('Pasta do inventário divergente.');
  const used=new Set<string>();
  for(const item of previous.candidatos){
    if(resolve(item.path)!==join(current.pasta,item.nome)||used.has(item.nome))throw new Error('Candidato fora da pasta ou duplicado.');
    used.add(item.nome);
  }
  const currentByName=new Map(current.candidatos.map(item=>[item.nome,item]));
  const maintained=[],invalidated=[];
  for(const item of previous.candidatos){
    const fresh=currentByName.get(item.nome);
    if(fresh&&fresh.sha256===item.sha256&&fresh.bytes===item.bytes&&fresh.modificado_em===item.modificado_em)maintained.push(fresh);
    else invalidated.push({nome:item.nome,motivo:'Ausente, alterado ou inelegível pelas referências e critérios atuais.'});
  }
  return {formato:'revalidacao-inventario-originais-v1',somente_leitura:true,autoriza_exclusao:false,
    fontes_anteriores_conferidas:!!previous.evidencia_fontes,
    pasta:current.pasta,criado_em:current.criado_em,inventario_anterior_em:previous.criado_em,
    min_age_days:current.min_age_days,candidatos_anteriores:previous.candidatos.length,
    mantidos:maintained,invalidados:invalidated,novos_candidatos:current.candidatos.filter(item=>!used.has(item.nome))};
}
