import { describe, expect, it, vi, afterEach } from 'vitest';
import { CAMPOS_CCT, NAO_CONSTA_CCT, SECOES_CCT, validarExtracaoCct, renderizarCctMarkdown } from '../src/cct-template.js';
import { extrairClausulas, normalizarExtracao, paraVisao } from '../src/extract.js';

const cfg = { ativo:true, baseUrl:'http://local/v1', apiKey:'', model:'teste' };
const vazios = () => Object.fromEntries(CAMPOS_CCT.map(c => [c.id, NAO_CONSTA_CCT]));
afterEach(() => vi.unstubAllGlobals());

describe('Contrato canônico do template CCT', () => {
  it('preserva as nove seções e 60 campos com IDs únicos', () => {
    expect(SECOES_CCT).toHaveLength(9);
    expect(CAMPOS_CCT).toHaveLength(60);
    expect(new Set(CAMPOS_CCT.map(c=>c.id)).size).toBe(60);
    expect(SECOES_CCT[0].titulo).toContain('Identificação e Metadados');
    expect(SECOES_CCT[8].titulo).toContain('Disposições Gerais');
  });
  it('preserva o valor original e exige ausência literal', () => {
    const campos = vazios();
    campos[CAMPOS_CCT.find(c=>c.rotulo==='Piso Geral')!.id] = 'R$ 1.750,68';
    const ext = validarExtracaoCct({campos});
    expect(ext.campos[CAMPOS_CCT.find(c=>c.rotulo==='Piso Geral')!.id]).toBe('R$ 1.750,68');
    expect(renderizarCctMarkdown(ext)).toContain('**Piso Geral:** R$ 1.750,68');
    expect(renderizarCctMarkdown(ext)).toContain('**Foro / Solução de Conflitos:** Não consta na CCT');
  });
  it('não confunde campo omitido na resposta do modelo com ausência no documento', () => {
    expect(()=>validarExtracaoCct({campos:{}})).toThrow('60 campo(s) ausente(s)');
  });
  it('popula o painel padronizado após uma resposta de LLM válida', async () => {
    const campos = vazios();
    campos[CAMPOS_CCT.find(c=>c.rotulo==='Percentual de Reajuste')!.id] = '5,2%';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({campos})}}]}))));
    const extracao = await extrairClausulas('CONVENÇÃO COLETIVA...', cfg);
    expect(extracao?.padrao?.campos[CAMPOS_CCT.find(c=>c.rotulo==='Percentual de Reajuste')!.id]).toBe('5,2%');
    const vista = paraVisao(extracao)!;
    expect('secoes' in vista).toBe(true);
    expect(vista.secoes).toHaveLength(9);
    expect(normalizarExtracao(extracao)?.padrao?.versao).toBe('1.0.0');
  });
  it('não trunca silenciosamente documentos longos', async () => {
    await expect(extrairClausulas('a'.repeat(150001), cfg)).rejects.toThrow('excede');
  });
});
