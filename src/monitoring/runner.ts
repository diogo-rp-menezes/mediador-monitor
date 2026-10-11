import { loadWatchConfig, env } from '../config.js';
import {exigirSqliteOperacional} from '../sqlite-cutover-lock.js';
import { openDb, existe, precisaDownload, filtrarNovos, upsertRegistro, salvarArquivo, registrarFalhaDownload, atualizarArquivoEExtracao, iniciarAnalise, falharAnalise, marcarNotificado, registrarExecucao, watchesDeSindicatos, lerLlm, type Db } from '../db.js';
import { abrirSessao, consultarSessao, fecharSessao, type ScraperOptions } from '../scraper.js';
import { lerDocumento, extrairCabecalho } from '../documento.js';
import { extrairClausulas } from '../extract.js';
import { notificar, type NovoEvento } from '../notify.js';
import type { Extracao } from '../types.js';
import { expandirTipos } from '../instrumentos.js';
import { consolidarCct } from '../consolidacao.js';
import { indexarVinculo, resolverReferenciasPendentes, ehAditivoCct } from '../vinculos.js';
import { extrairAlteracoesAditivo } from '../consolidacao.js';
import { registrarSindicatoDocumento, indexarMetaDocumento, descobrirDocumentosClientes } from '../cadastros.js';
import { prepararEnvios, processarFila } from '../envios.js';

export interface RunOptions {
  dryRun?: boolean;
  seed?: boolean;
  signal?: AbortSignal;
  headless?: boolean;
  onLog?: (message: string) => void;
  db?: Db;
}

export async function executarMonitor(opt: RunOptions = {}) {
  exigirSqliteOperacional(opt.db?.name??env.dbPath);
  const log = opt.onLog ?? console.log;
  const cfg = loadWatchConfig();
  const db = opt.db ?? openDb(env.dbPath);
  // Consultas independentes por instrumento: o select do Mediador não é multiselect.
  // Registro/arquivo continuam únicos por numero_registro no SQLite.
  const watches = [...cfg.watches, ...watchesDeSindicatos(db)].flatMap(expandirTipos);
  if (watches.length === 0) { log('Nenhuma consulta. Cadastre um sindicato.'); return { consultas: 0, novos: 0, downloads: 0, falhas: 0 }; }
  const llm = lerLlm(db);
  const eventos: NovoEvento[] = [];
  let falhas = 0, novosTotais = 0, downloads = 0;
  const modoHeadless = opt.headless ?? env.headless;
  log(`Iniciando Playwright em modo ${modoHeadless ? 'sem janela (headless)' : 'visível'}, sem pausas manuais.`);
  const sessao = await abrirSessao(modoHeadless);
  // Uma interrupção fecha o contexto e cancela operações Playwright pendentes.
  const onAbort = () => { void sessao.context.close().catch(() => {}); };
  opt.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (opt.signal?.aborted) onAbort();
    for (const watch of watches) {
      if (opt.signal?.aborted) { log('Execução interrompida pelo usuário.'); falhas++; break; }
      try {
        log(`[${watch.name}] Consultando tipo: ${watch.tipo}.`);
        const result = await consultarSessao(sessao, cfg.baseUrl, cfg.searchPath, watch,
          r => !opt.dryRun && !opt.seed && precisaDownload(db, r.numeroRegistro),
          { signal: opt.signal, log, diagnostics: false });
        const novos = filtrarNovos(db, result.registros);
        novosTotais += novos.length;
        log(`[${watch.name}] ${result.registros.length} encontrado(s), ${novos.length} novo(s), ${result.arquivos.size} download(s).`);
        if (!opt.dryRun) {
          for (const r of result.registros) {
            const primeiraVez = !existe(db, r.numeroRegistro);
            upsertRegistro(db, watch.name, r);
            if(watch.sindicatoId) registrarSindicatoDocumento(db,r.numeroRegistro,watch.sindicatoId);
            if (opt.seed) { marcarNotificado(db, r.numeroRegistro); continue; }
            const arquivo = result.arquivos.get(r.numeroRegistro);
            if (arquivo) {
              salvarArquivo(db, r.numeroRegistro, arquivo);
              downloads++;
              try {
                const texto = await lerDocumento(arquivo.path);
                const cab = extrairCabecalho(texto);
                if (cab.numeroRegistro && cab.numeroRegistro !== r.numeroRegistro) throw new Error('Número do registro não confere com o documento.');
                indexarMetaDocumento(db,r.numeroRegistro,texto);
                const vinculo = indexarVinculo(db,r.numeroRegistro,texto);
                if(vinculo) log(`[${r.numeroRegistro}] Vínculo CCT: ${vinculo.status} ${vinculo.base_registro??vinculo.referencia_registro??'—'}`);
                resolverReferenciasPendentes(db);
                let extracao: Extracao | null = null;
                if (llm.ativo) {
                  if (iniciarAnalise(db, r.numeroRegistro)) {
                    try {
                      extracao = ehAditivoCct(r.tipo)
                        ? {topicos:{},aditivo:{versao:'1.0',alteracoes:await extrairAlteracoesAditivo(texto,llm)}}
                        : await extrairClausulas(texto, llm, { vigencia: r.vigencia });
                      if (!extracao) throw new Error('O LLM não retornou análise.');
                      atualizarArquivoEExtracao(db, r.numeroRegistro, arquivo.path, extracao);
                    } catch (e) {
                      falharAnalise(db, r.numeroRegistro, (e as Error).message);
                      log(`[${r.numeroRegistro}] Análise falhou: ${(e as Error).message}`);
                    }
                  } else log(`[${r.numeroRegistro}] Análise já em andamento; aguardando conclusão.`);
                }
                // Só envia alerta para instrumentos novos, e somente quando houver documento verificável.
                if (primeiraVez) eventos.push({ watch: watch.name, registro: r, cabecalho: cab, extracao });
              } catch(e) { log(`[${r.numeroRegistro}] Leitura falhou: ${(e as Error).message}`); if (primeiraVez) eventos.push({watch: watch.name, registro:r, cabecalho:null, extracao:null}); }
            }
          }
          for (const erro of result.erros) {
            log('Falha: ' + erro); falhas++;
            const numero = erro.match(/^[A-Z]{2}\d{6}\/\d{4}/)?.[0];
            if (numero && existe(db, numero)) registrarFalhaDownload(db, numero, erro);
          }
        }
        registrarExecucao(db, watch.name, result.registros.length, novos.length, result.erros.length ? result.erros.join('; ') : undefined, watch.tipo);
      } catch (e) {
        const msg = (e as Error).message;
        registrarExecucao(db, watch.name, 0, 0, msg, watch.tipo);
        log(`[${watch.name}] Erro: ${msg}`);
        falhas++;
        if (opt.signal?.aborted) { log('Execução interrompida pelo usuário.'); break; }
        if (/Cloudflare|verificação humana|verificacao humana/i.test(msg)) {
          log('Verificação de segurança exigida pelo MTE. Encerrando esta rodada sem novas tentativas automáticas.');
          break;
        }
      }
    }
  } finally {
    opt.signal?.removeEventListener('abort', onAbort);
    await fecharSessao(sessao, log);
  }
  if (opt.signal?.aborted) { log('Monitoramento cancelado; nenhuma nova ação será iniciada.'); return {consultas:watches.length,novos:novosTotais,downloads,falhas:falhas || 1}; }
  // A CCT e o(s) aditivo(s) permanecem analisados isoladamente; a visão
  // consolidada é uma terceira entidade, com histórico e fontes identificadas.
  if(!opt.dryRun && !opt.seed && llm.ativo) {
    const prontas=db.prepare(`SELECT DISTINCT v.base_registro numero FROM vinculos_aditivos v
      JOIN registros b ON b.numero_registro=v.base_registro
      JOIN registros a ON a.numero_registro=v.aditivo_registro
      LEFT JOIN consolidacoes_cct c ON c.base_registro=v.base_registro
      WHERE v.status IN ('automatico','confirmado') AND v.base_registro IS NOT NULL
      AND b.arquivo_path IS NOT NULL AND a.arquivo_path IS NOT NULL
      AND (c.base_registro IS NULL OR c.status IN ('desatualizado','sem_analise'))`).all() as {numero:string}[];
    for(const item of prontas) {
      try {await consolidarCct(db,item.numero);log(`[${item.numero}] Análise consolidada atualizada.`);}
      catch(e){log(`[${item.numero}] Consolidação pendente: ${(e as Error).message}`);falhas++;}
    }
  }
  if(!opt.dryRun&&!opt.seed) {
    try {descobrirDocumentosClientes(db);const preparacao=await prepararEnvios(db);const envio=await processarFila(db);
      log(`[Clientes] ${preparacao.preparados} prévia(s), ${envio.enviados} envio(s) aceito(s) pelo SMTP.`);falhas+=envio.falhas;
    } catch(e) {falhas++;log(`[Clientes] ${(e as Error).message}`);}
  }
  if (eventos.length) {
    try { exigirSqliteOperacional(db.name);const delivered = await notificar(eventos, db); if (delivered) for (const e of eventos) marcarNotificado(db, e.registro.numeroRegistro); }
    catch(e) { falhas++; log(`Não foi possível notificar: ${(e as Error).message}`); }
  }
  log(`Concluído: ${novosTotais} registro(s) novo(s), ${downloads} download(s), ${falhas} ocorrência(s) para revisão.`);
  return { consultas: watches.length, novos: novosTotais, downloads, falhas };
}
