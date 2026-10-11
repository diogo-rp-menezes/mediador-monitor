import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,unlinkSync,rmdirSync,utimesSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assinarManifestoMigracao} from '../src/postgres-migration-manifest.js';
import {referenciasOriginaisPacote} from '../src/migration-original-references.js';
import {inventariarOriginais} from '../src/postgres-original-inventory.js';

it('protege por hash uma cópia renomeada e recusa pacote adulterado sem depender da origem viva',async()=>{
  const folder=resolve(mkdtempSync(join('data','package-refs-test-'))),originals=join(folder,'originais');mkdirSync(originals);
  const hash=(text:string)=>createHash('sha256').update(text).digest('hex'),key=Buffer.alloc(32,9),digest=hash('original');
  const snapshot=join(folder,'origem.sqlite'),backup=join(folder,'destino-antes.dump'),copy=join(originals,digest+'.bin');
  const candidate=join(folder,`DF999999_2026-${digest.slice(0,12)}.doc`),file=join(folder,'manifesto.json');
  writeFileSync(snapshot,'snapshot');writeFileSync(backup,'backup');writeFileSync(copy,'original');writeFileSync(candidate,'original');
  utimesSync(candidate,new Date(0),new Date(0));
  const manifest={formato:'ensaio-migracao-v1',estado:'validado',execucao_no_destino_atual:false,
    origem:{path:join(folder,'origem-inexistente.db'),snapshot,arquivo_hash:hash('snapshot')},destino:{backup,backup_hash:hash('backup')},
    originais:[{origem:'downloads/nome-antigo.doc',copia:copy,hash:digest}],assinatura:''};
  manifest.assinatura=assinarManifestoMigracao(manifest,key);writeFileSync(file,JSON.stringify(manifest));
  try{
    const before=readFileSync(file),refs=referenciasOriginaisPacote(file,key);
    expect((await inventariarOriginais(folder,refs)).candidatos).toHaveLength(0);
    expect(readFileSync(file).equals(before)).toBe(true);
    expect(()=>referenciasOriginaisPacote(file,Buffer.alloc(32,8))).toThrow();
    writeFileSync(copy,'adulterado');expect(()=>referenciasOriginaisPacote(file,key)).toThrow();writeFileSync(copy,'original');
    writeFileSync(backup,'adulterado');expect(()=>referenciasOriginaisPacote(file,key)).toThrow();writeFileSync(backup,'backup');
    manifest.originais=[];writeFileSync(file,JSON.stringify(manifest));expect(()=>referenciasOriginaisPacote(file,key)).toThrow();
  }finally{[snapshot,backup,copy,candidate,file].forEach(path=>unlinkSync(path));rmdirSync(originals);rmdirSync(folder);}
});
