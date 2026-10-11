import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";

/**
 * Cada campo é opcional; vazio = não filtra. Os valores de tipo/vigencia/uf
 * devem ser IGUAIS ao texto da opção no <select> do portal (ex.: "Convenção Coletiva",
 * "Vigentes", "DF"). Se vigencia/tipo vazios, o portal usa "Selecione"/"Todos os Tipos".
 */
const WatchSchema = z.object({
  name: z.string(),
  sindicatoId: z.number().int().positive().optional(),
  cnpj: z.string().default(""), // marca a caixa "CNPJ/CAEPF" e preenche
  categoria: z.string().default(""), // marca a caixa "Categoria" e preenche (campo pode ter autocomplete)
  tipo: z.string().default(""),
  tipos: z.array(z.string()).optional(), // permite consultas separadas por tipo no mesmo sindicato
  vigencia: z.string().default(""),
  uf: z.string().default(""), // "UF de Registro"
  titulo: z.string().default("") // Palavra do Título
});

const FileSchema = z.object({
  baseUrl: z.string().url(),
  searchPath: z.string(),
  watches: z.array(WatchSchema).default([])
});

export type Watch = z.infer<typeof WatchSchema>;

export function loadWatchConfig(path = "config/watch.json") {
  return FileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export const env = {
  dbPath: process.env.DB_PATH || (existsSync("data/mte-cct-monitor.db") ? "data/mte-cct-monitor.db" : "data/mediador.db"),
  downloadDir: process.env.DOWNLOAD_DIR || "downloads",
  // Padrão sem janelas. Pode ser alterado no painel, com persistência SQLite.
  headless: (process.env.HEADLESS ?? "true").trim().toLowerCase() !== "false",
  /** Ex.: "chrome" para usar o Google Chrome instalado em vez do Chromium do Playwright */
  browserChannel: process.env.BROWSER_CHANNEL || "",
  timeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 45000),
  formTimeoutMs: Number(process.env.FORM_TIMEOUT_MS || 15000), // preencher o formulário: falhar rápido
  maxRetries: Number(process.env.MAX_RETRIES || 2),
  maxPages: Number(process.env.MAX_PAGES || 10),
  slackWebhook: process.env.SLACK_WEBHOOK_URL || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "",
    to: process.env.MAIL_TO || ""
  },
  /** LLM compatível com a API OpenAI (/chat/completions). O painel (SQLite) tem prioridade sobre estas variáveis. */
  llm: {
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || ""
  }
};
