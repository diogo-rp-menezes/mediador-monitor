import { describe, expect, it } from 'vitest';
import { prepararFiltros } from '../src/scraper.js';

const sindicato = {
  name: 'SECHOSC', cnpj: '00.721.175/0001-98', categoria: '',
  tipo: 'Convenção Coletiva', vigencia: 'Vigentes', uf: 'DF', titulo: ''
};

describe('Filtros reais do Mediador', () => {
  it('mapeia os valores enviados para os values oficiais dos selects', () => {
    expect(prepararFiltros(sindicato)).toEqual({
      cnpj: '00.721.175/0001-98', categoria: '', titulo: '',
      tipo: 'convencao', vigencia: '1', uf: 'DF'
    });
  });
  it('mantém valores padrão CCT e vigentes para cadastros legados', () => {
    expect(prepararFiltros({...sindicato, tipo:'', vigencia:''})).toMatchObject({tipo:'convencao',vigencia:'1'});
  });
  it('permite consultar instrumentos não vigentes', () => {
    expect(prepararFiltros({...sindicato, vigencia:'Não Vigentes'}).vigencia).toBe('0');
  });
  it('não consulta indiscriminadamente quando sindicato não tem identificador', () => {
    expect(() => prepararFiltros({...sindicato, cnpj:'', categoria:'', titulo:''})).toThrow(/sem CNPJ/);
  });
  it('aceita categoria ou palavra do título como identificação', () => {
    expect(prepararFiltros({...sindicato, cnpj:'', categoria:'hotéis'}).categoria).toBe('hotéis');
  });
});
