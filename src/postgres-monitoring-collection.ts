import {limiteVolumeMonitoramentoBytes} from './postgres-monitoring-limits.js';
import type {Watch} from './config.js';
import {expandirTipos} from './instrumentos.js';
import {abrirSessao,consultarSessao,fecharSessao,prepararFiltros,type ConsultaResultado} from './scraper.js';
import type {TrabalhoMonitoramento} from './postgres-monitoring-executor.js';
import type {Pool} from 'pg';
import {criarPersistenciaColetaPostgres} from './postgres-monitoring-persistence.js';
import {controlarDownloadsChromium} from './chromium-download-budget.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {configuracaoColeta} from './coleta-config.js';

type Reserva=Parameters<TrabalhoMonitoramento>[0];
type Dependencies={abrir:typeof abrirSessao;consultar:typeof consultarSessao;fechar:typeof fecharSessao;controlar?:typeof controlarDownloadsChromium};
/** PostgreSQL collection path; not yet an operational consumer. */
export function criarTrabalhoColetaComPersistenciaPostgres(pool:Pool,options:{headless?:boolean;log?:(message:string)=>void;baixarOriginais?:boolean}={}){
  const persist=criarPersistenciaColetaPostgres(pool);
  return criarTrabalhoColetaPostgres(async(...args)=>{await persist(...args);},{...options,baixarOriginais:options.baixarOriginais??true});
}
/** The sink is required: collection cannot report success while discarding its results. */
export function criarTrabalhoColetaPostgres(
  persistir:(reserva:Reserva,watch:Watch,result:ConsultaResultado,signal:AbortSignal)=>Promise<void>,
  options:{headless?:boolean;log?:(message:string)=>void;baixarOriginais?:boolean}={},
  dependencies:Dependencies={abrir:abrirSessao,consultar:consultarSessao,fechar:fecharSessao,controlar:controlarDownloadsChromium}
):TrabalhoMonitoramento{
  return async(reserva,signal)=>{
    signal.throwIfAborted();
    const settings=configuracaoColeta(),headless=options.headless??settings.headless;
    const downloadBudget={remaining:Math.min(limiteVolumeMonitoramentoBytes(reserva.escritorio_id),reserva.limites?reserva.limites.volume_mib*1048576:Infinity)};
    const monitor=reserva.monitoramento;
    if(!Array.isArray(monitor.tipos_json)||!monitor.tipos_json.length||monitor.tipos_json.some((tipo:unknown)=>typeof tipo!=='string'))
      throw new Error('Tipos do monitoramento inválidos.');
    const watch:Watch={name:monitor.nome,cnpj:monitor.cnpj_filtro,categoria:monitor.categoria,
      uf:monitor.uf,titulo:monitor.titulo,vigencia:monitor.vigencia,tipo:monitor.tipos_json[0],tipos:monitor.tipos_json};
    const watches=expandirTipos(watch);
    watches.forEach(prepararFiltros);
    const tempRoot=resolve(tmpdir()),downloadPath=options.baixarOriginais?await mkdtemp(join(tempRoot,'mediador-transfer-')):undefined;
    const clean=async()=>{
      if(downloadPath){
        if(!resolve(downloadPath).startsWith(tempRoot+sep+'mediador-transfer-'))throw new Error('Pasta de transferência inválida.');
        await rm(downloadPath,{recursive:true,force:true});
      }
    };
    let session:Awaited<ReturnType<typeof abrirSessao>>;
    try{session=await dependencies.abrir(headless,downloadPath);}catch(error){await clean();throw error;}
    let transfer:Awaited<ReturnType<typeof controlarDownloadsChromium>>|undefined;
    let closing:Promise<void>|undefined;
    const close=()=>closing??=dependencies.fechar(session,options.log);
    const abort=()=>{void close().catch(()=>{});};
    signal.addEventListener('abort',abort,{once:true});
    try{
      signal.throwIfAborted();
      if(downloadPath&&dependencies.controlar)transfer=await dependencies.controlar(session,downloadPath,downloadBudget.remaining,abort);
      for(const query of watches){
        signal.throwIfAborted();
        transfer?.conferir();
        // Public endpoint is fixed; office configuration supplies only query filters.
        const result=await dependencies.consultar(session,'https://mediador.trabalho.gov.br/','/sistemas/mediador/ConsultarInstColetivo',query,()=>options.baixarOriginais===true,
          {signal,headless,log:options.log,diagnostics:false,downloadBudget:options.baixarOriginais?downloadBudget:undefined});
        signal.throwIfAborted();
        if(result.erros.length)throw new Error('Consulta MTE incompleta; execução não concluída.');
        await persistir(reserva,query,result,signal);
      }
    }catch(error){transfer?.conferir();throw error;}finally{
      signal.removeEventListener('abort',abort);
      try{await close();}finally{try{await transfer?.encerrar();}finally{await clean();}}
    }
  };
}


