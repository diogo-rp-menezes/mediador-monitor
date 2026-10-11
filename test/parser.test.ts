import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCabecalhoResultado, parseResultados } from "../src/parser.js";

const tabela = readFileSync("test/fixtures/resultado-tabela.html", "utf8");
const divs = readFileSync("test/fixtures/resultado-divs.html", "utf8");

describe("parseResultados (layout rótulo/valor do print)", () => {
  const r = parseResultados(tabela);

  it("lê um bloco por 'Nº do Registro', ignorando menu e rodapé", () => {
    expect(r.map((x) => x.numeroRegistro)).toEqual(["DF000380/2026", "DF000401/2026"]);
    expect(r.map((x) => x.indice)).toEqual([0, 1]);
  });
  it("extrai solicitação, tipo e vigência", () => {
    expect(r[0]).toMatchObject({
      numeroSolicitacao: "MR036310/2026",
      tipo: "Convenção Coletiva",
      vigencia: "01/05/2026 - 30/04/2028"
    });
    expect(r[1].tipo).toBe("Termo Aditivo");
  });
  it("junta as partes e não vaza 'Download'", () => {
    expect(r[0].partes).toBe(
      "SINDICATO DE EMP NO COM HOT REST BARES LANCHONETES PIZZARIAS; SINDICATO DE HOTEIS, RESTAURANTES, BARES E SIMILARES DE BRASILIA"
    );
    expect(r[1].partes).toBe("SINDICATO X");
  });
  it("funciona com markup diferente (divs/spans)", () => {
    const d = parseResultados(divs);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ numeroRegistro: "DF000380/2026", tipo: "Convenção Coletiva", vigencia: "01/05/2026 - 30/04/2028" });
    expect(d[0].partes).toBe("SINDICATO A; SINDICATO B");
  });
  it("retorna vazio sem resultados", () => {
    expect(parseResultados("<html><body>Nenhum registro</body></html>")).toEqual([]);
  });
});

describe("parseCabecalhoResultado", () => {
  it("lê total e paginação", () => {
    expect(parseCabecalhoResultado(tabela)).toEqual({ total: 2, paginaAtual: 1, totalPaginas: 1 });
    expect(parseCabecalhoResultado("<p>Resultado: 40 Instrumento(s) Coletivo(s) Encontrado(s) - Página 2 de 4</p>"))
      .toEqual({ total: 40, paginaAtual: 2, totalPaginas: 4 });
  });
});
