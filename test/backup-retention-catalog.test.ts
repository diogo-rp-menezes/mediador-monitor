import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {criarPacoteBackup} from '../src/backup-package.js';
import {lerCatalogoBackupsRetencao,referenciasCatalogoBackups} from '../src/backup-retention-catalog.js';

it('agrega pacotes com chaves diferentes, resolve caminhos relativos e deduplica',async()=>{
  const root=await mkdtemp(join(tmpdir(),'retention-catalog-'));
  try{
    const environment:NodeJS.ProcessEnv={},pacotes=[];
    for(let i=0;i<2;i++){
      const key=Buffer.alloc(32,i+1),source=join(root,`file${i}`),pasta=`package${i}`,chave_env=`BACKUP_ENCRYPTION_KEY_${i}`;
      await writeFile(source,`content${i}`);environment[chave_env]=key.toString('base64');
      await criarPacoteBackup([{source,path:'files/'+String(i).repeat(64)+'.bin',references:[source]}],join(root,pasta),key);
      pacotes.push({pasta,chave_env});key.fill(0);
    }
    const path=join(root,'catalog.json');await writeFile(path,JSON.stringify({formato:'catalogo-backups-retencao-v1',pacotes}));
    const sources=await lerCatalogoBackupsRetencao(path);
    expect(sources[0].pasta).toBe(join(root,'package0'));
    const result=await referenciasCatalogoBackups([...sources,sources[0]],environment);
    expect(result.pacotes).toBe(2);
    for(let i=0;i<2;i++)expect(result.references.has('hash:'+createHash('sha256').update(`content${i}`).digest('hex'))).toBe(true);
    delete environment.BACKUP_ENCRYPTION_KEY_1;
    await expect(referenciasCatalogoBackups(sources,environment)).rejects.toThrow('Chave');
    await expect(referenciasCatalogoBackups([sources[0],{...sources[0],chave_env:'BACKUP_ENCRYPTION_KEY_OTHER'}],environment)).rejects.toThrow('conflitantes');
  }finally{await rm(root,{recursive:true,force:true});}
});

it('recusa campos secretos, variáveis não dedicadas e catálogo vazio',async()=>{
  const root=await mkdtemp(join(tmpdir(),'retention-catalog-invalid-'));
  try{
    const path=join(root,'catalog.json');
    for(const pacotes of [[],[{pasta:'backup',chave_env:'PGPASSWORD'}],[{pasta:'backup',chave_env:'BACKUP_ENCRYPTION_KEY',chave:'secret'}]]){
      await writeFile(path,JSON.stringify({formato:'catalogo-backups-retencao-v1',pacotes}));
      await expect(lerCatalogoBackupsRetencao(path)).rejects.toThrow();
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
