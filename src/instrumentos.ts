/** Opções observadas no HTML real do Mediador. O valor é a etiqueta persistida; mte é o value do select. */
export const TIPOS_INSTRUMENTO = [
  { nome: 'Convenção Coletiva', mte: 'convencao' },
  { nome: 'Termo Aditivo de Convenção Coletiva', mte: 'termoAditivoConvecao' },
  { nome: 'Acordo Coletivo', mte: 'acordo' },
  { nome: 'Termo Aditivo de Acordo Coletivo', mte: 'termoAditivoAcordo' },
  { nome: 'Acordo Coletivo Específico - Programa de Proteção ao Emprego', mte: 'acordoColetivoEspecificoPPE' },
  { nome: 'Acordo Coletivo Específico - Autorização de Trabalho nos Domingos e Feriados', mte: 'acordoColetivoEspecificoDomingosFeriados' },
  { nome: 'Termo Aditivo de Acordo Coletivo Programa de Proteção ao Emprego', mte: 'termoAditivoAcordoEspecificoPPE' },
  { nome: 'Termo Aditivo de Acordo Coletivo - Autorização de Trabalho nos Domingos e Feriados', mte: 'termoAditivoAcordoEspecificoDomingoFeriado' },
  { nome: 'Todos os tipos', mte: '' }
] as const;
export const TIPOS_VALIDOS = new Set<string>(TIPOS_INSTRUMENTO.map(x => x.nome));
export const TIPOS_PADRAO = ['Convenção Coletiva', 'Termo Aditivo de Convenção Coletiva'];

/** "Todos os tipos" é filtro único (sem restrição) e nunca se mistura aos específicos. */
export function normalizarTipos(selecionados: readonly string[] | undefined | null, legado = 'Convenção Coletiva'): string[] {
  const entrada = selecionados?.length ? selecionados : [legado || 'Convenção Coletiva'];
  const tipos = [...new Set(entrada)];
  if (tipos.some(t => !TIPOS_VALIDOS.has(t))) throw new Error('Tipo de instrumento não reconhecido no Mediador.');
  return tipos.includes('Todos os tipos') ? ['Todos os tipos'] : tipos;
}

export function expandirTipos<T extends { tipo: string; tipos?: string[] }>(item: T): T[] {
  return normalizarTipos(item.tipos, item.tipo).map(tipo => ({ ...item, tipo, tipos: [tipo] }));
}

export function valorMte(nome: string): string {
  const valor = TIPOS_INSTRUMENTO.find(t => t.nome === nome);
  if (!valor) throw new Error(`Tipo de instrumento desconhecido: ${nome}`);
  return valor.mte;
}
