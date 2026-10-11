import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,lstat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {criarPacoteBackup,recuperarPacoteBackup} from '../src/backup-package.js';

async function fixture(work:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'mediador-package-test-'));try{await work(root);}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Limpeza fora do temporário');await rm(root,{recursive:true,force:true});}}
it('recupera dump e arquivos em raiz nova sem expor nomes no manifesto',()=>fixture(async root=>{
  const key=randomBytes(32),source=join(root,'source'),bytes=randomBytes(65537);await writeFile(source,bytes);
  const pack=join(root,'pack'),restored=join(root,'other-machine');
  await criarPacoteBackup([{source,path:'database/main.dump'},{source,path:'files/cliente-privado/document.pdf'}],pack,key);
  expect((await readFile(join(pack,'manifest.enc'))).includes(Buffer.from('cliente-privado'))).toBe(false);
  expect((await readdir(pack)).sort()).toEqual(['000000.enc','000001.enc','manifest.enc']);
  expect(await recuperarPacoteBackup(pack,restored,key)).toEqual({path:restored,files:2});
  expect((await readFile(join(restored,'files/cliente-privado/document.pdf'))).equals(bytes)).toBe(true);
  expect((await readFile(join(restored,'database/main.dump'))).equals(bytes)).toBe(true);
}));
it('recusa adulteração, chave errada e arquivos adicionais e limpa recuperação incompleta',()=>fixture(async root=>{
  const key=randomBytes(32),source=join(root,'source'),pack=join(root,'pack'),out=join(root,'out');await writeFile(source,'segredo');await criarPacoteBackup([{source,path:'db.dump'}],pack,key);
  await expect(recuperarPacoteBackup(pack,out,randomBytes(32))).rejects.toThrow();await expect(lstat(out)).rejects.toMatchObject({code:'ENOENT'});
  await writeFile(join(pack,'extra'),'extra');await expect(recuperarPacoteBackup(pack,out,key)).rejects.toThrow();await rm(join(pack,'extra'));
  const encrypted=await readFile(join(pack,'000000.enc'));encrypted[encrypted.length-1]^=1;await writeFile(join(pack,'000000.enc'),encrypted);
  await expect(recuperarPacoteBackup(pack,out,key)).rejects.toThrow();await expect(lstat(out)).rejects.toMatchObject({code:'ENOENT'});
}));
it('recusa travessia, colisões Windows e conflitos de diretórios antes de criar pacote',()=>fixture(async root=>{
  const source=join(root,'source'),key=randomBytes(32);await writeFile(source,'x');
  for(const paths of [['../escape'],['C:/escape'],['a\\b'],['NUL.txt'],['a.'],['a','A'],['a','a/b']]){
    await expect(criarPacoteBackup(paths.map(path=>({source,path})),join(root,'pack'),key)).rejects.toThrow();
    await expect(lstat(join(root,'pack'))).rejects.toMatchObject({code:'ENOENT'});
  }
}));
it('preserva destinos existentes e remove somente pasta criada ao falhar',()=>fixture(async root=>{
  const key=randomBytes(32),source=join(root,'source'),pack=join(root,'pack'),out=join(root,'out');await writeFile(source,'x');
  await criarPacoteBackup([{source,path:'db.dump'}],pack,key);
  await expect(criarPacoteBackup([{source,path:'db.dump'}],pack,key)).rejects.toThrow();
  await writeFile(out,'preservado');await expect(recuperarPacoteBackup(pack,out,key)).rejects.toThrow();expect(await readFile(out,'utf8')).toBe('preservado');
  await expect(criarPacoteBackup([{source:join(root,'missing'),path:'db.dump'}],join(root,'failed'),key)).rejects.toThrow();await expect(lstat(join(root,'failed'))).rejects.toMatchObject({code:'ENOENT'});
}));
it('CLI cria e recupera inventário explícito sem registrar a chave',()=>fixture(async root=>{
  const source=join(root,'source'),inventory=join(root,'inventory.json'),pack=join(root,'pack'),out=join(root,'restored'),key=randomBytes(32).toString('base64');
  await writeFile(source,'dump sintético');await writeFile(inventory,JSON.stringify([{source,path:'database/main.dump'}]));
  for(const args of [['criar','--input',inventory,'--output',pack],['recuperar','--input',pack,'--output',out]]){
    const result=spawnSync(process.execPath,['--import','tsx','src/backup-package-cli.ts',...args],{encoding:'utf8',env:{...process.env,BACKUP_ENCRYPTION_KEY:key}});
    expect(result.status,result.stderr).toBe(0);expect(result.stdout+result.stderr).not.toContain(key);
  }
  expect(await readFile(join(out,'database/main.dump'),'utf8')).toBe('dump sintético');
}),15000);
it('autentica mapa v2 de caminhos opacos sem expor referências na pasta cifrada',()=>fixture(async root=>{
  const key=randomBytes(32),source=join(root,'source'),pack=join(root,'pack');await writeFile(source,'bytes');
  const references=['D:\\origem\\documento.pdf','./downloads/documento.pdf','/srv/old/document.pdf'];
  await criarPacoteBackup([{source,path:'files/document.bin',references}],pack,key);
  const result=await recuperarPacoteBackup(pack,join(root,'out'),key);
  expect(result.references).toEqual(references.map(origin=>({origin,path:'files/document.bin'})));
  expect((await readFile(join(pack,'manifest.enc'))).includes(Buffer.from('documento.pdf'))).toBe(false);
  await expect(criarPacoteBackup([{source,path:'a',references:['origem']},{source,path:'b',references:['origem']}],join(root,'duplicate'),key)).rejects.toThrow();
  await expect(lstat(join(root,'duplicate'))).rejects.toMatchObject({code:'ENOENT'});
}));
it('confere os bytes cifrados contra o inventário e recusa mudança posterior da origem',()=>fixture(async root=>{
  const key=randomBytes(32),source=join(root,'source'),sha256=createHash('sha256').update('original').digest('hex');await writeFile(source,'original');
  await criarPacoteBackup([{source,path:'original.pdf',sha256,bytes:8}],join(root,'valid'),key);
  expect(await readdir(join(root,'valid'))).not.toContain('verify.private');
  await writeFile(source,'alterado');
  await expect(criarPacoteBackup([{source,path:'original.pdf',sha256,bytes:8}],join(root,'changed'),key)).rejects.toThrow();
  await expect(lstat(join(root,'changed'))).rejects.toMatchObject({code:'ENOENT'});
  const changedHash=createHash('sha256').update('alterado').digest('hex');
  await expect(criarPacoteBackup([{source,path:'original.pdf',sha256:changedHash,bytes:9}],join(root,'size'),key)).rejects.toThrow();
  await expect(lstat(join(root,'size'))).rejects.toMatchObject({code:'ENOENT'});
}));
