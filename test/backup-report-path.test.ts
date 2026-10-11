import {it,expect} from 'vitest';
import {resolve,join} from 'node:path';
import {validarRelatorioForaDoPacote} from '../src/backup-report-path.js';
it('recusa relatório dentro do pacote ou igual ao destino',()=>{
  const root=resolve('data','package');
  for(const report of [root,join(root,'report.json'),join(root,'nested','report.json'),join(root,'x','..','report.json')]){
    expect(()=>validarRelatorioForaDoPacote(root,report)).toThrow('fora');
  }
});
it('permite relatório irmão e pasta com prefixo semelhante',()=>{
  const root=resolve('data','package');
  expect(()=>validarRelatorioForaDoPacote(root,resolve('data','report.json'))).not.toThrow();
  expect(()=>validarRelatorioForaDoPacote(root,resolve('data','package-other','report.json'))).not.toThrow();
});
