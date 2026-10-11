import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {conferirEscopoConversorImportacao} from '../src/postgres-import-scope.js';
import {assinarManifestoMigracao} from '../src/postgres-migration-manifest.js';

it('mantém conversores restritos ao namespace de teste quando não há pacote',()=>{
  expect(()=>conferirEscopoConversorImportacao('mediador_import_test_'+'a'.repeat(32))).not.toThrow();
  for(const database of ['mediador','mediador_cutover_test_'+'a'.repeat(32),'mediador_import_test_invalido'])
    expect(()=>conferirEscopoConversorImportacao(database)).toThrow('exige banco isolado');
});
it('exige assinatura, estado revisado e banco correto no escopo operacional',()=>{
  const folder=mkdtempSync(join(tmpdir(),'mediador-scope-')),file=join(folder,'manifesto.json'),key=randomBytes(32);
  const manifest={formato:'ensaio-migracao-v1',estado:'validado',destino:{database:'destino'},ensaio:{estado_revisado_validado:true}};
  const signed={...manifest,assinatura:assinarManifestoMigracao(manifest,key)},scope={manifesto:file,key};
  try{
    writeFileSync(file,JSON.stringify(signed));
    expect(()=>conferirEscopoConversorImportacao('destino',scope)).not.toThrow();
    expect(()=>conferirEscopoConversorImportacao('outro',scope)).toThrow('inválido');
    expect(()=>conferirEscopoConversorImportacao('destino',{...scope,key:randomBytes(32)})).toThrow('chave divergente');
    writeFileSync(file,JSON.stringify({...signed,destino:{database:'outro'}}));
    expect(()=>conferirEscopoConversorImportacao('outro',scope)).toThrow('Manifesto alterado');
  }finally{rmSync(folder,{recursive:true,force:true});}
});
