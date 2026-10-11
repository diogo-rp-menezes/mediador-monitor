import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {auditoriaPublicacoesCsv,listarAuditoriaPublicacoesPostgres} from '../src/postgres-publication-audit.js';

it('exporta campos de auditoria preservando separadores e neutralizando fórmulas',()=>{
  const csv=auditoriaPublicacoesCsv([{id:1,resultado:'texto,"citado"\nlinha',user_agent:' =1+1',criado_em:new Date('2026-10-09T12:00:00Z')}]);
  expect(csv).toContain('"texto,""citado""\nlinha"');expect(csv).toContain('"\' =1+1"');expect(csv).toContain('2026-10-09T12:00:00.000Z');expect(csv.startsWith('\uFEFFid,')).toBe(true);
});
it('consulta somente eventos do escritório sob contexto RLS com limite explícito',async()=>{
  const query=vi.fn(async()=>({rows:[]})),release=vi.fn();
  const pool={connect:async()=>({query,release})} as unknown as Pool;
  await listarAuditoriaPublicacoesPostgres(pool,22);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE escritorio_id=$1 ORDER BY id DESC LIMIT 200'),[22]);
  expect(query).toHaveBeenCalledWith("SELECT set_config('app.escritorio_id', $1, true)",['22']);expect(release).toHaveBeenCalledOnce();
});
