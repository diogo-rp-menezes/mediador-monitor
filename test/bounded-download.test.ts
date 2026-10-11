import {it,expect} from 'vitest';
import {Readable} from 'node:stream';
import {mkdtempSync,existsSync,readFileSync,unlinkSync,rmdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {copiarDownloadLimitado} from '../src/bounded-download.js';
it('copia limite exato e remove somente o temporário de uma cópia excedente',async()=>{
  const dir=mkdtempSync(join('data','bounded-test-')),path=join(dir,'temp');
  try{
    expect(await copiarDownloadLimitado(Readable.from([Buffer.from('12'),Buffer.from('34')]),path,4)).toBe(4);
    expect(readFileSync(path).toString()).toBe('1234');unlinkSync(path);
    await expect(copiarDownloadLimitado(Readable.from([Buffer.from('12'),Buffer.from('345')]),path,4)).rejects.toThrow('volume');
    expect(existsSync(path)).toBe(false);
    writeFileSync(path,'preservado');await expect(copiarDownloadLimitado(Readable.from(['outro']),path,100)).rejects.toThrow();
    expect(readFileSync(path).toString()).toBe('preservado');
  }finally{if(existsSync(path))unlinkSync(path);rmdirSync(dir);}
});
it('interrupção durante stream limpa temporário sem completar a cópia',async()=>{
  const dir=mkdtempSync(join('data','bounded-test-')),path=join(dir,'temp'),stop=new AbortController();
  try{
    const stream=Readable.from((async function*(){yield Buffer.from('12');stop.abort();yield Buffer.from('34');})());
    await expect(copiarDownloadLimitado(stream,path,10,stop.signal)).rejects.toThrow();expect(existsSync(path)).toBe(false);
  }finally{if(existsSync(path))unlinkSync(path);rmdirSync(dir);}
});
