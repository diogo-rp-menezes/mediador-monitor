import { readFileSync } from "node:fs";
import { decode } from "html-entities";
import { htmlParaLinhas } from "./parser.js";
import type { Cabecalho } from "./types.js";

/**
 * O Mediador entrega o "Download" com extensão .doc, mas o conteúdo observado
 * é HTML (estilo "Word HTML", ISO-8859-1). Por segurança, o formato é detectado
 * pelos primeiros bytes e não pela extensão:
 *   - HTML  → texto direto
 *   - OLE2  → .doc binário de verdade (word-extractor)
 *   - %PDF  → pdf-parse
 */
export type Formato = "html" | "doc-binario" | "pdf" | "desconhecido";

export function detectarFormato(buf: Buffer): Formato {
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "doc-binario";
  const ini = buf.subarray(0, 4096).toString("latin1").toLowerCase();
  if (ini.includes("<html") || ini.includes("<!doctype html") || ini.includes("<head") || ini.includes("<body")) return "html";
  return "desconhecido";
}

function decodificarHtml(buf: Buffer): string {
  const meta = buf.subarray(0, 4096).toString("latin1").match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase();
  const charset = meta && /utf-?8/.test(meta) ? "utf-8" : "windows-1252"; // ISO-8859-1 ≈ windows-1252
  return new TextDecoder(charset).decode(buf);
}

export async function lerDocumento(path: string): Promise<string> {
  return lerDocumentoBytes(readFileSync(path));
}

/** Parses the exact bytes whose hash the caller checked, without rereading a mutable path. */
export async function lerDocumentoBytes(buf: Buffer): Promise<string> {
  switch (detectarFormato(buf)) {
    case "html": {
      // htmlParaLinhas já remove <script>/<style> e decodifica entidades
      const html = decodificarHtml(buf);
      const i = html.search(/<body[\s>]/i); // ignora <head>/<title> ("Mediador - Extrato ...")
      return htmlParaLinhas(i >= 0 ? html.slice(i) : html).join("\n");
    }
    case "doc-binario": {
      const { default: WordExtractor } = await import("word-extractor");
      return (await new WordExtractor().extract(buf)).getBody().trim();
    }
    case "pdf": {
      const { default: pdf } = await import("pdf-parse/lib/pdf-parse.js");
      return (await pdf(buf)).text.trim();
    }
    default:
      throw new Error('Formato de documento não reconhecido.');
  }
}

/** Cabeçalho determinístico (sem LLM). Usado também para validar que o arquivo baixado é do registro esperado. */
export function extrairCabecalho(texto: string): Cabecalho {
  const apos = (rotulo: RegExp, valor: RegExp) => {
    const m = texto.match(new RegExp(`${rotulo.source}\\s*:?\\s*\\n?\\s*(${valor.source})`, "i"));
    return m?.[1]?.trim();
  };
  const cnpjs = [...new Set([...texto.matchAll(/CNPJ\s*n?[.º°]?\s*:?\s*([A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}\/?[A-Z0-9]{4}-?\d{2})\b/gi)].map((m) => m[1].toUpperCase()))];
  const primeiraLinha = texto.split("\n").find((l) => /^(conven[çc][ãa]o|acordo|termo aditivo)/i.test(l));
  return {
    titulo: primeiraLinha ? decode(primeiraLinha).trim() : undefined,
    numeroRegistro: apos(/N[ÚU]MERO DE REGISTRO NO MTE/, /[A-Z]{2}\d{6}\/\d{4}/),
    dataRegistro: apos(/DATA DE REGISTRO NO MTE/, /\d{2}\/\d{2}\/\d{4}/),
    numeroSolicitacao: apos(/N[ÚU]MERO DA SOLICITA[ÇC][ÃA]O/, /MR\d{6}\/\d{4}/),
    numeroProcesso: apos(/N[ÚU]MERO DO PROCESSO/, /[\d.]+\/\d{4}-\d{2}/),
    cnpjs
  };
}
