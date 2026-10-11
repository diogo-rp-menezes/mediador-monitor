import {it,expect,vi,beforeEach} from 'vitest';
import type {Pool} from 'pg';
import {executarSolicitacaoMonitoramentoPostgres} from '../src/postgres-monitoring-executor.js';
import {reservarMonitoramentoPostgres,consultarCancelamentoMonitoramentoPostgres,concluirMonitoramentoPostgres} from '../src/postgres-monitoring-reservation.js';
import {ErroLimiteVolumeMonitoramento} from '../src/postgres-monitoring-limits.js';
vi.mock('../src/postgres-monitoring-reservation.js',()=>({reservarMonitoramentoPostgres:vi.fn(),consultarCancelamentoMonitoramentoPostgres:vi.fn(),concluirMonitoramentoPostgres:vi.fn()}));
const pool={} as Pool,reservation={id:1,escritorio_id:3,solicitada_por:7,token:'token',monitoramento:{}};
beforeEach(()=>{
  vi.mocked(reservarMonitoramentoPostgres).mockReset().mockResolvedValue(reservation);
  vi.mocked(consultarCancelamentoMonitoramentoPostgres).mockReset().mockResolvedValue(false);
  vi.mocked(concluirMonitoramentoPostgres).mockReset().mockResolvedValue(undefined);
});
it('conclui sucesso e registra falha sem propagar conteúdo de erro do trabalho',async()=>{
  await executarSolicitacaoMonitoramentoPostgres(pool,3,async()=>{});
  expect(concluirMonitoramentoPostgres).toHaveBeenLastCalledWith(pool,3,1,'token','concluida');
  await executarSolicitacaoMonitoramentoPostgres(pool,3,async()=>{throw new Error('segredo');});
  expect(concluirMonitoramentoPostgres).toHaveBeenLastCalledWith(pool,3,1,'token','falhou');
});
it('cancela antes de iniciar e não reserva após interrupção externa',async()=>{
  const work=vi.fn();vi.mocked(consultarCancelamentoMonitoramentoPostgres).mockResolvedValue(true);
  await executarSolicitacaoMonitoramentoPostgres(pool,3,work);expect(work).not.toHaveBeenCalled();
  const stop=new AbortController();stop.abort();vi.mocked(reservarMonitoramentoPostgres).mockClear();
  await executarSolicitacaoMonitoramentoPostgres(pool,3,work,{signal:stop.signal});expect(reservarMonitoramentoPostgres).not.toHaveBeenCalled();
});
it('aguarda encerramento do trabalho após sinal de cancelamento antes de concluir',async()=>{
  vi.mocked(consultarCancelamentoMonitoramentoPostgres).mockResolvedValueOnce(false).mockResolvedValue(true);
  let release!:()=>void;const settled=new Promise<void>(resolve=>{release=resolve;});
  let observed!:()=>void;const aborted=new Promise<void>(resolve=>{observed=resolve;});
  const run=executarSolicitacaoMonitoramentoPostgres(pool,3,async(_,signal)=>{
    signal.addEventListener('abort',observed,{once:true});await settled;
  },{intervalMs:10});
  await aborted;expect(concluirMonitoramentoPostgres).not.toHaveBeenCalled();
  release();await run;expect(concluirMonitoramentoPostgres).toHaveBeenCalledOnce();
});
it('não libera reserva após perda da conexão de validação',async()=>{
  vi.mocked(consultarCancelamentoMonitoramentoPostgres).mockRejectedValue(new Error('offline'));
  const work=vi.fn();await expect(executarSolicitacaoMonitoramentoPostgres(pool,3,work)).rejects.toThrow('recuperação administrativa');
  expect(work).not.toHaveBeenCalled();expect(concluirMonitoramentoPostgres).not.toHaveBeenCalled();
});
it('limite de duração sinaliza interrupção mas mantém reserva até o trabalho terminar',async()=>{
  let release!:()=>void,observed!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;}),aborted=new Promise<void>(resolve=>{observed=resolve;});
  const running=executarSolicitacaoMonitoramentoPostgres(pool,3,async(_,signal)=>{
    signal.addEventListener('abort',observed,{once:true});await pending;
  },{maxDurationMs:20});
  await aborted;expect(concluirMonitoramentoPostgres).not.toHaveBeenCalled();
  release();expect((await running).limite_duracao_excedido).toBe(true);
  expect(concluirMonitoramentoPostgres).toHaveBeenCalledWith(pool,3,1,'token','falhou','duracao_excedida');
});
it('limpa o temporizador após sucesso, sem abortar trabalho já encerrado',async()=>{
  let captured!:AbortSignal;
  await executarSolicitacaoMonitoramentoPostgres(pool,3,async(_,signal)=>{captured=signal;},{maxDurationMs:20});
  await new Promise(resolve=>setTimeout(resolve,30));expect(captured.aborted).toBe(false);
});
it('registra excesso de volume com motivo restrito sem expor conteúdo de erros',async()=>{
  await executarSolicitacaoMonitoramentoPostgres(pool,3,async()=>{throw new ErroLimiteVolumeMonitoramento();});
  expect(concluirMonitoramentoPostgres).toHaveBeenCalledWith(pool,3,1,'token','falhou','volume_excedido');
});
