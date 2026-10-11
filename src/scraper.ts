import {copiarDownloadLimitado} from './bounded-download.js';
import {ErroLimiteVolumeMonitoramento} from './postgres-monitoring-limits.js';
import {randomUUID} from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Download, type Frame, type Locator, type Page } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { env, type Watch } from "./config.js";
import { valorMte } from "./instrumentos.js";
import { parseCabecalhoResultado, parseResultados } from "./parser.js";
import { domInventoryScript } from "./browserScripts.js";
import { detectarFormato, lerDocumento, extrairCabecalho } from "./documento.js";
import type { Registro } from "./types.js";

export type Root = Page | Frame;
export interface ConsultaResultado { registros: Registro[]; arquivos: Map<string, ArquivoCapturado>; erros: string[]; }
export interface ArquivoCapturado { path: string; hash: string; bytes: number; original: string; }
export interface Sessao { browser: Browser; context: BrowserContext; page: Page; }
export interface ScraperOptions { signal?: AbortSignal; log?: (message: string) => void; diagnostics?: boolean; headless?: boolean; downloadBudget?: {remaining:number}; }
const URL_MTE = 'https://mediador.trabalho.gov.br/';
const RESULTADO = /Resultado\s*:\s*\d+|Instrumento\(s\)\s+Coletivo\(s\)\s+Encontrado|nenhum\s+(?:instrumento|registro|resultado)|n[aã]o\s+foram\s+encontrados/i;
const NOME = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90);
const logDefault = (m: string) => console.log('[MTE] ' + m);

export async function abrirSessao(headless = false, downloadsPath?:string): Promise<Sessao> {
  const browser = await chromium.launch({ headless, downloadsPath, channel: env.browserChannel || undefined });
  try {
    const context = await browser.newContext({ acceptDownloads: true, locale: 'pt-BR', viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(env.timeoutMs);
      return { browser, context, page };
    } catch (e) { await context.close().catch(() => {}); throw e; }
  } catch (e) { await browser.close().catch(() => {}); throw e; }
}

async function diagnostico(root: Root, nome: string) {
  const dir = join('data', 'debug');
  mkdirSync(dir, { recursive: true });
  const prefix = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${NOME(nome)}`);
  await Promise.allSettled([
    root.content().then(s => writeFileSync(prefix + '.html', s)),
    ('page' in root ? root.page() : root).screenshot({ path: prefix + '.png', fullPage: true }),
    root.evaluate(domInventoryScript).then(obj => writeFileSync(prefix + '.json', JSON.stringify(obj, null, 2)))
  ]);
}

function assertAtivo(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Monitoramento interrompido pelo usuário.');
}

async function registrarEtapa(root: Root, opt: ScraperOptions, stage: string, message: string) {
  assertAtivo(opt.signal);
  opt.log?.(`${stage}: ${message}`);
  // Etapas são apenas informativas: não existe qualquer confirmação humana.
  // Capturas por etapa são opcionais; falhas sempre tentam salvar diagnóstico.
  if (opt.diagnostics === true) await diagnostico(root, stage);
}

async function aguardarLiberacao(page: Page, log: (m: string) => void, signal?: AbortSignal) {
  // Não contorna Cloudflare/reCAPTCHA. Falha explícita e rápida quando um desafio requer pessoa.
  const until = Date.now() + Math.max(12000, env.timeoutMs);
  let avisoCarregamento = false;
  while (Date.now() < until) {
    assertAtivo(signal);
    if (page.isClosed()) throw new Error('Janela do MTE foi fechada durante a abertura.');
    const url = page.url();
    const title = await page.title().catch(() => '');
    const body = await page.locator('body').innerText({ timeout: 2500 }).catch(() => '');
    // Nunca resolva ou contorne desafios do Cloudflare; aguarde intervenção humana.
    const bloqueio = /um momento|just a moment|verifica[cç][aã]o de seguran[cç]a|security verification|confirme que .{0,30}humano|verify you are human/i
      .test((title + ' ' + body.slice(0, 3500)).toLowerCase()) || url.includes('/cdn-cgi/challenge');
    if (bloqueio) {
      throw new Error('MTE solicitou verificação humana (Cloudflare). Consulta automática interrompida sem contornar a segurança. Configure navegador visível e consulte manualmente se necessário.');
    } else {
      const form = page.locator('#chkNRCNPJ');
      const tipo = page.locator('#cboTPRequerimento');
      const vigencia = page.locator('#cboSTVigencia');
      const uf = page.locator('#cboUFRegistro');
      if (await form.isVisible().catch(() => false) &&
          await tipo.isVisible().catch(() => false) &&
          await vigencia.isVisible().catch(() => false) &&
          await uf.isVisible().catch(() => false)) {
        log('Formulário confirmado pelos IDs originais do Mediador.');
        return;
      }
      if (!avisoCarregamento) { log('Aguardando carregamento do formulário oficial do Mediador.'); avisoCarregamento = true; }
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('Formulário do Mediador indisponível dentro do prazo. Consulte data/debug/.');
}

/** Seletores confirmados nos HTMLs de diagnóstico reais do Mediador (07/10/2026).
 * Evita descobrir inputs por texto e escolher o elemento errado ou readonly.
 */
async function campo(root: Root, id: string): Promise<Locator> {
  const locator = root.locator('#' + id);
  await locator.waitFor({ state: 'visible', timeout: env.formTimeoutMs });
  if (await locator.count() !== 1) throw new Error(`Esperava um único #${id} no formulário.`);
  return locator;
}

function somenteDigitos(s: string) { return s.replace(/\D/g, ''); }

async function habilitarEPreencher(root: Root, checkboxId: string, fieldId: string, value: string, cnpj = false) {
  if (!value.trim()) return;
  const checkbox = await campo(root, checkboxId);
  const input = await campo(root, fieldId);
  await checkbox.check({ timeout: env.formTimeoutMs });
  // O portal inicia os campos bloqueados e HabilitarCampo(n) remove readonly.
  if (await input.getAttribute('readonly') !== null) throw new Error(`#${checkboxId} não habilitou #${fieldId}: campo continua readonly.`);
  const esperado = cnpj ? somenteDigitos(value) : value.trim();
  if (cnpj && esperado.length !== 14) throw new Error('CNPJ cadastrado deve conter exatamente 14 dígitos.');
  await input.fill(cnpj ? esperado : value.trim());
  await input.press('Tab');
  let atual = await input.inputValue();
  const confere = (s: string) => (cnpj ? somenteDigitos(s) : s.trim()) === esperado;
  if (!confere(atual)) {
    await input.fill('');
    await input.pressSequentially(cnpj ? esperado : value.trim(), { delay: 45 });
    await input.press('Tab');
    atual = await input.inputValue();
  }
  if (!confere(atual) || !(await checkbox.isChecked())) {
    throw new Error(`#${fieldId} não foi preenchido corretamente: valor observado \"${atual}\".`);
  }
}

async function selecionarPorValor(root: Root, id: string, valor: string, nome: string) {
  const select = await campo(root, id);
  const disponiveis = await select.locator('option').allTextContents();
  try { await select.selectOption({ value: valor }, { timeout: env.formTimeoutMs }); }
  catch { throw new Error(`Não consegui selecionar ${nome} (${valor}) em #${id}. Opções: ${disponiveis.join('; ')}`); }
  if (await select.inputValue() !== valor) throw new Error(`Seleção ${nome} não persistiu em #${id}.`);
}

export function prepararFiltros(w: Watch) {
  const cnpj = w.cnpj.trim();
  const categoria = w.categoria.trim();
  const titulo = w.titulo.trim();
  if (!cnpj && !categoria && !titulo) {
    throw new Error(`Sindicato ${w.name} está sem CNPJ, categoria ou palavra do título. Configure pelo menos um filtro de identificação antes de monitorar.`);
  }
  // A UI é multisseleção, mas cada consulta do Mediador aceita um só tipo.
  // O runner expande em consultas individuais antes de chamar o scraper.
  const tipo = valorMte(w.tipo || 'Convenção Coletiva');
  const vigenciaTexto = (w.vigencia || 'Vigentes').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const vigMap: Record<string, string> = { vigentes: '1', vigente: '1', todos: '2', 'nao vigentes': '0', 'nao vigente': '0', '1': '1', '2': '2', '0': '0' };
  const vigencia = vigMap[vigenciaTexto];
  if (vigencia === undefined) throw new Error(`Vigência inválida no cadastro: ${w.vigencia}. Use Vigentes, Todos ou Não Vigentes.`);
  const uf = w.uf.trim().toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) throw new Error(`UF inválida no cadastro: ${w.uf}`);
  return { cnpj, categoria, titulo, tipo, vigencia, uf };
}

async function preencher(root: Root, w: Watch, log: (m: string) => void) {
  const f = prepararFiltros(w);
  log(`[${w.name}] Iniciando preenchimento confirmado por ID. Identificação: ${f.cnpj ? 'CNPJ' : f.categoria ? 'Categoria' : 'Palavra do Título'}.`);
  if (f.cnpj) { await habilitarEPreencher(root, 'chkNRCNPJ', 'txtNRCNPJ', f.cnpj, true); log(`[${w.name}] CNPJ marcado e conferido.`); }
  if (f.categoria) { await habilitarEPreencher(root, 'chkCategoria', 'txtDSCategoria', f.categoria); log(`[${w.name}] Categoria marcada e conferida.`); }
  await selecionarPorValor(root, 'cboTPRequerimento', f.tipo, 'Tipo do Instrumento');
  log(`[${w.name}] Tipo selecionado: ${f.tipo || 'Todos os Tipos'}.`);
  await selecionarPorValor(root, 'cboSTVigencia', f.vigencia, 'Vigência');
  log(`[${w.name}] Vigência selecionada: ${f.vigencia === '1' ? 'Vigentes' : f.vigencia === '2' ? 'Todos' : 'Não Vigentes'}.`);
  if (f.uf) { await selecionarPorValor(root, 'cboUFRegistro', f.uf, 'UF de Registro'); log(`[${w.name}] UF selecionada: ${f.uf}.`); }
  if (f.titulo) {
    const input = await campo(root, 'txtNOTituloClausula');
    await input.fill(f.titulo);
    if ((await input.inputValue()).trim() !== f.titulo) throw new Error('Palavra do Título não foi preenchida corretamente.');
    log(`[${w.name}] Palavra do título conferida.`);
  }
  // Evita um falso sucesso: o estado deve estar presente antes da pausa supervisionada.
  if (f.cnpj && somenteDigitos(await (await campo(root, 'txtNRCNPJ')).inputValue()) !== somenteDigitos(f.cnpj)) throw new Error('CNPJ foi perdido após selecionar filtros.');
  if (await (await campo(root, 'cboTPRequerimento')).inputValue() !== f.tipo) throw new Error('Tipo foi perdido após preencher o formulário.');
  if (await (await campo(root, 'cboSTVigencia')).inputValue() !== f.vigencia) throw new Error('Vigência foi perdida após preencher o formulário.');
  if (f.uf && await (await campo(root, 'cboUFRegistro')).inputValue() !== f.uf) throw new Error('UF foi perdida após preencher o formulário.');
  log(`[${w.name}] Formulário preenchido e validado; pesquisa seguirá automaticamente.`);
}

async function encontrarResultados(ctx: BrowserContext, prazo = 45000, signal?: AbortSignal): Promise<Root> {
  const deadline = Date.now() + prazo;
  while (Date.now() < deadline) {
    assertAtivo(signal);
    for (const page of ctx.pages().filter(p => !p.isClosed())) {
      const roots: Root[] = [page, ...page.frames().filter(f => f !== page.mainFrame())];
      for (const root of roots) {
        const txt = await root.locator('body').innerText({ timeout: 1500 }).catch(() => '');
        if (RESULTADO.test(txt)) return root;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error('A janela de resultados não apareceu no prazo. Consulte os diagnósticos.');
}

async function encontrarDownload(root: Root, reg: Registro, totalReg: number): Promise<Locator | null> {
  const links = root.locator('a:has-text("Download"),button:has-text("Download"),input[value*="Download" i],[role=button]:has-text("Download")');
  const qtd = await links.count();
  if (qtd === totalReg && reg.indice < qtd) return links.nth(reg.indice);
  // Se o layout divergir, busque ancestral com número do registro, nunca clique por posição duvidosa.
  for (let i = 0; i < qtd; i++) {
    const link = links.nth(i);
    const ancestor = await link.locator('xpath=ancestor::*[.//*[contains(text(), "Nº do Registro")]][1]').innerText().catch(() => '');
    if (ancestor.includes(reg.numeroRegistro) && (ancestor.match(/[A-Z]{2}\d{6}\/\d{4}/g) ?? []).length === 1) return link;
  }
  return null;
}

async function capturarDownload(context: BrowserContext, link: Locator): Promise<Download> {
  const pages = new Set<Page>();
  let resolver!: (d: Download) => void;
  const promise = new Promise<Download>(r => resolver = r);
  const onDownload = (d: Download) => resolver(d);
  const observar = (p: Page) => { if (!pages.has(p)) { pages.add(p); p.on('download', onDownload); } };
  context.pages().forEach(observar);
  context.on('page', observar);
  try {
    await link.click({ noWaitAfter: true });
    const timeout = Math.max(2000, Math.min(env.timeoutMs, 20000));
    return await Promise.race([promise, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Clique não produziu download.')), timeout))]);
  } finally {
    context.off('page', observar);
    for (const p of pages) p.off('download', onDownload);
  }
}

async function salvarArquivo(d: Download, registro: Registro, opts:ScraperOptions): Promise<ArquivoCapturado> {
  mkdirSync(env.downloadDir, { recursive: true });
  const temporary = join(env.downloadDir, `.tmp-${randomUUID()}-${NOME(registro.numeroRegistro)}`);
  if(opts.downloadBudget){
    const stream=await d.createReadStream();if(!stream)throw new Error('Download indisponível.');
    try{opts.downloadBudget.remaining-=await copiarDownloadLimitado(stream,temporary,Math.min(50*1024*1024,opts.downloadBudget.remaining),opts.signal);}
    catch(error){await d.cancel().catch(()=>{});throw error;}
    finally{await d.delete().catch(()=>{});}
  }else await d.saveAs(temporary);
  const buffer = readFileSync(temporary);
  const formato = detectarFormato(buffer);
  if (formato === 'desconhecido') { unlinkSync(temporary); throw new Error('Resposta não é PDF/Word/HTML reconhecível.'); }
  const extension = formato === 'pdf' ? '.pdf' : '.doc';
  const hash = createHash('sha256').update(buffer).digest('hex');
  const original = basename(d.suggestedFilename()).replace(/[^a-zA-Z0-9._-]/g, '_');
  const destino = join(env.downloadDir, `${NOME(registro.numeroRegistro)}-${hash.slice(0, 12)}${extension}`);
  // Confere o registro ANTES de persistir e impede associar DOC de outro sindicato.
  try {
    const text = await lerDocumento(temporary);
    const head = extrairCabecalho(text);
    if (head.numeroRegistro && head.numeroRegistro !== registro.numeroRegistro) {
      throw new Error(`Arquivo informa ${head.numeroRegistro}, mas registro esperado é ${registro.numeroRegistro}`);
    }
  } catch (e) { unlinkSync(temporary); throw e; }
  renameSync(temporary, destino);
  return { path: destino, hash, bytes: buffer.length, original };
}

/** Usa um único navegador, janela(s) do MTE e downloads do contexto para cada sindicato. */
export async function consultarSessao(
  sessao: Sessao, baseUrl: string, searchPath: string, watch: Watch,
  deveBaixar: (reg: Registro) => boolean, opts: ScraperOptions = {}
): Promise<ConsultaResultado> {
  const log = opts.log ?? logDefault;
  const arquivos = new Map<string, ArquivoCapturado>();
  const erros: string[] = [];
  const registros: Registro[] = [];
  let ultimoRoot: Root = sessao.page;
  try {
    assertAtivo(opts.signal);
    // Impede confundir um popup de resultados de outro tipo com a pesquisa atual.
    for (const janela of sessao.context.pages()) {
      if (janela !== sessao.page && !janela.isClosed()) await janela.close().catch(() => {});
    }
    log(`[${watch.name}] Abrindo formulário (${watch.tipo || 'Convenção Coletiva'}).`);
    await sessao.page.goto(new URL(searchPath, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await aguardarLiberacao(sessao.page, log, opts.signal);
    await preencher(sessao.page, watch, log);
    await registrarEtapa(sessao.page, opts, 'Filtros verificados', `Todos os filtros de ${watch.name} foram preenchidos e conferidos.`);
    const pesquisa = await campo(sessao.page, 'btnPesquisar');
    log(`[${watch.name}] Clicando em Pesquisar (#btnPesquisar); aguardando tela de resultados.`);
    await pesquisa.click({ noWaitAfter: true });
    ultimoRoot = await encontrarResultados(sessao.context, env.timeoutMs, opts.signal);
    let pageNumber = 1;
    const seen = new Set<string>();
    while (pageNumber <= Math.min(50, Math.max(1, env.maxPages))) {
      assertAtivo(opts.signal);
      const html = await ultimoRoot.content();
      const cab = parseCabecalhoResultado(html);
      const dessaPagina = parseResultados(html);
      if (cab && cab.total > 0 && dessaPagina.length === 0) throw new Error(`Portal indica ${cab.total} registros, parser não localizou nenhum. Consulte data/debug.`);
      await registrarEtapa(ultimoRoot, opts, `Resultados página ${pageNumber}`, `${dessaPagina.length} registro(s) encontrado(s); iniciando downloads elegíveis.`);
      for (const reg of dessaPagina) {
        assertAtivo(opts.signal);
        if (seen.has(reg.numeroRegistro)) continue;
        seen.add(reg.numeroRegistro);
        registros.push(reg);
        if (!deveBaixar(reg)) continue;
        const link = await encontrarDownload(ultimoRoot, reg, dessaPagina.length);
        if (!link) { erros.push(`${reg.numeroRegistro}: download não identificado com segurança`); continue; }
        log(`[${reg.numeroRegistro}] Solicitando download automaticamente.`);
        try {
          const d = await capturarDownload(sessao.context, link);
          const arquivo = await salvarArquivo(d, reg, opts);
          arquivos.set(reg.numeroRegistro, arquivo);
          log(`[${reg.numeroRegistro}] Arquivo salvo: ${arquivo.path} (${arquivo.bytes} bytes; SHA-256 ${arquivo.hash.slice(0, 12)}…).`);
        } catch (e) {
          if(e instanceof ErroLimiteVolumeMonitoramento||opts.signal?.aborted)throw e;
          erros.push(`${reg.numeroRegistro}: ${(e as Error).message}`);
          if (opts.diagnostics !== false) await diagnostico(ultimoRoot, `falha-download-${reg.numeroRegistro}`);
        }
      }
      if (!cab || pageNumber >= cab.totalPaginas) break;
      pageNumber++;
      const prox = ultimoRoot.locator('a', { hasText: new RegExp(`^\\s*${pageNumber}\\s*$`) }).first();
      if (!await prox.count()) { erros.push(`Não encontrei paginação para página ${pageNumber}`); break; }
      await prox.click({ noWaitAfter: true });
      ultimoRoot = await encontrarResultados(sessao.context, env.timeoutMs, opts.signal);
    }
    return { registros, arquivos, erros };
  } catch (e) {
    await diagnostico(ultimoRoot, `erro-${watch.name}`).catch(() => {});
    throw e;
  }
}

/** Fecha todas as abas próprias do monitor, o contexto isolado e o processo do browser.
 * Sempre chamar num bloco finally — nunca fecha abas do Chrome pessoal do usuário.
 */
export async function fecharSessao(s: Sessao, log: (m: string) => void = logDefault) {
  try {
    await s.context.close().catch(e => log(`Erro ao fechar guias: ${(e as Error).message}`));
  } finally {
    await s.browser.close().catch(e => log(`Erro ao encerrar navegador: ${(e as Error).message}`));
    log('Guias de consulta e navegador encerrados.');
  }
}


