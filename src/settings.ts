import type { Db } from './db.js';
import { env } from './config.js';

export interface ScheduleConfig { ativo: boolean; cron: string; timezone: string }
/** Preferência de execução: dados locais no SQLite; não altera a sessão do usuário. */
export interface BrowserConfig { headless: boolean }

export function lerNavegador(db: Db): BrowserConfig {
  const value = lerAjuste(db, 'navegador') as Partial<BrowserConfig> | undefined;
  return { headless: typeof value?.headless === 'boolean' ? value.headless : env.headless };
}

export function salvarNavegador(db: Db, value: BrowserConfig): BrowserConfig {
  gravarAjuste(db, 'navegador', { headless: value.headless });
  return lerNavegador(db);
}
export interface SlackConfig { ativo: boolean; webhook: string }
export interface EmailConfig {
  ativo: boolean; host: string; port: number; secure: boolean;
  user: string; password: string; from: string; to: string;
}
export interface NotificationConfig { slack: SlackConfig; email: EmailConfig }

function lerAjuste(db: Db, chave: string): unknown | undefined {
  const row = db.prepare('SELECT valor FROM ajustes WHERE chave=?').get(chave) as {valor: string}|undefined;
  if (!row) return undefined;
  try { return JSON.parse(row.valor); } catch { return undefined; }
}
function gravarAjuste(db: Db, chave: string, valor: unknown): void {
  db.prepare('INSERT INTO ajustes(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor')
    .run(chave, JSON.stringify(valor));
}

export function lerAgendamento(db: Db): ScheduleConfig {
  const value = lerAjuste(db, 'agendamento') as Partial<ScheduleConfig>|undefined;
  return {
    ativo: value?.ativo === true,
    cron: typeof value?.cron === 'string' && value.cron.trim() ? value.cron : '0 8 * * 1-5',
    // Registros existentes mantêm o comportamento anterior: horário do servidor.
    timezone: typeof value?.timezone === 'string' ? value.timezone : 'server'
  };
}
export function salvarAgendamento(db: Db, value: ScheduleConfig): ScheduleConfig {
  gravarAjuste(db, 'agendamento', value);
  return lerAgendamento(db);
}

export function lerNotificacoes(db: Db): NotificationConfig {
  const saved = lerAjuste(db, 'notificacoes') as Partial<NotificationConfig>|undefined;
  if (saved) {
    // SQLite passa a ter prioridade integral; um canal desativado não ressuscita do .env.
    return {
      slack: { ativo: saved.slack?.ativo === true, webhook: saved.slack?.webhook ?? '' },
      email: {
        ativo: saved.email?.ativo === true, host: saved.email?.host ?? '',
        port: saved.email?.port ?? 587, secure: saved.email?.secure === true,
        user: saved.email?.user ?? '', password: saved.email?.password ?? '',
        from: saved.email?.from ?? '', to: saved.email?.to ?? ''
      }
    };
  }
  // Migração não destrutiva: antigos valores .env aparecem como configuração inicial.
  return {
    slack: { ativo: !!env.slackWebhook, webhook: env.slackWebhook },
    email: {
      ativo: !!(env.smtp.host && env.smtp.from && env.smtp.to),
      host: env.smtp.host, port: env.smtp.port,
      secure: env.smtp.port === 465, user: env.smtp.user, password: env.smtp.pass,
      from: env.smtp.from, to: env.smtp.to
    }
  };
}

export interface NotificationInput {
  slack: { ativo: boolean; webhook?: string; limparWebhook?: boolean };
  email: { ativo: boolean; host: string; port: number; secure: boolean;
    user: string; password?: string; limparSenha?: boolean; from: string; to: string };
}

export function resolverNotificacoes(db: Db, input: NotificationInput): NotificationConfig {
  const current = lerNotificacoes(db);
  return {
    slack: {
      ativo: input.slack.ativo,
      webhook: input.slack.limparWebhook ? '' : (input.slack.webhook?.trim() || current.slack.webhook)
    },
    email: {
      ativo: input.email.ativo, host: input.email.host.trim(), port: input.email.port,
      secure: input.email.secure, user: input.email.user.trim(),
      password: input.email.limparSenha ? '' : (input.email.password || current.email.password),
      from: input.email.from.trim(), to: input.email.to.trim()
    }
  };
}

export function validarNotificacoes(cfg: NotificationConfig): void {
  if (cfg.slack.ativo) {
    let url: URL;
    try { url = new URL(cfg.slack.webhook); } catch { throw new Error('Informe a URL do webhook Slack.'); }
    if (url.protocol !== 'https:' || !['hooks.slack.com', 'hooks.slack-gov.com'].includes(url.hostname))
      throw new Error('O webhook Slack deve usar HTTPS em hooks.slack.com (ou hooks.slack-gov.com).');
  }
  if (cfg.email.ativo) {
    if (!cfg.email.host || !cfg.email.from)
      throw new Error('Configure servidor SMTP e remetente para ativar e-mail. Os destinatários dos clientes vêm dos contatos vinculados.');
    if (!Number.isInteger(cfg.email.port) || cfg.email.port < 1 || cfg.email.port > 65535)
      throw new Error('Porta SMTP inválida.');
    if (cfg.email.user && !cfg.email.password) throw new Error('Informe a senha SMTP para o usuário configurado.');
  }
}
export function salvarNotificacoes(db: Db, input: NotificationInput): NotificationConfig {
  const cfg = resolverNotificacoes(db, input);
  validarNotificacoes(cfg);
  gravarAjuste(db, 'notificacoes', cfg);
  return cfg;
}
export function vistaNotificacoes(cfg: NotificationConfig) {
  return {
    slack: { ativo: cfg.slack.ativo, temWebhook: !!cfg.slack.webhook, webhookFinal: cfg.slack.webhook ? '••••' + cfg.slack.webhook.slice(-5) : '' },
    email: { ativo: cfg.email.ativo, host: cfg.email.host, port: cfg.email.port,
      secure: cfg.email.secure, user: cfg.email.user, from: cfg.email.from, to: cfg.email.to,
      temSenha: !!cfg.email.password }
  };
}
