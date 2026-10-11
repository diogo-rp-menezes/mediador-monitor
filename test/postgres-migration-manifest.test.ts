import {it,expect} from 'vitest';
import {assinarManifestoMigracao,conferirAssinaturaManifestoMigracao} from '../src/postgres-migration-manifest.js';
import {criarBackupPostgres} from '../src/postgres-backup.js';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

it('assina todo o manifesto, aceita ordem diferente de propriedades e recusa alteração ou chave divergente',()=>{
  const key=Buffer.alloc(32,1),payload={destino:{database:'mediador',hash:'original'},arquivos:[{hash:'documento'}]};
  const signed={...payload,assinatura:assinarManifestoMigracao(payload,key)};
  expect(()=>conferirAssinaturaManifestoMigracao(signed,key)).not.toThrow();
  expect(()=>conferirAssinaturaManifestoMigracao({assinatura:signed.assinatura,arquivos:payload.arquivos,destino:{hash:'original',database:'mediador'}},key)).not.toThrow();
  expect(()=>conferirAssinaturaManifestoMigracao({...signed,destino:{...payload.destino,hash:'alterado'}},key)).toThrow('alterado');
  expect(()=>conferirAssinaturaManifestoMigracao(signed,Buffer.alloc(32,2))).toThrow('chave divergente');
  expect(()=>conferirAssinaturaManifestoMigracao({...signed,assinatura:'inválida'},key)).toThrow('assinatura válida');
  expect(()=>assinarManifestoMigracao(payload,Buffer.alloc(0))).toThrow('Chave');
});
it('backup recusa arquivo existente antes de executar Docker e preserva seu conteúdo',async()=>{
  const root=mkdtempSync(join(tmpdir(),'backup-collision-'));
  try{
    const output=join(root,'backup.dump');writeFileSync(output,'backup existente');
    await expect(criarBackupPostgres({container:'nao-executar',database:'mediador',user:'mediador',output})).rejects.toMatchObject({code:'EEXIST'});
    expect(readFileSync(output,'utf8')).toBe('backup existente');
  }finally{rmSync(root,{recursive:true,force:true});}
});
