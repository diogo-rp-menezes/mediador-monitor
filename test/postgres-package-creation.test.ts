import {it,expect,vi,beforeEach} from 'vitest';
import {mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Pool} from 'pg';
const state=vi.hoisted(()=>({commitFails:false,dump:''}));
vi.mock('../src/postgres-backup-snapshot.js',()=>({comSnapshotBackupIsolado:async(_p:unknown,_d:string,work:(s:string)=>Promise<unknown>)=>{const result=await work('snapshot');if(state.commitFails)throw new Error('commit');return result;}}));
vi.mock('../src/postgres-backup.js',()=>({criarBackupPostgres:async(c:{output:string,snapshot:string})=>{expect(c.snapshot).toBe('snapshot');state.dump=c.output;await writeFile(c.output,'dump');}}));
vi.mock('../src/postgres-backup-inventory.js',()=>({lerReferenciasBackupPostgres:async(_p:unknown,s:string)=>{expect(s).toBe('snapshot');return [];},inventariarArquivosBackup:async()=>({files:[],arquivos:0,referencias:0})}));
import {criarPacotePostgresIsolado} from '../src/postgres-package-creation.js';
import {recuperarPacoteBackup} from '../src/backup-package.js';
const config={database:'mediador_backup_test_'+'a'.repeat(32),container:'test',user:'test',output:'ignored.dump'};
beforeEach(()=>{state.commitFails=false;state.dump='';});
it('recusa banco operacional antes de criar arquivos ou conectar',async()=>{
  await expect(criarPacotePostgresIsolado({} as Pool,{...config,database:'mediador'},['data'],'unused',Buffer.alloc(32))).rejects.toThrow('origem de ensaio');
});
it.each([false,true])('limpa dump temporário e não conserva pacote se commit falhar (%s)',async failure=>{
  const root=await mkdtemp(join(tmpdir(),'package-creation-test-'));state.commitFails=failure;
  try{
    const call=criarPacotePostgresIsolado({} as Pool,config,[root],join(root,'package'),Buffer.alloc(32,1));
    if(failure){await expect(call).rejects.toThrow('commit');expect(await readdir(root)).toEqual([]);}
    else{expect(await call).toMatchObject({validado:true,arquivos_pacote:1});expect(await readdir(join(root,'package'))).toContain('manifest.enc');}
    await expect(readdir(join(state.dump,'..'))).rejects.toMatchObject({code:'ENOENT'});
  }finally{await rm(root,{recursive:true,force:true});}
});
it('preserva destino preexistente',async()=>{
  const root=await mkdtemp(join(tmpdir(),'package-existing-test-'));
  try{await mkdir(join(root,'package'));await writeFile(join(root,'package','keep'),'original');
    await expect(criarPacotePostgresIsolado({} as Pool,config,[root],join(root,'package'),Buffer.alloc(32,1))).rejects.toThrow();
    expect(await readdir(join(root,'package'))).toEqual(['keep']);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('produz mapa v2 vazio recuperável quando a instalação ainda não possui documentos',async()=>{
  const root=await mkdtemp(join(tmpdir(),'package-empty-test-')),key=Buffer.alloc(32,1);
  try{
    const result=await criarPacotePostgresIsolado({} as Pool,config,[root],join(root,'package'),key);
    expect(result.arquivos_referenciados).toBe(0);
    const recovered=await recuperarPacoteBackup(join(root,'package'),join(root,'recovered'),key);
    expect(recovered.files).toBe(1);expect(recovered.references).toEqual([]);
  }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
});
