import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectarFormato, extrairCabecalho, lerDocumento } from "../src/documento.js";

const AMOSTRA = "test/fixtures/sechosc-df.doc"; // CCT real baixada do Mediador (HTML com extensão .doc)

describe("documento baixado do Mediador", () => {
  it("detecta o formato pelo conteúdo, não pela extensão", () => {
    expect(detectarFormato(readFileSync(AMOSTRA))).toBe("html");
    expect(detectarFormato(Buffer.from("%PDF-1.7 ..."))).toBe("pdf");
    expect(detectarFormato(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe("doc-binario");
    expect(detectarFormato(Buffer.from("qualquer coisa"))).toBe("desconhecido");
  });

  it("decodifica ISO-8859-1 e remove scripts", async () => {
    const t = await lerDocumento(AMOSTRA);
    expect(t).toContain("Convenção Coletiva De Trabalho 2026/2028");
    expect(t).toContain("R$1.750,68");
    expect(t).not.toContain("recaptcha");
    expect(t).not.toContain("WebResource.axd");
    expect(t).not.toMatch(/Ã§|Ã£|&#231;/); // sem mojibake nem entidades
  });

  it("extrai o cabeçalho de forma determinística", async () => {
    const c = extrairCabecalho(await lerDocumento(AMOSTRA));
    expect(c.numeroRegistro).toBe("DF000380/2026");
    expect(c.dataRegistro).toBe("19/06/2026");
    expect(c.numeroSolicitacao).toBe("MR036310/2026");
    expect(c.numeroProcesso).toBe("19964.203732/2026-37");
    expect(c.cnpjs).toEqual(["00.721.175/0001-98", "00.386.748/0001-74"]);
    expect(c.titulo).toMatch(/Convenção Coletiva De Trabalho 2026\/2028/);
  });
});
