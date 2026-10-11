import {it,expect} from 'vitest';
import {mkdtemp,writeFile,utimes,unlink,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {inventariarOriginais} from '../src/postgres-original-inventory.js';
import {revalidarInventarioOriginais} from '../src/original-inventory-revalidation.js';

it('reconsulta referências, detecta perda/alteração e separa novos candidatos sem alterar arquivos',async()=>{
  const root=await mkdtemp(join(tmpdir(),'inventory-revalidate-')),now=Date.now();
  const create=async(i:number)=>{const text=`original${i}`,hash=createHash('sha256').update(text).digest('hex'),path=join(root,`DF00000${i}_2026-${hash.slice(0,12)}.pdf`);await writeFile(path,text);await utimes(path,new Date(0),new Date(0));return path;};
  try{
    const kept=await create(1),protectedFile=await create(2),missing=await create(3),changed=await create(4);
    const prior=await inventariarOriginais(root,new Set(),{now}),report=join(root,'prior.json');await writeFile(report,JSON.stringify(prior));
    await expect(revalidarInventarioOriginais(report,root,new Set(),{minAgeDays:1})).rejects.toThrow('preservar');
    await expect(revalidarInventarioOriginais(report,root,new Set(),{minAgeDays:30})).rejects.toThrow('preservar');
    expect((await revalidarInventarioOriginais(report,root,new Set(),{minAgeDays:7})).min_age_days).toBe(7);
    await unlink(missing);await writeFile(changed,'adulterado');const fresh=await create(5);
    const result=await revalidarInventarioOriginais(report,root,new Set([resolve(protectedFile).toLowerCase()]),{now});
    expect(result.mantidos.map(item=>item.path)).toEqual([kept]);expect(result.invalidados).toHaveLength(3);
    expect(result.novos_candidatos.map(item=>item.path)).toEqual([fresh]);expect(result.autoriza_exclusao).toBe(false);
    expect(await readFile(protectedFile,'utf8')).toBe('original2');expect(await readFile(changed,'utf8')).toBe('adulterado');
    expect(JSON.parse(await readFile(report,'utf8'))).toEqual(prior);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('recusa relatório de outra pasta, candidato fora da pasta e duplicação',async()=>{
  const root=await mkdtemp(join(tmpdir(),'inventory-revalidate-invalid-'));
  try{
    const hash=createHash('sha256').update('original').digest('hex'),path=join(root,`DF000001_2026-${hash.slice(0,12)}.pdf`);
    await writeFile(path,'original');await utimes(path,new Date(0),new Date(0));
    const prior=await inventariarOriginais(root,new Set()),report=join(root,'prior.json');
    for(const invalid of [{...prior,pasta:join(root,'other')},{...prior,candidatos:[{...prior.candidatos[0],path:join(root,'..','outside.pdf')}]},{...prior,candidatos:[...prior.candidatos,...prior.candidatos]}]){
      await writeFile(report,JSON.stringify(invalid));await expect(revalidarInventarioOriginais(report,root,new Set())).rejects.toThrow();
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
