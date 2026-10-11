import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import cron from 'node-cron';
import { executarMonitor } from './monitoring/runner.js';
import { z, ZodError } from "zod";
import { loadWatchConfig, env } from "./config.js";
import { TIPOS_VALIDOS, normalizarTipos } from "./instrumentos.js";
import { openDb, listarSindicatos, criarSindicato, atualizarSindicato, removerSindicato, watchesDeSindicatos, lerLlm, salvarLlm, importarLegado } from "./db.js";
import { testarLlm, normalizarExtracao, paraVisao } from "./extract.js";
import { renderizarCctMarkdown } from "./cct-template.js";
import { reanalisar } from "./reanalisar.js";
import { indexarArquivosExistentes, definirVinculo, rejeitarVinculo, ehCct } from './vinculos.js';
import { consolidarCct, lerConsolidacao, renderizarConsolidadoMarkdown, validarProntidao } from './consolidacao.js';
import { reservarSugestao, solicitarSugestao, salvarDecisao, historicoRevisao } from './revisoes.js';
import { lerAgendamento, salvarAgendamento, lerNavegador, salvarNavegador, lerNotificacoes, salvarNotificacoes, resolverNotificacoes, vistaNotificacoes, type NotificationInput } from './settings.js';
import { testarSlack, testarEmail, criarTransporteEmail } from './notify.js';
import { ErroCadastro, indexarMetaDocumento } from './cadastros.js';
import { tratarClientes } from './clientes-api.js';
import { tratarCadastrosContexto } from './cadastros-contexto-api.js';
import { tratarGestaoContexto } from './gestao-contexto-api.js';
import { tratarInterpretacoesContexto } from './interpretacoes-contexto-api.js';
import { tratarEnviosContexto } from './envios-contexto-api.js';
import { prepararEnvios, processarFila, recuperarEnviosInterrompidos } from './envios.js';
import { lerDocumento } from './documento.js';
import { criarAcessoHttp } from './auth-http.js';
import { auditarSeguranca } from './autenticacao.js';
import { processarNotificacoesPublicacao, tratarPublicacoes } from './publicacoes.js';
import { criarPoolPostgresRuntime } from './postgres.js';
import { criarAcessoHttpPostgres } from './postgres-auth-http.js';
import {criarEntregaRecuperacaoPostgres} from './postgres-recovery-mail.js';
import {comEscritorArquivosPostgres} from './postgres-backup-gate.js';
import { tratarGestaoPostgres } from './postgres-gestao-http.js';
import type { Pool } from 'pg';
import {exigirSqliteOperacional,ErroSqliteDesativado} from './sqlite-cutover-lock.js';

/** Painel local (somente 127.0.0.1). Lê o SQLite e dispara o mesmo CLI de sempre. */
const PORT = Number(process.env.UI_PORT || 3000);
const postgresEnabled = process.env.APP_POSTGRES_CONTEXT === '1';
// No SQLite connection, migrations or background jobs in PostgreSQL mode.
// Legacy handlers below are reachable only after the PostgreSQL route barrier.
const db = postgresEnabled ? null! : openDb(env.dbPath);
const publicUrl = process.env.AUTH_PUBLIC_URL || `http://localhost:${PORT}`;
const acesso = postgresEnabled ? null! : criarAcessoHttp(db, { publicUrl, enviarRecuperacao: async (destino, token) => {
  const cfg = lerNotificacoes(db);
  if (!cfg.email.ativo || !cfg.email.host || !cfg.email.from) throw new Error('Recuperação por e-mail indisponível.');
  const transporte = criarTransporteEmail(cfg);
  try {
    exigirSqliteOperacional(db.name);
    await transporte.sendMail({ from: cfg.email.from, to: destino, subject: '[Mediador Monitor] Recuperar acesso',
      text: `Use o link abaixo para definir uma nova senha. Ele expira em 30 minutos e pode ser usado uma única vez.\n\n${new URL('/login', publicUrl).href}#recuperar=${token}\n\nSe você não solicitou, ignore esta mensagem.` });
  } finally { transporte.close(); }
} });
// Rotas PostgreSQL estão em opt-in; o painel/monitor legado continua no SQLite.
const postgresPool: Pool | null = postgresEnabled ? criarPoolPostgresRuntime() : null;
const postgresAccess = postgresPool ? criarAcessoHttpPostgres(postgresPool, { publicUrl,enviarRecuperacao:criarEntregaRecuperacaoPostgres(publicUrl) }) : null;
const corpoPostgres = async (req: IncomingMessage) => {
  let s=''; let tamanho=0;
  for await (const chunk of req) { tamanho+=Buffer.byteLength(chunk); if(tamanho>1024*1024)throw new ErroCadastro('Conteúdo excede o limite permitido.',413); s+=chunk; }
  let data: unknown;
  try { data=s?JSON.parse(s):{}; } catch { throw new ErroCadastro('JSON inválido.',400); }
  return data;
};
if (!postgresEnabled) {
recuperarEnviosInterrompidos(db);
db.prepare("UPDATE notificacoes_publicacoes SET estado='incerto',erro='Servidor reiniciou durante o envio; confirme o provedor antes de repetir.' WHERE estado='enviando'").run();
const legado = importarLegado(db);
db.exec(`UPDATE consolidacoes_cct SET status='falhou',erro='Consolidação interrompida pelo reinício do servidor.',atualizado_em=datetime('now') WHERE status='consolidando'`);
db.exec(`UPDATE revisoes_pendencias SET sugestao_estado='falhou',sugestao_erro='Solicitação interrompida pelo reinício do servidor.' WHERE sugestao_estado='gerando'`);
if (legado.sindicatos || legado.registros) console.log('Importação SQLite anterior:', legado);
}
const requireSep = () => sep;
// Vínculos históricos são indexados em segundo plano, sem ignorar decisões manuais.
if (!postgresEnabled) void indexarArquivosExistentes(db).then(n=>{if(n)console.log(`[Vínculos] ${n} documento(s) indexado(s)`);}).catch(e=>console.error('[Vínculos]',e));
const html = () => readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
if (!postgresEnabled) void (async()=>{
  const docs=db.prepare('SELECT numero_registro,arquivo_path FROM registros WHERE documento_meta_json IS NULL AND arquivo_path IS NOT NULL').all() as {numero_registro:string;arquivo_path:string}[];
  for(const d of docs)try {if(existsSync(d.arquivo_path))indexarMetaDocumento(db,d.numero_registro,await lerDocumento(d.arquivo_path));}catch(e){console.warn('[Clientes]',(e as Error).message);}
})();
let filaRodando=false;
async function cicloEnvios(){
  if(filaRodando)return;filaRodando=true;
  try{await prepararEnvios(db);await processarFila(db);}catch(e){console.error('[Envios]',(e as Error).message);}finally{filaRodando=false;}
}
if (!postgresEnabled) {
  setInterval(()=>void cicloEnvios(),30000).unref();
  setInterval(()=>void processarNotificacoesPublicacao(db).catch(e=>console.error('[Publicações]',(e as Error).message)),30000).unref();
}

interface Job { modo: string; log: string[]; inicio: number; controller: AbortController; headless: boolean; }
let job: Job | null = null;
let ultimo: { modo: string; codigo: number | null; fim: number; log: string[] } | null = null;

function executar(modo: "check" | "dry-run" | "seed") {
  if (job) return false;
  const atual: Job = { modo, log: [], inicio: Date.now(), controller: new AbortController(), headless: lerNavegador(db).headless };
  job = atual;
  const log = (m: string) => { console.log(m); atual.log.push(`${new Date().toLocaleTimeString('pt-BR')} · ${m}`); if (atual.log.length > 400) atual.log.shift(); };
  void executarMonitor({ dryRun: modo === 'dry-run', seed: modo === 'seed', signal: atual.controller.signal, headless: atual.headless, onLog: log, db })
    .then(result => { ultimo = { modo, codigo: result.falhas ? 1 : 0, fim: Date.now(), log: atual.log.slice(-200) }; })
    .catch(e => { log(`Erro: ${(e as Error).message}`); ultimo = { modo, codigo: 1, fim: Date.now(), log: atual.log.slice(-200) }; })
    .finally(() => { if (job === atual) job = null; });
  return true;
}

// Agendamento é opt-in; execuções manuais e agendadas usam o mesmo fluxo autônomo.
let schedule: ReturnType<typeof cron.schedule> | null = null;
function aplicarAgendamento() {
  schedule?.stop(); schedule = null;
  const cfg = lerAgendamento(db);
  if (cfg.ativo && cron.validate(cfg.cron)) {
    schedule = cron.schedule(cfg.cron, () => {
      if (!job) executar('check');
    }, cfg.timezone === 'server' ? undefined : { timezone: cfg.timezone });
  }
  return cfg;
}
if (!postgresEnabled) aplicarAgendamento();

const q = (sql: string, ...p: unknown[]) => db.prepare(sql).all(...p);

const rotas: Record<string, () => unknown> = {
  "/api/resumo": () => ({
    total: (q("SELECT COUNT(*) n FROM registros")[0] as { n: number }).n,
    novos7d: (q("SELECT COUNT(*) n FROM registros WHERE primeira_vez >= datetime('now','-7 day')")[0] as { n: number }).n,
    pendentes: (q("SELECT COUNT(*) n FROM registros WHERE notificado = 0")[0] as { n: number }).n,
    ultimaExecucao: q("SELECT iniciada_em, erro FROM execucoes ORDER BY id DESC LIMIT 1")[0] ?? null
  }),
  "/api/registros": () =>
    q(`SELECT numero_registro, numero_solicitacao, watch, tipo, vigencia, partes, notificado, primeira_vez, extracao_json, arquivo_path, arquivo_hash, download_erro, analise_status, analise_erro, analise_iniciada_em, analise_concluida_em
       FROM registros ORDER BY primeira_vez DESC, numero_registro DESC LIMIT 500`).map((r: any) => ({
      ...r,
      extracao: paraVisao(normalizarExtracao(r.extracao_json ? JSON.parse(r.extracao_json) : null)),
      vinculo: q('SELECT * FROM vinculos_aditivos WHERE aditivo_registro=?',r.numero_registro)[0] ?? null,
      aditivos: ehCct(r.tipo) ? q(`SELECT v.aditivo_registro numero, v.status, v.evidencia,
        a.arquivo_path FROM vinculos_aditivos v JOIN registros a ON a.numero_registro=v.aditivo_registro
        WHERE v.base_registro=? AND v.status IN ('automatico','confirmado') ORDER BY v.aditivo_registro`,r.numero_registro) : [],
      consolidacao: ehCct(r.tipo) ? lerConsolidacao(db,r.numero_registro) : null,
      extracao_json: undefined
    })),
  "/api/execucoes": () => q("SELECT id, iniciada_em, watch, tipo_instrumento, encontrados, novos, erro FROM execucoes ORDER BY id DESC LIMIT 100"),
  "/api/consultas": () => {
    const todas = [...loadWatchConfig().watches, ...watchesDeSindicatos(db)];
    return todas.map((w) => ({
      ...w,
      ultima: q("SELECT iniciada_em, encontrados, novos, erro FROM execucoes WHERE watch = ? ORDER BY id DESC LIMIT 1", w.name)[0] ?? null,
      registros: (q("SELECT COUNT(*) n FROM registros WHERE watch = ?", w.name)[0] as { n: number }).n
    }));
  },
  "/api/status": () => ({
    rodando: !!job,
    modo: job?.modo ?? ultimo?.modo ?? null,
    codigo: ultimo?.codigo ?? null,
    log: (job?.log ?? ultimo?.log ?? []).slice(-60),
    pausa: null,
    supervisionado: false,
    headless: job?.headless ?? lerNavegador(db).headless,
    interrompendo: job?.controller.signal.aborted ?? false,
    analisesEmAndamento: (q("SELECT COUNT(*) AS n FROM registros WHERE analise_status='analisando'")[0] as {n:number}).n,
    consolidacoesEmAndamento: (q("SELECT COUNT(*) AS n FROM consolidacoes_cct WHERE status='consolidando'")[0] as {n:number}).n,
    canais: { slack: lerNotificacoes(db).slack.ativo, email: lerNotificacoes(db).email.ativo, ia: lerLlm(db).ativo }
  })
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function corpo(req: IncomingMessage) {
  let s = "";
  let tamanho = 0;
  for await (const c of req) {
    tamanho += Buffer.byteLength(c);
    if (tamanho > 1024 * 1024) throw new ErroCadastro('Conteúdo excede o limite permitido.', 413);
    s += c;
  }
  let dados;
  try { dados = s ? JSON.parse(s) : {}; } catch { throw new ErroCadastro('JSON inválido.', 400); }
  const caminho = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (!caminho.startsWith('/api/auth/') && !caminho.startsWith('/api/contexto/')) {
    // Revalida sessão/permissão depois da leitura assíncrona do corpo.
    const id = acesso.protegerLegado(req);
    if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
      if (caminho === '/api/pendencias/decidir') dados.revisor = id.nome;
      if (/^\/api\/clientes\/\d+\/documentos\/decidir$/.test(caminho) || /^\/api\/envios\/\d+\/aprovar$/.test(caminho)) dados.responsavel = id.nome;
    }
  }
  return dados;
}

const Txt = z.string().trim().default("");
const SindSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do sindicato"),
  cnpj: Txt.pipe(z.string().regex(/^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})?$/, "CNPJ inválido. Use 00.000.000/0000-00")),
  categoria: Txt,
  uf: Txt.pipe(z.string().toUpperCase().regex(/^([A-Z]{2})?$/, "UF inválida")),
  tipo: Txt, // legado: compatibilidade com clientes anteriores
  tipos: z.array(z.string()).min(1, "Selecione pelo menos um tipo").max(9).optional()
    .refine(v => !v || v.every(t => TIPOS_VALIDOS.has(t)), "Tipo de instrumento inválido"),
  vigencia: Txt,
  titulo: Txt,
  ativo: z.boolean().default(true)
}).refine(s => !!(s.cnpj || s.categoria || s.titulo), {message:"Informe CNPJ, categoria ou palavra do título para identificar o sindicato"})
  .transform(s => ({ ...s, tipos: normalizarTipos(s.tipos, s.tipo), tipo: normalizarTipos(s.tipos, s.tipo)[0] }));
const NotifySchema = z.object({
  slack: z.object({ ativo:z.boolean(), webhook:z.string().trim().optional(), limparWebhook:z.boolean().optional() }),
  email: z.object({
    ativo:z.boolean(), host:z.string().trim(), port:z.coerce.number().int().min(1).max(65535),
    secure:z.boolean(), user:z.string().trim(), password:z.string().optional(),
    limparSenha:z.boolean().optional(), from:z.string().trim(), to:z.string().trim()
  })
});
const ScheduleSchema = z.object({ ativo:z.boolean(), cron:z.string().trim().min(1), timezone:z.string().trim().default('server') });
function validarFuso(tz: string): boolean {
  if (tz === 'server') return true;
  try { new Intl.DateTimeFormat('pt-BR', {timeZone:tz}); return true; } catch {return false;}
}
const LlmSchema = z.object({
  ativo: z.boolean(),
  baseUrl: z.string().trim().url("URL base inválida (ex.: https://api.openai.com/v1)"),
  model: z.string().trim().min(1, "Informe o modelo"),
  apiKey: z.string().trim().optional()
});

const vistaLlm = () => {
  const { apiKey, ...c } = lerLlm(db); // a chave nunca sai do servidor
  return { ...c, temChave: !!apiKey, chaveFinal: apiKey.slice(-4) };
};

createServer(async (req, res) => {
  try {
    if(!postgresEnabled)exigirSqliteOperacional(db.name);
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    if (postgresEnabled && postgresPool && postgresAccess) {
      postgresAccess.validarRequisicao(req);
      if (p.startsWith('/api/auth/') || p.startsWith('/api/contexto/') || p.startsWith('/api/portal/') || p.startsWith('/api/plataforma/')) {
        await comEscritorArquivosPostgres(postgresPool,async()=>{
          if(p.startsWith('/api/auth/')){if(await postgresAccess.tratar(req,res,url,corpoPostgres))return;}
          else if(await tratarGestaoPostgres(req,res,postgresPool,url,postgresAccess,corpoPostgres))return;
          json(res,404,{erro:'Rota PostgreSQL não implementada.'});
        });
        return;
      }
    }
    if (!postgresEnabled) acesso.validarRequisicao(req);
    const arquivosAuth: Record<string, string> = { '/theme-ui.js':'theme-ui.js', '/workspace-ui.js':'workspace-ui.js', '/resumo-ui.js':'resumo-ui.js', '/workspace-conceito.css':'workspace-conceito.css', '/auth-ui.css': 'auth-ui.css', '/auth-ui.js': 'auth-ui.js', '/cliente-vinculos-ui.js':'cliente-vinculos-ui.js', '/cliente-cnpj-ui.js':'cliente-cnpj-ui.js', '/auth-client.js': 'auth-client.js', '/gestao-ui.js': 'gestao-ui.js', '/publicacoes-ui.js':'publicacoes-ui.js', '/monitoramento-ui.js':'monitoramento-ui.js', '/ia-plataforma-ui.js':'ia-plataforma-ui.js' };
    if (req.method === 'GET' && arquivosAuth[p]) {
      res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(readFileSync(new URL('../web/' + arquivosAuth[p], import.meta.url)));
    }
    if (req.method === 'GET' && p === '/login') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
      return res.end(readFileSync(new URL('../web/login.html', import.meta.url)));
    }
    if (req.method === 'GET' && (p === '/' || p === '/acesso')) {
      let id;
      try {
        if (postgresEnabled && postgresAccess) {
          await comEscritorArquivosPostgres(postgresPool!,()=>postgresAccess!.identidade(req));
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(readFileSync(new URL('../web/acesso.html', import.meta.url)));
        }
        id = acesso.identidade(req);
      } catch (e) {
        if (!(e instanceof ErroCadastro) || e.status !== 401) throw e;
        res.writeHead(303, { location: '/login', 'cache-control': 'no-store' }); return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(p === '/' && id.papel_plataforma === 'administrador_plataforma' ? html() : readFileSync(new URL('../web/acesso.html', import.meta.url)));
    }
    if(req.method==='GET'&&(p==='/clientes-ui.js'||p==='/clientes-ui.css')) {
      res.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','cache-control':'no-store'});
      return res.end(readFileSync(new URL('../web'+p,import.meta.url)));
    }
    if (postgresEnabled) return json(res, 404, { erro: 'Rota indisponível no modo PostgreSQL.' });
    if (await acesso.tratar(req, res, url, corpo)) return;
    if (await tratarGestaoContexto(req,res,db,url,acesso,corpo)) return;
    if (await tratarPublicacoes(req,res,db,url,acesso,corpo)) return;
    if (await tratarEnviosContexto(req,res,db,url,acesso,corpo)) return;
    if (await tratarInterpretacoesContexto(req,res,db,url,acesso,corpo)) return;
    if (await tratarCadastrosContexto(req,res,db,url,acesso,corpo)) return;
    // As consultas legadas ainda são globais. Apenas o administrador da plataforma
    // pode usá-las até o isolamento de cada módulo na sprint 3.
    const identidade = acesso.protegerLegado(req);
    res.setHeader('x-mediador-escopo', 'plataforma');
    if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try { auditarSeguranca(db, 'LEGADO_MUTACAO', identidade.usuario_id,
          acesso.evento(req), { metodo: req.method, caminho: p, status: res.statusCode }); }
        catch { console.error('[Auditoria] Falha ao registrar ação autenticada.'); }
      }
    });
    if (req.method === "GET" && rotas[p]) return json(res, 200, rotas[p]());
    if (req.method === "GET" && p === "/api/sindicatos") return json(res, 200, listarSindicatos(db));
    if (req.method === 'GET' && p === '/api/pendencias/historico') {
      const base=url.searchParams.get('base')||'', campo=url.searchParams.get('campo')||'', aditivo=url.searchParams.get('aditivo')||'';
      if(!base||!campo||!aditivo)return json(res,400,{erro:'Parâmetros incompletos.'});
      return json(res,200,historicoRevisao(db,base,campo,aditivo));
    }
    if (req.method === "GET" && p === "/api/llm") return json(res, 200, vistaLlm());
    if (req.method === "GET" && p.startsWith("/api/relatorio/")) {
      const numero = decodeURIComponent(p.slice("/api/relatorio/".length));
      const row = db.prepare("SELECT extracao_json FROM registros WHERE numero_registro = ?").get(numero) as {extracao_json:string|null}|undefined;
      if (!row) return json(res, 404, {erro:"Registro não encontrado."});
      let extra;
      try { extra = normalizarExtracao(row.extracao_json ? JSON.parse(row.extracao_json) : null); }
      catch { return json(res, 422, {erro:"Análise salva inválida; execute Reanalisar."}); }
      if (!extra?.padrao) return json(res, 422, {erro:"Este registro ainda não foi analisado no template v1. Utilize Reanalisar com IA."});
      const markdown = renderizarCctMarkdown(extra.padrao);
      const filename = numero.replace(/[^a-zA-Z0-9_-]/g, "_") + "_analise_cct.md";
      res.writeHead(200, {"content-type":"text/markdown; charset=utf-8", "content-disposition":`attachment; filename="${filename}"`, "cache-control":"no-store"});
      return res.end(markdown);
    }
    if (req.method === 'GET' && p.startsWith('/api/consolidado/')) {
      const numero=decodeURIComponent(p.slice('/api/consolidado/'.length));
      const c=lerConsolidacao(db,numero);
      if(!c?.resultado)return json(res,404,{erro:'Nenhuma consolidação disponível.'});
      if(c.status!=='consolidado')return json(res,409,{erro:'Consolidação desatualizada. Recalcule antes de exportar.'});
      const nome=numero.replace(/[^a-zA-Z0-9_-]/g,'_')+'_consolidada.md';
      res.writeHead(200,{'content-type':'text/markdown; charset=utf-8','content-disposition':`attachment; filename="${nome}"`,'cache-control':'no-store'});
      return res.end(renderizarConsolidadoMarkdown(c.resultado));
    }
    if (req.method === 'GET' && p === '/api/agendamento') return json(res, 200, lerAgendamento(db));
    if (req.method === 'GET' && p === '/api/navegador') return json(res, 200, lerNavegador(db));
    if (req.method === 'GET' && p === '/api/notificacoes') return json(res, 200, vistaNotificacoes(lerNotificacoes(db)));
    // Preset público e versionado do Gmail: configurações oficiais, SEM acesso à conta Google.
    if (req.method === 'GET' && p === '/api/provedores/gmail') return json(res, 200, {
      provedor: 'Google Gmail', host: 'smtp.gmail.com',
      transportes: [
        { porta: 465, secure: true, rotulo: 'SSL/TLS (porta 465)' },
        { porta: 587, secure: false, rotulo: 'STARTTLS (porta 587)' }
      ],
      ajuda: 'https://support.google.com/a/answer/176600?hl=pt-BR',
      senhaApp: 'https://myaccount.google.com/apppasswords',
      autenticacao: 'senha-de-aplicativo',
      nota: 'A autenticação requer uma senha de app quando disponível; credenciais não são obtidas do Google.'
    });
    if (req.method === 'GET' && p.startsWith('/api/arquivo/')) {
      const numero = decodeURIComponent(p.slice('/api/arquivo/'.length));
      const row = db.prepare('SELECT arquivo_path FROM registros WHERE numero_registro=?').get(numero) as { arquivo_path: string|null }|undefined;
      if (!row?.arquivo_path || !existsSync(row.arquivo_path)) return json(res, 404, { erro:'Arquivo não localizado' });
      const file = resolve(row.arquivo_path);
      // Não serve arquivos arbitrários: só paths armazenados na base e dentro de downloads/ ou data/.
      const roots = [resolve(env.downloadDir), resolve('data')];
      if (!roots.some(r => file.startsWith(r + requireSep()))) return json(res, 403, { erro:'Caminho externo não permitido' });
      const ext = file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/msword';
      res.writeHead(200, { 'content-type': ext, 'content-disposition': `attachment; filename="${numero.replace(/[^A-Z0-9_./-]/gi, '_').replace('/', '_')}${ext === 'application/pdf' ? '.pdf' : '.doc'}"`, 'x-content-type-options':'nosniff' });
      return res.end(readFileSync(file));
    }

    if(await tratarClientes(req,res,db,url,corpo))return;
    const sind = p.match(/^\/api\/sindicatos(?:\/(\d+))?$/);
    if (sind) {
      const id = sind[1] ? Number(sind[1]) : null;
      if (req.method === "POST" && !id) return json(res, 201, { id: criarSindicato(db, SindSchema.parse(await corpo(req))) });
      if (req.method === "PUT" && id)
        return atualizarSindicato(db, id, SindSchema.parse(await corpo(req))) ? json(res, 200, { ok: true }) : json(res, 404, { erro: "sindicato não encontrado" });
      if (req.method === "DELETE" && id)
        return removerSindicato(db, id) ? json(res, 200, { ok: true }) : json(res, 404, { erro: "sindicato não encontrado" });
    }
    if (req.method === "PUT" && p === "/api/llm") {
      const { apiKey, ...c } = LlmSchema.parse(await corpo(req));
      salvarLlm(db, { ...c, apiKey: apiKey || lerLlm(db).apiKey }); // chave em branco = manter a atual
      return json(res, 200, vistaLlm());
    }
    if (req.method === "POST" && p === "/api/llm/testar") {
      // testa o que está no formulário, mesmo sem salvar
      const { apiKey, ...c } = LlmSchema.parse(await corpo(req));
      try {
        return json(res, 200, { ok: true, ...(await testarLlm({ ...c, apiKey: apiKey || lerLlm(db).apiKey })) });
      } catch (e) {
        return json(res, 200, { ok: false, erro: (e as Error).message });
      }
    }
    if (req.method === 'POST' && p === '/api/vinculos') {
      const {aditivo,base}=await corpo(req);
      if(typeof aditivo!=='string'||typeof base!=='string'||!aditivo.trim()||!base.trim())return json(res,400,{erro:'Selecione aditivo e CCT original.'});
      definirVinculo(db,aditivo,base);
      return json(res,200,{ok:true});
    }
    if (req.method === 'POST' && p === '/api/vinculos/rejeitar') {
      const {aditivo}=await corpo(req);
      if(typeof aditivo!=='string'||!aditivo.trim())return json(res,400,{erro:'Informe o aditivo.'});
      rejeitarVinculo(db,aditivo);
      return json(res,200,{ok:true});
    }
    if (req.method === 'POST' && p === '/api/pendencias/sugerir') {
      const v=z.object({base:z.string().min(1),campo:z.string().min(1),aditivo:z.string().min(1)}).parse(await corpo(req));
      const c=lerConsolidacao(db,v.base);
      if(c?.status!=='consolidado')return json(res,409,{erro:'Recalcule a consolidação antes de solicitar sugestões.'});
      if(!reservarSugestao(db,v.base,v.campo,v.aditivo))return json(res,409,{erro:'Sugestão já em processamento.'});
      void solicitarSugestao(db,v.base,v.campo,v.aditivo).catch(e=>console.error('[Sugestão IA]',(e as Error).message));
      return json(res,202,{ok:true,status:'gerando'});
    }
    if (req.method === 'POST' && p === '/api/pendencias/decidir') {
      const v=z.object({base:z.string().min(1),campo:z.string().min(1),aditivo:z.string().min(1),
        acao:z.enum(['manter','aplicar_aditivo','aplicar_sugestao','manual']),valor:z.string().max(3000).optional(),
        justificativa:z.string().trim().min(8).max(2500),revisor:z.string().trim().min(1).max(150)}).parse(await corpo(req));
      const c=lerConsolidacao(db,v.base);
      if(c?.status!=='consolidado')return json(res,409,{erro:'Consolidação desatualizada. Recalcule antes de decidir.'});
      salvarDecisao(db,v);
      return json(res,200,{ok:true});
    }
    if (req.method === 'POST' && p === '/api/consolidar') {
      const {numero}=await corpo(req);
      if(typeof numero!=='string'||!numero.trim())return json(res,400,{erro:'Informe a CCT original.'});
      const row=db.prepare('SELECT status FROM consolidacoes_cct WHERE base_registro=?').get(numero) as {status:string}|undefined;
      if(row?.status==='consolidando')return json(res,409,{erro:'Consolidação em andamento.'});
      validarProntidao(db,numero);
      // Reserva de execução e tratamento assíncrono em consolidarCct(), com erros persistidos.
      void consolidarCct(db,numero).catch(e=>console.error(`[Consolidação ${numero}]`,(e as Error).message));
      return json(res,202,{ok:true,status:'consolidando'});
    }
    if (req.method === "POST" && p === "/api/reanalisar") {
      const { numero } = await corpo(req);
      if (typeof numero !== 'string' || !numero.trim()) return json(res, 400, { erro: 'Número de registro inválido.' });
      const registro = db.prepare('SELECT analise_status, arquivo_path FROM registros WHERE numero_registro=?')
        .get(numero) as {analise_status:string;arquivo_path:string|null}|undefined;
      if (!registro) return json(res, 404, { erro: 'Registro não encontrado.' });
      if (registro.analise_status === 'analisando') return json(res, 409, { erro: 'Análise já em andamento.' });
      // Inicia de forma assíncrona: a UI passa a acompanhar analise_status no SQLite.
      // A reserva atômica acontece sincronamente em reanalisar() antes do primeiro await.
      void reanalisar(db, numero).catch(e => console.error(`[IA ${numero}]`, (e as Error).message));
      return json(res, 202, { ok:true, status:'analisando' });
    }
    if (req.method === 'PUT' && p === '/api/agendamento') {
      const val = ScheduleSchema.parse(await corpo(req));
      if (!cron.validate(val.cron)) return json(res, 400, {erro:'Expressão cron inválida'});
      if (!validarFuso(val.timezone)) return json(res, 400, {erro:'Fuso horário inválido'});
      salvarAgendamento(db, val);
      return json(res, 200, aplicarAgendamento());
    }
    if (req.method === 'PUT' && p === '/api/navegador') {
      const valor = z.object({ headless: z.boolean() }).parse(await corpo(req));
      return json(res, 200, salvarNavegador(db, valor));
    }
    if (req.method === 'PUT' && p === '/api/notificacoes') {
      const input: NotificationInput = NotifySchema.parse(await corpo(req));
      const cfg = salvarNotificacoes(db, input);
      return json(res, 200, vistaNotificacoes(cfg));
    }
    if (req.method === 'POST' && p === '/api/notificacoes/testar') {
      const body = await corpo(req);
      if (body.canal !== 'slack' && body.canal !== 'email') return json(res, 400, {erro:'Canal inválido'});
      const input: NotificationInput = NotifySchema.parse(body.config);
      const cfg = resolverNotificacoes(db, input);
      try {
        if (body.canal === 'slack') await testarSlack(cfg);
        else await testarEmail(cfg);
        return json(res, 200, {ok:true, mensagem:body.canal === 'slack' ? 'Mensagem de teste enviada ao Slack.' : 'Mensagem de teste entregue ao servidor SMTP.'});
      } catch (e) { return json(res, 200, {ok:false, erro:(e as Error).message}); }
    }
    if (req.method === 'POST' && p === '/api/interromper') {
      if (!job) return json(res, 409, {erro:'Sem execução ativa'});
      job.controller.abort();
      return json(res, 200, {ok:true});
    }
    if (req.method === "POST" && p === "/api/executar") {
      const { modo } = await corpo(req);
      if (modo !== "check" && modo !== "dry-run" && modo !== 'seed') return json(res, 400, { erro: "modo inválido" });
      return executar(modo) ? json(res, 202, { ok: true }) : json(res, 409, { erro: "já existe uma verificação em andamento" });
    }
    json(res, 404, { erro: "não encontrado" });
  } catch (e) {
    if(res.headersSent){if(!res.writableEnded)res.destroy();console.error('Falha após iniciar resposta HTTP.');return;}
    if(e instanceof ErroSqliteDesativado)return json(res,503,{erro:e.message,codigo:e.code});
    if(e instanceof ErroCadastro)return json(res,e.status,{erro:e.message});
    if (e instanceof ZodError) return json(res, 400, { erro: e.issues[0].message });
    json(res, 500, { erro: (e as Error).message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Painel: http://localhost:${PORT}`));





