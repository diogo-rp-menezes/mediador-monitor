import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hashBytes} from '../src/relatorios.js';
import {validarOriginalColetado,conferirBytesOriginalColetado} from '../src/postgres-monitoring-original.js';
async function fixture(work:(file:{path:string;hash:string;bytes:number;original:string})=>Promise<void>,outside=false){
  const dir=mkdtempSync(join(outside?tmpdir():'data','original-test-')),path=join(dir,'original.doc');
  const bytes=Buffer.from('<html><body>NUMERO DE REGISTRO NO MTE: DF999995/2026</body></html>');writeFileSync(path,bytes);
  try{await work({path,hash:hashBytes(bytes),bytes:bytes.length,original:'original.doc'});}
  finally{unlinkSync(path);rmdirSync(dir);}
}
it('confirma conteúdo, hash, tamanho e número do original',async()=>{
  await fixture(async file=>{
    const validated=await validarOriginalColetado('DF999995/2026',file,new AbortController().signal);
    expect(validated.hash).toBe(file.hash);expect(validated.original).toBe('original.doc');
    conferirBytesOriginalColetado(validated);
  });
});
it('recusa arquivo de outro registro, adulterado ou fora das pastas permitidas',async()=>{
  await fixture(async file=>{
    await expect(validarOriginalColetado('DF999996/2026',file,new AbortController().signal)).rejects.toThrow('Número');
    await expect(validarOriginalColetado('DF999995/2026',{...file,hash:'a'.repeat(64)},new AbortController().signal)).rejects.toThrow('integridade');
  });
  await fixture(async file=>{await expect(validarOriginalColetado('DF999995/2026',file,new AbortController().signal)).rejects.toThrow('pastas permitidas');},true);
});
it('recusa descritor inválido e cancelamento, e detecta alteração posterior à validação',async()=>{
  await fixture(async file=>{
    await expect(validarOriginalColetado('DF999995/2026',{...file,bytes:0},new AbortController().signal)).rejects.toThrow('Descritor');
    const cancelled=new AbortController();cancelled.abort();await expect(validarOriginalColetado('DF999995/2026',file,cancelled.signal)).rejects.toThrow();
    const validated=await validarOriginalColetado('DF999995/2026',file,new AbortController().signal);
    writeFileSync(file.path,'Alterado');expect(()=>conferirBytesOriginalColetado(validated)).toThrow('integridade');
  });
});

