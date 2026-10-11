import {criarTransporteEmail} from './smtp-transporte.js';
import {exigirSqliteOperacional} from './sqlite-cutover-lock.js';
import { lerNotificacoes, type NotificationConfig } from "./settings.js";
import type { Db } from "./db.js";
import { TOPICOS } from "./extract.js";
import { SECOES_CCT, NAO_CONSTA_CCT } from "./cct-template.js";
import type { Cabecalho, Extracao, Registro } from "./types.js";

export interface NovoEvento {
  watch: string;
  registro: Registro;
  cabecalho: Cabecalho | null;
  extracao: Extracao | null;
}

export function formatarTexto(e: NovoEvento): string {
  const r = e.registro;
  const c = e.cabecalho;
  const linhas = [
    `Novo registro no Mediador (${e.watch})`,
    `Registro: ${r.numeroRegistro}${c?.dataRegistro ? ` (registrado em ${c.dataRegistro})` : ""}`,
    r.tipo && `Tipo: ${r.tipo}`,
    r.vigencia && `Vigência: ${r.vigencia}`,
    r.partes && `Partes: ${r.partes}`,
    r.numeroSolicitacao && `Solicitação: ${r.numeroSolicitacao}`,
    c?.numeroProcesso && `Processo: ${c.numeroProcesso}`
  ].filter(Boolean) as string[];

  if (e.extracao) {
    linhas.push("— Análise por IA das cláusulas (confira no documento) —");
    if (e.extracao.padrao) {
      // Resumo útil sem anexar ao e-mail o relatório completo de 60 campos.
      const preferidos = new Set([
        "Piso Geral", "Percentual de Reajuste", "Data de Aplicação", "Valor Diário/Mensal",
        "Carga Horária Semanal / Mensal", "Banco de Horas", "Multa por Descumprimento da CCT"
      ]);
      for (const secao of SECOES_CCT) for (const grupo of secao.grupos) for (const campo of grupo.campos) {
        const valor = e.extracao.padrao.campos[campo.id];
        if (preferidos.has(campo.rotulo) && valor && valor !== NAO_CONSTA_CCT) linhas.push(`${campo.rotulo}: ${valor}`);
      }
    } else {
      for (const t of TOPICOS) {
        const x = e.extracao.topicos[t.id];
        if (x) linhas.push(`${t.titulo}: ${x.resumo}${x.clausula ? ` (${x.clausula})` : ""}`);
      }
      e.extracao.observacoes?.forEach((o) => linhas.push(`⚠ ${o}`));
    }
  }
  return linhas.join("\n");
}

export async function notificar(eventos: NovoEvento[], db: Db) {
  exigirSqliteOperacional(db.name);
  if (!eventos.length) return false;
  const texto = eventos.map(formatarTexto).join("\n\n");
  let enviou = false;
  const cfg = lerNotificacoes(db);

  if (cfg.slack.ativo && cfg.slack.webhook) {
    exigirSqliteOperacional(db.name);
    const r = await fetch(cfg.slack.webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: texto })
    });
    if (!r.ok) throw new Error(`Slack webhook ${r.status}`);
    enviou = true;
  }

  const s = cfg.email;
  if (s.ativo && s.host && s.to && s.from) {
    const t = criarTransporteEmail(cfg);
    exigirSqliteOperacional(db.name);
    await t.sendMail({
      from: s.from,
      to: s.to,
      subject: `[Mediador] ${eventos.length} novo(s) registro(s)`,
      text: texto
    });
    enviou = true;
  }

  if (!enviou) console.log("\n" + texto + "\n(nenhum canal de notificação configurado; impresso no console)");
  return enviou;
}

/** Mesmo transporte para alertas e teste explícito de configuração. */
export {criarTransporteEmail} from './smtp-transporte.js';
export async function testarSlack(cfg: NotificationConfig): Promise<void> {
  if (!cfg.slack.webhook) throw new Error('Informe o webhook do Slack para testar.');
  // Validar o destino antes de efetuar uma requisição externa.
  const u = new URL(cfg.slack.webhook);
  if (u.protocol !== 'https:' || !['hooks.slack.com', 'hooks.slack-gov.com'].includes(u.hostname))
    throw new Error('Informe um webhook Slack válido (https://hooks.slack.com/...).');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(cfg.slack.webhook, {method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({text:'Mediador Monitor — teste de notificação realizado pelo painel de configurações.'}),
      signal:controller.signal});
    if (!res.ok) throw new Error('Slack retornou HTTP ' + res.status);
  } finally {clearTimeout(timeout);}
}

export async function testarEmail(cfg: NotificationConfig): Promise<void> {
  const s = cfg.email;
  if (!s.host || !s.from || !s.to) throw new Error('Informe servidor, remetente e destinatário do SMTP.');
  const transporte = criarTransporteEmail(cfg);
  try {
    await transporte.verify();
    await transporte.sendMail({
      from:s.from, to:s.to, subject:'[Mediador Monitor] Teste de notificações',
      text:'Configuração SMTP validada e mensagem de teste enviada pelo painel do Mediador Monitor.'
    });
  } finally {transporte.close();}
}


