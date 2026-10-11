import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evidenciarFontesRetencao,conferirFontesPreservadas} from '../src/retention-source-evidence.js';
import {inventariarOriginais} from '../src/postgres-original-inventory.js';
import {revalidarInventarioOriginais} from '../src/original-inventory-revalidation.js';
it('recusa banco diferente ou identidade ausente e aceita mesma identidade',()=>{
  const old={formato:'fontes-retencao-v1' as const,identidades:[],postgres:'a'.repeat(64)};
  expect(()=>conferirFontesPreservadas(old,{...old,postgres:'b'.repeat(64)})).toThrow('PostgreSQL');
  expect(()=>conferirFontesPreservadas(old,{formato:old.formato,identidades:[]})).toThrow('PostgreSQL');
  expect(()=>conferirFontesPreservadas(old,old)).not.toThrow();
});
it('recusa substituição com mesma contagem e permite ampliar fontes sem expor caminhos',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sources-evidence-'));
  try{
    const a=join(root,'a'),b=join(root,'b');await writeFile(a,'a');await writeFile(b,'b');
    const old=await evidenciarFontesRetencao([{tipo:'backup',path:a}]),changed=await evidenciarFontesRetencao([{tipo:'backup',path:b}]);
    expect(()=>conferirFontesPreservadas(old,changed)).toThrow('omitida');
    expect(()=>conferirFontesPreservadas(old,undefined)).toThrow('ausente');
    const expanded=await evidenciarFontesRetencao([{tipo:'backup',path:b},{tipo:'backup',path:a},{tipo:'backup',path:a}]);
    expect(expanded.identidades).toHaveLength(2);expect(()=>conferirFontesPreservadas(old,expanded)).not.toThrow();
    expect(JSON.stringify(expanded)).not.toContain(root);
    const report=join(root,'report.json');await writeFile(report,JSON.stringify({...await inventariarOriginais(root,new Set()),evidencia_fontes:old}));
    await expect(revalidarInventarioOriginais(report,root,new Set(),{evidenciaFontes:changed})).rejects.toThrow('omitida');
    expect((await revalidarInventarioOriginais(report,root,new Set(),{evidenciaFontes:expanded})).fontes_anteriores_conferidas).toBe(true);
  }finally{await rm(root,{recursive:true,force:true});}
});
