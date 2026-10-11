import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {criarPersistenciaColetaPostgres} from '../src/postgres-monitoring-persistence.js';
const monitor={id:2,sindicato_id:8,nome:'Privado',cnpj_filtro:'',categoria:'Teste',uf:'DF',titulo:'',vigencia:'',tipos_json:['Convenção Coletiva']};
const reservation={id:1,escritorio_id:3,solicitada_por:7,token:'token',monitoramento:monitor};
const watch={name:'Privado',cnpj:'',categoria:'Teste',uf:'DF',titulo:'',vigencia:'',tipo:'Convenção Coletiva'};
const record={numeroRegistro:'DF999991/2026',numeroSolicitacao:'MR999991/2026',tipo:'Convenção Coletiva',vigencia:'2026',partes:'Público',indice:0};
function fixture(cancelled=false){
  const query=vi.fn(async(sql:string)=>{
    if(sql.startsWith('SELECT id FROM escritorios'))return {rows:[{id:3}],rowCount:1};
    if(sql.startsWith('SELECT detalhes_json'))return {rows:[{detalhes_json:{monitoramento_id:2,cancelamento_solicitado:cancelled}}],rowCount:1};
    if(sql.includes('FROM monitoramentos_escritorios'))return {rows:[monitor],rowCount:1};
    return {rows:[],rowCount:1};
  });
  const release=vi.fn(),connect=vi.fn().mockResolvedValue({query,release});
  return {query,release,connect,persist:criarPersistenciaColetaPostgres({connect} as unknown as Pool)};
}
const result={registros:[record],arquivos:new Map(),erros:[]};
it('recusa lote inválido, tipos divergentes e duplicação conflitante antes de abrir transação',async()=>{
  const {persist,connect}=fixture(),signal=new AbortController().signal;
  await expect(persist(reservation,watch,{...result,registros:[{...record,numeroRegistro:'inválido'}]},signal)).rejects.toThrow();
  await expect(persist(reservation,watch,{...result,registros:[{...record,tipo:'Acordo Coletivo'}]},signal)).rejects.toThrow('tipo consultado');
  await expect(persist(reservation,watch,{...result,registros:[record,{...record,partes:'Divergente',indice:1}]},signal)).rejects.toThrow('divergentes');
  expect(connect).not.toHaveBeenCalled();
});
it('recusa cancelamento já registrado no banco e libera conexão com rollback',async()=>{
  const {persist,query,release}=fixture(true);
  await expect(persist(reservation,watch,result,new AbortController().signal)).rejects.toThrow('cancelada');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');expect(release).toHaveBeenCalledOnce();
});
it('cancelamento durante a gravação desfaz lote e evidência em vez de confirmar',async()=>{
  const {persist,query,release}=fixture(),controller=new AbortController();
  const implementation=query.getMockImplementation()!;
  query.mockImplementation(async sql=>{
    const response=await implementation(sql);
    if(sql.startsWith('INSERT INTO registros('))controller.abort();
    return response;
  });
  await expect(persist(reservation,watch,result,controller.signal)).rejects.toThrow();
  expect(query.mock.calls.some(([sql])=>sql==='COMMIT')).toBe(false);
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');expect(release).toHaveBeenCalledOnce();
});
it('recusa filtros alterados antes da gravação no catálogo público',async()=>{
  const {persist,query}=fixture();
  await expect(persist(reservation,{...watch,uf:'GO'},result,new AbortController().signal)).rejects.toThrow('Filtros');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
});
