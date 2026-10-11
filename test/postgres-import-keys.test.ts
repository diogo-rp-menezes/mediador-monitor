import Database from 'better-sqlite3';
import type {PoolClient} from 'pg';
import {describe,it,expect,vi} from 'vitest';
import {conciliarChavesLegadas,planejarChavesImportacao,classificarRestricaoUnicaImportacao,type RegraChaveImportacao} from '../src/postgres-import-keys.js';

const document:RegraChaveImportacao={tabela:'registros',destino:'registros',colunas:['numero_registro'],ids:[],documento:true};
const relation:RegraChaveImportacao={tabela:'clientes_contatos',destino:'clientes_contatos',colunas:['cliente_id','contato_id'],ids:['cliente_id','contato_id']};
describe('chaves textuais e compostas da conciliação',()=>{
  it('exige revisão de documentos existentes mesmo com original idêntico e bloqueia hashes divergentes',()=>{
    const source=[{numero_registro:'CCT1',arquivo_hash:'a'.repeat(64)}];
    expect(conciliarChavesLegadas(document,source,[],[],[])[0].acao).toBe('inserir');
    expect(conciliarChavesLegadas(document,source,source,[],[])[0].acao).toBe('revisar_documento_existente');
    expect(conciliarChavesLegadas(document,source,[{...source[0],arquivo_hash:'b'.repeat(64)}],[],[])[0].acao).toBe('conflito_original_divergente');
    expect(conciliarChavesLegadas(document,source,[{...source[0],arquivo_hash:null}],[],[])[0].acao).toBe('revisar_documento_sem_hash');
  });
  it('mantém identificadores textuais exatos e delimita componentes da chave',()=>{
    const source=[{numero_registro:'001'},{numero_registro:'1'},{numero_registro:'CCT'},{numero_registro:'cct'}];
    expect(new Set(conciliarChavesLegadas(document,source,[],[],[]).map(row=>row.chave_hash)).size).toBe(4);
    const rule={...document,documento:false,colunas:['a','b']};
    expect(new Set(conciliarChavesLegadas(rule,[{a:'x:y',b:'z'},{a:'x',b:'y:z'}],[],[],[]).map(row=>row.chave_hash)).size).toBe(2);
  });
  it('compara vínculos após remapeamento e bloqueia dependências pendentes',()=>{
    const source=[{cliente_id:1n,contato_id:2n}],target=[{cliente_id:4,contato_id:'5'}];
    const references=[{coluna:'cliente_id',tabela:'clientes'},{coluna:'contato_id',tabela:'contatos'}];
    const plans=[{tabela:'clientes',mapeamentos:[{origem_id:1,destino_id:4,acao:'inserir_remapeando_id'}]},
      {tabela:'contatos',mapeamentos:[{origem_id:2,destino_id:5,acao:'inserir_remapeando_id'}]}];
    expect(conciliarChavesLegadas(relation,source,target,references,plans)[0].acao).toBe('revisar_vinculo_existente');
    expect(conciliarChavesLegadas(relation,source,target,references,[])[0].acao).toBe('bloqueado_chave_ou_dependencia');
    expect(source[0].cliente_id).toBe(1n);
  });
  it('bloqueia todas as ocorrências de chaves duplicadas e omite valores das chaves no relatório',()=>{
    const source=[{numero_registro:'segredo'},{numero_registro:'segredo'}];
    expect(conciliarChavesLegadas(document,source,[],[],[]).every(row=>row.acao==='conflito_chave_origem')).toBe(true);
    expect(conciliarChavesLegadas(document,[source[0]],source,[],[])[0].acao).toBe('conflito_chave_destino');
    expect(JSON.stringify(conciliarChavesLegadas(document,source,[],[],[]))).not.toContain('segredo');
    expect(conciliarChavesLegadas(document,[{numero_registro:null}],[],[],[])[0].acao).toBe('bloqueado_chave_ou_dependencia');
  });
  it('considera apenas sindicatos principais no índice parcial e só executa SELECTs',async()=>{
    const db=new Database(':memory:');
    try{
      db.exec(`CREATE TABLE clientes(id INTEGER PRIMARY KEY); INSERT INTO clientes VALUES(1);
        CREATE TABLE sindicatos(id INTEGER PRIMARY KEY); INSERT INTO sindicatos VALUES(1),(2);
        CREATE TABLE clientes_sindicatos(cliente_id INTEGER REFERENCES clientes(id),sindicato_id INTEGER REFERENCES sindicatos(id),principal INTEGER);
        INSERT INTO clientes_sindicatos VALUES(1,1,1),(1,2,0);`);
      const query=vi.fn(async()=>({rows:[]})),client={query} as unknown as PoolClient;
      const plans=[{tabela:'clientes',mapeamentos:[{origem_id:1,destino_id:3,acao:'inserir_remapeando_id'}]},
        {tabela:'sindicatos',mapeamentos:[{origem_id:1,destino_id:4,acao:'inserir_remapeando_id'},{origem_id:2,destino_id:5,acao:'inserir_remapeando_id'}]}];
      const report=await planejarChavesImportacao(db,client,plans);
      expect(report.find(rule=>rule.indice_parcial_principal)?.linhas_origem).toBe(1);
      expect(report.find(rule=>!rule.indice_parcial_principal)?.linhas_origem).toBe(2);
      expect(query.mock.calls.every(([sql])=>String(sql).startsWith('SELECT'))).toBe(true);
    }finally{db.close();}
  });
  it('recusa índices novos ou predicados que não correspondam à política conhecida',()=>{
    const index={tabela:'clientes_sindicatos',indice:'principal',expressoes:['cliente_id'],predicado:'principal'};
    expect(classificarRestricaoUnicaImportacao(index)).toBe('chave_textual_composta_planejada');
    expect(classificarRestricaoUnicaImportacao({...index,predicado:'NOT principal'})).toBe('restricao_sem_plano');
    expect(classificarRestricaoUnicaImportacao({...index,tabela:'clientes',expressoes:['razao_social'],predicado:null})).toBe('restricao_sem_plano');
    expect(classificarRestricaoUnicaImportacao({...index,tabela:'usuarios',expressoes:['lower(email)'],predicado:null})).toBe('identidade_natural_planejada');
    expect(classificarRestricaoUnicaImportacao({...index,tabela:'envios_clientes',expressoes:['id','escritorio_id'],predicado:null})).toBe('id_numerico_planejado');
    expect(classificarRestricaoUnicaImportacao({...index,tabela:'usuarios',expressoes:['lower(email)'],predicado:null,valido:false})).toBe('restricao_sem_plano');
    expect(classificarRestricaoUnicaImportacao({...index,tabela:'escritorios',expressoes:['cnpj'],predicado:null,nulos_nao_distintos:true})).toBe('restricao_sem_plano');
  });
});
