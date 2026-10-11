import {describe,it,expect} from 'vitest';
import {mapearIdentidadesLegadas,chaveContatoConciliacao} from '../src/postgres-import-reconcile.js';

describe('conciliação de identidades legadas',()=>{
  it('compara contatos por escritório remapeado e e-mail normalizado, sem fundir escritórios',()=>{
    const officePlans={tabela:'escritorios',mapeamentos:[{origem_id:1,destino_id:3,acao:'inserir_remapeando_id'}]};
    const source=chaveContatoConciliacao({escritorio_id:1n,email:' Pessoa@Example.test '},officePlans);
    expect(source).toBe(chaveContatoConciliacao({escritorio_id:3,email:'pessoa@example.test'}));
    expect(source).not.toBe(chaveContatoConciliacao({escritorio_id:2,email:'pessoa@example.test'}));
    expect(chaveContatoConciliacao({escritorio_id:2,email:'pessoa@example.test'},officePlans)).toBeNull();
    expect(chaveContatoConciliacao({escritorio_id:1,email:''},officePlans)).toBeNull();
    expect(()=>chaveContatoConciliacao({escritorio_id:0,email:'pessoa@example.test'})).toThrow();
  });
  it('remapeia colisões sem ocupar IDs preserváveis da origem',()=>{
    expect(mapearIdentidadesLegadas([{id:2,chave:null},{id:1,chave:null}],[{id:1,chave:null}]))
      .toEqual([{origem_id:1,destino_id:3,acao:'inserir_remapeando_id'},{origem_id:2,destino_id:2,acao:'inserir_preservando_id'}]);
  });
  it('exige revisão para identidade existente mesmo com ID diferente',()=>{
    expect(mapearIdentidadesLegadas([{id:1,chave:'a'}],[{id:9,chave:'a'}])[0])
      .toEqual({origem_id:1,destino_id:9,acao:'revisar_identidade_existente'});
  });
  it('não escolhe arbitrariamente entre chaves duplicadas no destino',()=>{
    expect(mapearIdentidadesLegadas([{id:1,chave:'a'}],[{id:8,chave:'a'},{id:9,chave:'a'}])[0].acao).toBe('conflito_chave_destino');
  });
  it('sinaliza repetição de chave na origem',()=>{
    expect(mapearIdentidadesLegadas([{id:1,chave:'a'},{id:2,chave:'a'}],[]).every(row=>row.acao==='conflito_chave_origem'&&row.destino_id===null)).toBe(true);
  });
  it('não considera chaves ausentes uma identidade compartilhada',()=>{
    expect(mapearIdentidadesLegadas([{id:1,chave:null},{id:2,chave:null}],[]).every(row=>row.acao==='inserir_preservando_id')).toBe(true);
  });
  it('rejeita IDs inválidos e duplicados nos dois lados',()=>{
    for(const invalid of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
      expect(()=>mapearIdentidadesLegadas([{id:invalid,chave:null}],[])).toThrow();
      expect(()=>mapearIdentidadesLegadas([],[{id:invalid,chave:null}])).toThrow();
    }
    const duplicate=[{id:1,chave:null},{id:1,chave:null}];
    expect(()=>mapearIdentidadesLegadas(duplicate,[])).toThrow();
    expect(()=>mapearIdentidadesLegadas([],duplicate)).toThrow();
  });
  it('recusa alocar ID fora do intervalo seguro',()=>{
    expect(()=>mapearIdentidadesLegadas([{id:Number.MAX_SAFE_INTEGER,chave:null}],[{id:Number.MAX_SAFE_INTEGER,chave:null}])).toThrow('Espaço de IDs esgotado');
  });
  it('não modifica as entradas e gera resultado determinístico',()=>{
    const source=[{id:3,chave:'b'},{id:1,chave:'a'}],target=[{id:1,chave:'c'}];
    const before=JSON.stringify({source,target});
    expect(mapearIdentidadesLegadas(source,target)).toEqual(mapearIdentidadesLegadas([...source].reverse(),target));
    expect(JSON.stringify({source,target})).toBe(before);
  });
});
