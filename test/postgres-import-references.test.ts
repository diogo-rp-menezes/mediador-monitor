import Database from 'better-sqlite3';
import {describe,it,expect} from 'vitest';
import {planejarReferenciasIdentidade,referenciasIdentidades,remapearReferenciasIdentidade,criarPlanosIdsIsolados,type PlanoIdentidade} from '../src/postgres-import-references.js';

const plans:PlanoIdentidade[]=[
  {tabela:'escritorios',mapeamentos:[{origem_id:1,destino_id:3,acao:'inserir_remapeando_id'}]},
  {tabela:'usuarios',mapeamentos:[{origem_id:2,destino_id:7,acao:'inserir_remapeando_id'}]},
  {tabela:'clientes',mapeamentos:[{origem_id:4,destino_id:4,acao:'inserir_preservando_id'}]},
];
describe('referências da conciliação',()=>{
  it('remapeia a cadeia publicação/aviso/acesso e envio/tentativa, excluindo tabelas apenas arquivadas',()=>{
    const db=new Database(':memory:');
    try{
      db.exec(`CREATE TABLE contatos(id INTEGER PRIMARY KEY); INSERT INTO contatos VALUES(1);
        CREATE TABLE sindicatos(id INTEGER PRIMARY KEY); INSERT INTO sindicatos VALUES(1);
        CREATE TABLE envios_clientes(id INTEGER PRIMARY KEY,contato_id INTEGER REFERENCES contatos(id)); INSERT INTO envios_clientes VALUES(1,1);
        CREATE TABLE tentativas_envio(id INTEGER PRIMARY KEY,envio_id INTEGER REFERENCES envios_clientes(id)); INSERT INTO tentativas_envio VALUES(1,1);
        CREATE TABLE publicacoes_documentos(id INTEGER PRIMARY KEY); INSERT INTO publicacoes_documentos VALUES(1);
        CREATE TABLE notificacoes_publicacoes(id INTEGER PRIMARY KEY,publicacao_id INTEGER REFERENCES publicacoes_documentos(id)); INSERT INTO notificacoes_publicacoes VALUES(1,1);
        CREATE TABLE auditoria_acessos_publicacoes(id INTEGER PRIMARY KEY,publicacao_id INTEGER REFERENCES publicacoes_documentos(id)); INSERT INTO auditoria_acessos_publicacoes VALUES(1,1);
        CREATE TABLE auditoria_revisoes(id INTEGER PRIMARY KEY); INSERT INTO auditoria_revisoes VALUES(1);
        CREATE TABLE concessoes_suporte(id TEXT PRIMARY KEY); INSERT INTO concessoes_suporte VALUES('uuid');`);
      const mappedPlans=criarPlanosIdsIsolados(db,true);
      expect(mappedPlans.some(plan=>['auditoria_revisoes','concessoes_suporte'].includes(plan.tabela))).toBe(false);
      for(const table of ['envios_clientes','tentativas_envio','notificacoes_publicacoes','auditoria_acessos_publicacoes']){
        const row=db.prepare(`SELECT * FROM ${table}`).safeIntegers().get() as Record<string,unknown>;
        const result=remapearReferenciasIdentidade(row,[{coluna:'id',tabela:table},...referenciasIdentidades(db,table)],mappedPlans);
        expect(Object.values(result).every(value=>value===2)).toBe(true);
      }
      expect(criarPlanosIdsIsolados(db).every(plan=>plan.mapeamentos.every(mapping=>mapping.origem_id===mapping.destino_id))).toBe(true);
      db.prepare('INSERT INTO sindicatos VALUES(?)').run(9007199254740993n);
      expect(()=>criarPlanosIdsIsolados(db,true)).toThrow('intervalo seguro');
    }finally{db.close();}
  });
  it('remapeia ator, escritório e cliente sem alterar o histórico original',()=>{
    const original={ator_id:2n,escritorio_id:1n,cliente_id:4n,detalhes_json:'{"escritorio_id":1}'};
    const mapped=remapearReferenciasIdentidade(original,[{coluna:'ator_id',tabela:'usuarios'},{coluna:'escritorio_id',tabela:'escritorios'},{coluna:'cliente_id',tabela:'clientes'}],plans);
    expect(mapped).toEqual({...original,ator_id:7,escritorio_id:3,cliente_id:4});
    expect(original.ator_id).toBe(2n);
    expect(mapped.detalhes_json).toBe(original.detalhes_json);
  });
  it('preserva referências nulas de auditoria global',()=>{
    expect(remapearReferenciasIdentidade({ator_id:null},[{coluna:'ator_id',tabela:'usuarios'}],[])).toEqual({ator_id:null});
  });
  it('bloqueia referências ausentes, inválidas, sem mapa ou com revisão pendente',()=>{
    const reference=[{coluna:'ator_id',tabela:'usuarios'}];
    for(const value of [undefined,'2',0,-1,1.5,9007199254740993n])expect(()=>remapearReferenciasIdentidade({ator_id:value},reference,plans)).toThrow();
    expect(()=>remapearReferenciasIdentidade({ator_id:99},reference,plans)).toThrow('sem mapeamento');
    expect(()=>remapearReferenciasIdentidade({ator_id:2},reference,[...plans,...plans])).toThrow('sem mapeamento');
    expect(()=>remapearReferenciasIdentidade({ator_id:2},reference,[{tabela:'usuarios',mapeamentos:[{origem_id:2,destino_id:7,acao:'revisar_identidade_existente'}]}])).toThrow('exige revisão');
  });
  it('descobre FKs compostas sem confundir escritorio_id com cliente_id',()=>{
    const db=new Database(':memory:');
    try{
      db.exec(`CREATE TABLE escritorios(id INTEGER PRIMARY KEY);
        CREATE TABLE usuarios(id INTEGER PRIMARY KEY);
        CREATE TABLE clientes(id INTEGER PRIMARY KEY,escritorio_id INTEGER REFERENCES escritorios(id),UNIQUE(id,escritorio_id));
        CREATE TABLE usuarios_clientes(usuario_id INTEGER REFERENCES usuarios(id),cliente_id INTEGER,escritorio_id INTEGER REFERENCES escritorios(id),
          FOREIGN KEY(cliente_id,escritorio_id) REFERENCES clientes(id,escritorio_id));
        INSERT INTO escritorios VALUES(1); INSERT INTO usuarios VALUES(2); INSERT INTO clientes VALUES(4,1); INSERT INTO usuarios_clientes VALUES(2,4,1);`);
      const references=referenciasIdentidades(db,'usuarios_clientes');
      expect(references).toEqual([{coluna:'cliente_id',tabela:'clientes'},{coluna:'escritorio_id',tabela:'escritorios'},{coluna:'usuario_id',tabela:'usuarios'}]);
      const report=planejarReferenciasIdentidade(db,plans);
      expect(report.find(row=>row.tabela==='usuarios_clientes')?.colunas.map(row=>[row.coluna,row.remapeadas,row.bloqueadas]))
        .toEqual([['cliente_id',0,0],['escritorio_id',1,0],['usuario_id',1,0]]);
      expect(db.prepare('SELECT escritorio_id FROM usuarios_clientes').get()).toEqual({escritorio_id:1});
      const blocked=planejarReferenciasIdentidade(db,[]);
      expect(blocked.flatMap(row=>row.colunas).every(column=>column.bloqueadas===column.referencias)).toBe(true);
    }finally{db.close();}
  });
});
