import { existsSync } from 'node:fs';
import { lerDocumento } from './documento.js';
import type { Db } from './db.js';

/** CCT e seu aditivo continuam instrumentos independentes; o vínculo NÃO modifica o original. */
export interface Vinculo {
  aditivo_registro: string;
  base_registro: string | null;
  referencia_registro: string | null;
  status: 'automatico' | 'confirmado' | 'pendente' | 'rejeitado';
  evidencia: string | null;
  atualizado_em: string;
}
export function ehCct(tipo: string | null): boolean {
  return /conven[çc][ãa]o coletiva/i.test(tipo ?? '') && !/termo aditivo/i.test(tipo ?? '');
}
export function ehAditivoCct(tipo: string | null): boolean {
  return /termo aditivo/i.test(tipo ?? '') && /conven[çc][ãa]o coletiva/i.test(tipo ?? '');
}
const numRegistro = /\b[A-Z]{2}\d{6}\/\d{4}\b/gi;
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

/** Só associa automaticamente quando o ADITIVO referencia formalmente o registro da CCT original. */
export function referenciasExplicitas(texto: string, proprioRegistro: string): { numero: string; evidencia: string }[] {
  const resultados: {numero:string;evidencia:string}[] = [];
  const linhas = texto.replace(/\r/g,'').split(/\n/);
  const vistos = new Set<string>();
  for (let i=0;i<linhas.length;i++) {
    // Limita janela: não confunde o cabeçalho do termo aditivo com a CCT referenciada.
    const trecho = linhas.slice(i, Math.min(i+3,linhas.length)).join(' ').replace(/\s+/g,' ').trim();
    const limpo = normalizar(trecho);
    const mencionaCct = /(?:convencao coletiva(?: de trabalho)?|\bcct\b|instrumento (?:coletivo )?(?:original|principal|aditado))/.test(limpo);
    const referenciaFormal = /(?:registrad[ao]\s+(?:no mte\s+)?sob|registro\s+(?:no mte|da cct|da convencao|original|principal)|instrumento\s+(?:original|principal|aditado)\s+(?:n[ºo.]|numero))/.test(limpo);
    if (!mencionaCct || !referenciaFormal) continue;
    for (const match of trecho.matchAll(numRegistro)) {
      const numero=match[0].toUpperCase();
      if (numero===proprioRegistro.toUpperCase() || vistos.has(numero)) continue;
      // A referência tem de estar próxima do registro, para não ler números de uma tabela longa.
      const pos = match.index ?? 0;
      const antes=normalizar(trecho.slice(Math.max(0,pos-165),pos));
      if (!/(?:registrad[ao]|registro|instrumento\s+(?:original|principal|aditado))/.test(antes)) continue;
      vistos.add(numero);resultados.push({numero,evidencia:trecho.slice(0,330)});
    }
  }
  return resultados;
}

export function invalidarConsolidacao(db: Db, base: string): void {
  db.prepare(`UPDATE consolidacoes_cct SET status='desatualizado', atualizado_em=datetime('now')
    WHERE base_registro=? AND status='consolidado'`).run(base);
}
function baseValida(db: Db, numero: string): boolean {
  const r=db.prepare('SELECT tipo FROM registros WHERE numero_registro=?').get(numero) as {tipo:string}|undefined;
  return !!r && ehCct(r.tipo);
}
export function resolverReferenciasPendentes(db: Db): number {
  const pendentes=db.prepare(`SELECT aditivo_registro, referencia_registro FROM vinculos_aditivos
    WHERE status='pendente' AND referencia_registro IS NOT NULL`).all() as {aditivo_registro:string;referencia_registro:string}[];
  let vinculados=0;
  for (const p of pendentes) {
    if(!baseValida(db,p.referencia_registro)) continue;
    db.prepare(`UPDATE vinculos_aditivos SET base_registro=?, status='automatico', atualizado_em=datetime('now')
      WHERE aditivo_registro=? AND status='pendente'`).run(p.referencia_registro,p.aditivo_registro);
    invalidarConsolidacao(db,p.referencia_registro);vinculados++;
  }
  return vinculados;
}
export function indexarVinculo(db: Db, numero: string, texto: string): Vinculo | null {
  const reg=db.prepare('SELECT tipo FROM registros WHERE numero_registro=?').get(numero) as {tipo:string}|undefined;
  if (!reg) return null;
  if (ehCct(reg.tipo)) { resolverReferenciasPendentes(db); return null; }
  if (!ehAditivoCct(reg.tipo)) return null;
  const atual=db.prepare('SELECT * FROM vinculos_aditivos WHERE aditivo_registro=?').get(numero) as Vinculo|undefined;
  if (atual && (atual.status==='confirmado'||atual.status==='rejeitado')) return atual;
  const refs=referenciasExplicitas(texto,numero);
  // Duas ou mais referências explícitas são ambíguas: NUNCA escolher pela ordem da lista.
  const ref=refs.length===1?refs[0]:null;
  const base=ref && baseValida(db,ref.numero) ? ref.numero : null;
  const status=base?'automatico':'pendente';
  const evidencia=refs.length>1 ? `Referências múltiplas: ${refs.map(r=>r.numero).join(', ')}. Revisão obrigatória.` : ref?.evidencia ?? null;
  db.prepare(`INSERT INTO vinculos_aditivos(aditivo_registro,base_registro,referencia_registro,status,evidencia)
    VALUES (?,?,?,?,?) ON CONFLICT(aditivo_registro) DO UPDATE SET
    base_registro=excluded.base_registro, referencia_registro=excluded.referencia_registro,
    status=excluded.status, evidencia=excluded.evidencia, atualizado_em=datetime('now')`)
    .run(numero,base,ref?.numero??null,status,evidencia);
  if(atual?.base_registro && atual.base_registro!==base) invalidarConsolidacao(db,atual.base_registro);
  if(base) invalidarConsolidacao(db,base);
  return db.prepare('SELECT * FROM vinculos_aditivos WHERE aditivo_registro=?').get(numero) as Vinculo;
}

/** A associação manual tem precedência sobre qualquer redescoberta automática. */
export function definirVinculo(db:Db,aditivo:string,base:string|null): void {
  const row=db.prepare('SELECT tipo FROM registros WHERE numero_registro=?').get(aditivo) as {tipo:string}|undefined;
  if(!row || !ehAditivoCct(row.tipo)) throw new Error('O registro selecionado não é Termo Aditivo de Convenção Coletiva.');
  if(base && (base===aditivo || !baseValida(db,base))) throw new Error('Selecione uma CCT original válida.');
  const anterior=db.prepare('SELECT base_registro FROM vinculos_aditivos WHERE aditivo_registro=?').get(aditivo) as {base_registro:string|null}|undefined;
  db.prepare(`INSERT INTO vinculos_aditivos(aditivo_registro,base_registro,status,evidencia)
    VALUES (?,?,'confirmado','Vínculo selecionado manualmente pelo usuário')
    ON CONFLICT(aditivo_registro) DO UPDATE SET base_registro=excluded.base_registro,
    status='confirmado', evidencia=excluded.evidencia, atualizado_em=datetime('now')`).run(aditivo,base);
  if(anterior?.base_registro) invalidarConsolidacao(db,anterior.base_registro);
  if(base) invalidarConsolidacao(db,base);
}
export function rejeitarVinculo(db:Db,aditivo:string):void {
  const anterior=db.prepare('SELECT base_registro FROM vinculos_aditivos WHERE aditivo_registro=?').get(aditivo) as {base_registro:string|null}|undefined;
  if(!anterior) throw new Error('Aditivo não indexado.');
  db.prepare(`UPDATE vinculos_aditivos SET base_registro=NULL,status='rejeitado', atualizado_em=datetime('now') WHERE aditivo_registro=?`).run(aditivo);
  if(anterior.base_registro) invalidarConsolidacao(db,anterior.base_registro);
}

/** Migração de documentos já baixados; não altera vínculos revisados manualmente. */
export async function indexarArquivosExistentes(db:Db, onLog:(s:string)=>void=console.log):Promise<number> {
  const registros=db.prepare(`SELECT r.numero_registro,r.arquivo_path FROM registros r
    LEFT JOIN vinculos_aditivos v ON v.aditivo_registro=r.numero_registro
    WHERE r.tipo LIKE '%Aditivo%' AND r.tipo LIKE '%Conven%'
    AND r.arquivo_path IS NOT NULL AND (v.aditivo_registro IS NULL OR v.status='pendente')`).all() as {numero_registro:string;arquivo_path:string}[];
  let total=0;
  for(const r of registros) {
    if(!existsSync(r.arquivo_path)) continue;
    try {indexarVinculo(db,r.numero_registro,await lerDocumento(r.arquivo_path));total++;}
    catch(e){onLog(`[Vínculo ${r.numero_registro}] ${(e as Error).message}`);}
  }
  resolverReferenciasPendentes(db);
  return total;
}
