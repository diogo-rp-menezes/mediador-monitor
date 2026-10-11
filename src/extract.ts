import type { LlmConfig } from "./db.js";
import type { Extracao, Topico } from "./types.js";
import { CAMPOS_CCT, NAO_CONSTA_CCT, SECOES_CCT, VERSAO_TEMPLATE_CCT, validarExtracaoCct, type PadraoCct } from "./cct-template.js";

/** Tópicos históricos, utilizados apenas para exibir análises das versões anteriores. */
export const TOPICOS = [
  { id: "vigencia", titulo: "Vigência e data-base", instrucao: "período de vigência" },
  { id: "pisoSalarial", titulo: "Piso salarial", instrucao: "pisos por cargo" },
  { id: "reajuste", titulo: "Reajuste salarial", instrucao: "reajuste" },
  { id: "valeAlimentacaoRefeicao", titulo: "Vale-alimentação / refeição", instrucao: "vale-alimentação" },
  { id: "bancoDeHoras", titulo: "Banco de horas", instrucao: "compensação" },
  { id: "ferias", titulo: "Férias", instrucao: "férias" },
  { id: "participacaoLucros", titulo: "Distribuição de lucros (PLR)", instrucao: "PLR" },
  { id: "estabilidades", titulo: "Estabilidades", instrucao: "garantias" }
] as const;


export const PROMPT_EXTRACAO_CCT = `Você é analista documental de Convenções Coletivas de Trabalho (CCT) brasileiras.
Extraia EXCLUSIVAMENTE o que estiver explicitamente no DOCUMENTO fornecido. Não complete com a CLT, jurisprudência, pressupostos, exemplos ou informações do site.
Devolva apenas UM objeto JSON, sem markdown, no formato:
{"campos":{"<id_do_campo>":"valor extraído ou Não consta na CCT"},"evidencias":{"<id_do_campo>":{"clausula":"Cláusula ...","citacao":"trecho literal curto"}}}

Todos os campos abaixo são OBRIGATÓRIOS, inclusive os ausentes: substitua ausências exatamente por "${NAO_CONSTA_CCT}".
Não invente, não deduza e não presuma regras. Preserve datas, percentuais, valores monetários e prazos na grafia original da CCT.
Um texto de exemplo entre colchetes no template NÃO é um valor para copiar para a resposta.
Se houver diversos cargos/pisos, escreva todos no campo respectivo, um por linha no formato "Cargo/Função: Valor".
Quando uma cláusula só remeter a outro instrumento, reproduza apenas a remissão, sem presumir o conteúdo do outro documento.
Se houver mais de uma regra para o mesmo campo, descreva as exceções relevantes sem as fundir.
As referências de cláusula e citações curtas são opcionais, mas precisam ser literais e verificáveis.
Não preencha metadados com base em informações de fora do texto da CCT. Campos não encontrados no texto devem ter o valor literal de ausência.

CAMPOS OBRIGATÓRIOS, NA ORDEM DO TEMPLATE:
${SECOES_CCT.map(s => `${s.titulo}\n${s.grupos.map(g => `${g.titulo ?? ""}\n${g.campos.map(c => `- ${c.id}: ${c.rotulo}${c.instrucao ? ` — ${c.instrucao}` : ""}`).join("\n")}`).join("\n")}`).join("\n\n")}
Total: ${CAMPOS_CCT.length} campos. Todos devem constar no JSON.`;

/** Cliente OpenAI compatível, sem parâmetros opcionais incompatíveis com modelos de raciocínio. */
export async function chat(cfg: LlmConfig, system: string, user: string): Promise<string> {
  const resp = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(240_000)
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const value = data.choices?.[0]?.message?.content ?? "";
  if (!value.trim()) throw new Error("LLM retornou resposta vazia.");
  return value;
}

function lerJson(bruto: string): unknown {
  const m = bruto.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : bruto); }
  catch { throw new Error("LLM não retornou JSON válido. Tente reanalisar com outro modelo."); }
}

/** Extração padronizada v1.0. O contexto do portal permanece fora do relatório: não é prova do texto da CCT. */
export async function extrairClausulas(texto: string, cfg: LlmConfig, _ctx: { vigencia?: string } = {}): Promise<Extracao | null> {
  if (!cfg.ativo || !cfg.model || !texto.trim()) return null;
  // Se o documento ultrapassar esse limite, falhar em vez de analisar só o começo e concluir que o restante não consta.
  if (texto.length > 150_000) throw new Error(`Documento com ${texto.length} caracteres excede o limite de 150000 desta extração. É necessário processá-lo em partes para não omitir cláusulas.`);
  const bruto = await chat(cfg, PROMPT_EXTRACAO_CCT, `DOCUMENTO ORIGINAL:\n${texto}`);
  const padrao = validarExtracaoCct(lerJson(bruto));
  return { topicos: {}, observacoes: [], padrao };
}

export async function testarLlm(cfg: LlmConfig) {
  const t0 = Date.now();
  const resposta = await chat(cfg, "Responda apenas com a palavra: ok", "ping");
  return { ms: Date.now() - t0, resposta: resposta.trim().slice(0, 80) };
}

/** Mantém a leitura dos documentos que já tinham sido analisados em versões antigas. */
export function normalizarExtracao(raw: unknown): Extracao | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.aditivo && typeof r.aditivo === 'object') {
    const aditivo=r.aditivo as Record<string,unknown>;
    if(Array.isArray(aditivo.alteracoes)) {
      return {topicos:{},aditivo:{versao:String(aditivo.versao||'1.0'),alteracoes:aditivo.alteracoes.filter((a):a is {campo:string;acao:string;valor:string;clausula:string;citacao:string}=>
        !!a && typeof a==='object' && typeof a.campo==='string' && typeof a.acao==='string' && typeof a.citacao==='string')}};
    }
  }
  if (r.padrao && typeof r.padrao === "object") {
    const p = r.padrao as Record<string, unknown>;
    if (p.versao === VERSAO_TEMPLATE_CCT || (typeof p.versao === "string" && typeof p.campos === "object")) {
      return { topicos: {}, observacoes: [], padrao: validarExtracaoCct(p) };
    }
  }
  if (r.topicos && typeof r.topicos === "object" && !Array.isArray(r.topicos)) {
    const topicos: Record<string, Topico> = {};
    for (const [key, rawTopico] of Object.entries(r.topicos as Record<string, unknown>)) {
      if (!rawTopico || typeof rawTopico !== "object") continue;
      const valor = rawTopico as Record<string, unknown>;
      if (typeof valor.resumo !== "string" || !valor.resumo.trim()) continue;
      topicos[key] = {
        resumo: valor.resumo,
        ...(typeof valor.clausula === "string" ? { clausula: valor.clausula } : {}),
        ...(typeof valor.citacao === "string" ? { citacao: valor.citacao } : {})
      };
    }
    return { topicos, observacoes: Array.isArray(r.observacoes) ? r.observacoes.filter((x): x is string => typeof x === "string") : [] };
  }
  const legado: Record<string, string> = {
    vigencia: "vigencia", pisoSalarial: "pisoSalarial", reajusteSalarialPercentual: "reajuste",
    valeAlimentacaoRefeicao: "valeAlimentacaoRefeicao", bancoDeHoras: "bancoDeHoras"
  };
  const topicos: Record<string, Topico> = {};
  for (const [key, id] of Object.entries(legado)) if (typeof r[key] === "string" && r[key]) topicos[id] = { resumo: r[key] as string };
  return { topicos, observacoes: typeof r.observacoes === "string" && r.observacoes ? [r.observacoes] : [] };
}

/** A UI recebe a hierarquia do template e os valores; análises antigas continuam na apresentação anterior. */
export function paraVisao(extracao: Extracao | null) {
  if (!extracao) return null;
  if(extracao.aditivo) {
    return {versao:'aditivo-'+extracao.aditivo.versao,aditivo:true,alteracoes:extracao.aditivo.alteracoes,
      itens:[],observacoes:[]};
  }
  if (extracao.padrao) {
    const p = extracao.padrao;
    return {
      versao: p.versao,
      secoes: SECOES_CCT.map(s => ({ titulo: s.titulo, grupos: s.grupos.map(g => ({
        titulo: g.titulo,
        campos: g.campos.map(c => ({ id: c.id, rotulo: c.rotulo, valor: p.campos[c.id] ?? NAO_CONSTA_CCT, ...(p.evidencias?.[c.id] ?? {}) }))
      })) })),
      itens: [], observacoes: []
    };
  }
  return { itens: TOPICOS.map((t) => ({ id: t.id, titulo: t.titulo, ...(extracao.topicos[t.id] ?? null) })), observacoes: extracao.observacoes ?? [] };
}

export type { PadraoCct };
