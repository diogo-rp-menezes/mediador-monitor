import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {criarPacoteBackup} from '../src/backup-package.js';
import {ensaiarRecuperacaoPacotePostgres} from '../src/postgres-package-recovery.js';
async function fixture(work:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'mediador-package-recovery-'));try{await work(root);}finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw new Error('Limpeza inválida');await rm(root,{recursive:true,force:true});}}
it('recusa v1 sem mapa antes de conectar ao banco e preserva arquivos extraídos privados',()=>fixture(async root=>{
  const key=randomBytes(32),source=join(root,'source');await writeFile(source,'dump sintético');await criarPacoteBackup([{source,path:'database/main.dump'}],join(root,'pack'),key);
  await expect(ensaiarRecuperacaoPacotePostgres(join(root,'pack'),join(root,'out'),key,{PGPORT:'inválida'})).rejects.toThrow('v2');
  expect(await readFile(join(root,'out/database/main.dump'),'utf8')).toBe('dump sintético');
}));
it('CLI preserva relatório preexistente e não extrai pacote nem expõe chave ao recusar',()=>fixture(async root=>{
  const report=join(root,'report.json'),output=join(root,'out'),key=randomBytes(32).toString('base64');await writeFile(report,'preservado');
  const result=spawnSync(process.execPath,['--import','tsx','src/postgres-package-recovery-cli.ts','--input',join(root,'missing'),'--output',output,'--report',report],{encoding:'utf8',env:{...process.env,BACKUP_ENCRYPTION_KEY:key}});
  expect(result.status).toBe(1);expect(result.stderr+result.stdout).not.toContain(key);expect(await readFile(report,'utf8')).toBe('preservado');await expect(lstat(output)).rejects.toMatchObject({code:'ENOENT'});
}),15000);
