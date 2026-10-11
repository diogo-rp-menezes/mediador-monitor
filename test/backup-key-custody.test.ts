import {it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {criarCopiaChavesBackup,recuperarCopiaChavesBackup} from '../src/backup-key-custody.js';

const fixture=()=>({keys:{backupKey:randomBytes(32),credentialsKey:randomBytes(32)},recovery:randomBytes(32)});
it('recupera ambas as chaves de uma cópia aleatória sem expor seu conteúdo',()=>{
  const {keys,recovery}=fixture(),copy=criarCopiaChavesBackup(keys,recovery),other=criarCopiaChavesBackup(keys,recovery);
  expect(copy).not.toBe(other);for(const key of Object.values(keys))expect(copy).not.toContain(key.toString('base64'));
  const restored=recuperarCopiaChavesBackup(copy,recovery);expect(restored.backupKey.equals(keys.backupKey)).toBe(true);expect(restored.credentialsKey.equals(keys.credentialsKey)).toBe(true);
});
it('recusa chave incorreta, adulteração, versão desconhecida e conteúdo excessivo',()=>{
  const {keys,recovery}=fixture(),copy=criarCopiaChavesBackup(keys,recovery);
  expect(()=>recuperarCopiaChavesBackup(copy,randomBytes(32))).toThrow(/incompatível/);
  for(const field of ['iv','tag','cifrado']){const changed=JSON.parse(copy);const bytes=Buffer.from(changed[field],'base64');bytes[0]^=1;changed[field]=bytes.toString('base64');expect(()=>recuperarCopiaChavesBackup(JSON.stringify(changed),recovery)).toThrow();}
  expect(()=>recuperarCopiaChavesBackup(copy.replace('v1','v2'),recovery)).toThrow();
  expect(()=>recuperarCopiaChavesBackup('x'.repeat(8193),recovery)).toThrow();
});
it('exige três chaves distintas com tamanho correto',()=>{
  const {keys,recovery}=fixture();expect(()=>criarCopiaChavesBackup(keys,keys.backupKey)).toThrow();
  expect(()=>criarCopiaChavesBackup({...keys,credentialsKey:keys.backupKey},recovery)).toThrow();
  expect(()=>criarCopiaChavesBackup(keys,Buffer.alloc(1))).toThrow();
});
it('CLI cria e recupera sem imprimir segredos, ativar ambiente ou sobrescrever destino',()=>{
  const dir=mkdtempSync(join(tmpdir(),'mediador-key-test-')),{keys,recovery}=fixture();
  const env={...process.env,BACKUP_ENCRYPTION_KEY:keys.backupKey.toString('base64'),CREDENTIALS_MASTER_KEY:keys.credentialsKey.toString('base64'),BACKUP_RECOVERY_KEY:recovery.toString('base64')};
  const run=(args:string[])=>{const result=spawnSync(process.execPath,['--import','tsx','src/backup-key-custody-cli.ts',...args],{env,encoding:'utf8',windowsHide:true});
    for(const value of [env.BACKUP_ENCRYPTION_KEY,env.CREDENTIALS_MASTER_KEY,env.BACKUP_RECOVERY_KEY])expect(result.stdout+result.stderr).not.toContain(value);return result;};
  try{
    const encrypted=join(dir,'keys.enc'),output=join(dir,'recovered.json');expect(run(['criar','--output',encrypted]).status).toBe(0);
    expect(run(['recuperar','--input',encrypted,'--output',output]).status).toBe(0);
    expect(JSON.parse(readFileSync(output,'utf8'))).toEqual({BACKUP_ENCRYPTION_KEY:env.BACKUP_ENCRYPTION_KEY,CREDENTIALS_MASTER_KEY:env.CREDENTIALS_MASTER_KEY});
    const before=readFileSync(output);expect(run(['recuperar','--input',encrypted,'--output',output]).status).toBe(1);expect(readFileSync(output)).toEqual(before);
    writeFileSync(encrypted,'adulterado');expect(run(['recuperar','--input',encrypted,'--output',join(dir,'bad')]).status).toBe(1);expect(existsSync(join(dir,'bad'))).toBe(false);
  }finally{expect(resolve(dir).startsWith(resolve(tmpdir())+sep)).toBe(true);rmSync(dir,{recursive:true,force:true});}
},15000);
