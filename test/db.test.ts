import { describe, expect, it } from "vitest";
import { existe, filtrarNovos, openDb, salvarRegistro } from "../src/db.js";
import type { Registro } from "../src/types.js";

const reg = (n: string, indice = 0): Registro => ({
  numeroRegistro: n, numeroSolicitacao: "", tipo: "CCT", vigencia: "", partes: "", indice
});

describe("diff por número de registro", () => {
  it("só retorna inéditos e deduplica a própria lista", () => {
    const db = openDb(":memory:");
    salvarRegistro(db, "w", reg("DF000001/2026"), true);
    const novos = filtrarNovos(db, [reg("DF000001/2026"), reg("DF000002/2026"), reg("DF000002/2026")]);
    expect(novos.map((x) => x.numeroRegistro)).toEqual(["DF000002/2026"]);
    expect(existe(db, "DF000001/2026")).toBe(true);
    expect(existe(db, "DF000009/2026")).toBe(false);
  });
});

// Regressão: registro descoberto sem Word/PDF não pode bloquear tentativas futuras.
import { precisaDownload, upsertRegistro, salvarArquivo } from '../src/db.js';

describe('recuperação de downloads incompletos', () => {
  it('permite tentar novamente quando não há arquivo físico', () => {
    const db = openDb(':memory:');
    upsertRegistro(db, 'monitor', reg('DF000380/2026'));
    expect(precisaDownload(db, 'DF000380/2026')).toBe(true);
    salvarArquivo(db, 'DF000380/2026', {
      path: 'downloads/arquivo-que-nao-existe.doc', hash: 'teste', bytes: 123, original: 'original.doc'
    });
    expect(precisaDownload(db, 'DF000380/2026')).toBe(true);
  });
});
