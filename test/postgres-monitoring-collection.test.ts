import {it,expect,vi} from 'vitest';
import {env} from '../src/config.js';
import {criarTrabalhoColetaPostgres} from '../src/postgres-monitoring-collection.js';
import type {Sessao,ConsultaResultado} from '../src/scraper.js';
const result:ConsultaResultado={registros:[],arquivos:new Map(),erros:[]};
const reservation={id:1,escritorio_id:3,solicitada_por:7,token:'token',monitoramento:{nome:'Privado',cnpj_filtro:'12345678000199',categoria:'',uf:'DF',titulo:'',vigencia:'',tipos_json:['Convenção Coletiva','Acordo Coletivo']}};
function fixture(){
  const deps={abrir:vi.fn().mockResolvedValue({} as Sessao),consultar:vi.fn().mockResolvedValue(result),fechar:vi.fn().mockResolvedValue(undefined)};
  const sink=vi.fn().mockResolvedValue(undefined);
  return {deps,sink,work:criarTrabalhoColetaPostgres(sink,{},deps)};
}
it('usa somente filtros reservados, separa tipos e aguarda persistência antes da próxima consulta',async()=>{
  const {deps,sink,work}=fixture();
  await work(reservation,new AbortController().signal);
  expect(deps.consultar).toHaveBeenCalledTimes(2);expect(sink).toHaveBeenCalledTimes(2);
  const args=deps.consultar.mock.calls[0];
  expect(new URL(args[2],args[1]).toString()).toBe('https://mediador.trabalho.gov.br/sistemas/mediador/ConsultarInstColetivo');
  expect(args[3]).toMatchObject({name:'Privado',cnpj:'12345678000199',uf:'DF',tipo:'Convenção Coletiva'});
  expect(args[4]({})).toBe(false);
  expect(sink.mock.invocationCallOrder[0]).toBeLessThan(deps.consultar.mock.invocationCallOrder[1]);
  expect(deps.fechar).toHaveBeenCalledOnce();
});
it('fecha navegador e não persiste resultado parcial ou após cancelamento',async()=>{
  const first=fixture();first.deps.consultar.mockResolvedValue({...result,erros:['paginação incompleta']});
  await expect(first.work(reservation,new AbortController().signal)).rejects.toThrow('incompleta');
  expect(first.sink).not.toHaveBeenCalled();expect(first.deps.fechar).toHaveBeenCalledOnce();
  const second=fixture(),controller=new AbortController();
  second.deps.consultar.mockImplementation(async()=>{controller.abort();return result;});
  await expect(second.work(reservation,controller.signal)).rejects.toThrow();
  expect(second.sink).not.toHaveBeenCalled();expect(second.deps.fechar).toHaveBeenCalledOnce();
});
it('recusa configuração inválida e cancelamento prévio antes de abrir navegador',async()=>{
  const {deps,work}=fixture();
  await expect(work({...reservation,monitoramento:{...reservation.monitoramento,tipos_json:[]}},new AbortController().signal)).rejects.toThrow('inválidos');
  const controller=new AbortController();controller.abort();
  await expect(work(reservation,controller.signal)).rejects.toThrow();expect(deps.abrir).not.toHaveBeenCalled();
});
it('propaga falha de persistência e aguarda fechamento mesmo quando aborta durante abertura',async()=>{
  const first=fixture();first.sink.mockRejectedValue(new Error('storage'));
  await expect(first.work(reservation,new AbortController().signal)).rejects.toThrow('storage');expect(first.deps.fechar).toHaveBeenCalledOnce();
  const second=fixture(),controller=new AbortController();
  second.deps.abrir.mockImplementation(async()=>{controller.abort();return {} as Sessao;});
  await expect(second.work(reservation,controller.signal)).rejects.toThrow();
  expect(second.deps.consultar).not.toHaveBeenCalled();expect(second.deps.fechar).toHaveBeenCalledOnce();
});
it('não encerra o trabalho enquanto o fechamento iniciado por cancelamento estiver pendente',async()=>{
  const {deps,work}=fixture(),controller=new AbortController();
  let release!:()=>void,observed!:()=>void;
  const closing=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{observed=resolve;});
  deps.fechar.mockImplementation(()=>{observed();return closing;});
  deps.consultar.mockImplementation(async()=>{controller.abort();return result;});
  let settled=false;
  const running=work(reservation,controller.signal).catch(()=>{}).finally(()=>{settled=true;});
  await started;await Promise.resolve();expect(settled).toBe(false);
  release();await running;expect(settled).toBe(true);expect(deps.fechar).toHaveBeenCalledOnce();
});
it('habilita downloads somente quando a opção explícita estiver ativa',async()=>{
  const {deps,sink}=fixture();
  await criarTrabalhoColetaPostgres(sink,{baixarOriginais:true},deps)(reservation,new AbortController().signal);
  expect(deps.consultar.mock.calls[0][4]({})).toBe(true);
});

it('respeita o modo de janela do ambiente e a opção explícita de coleta',async()=>{
  const previous=env.headless;env.headless=false;
  try{
    const f=fixture();await f.work(reservation,new AbortController().signal);
    expect(f.deps.abrir).toHaveBeenCalledWith(false,undefined);
    expect(f.deps.consultar.mock.calls[0][5].headless).toBe(false);
    const work=criarTrabalhoColetaPostgres(f.sink,{headless:true},f.deps);await work(reservation,new AbortController().signal);
    expect(f.deps.abrir).toHaveBeenLastCalledWith(true,undefined);
  }finally{env.headless=previous;}
});
