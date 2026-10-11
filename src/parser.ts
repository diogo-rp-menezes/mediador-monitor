import { decode } from "html-entities";
import type { Registro } from "./types.js";

/**
 * Parser da tela de resultados do Mediador.
 *
 * Layout observado (print): cada instrumento é um bloco "rótulo → valor":
 *   Nº do Registro | DF000380/2026 | Nº da Solicitação | MR036310/2026
 *   Tipo do Instrumento | Convenção Coletiva | Vigência | 01/05/2026 - 30/04/2028
 *   Partes | SINDICATO ... (uma linha por parte)
 *   Download | Visualizar Instrumento Coletivo
 *
 * Como NÃO tenho o HTML real, o parser não depende de tags: converte o HTML
 * em linhas de texto e trabalha pelos rótulos. Funciona com <table>, <div>
 * ou <span>, desde que os rótulos tenham o texto visível acima.
 */

const BLOCO = "(?:block|td|th|tr|table|tbody|div|p|br|li|ul|ol|h[1-6]|label|fieldset|legend|a|input)";

export function htmlParaLinhas(html: string): string[] {
  const limpo = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(new RegExp(`</?${BLOCO}(\\s[^>]*)?/?>`, "gi"), "\n")
    .replace(/<[^>]+>/g, " ");
  return decode(limpo)
    .split("\n")
    .map((l) => l.replace(/[\s\u00a0]+/g, " ").trim())
    .filter(Boolean);
}

const RE_NUM_REGISTRO_ROTULO = /^N[ºo°.]?\s*do\s*Registro\b/i;
const RE_NUM_REGISTRO = /\b[A-Z]{2}\d{6}\/\d{4}\b/;
const RE_NUM_SOLICITACAO = /\bMR\d{6}\/\d{4}\b/;
const RE_VIGENCIA = /(\d{2}\/\d{2}\/\d{4})\s*(?:-|–|a|até)\s*(\d{2}\/\d{2}\/\d{4})/i;
const RE_FIM_BLOCO = /^(Download|Visualizar Instrumento Coletivo|Fechar)$/i;

export function parseResultados(html: string): Registro[] {
  const linhas = htmlParaLinhas(html);

  // fatia em blocos: cada "Nº do Registro" abre um novo registro
  const blocos: string[][] = [];
  for (const l of linhas) {
    if (RE_NUM_REGISTRO_ROTULO.test(l)) blocos.push([]);
    if (blocos.length) blocos[blocos.length - 1].push(l);
  }

  const out: Registro[] = [];
  for (const bloco of blocos) {
    const texto = bloco.join(" \n ");
    // o número deve vir logo após o rótulo, não o de outro campo
    const apos = texto.replace(/^[\s\S]*?N[ºo°.]?\s*do\s*Registro\s*:?/i, "");
    const numeroRegistro = apos.match(RE_NUM_REGISTRO)?.[0];
    if (!numeroRegistro) continue;

    const tipo = texto.match(/Tipo\s+do\s+Instrumento\s*:?\s*\n?\s*([^\n]+?)\s*(?:\n|$)/i)?.[1]?.trim() ?? "";
    const tipoLimpo = tipo.replace(/\s*Vig[êe]ncia.*$/i, "").trim();
    const v = texto.match(RE_VIGENCIA);

    // partes: linhas entre o rótulo "Partes" e o fim do bloco (Download/Visualizar)
    const iPartes = bloco.findIndex((l) => /^Partes\b/i.test(l));
    const partes: string[] = [];
    if (iPartes >= 0) {
      const primeira = bloco[iPartes].replace(/^Partes\s*:?\s*/i, "");
      if (primeira) partes.push(primeira);
      for (const l of bloco.slice(iPartes + 1)) {
        if (RE_FIM_BLOCO.test(l)) break;
        partes.push(l);
      }
    }

    out.push({
      numeroRegistro,
      numeroSolicitacao: texto.match(RE_NUM_SOLICITACAO)?.[0] ?? "",
      tipo: tipoLimpo,
      vigencia: v ? `${v[1]} - ${v[2]}` : "",
      partes: partes.join("; "),
      indice: out.length
    });
  }
  return out;
}

/** "Resultado: 1 Instrumento(s) Coletivo(s) Encontrado(s) - Página 1 de 3" → { total: 1, paginaAtual: 1, totalPaginas: 3 } */
export function parseCabecalhoResultado(html: string): { total: number; paginaAtual: number; totalPaginas: number } | null {
  const texto = htmlParaLinhas(html).join(" ");
  const m = texto.match(/Resultado:\s*(\d+)\s*Instrumento\(s\)[^-–]*[-–]\s*P[áa]gina\s*(\d+)\s*de\s*(\d+)/i);
  return m ? { total: +m[1], paginaAtual: +m[2], totalPaginas: +m[3] } : null;
}
