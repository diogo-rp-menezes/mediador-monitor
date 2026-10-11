import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {conferirCoberturaBackups} from '../src/backup-retention-coverage.js';

it('recusa pacote omitido e confere raízes duplicadas sem duplicar contagem',async()=>{
  const root=await mkdtemp(join(tmpdir(),'coverage-test-'));
  try{
    const pack=join(root,'pack');await mkdir(pack);await writeFile(join(pack,'manifest.enc'),'ciphertext');
    await expect(conferirCoberturaBackups([root],[])).rejects.toThrow('fora do catálogo');
    const sources=[{pasta:pack,chave_env:'BACKUP_ENCRYPTION_KEY'}];
    const result=await conferirCoberturaBackups([root,root],sources);
    expect(result.raizes).toBe(1);expect(result.pacotes).toBe(1);
    await writeFile(join(pack,'manifest.enc'),'changed');
    expect((await conferirCoberturaBackups([root],sources)).evidencia).not.toEqual(result.evidencia);
    await writeFile(join(root,'unexpected'),'x');
    await expect(conferirCoberturaBackups([root],sources)).rejects.toThrow('somente diretórios');
  }finally{await rm(root,{recursive:true,force:true});}
});
it('declara ausência de cobertura sem raízes e recusa diretório incompleto',async()=>{
  expect(await conferirCoberturaBackups([],[])).toEqual({raizes:0,pacotes:0,evidencia:[]});
  const root=await mkdtemp(join(tmpdir(),'coverage-incomplete-'));
  try{const pack=join(root,'pack');await mkdir(pack);
    await expect(conferirCoberturaBackups([root],[{pasta:pack,chave_env:'BACKUP_ENCRYPTION_KEY'}])).rejects.toThrow();
  }finally{await rm(root,{recursive:true,force:true});}
});
