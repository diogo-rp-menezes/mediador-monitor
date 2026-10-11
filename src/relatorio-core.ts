import {createHash} from 'node:crypto';
import {existsSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {env} from './config.js';
import type {ResultadoConsolidado} from './consolidacao-core.js';
import {CAMPOS_CCT,SECOES_CCT,type PadraoCct} from './cct-template.js';
import {ErroCadastro} from './cadastro-erro.js';
import type {Extracao} from './types.js';
export const hashBytes = (v: string|Buffer) => createHash('sha256').update(v).digest('hex');
export const escaparHtml = (v: unknown) => String(v??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export interface ArquivoRelatorio { numero: string; path: string; nome: string; hash: string; bytes: number }
export interface Relatorio {
  numero: string; tipo: string; vigencia: string; base: string|null; versao: string;
  analise: Extracao; consolidado: ResultadoConsolidado|null; arquivos: ArquivoRelatorio[]; analisado_em: string;
}
export function arquivoPermitido(path: string): string {
  if(!existsSync(path)) throw new ErroCadastro('Documento original não localizado. Baixe-o novamente.',409);
  const file=realpathSync(path);
  const roots=[env.downloadDir,'data'].map(p => existsSync(p)?realpathSync(p):resolve(p));
  if(!roots.some(root => file.startsWith(root+sep))) throw new ErroCadastro('Documento está fora das pastas permitidas.',403);
  return file;
}
function camposHtml(p:PadraoCct,fontes:Record<string,string>,numero:string):string {
  return SECOES_CCT.map(secao => `<section><h2>${escaparHtml(secao.titulo)}</h2>${secao.grupos.map(grupo =>
    `${grupo.titulo?`<h3>${escaparHtml(grupo.titulo)}</h3>`:''}${grupo.campos.map(c => {
      const valor=p.campos[c.id], e=p.evidencias?.[c.id];
      return `<div class="campo ${valor.length>1800?'longo':''}"><div class="rotulo">${escaparHtml(c.rotulo)}</div><div class="valor">${escaparHtml(valor)}</div>
        <div class="fonte">Fonte: ${escaparHtml(fontes[c.id]||numero)}${e?.clausula?' / '+escaparHtml(e.clausula):''}</div>
        ${e?.citacao?`<blockquote>${escaparHtml(e.citacao)}</blockquote>`:''}</div>`;
    }).join('')}`).join('')}</section>`).join('');
}
/** Só formata dados persistidos; não faz novas chamadas à IA. */
export function renderizarRelatorioHtml(r:Relatorio,cliente?:{razao_social:string;cnpj:string}):string {
  const e=escaparHtml, p=r.consolidado?.padrao||r.analise.padrao;
  const evidencias=p?camposHtml(p,r.consolidado?.fontes||{},r.base||r.numero)
    :r.analise.aditivo?`<h2>Alterações do termo aditivo</h2>${r.analise.aditivo.alteracoes.map(a => `<div class="campo"><div class="rotulo">${e(CAMPOS_CCT.find(c=>c.id===a.campo)?.rotulo||a.campo)}</div><div class="valor">${e(a.valor||'Revogação expressa')}</div><div class="fonte">${e(a.acao)} / ${e(a.clausula)} / ${e(r.numero)}</div><blockquote>${e(a.citacao)}</blockquote></div>`).join('')}`
    :`<h2>Informações do documento</h2>${Object.entries(r.analise.topicos).map(([nome,t]) => `<div class="campo"><div class="rotulo">${e(nome)}</div><div class="valor">${e(t.resumo)}</div><div class="fonte">Fonte: ${e(r.numero)} / ${e(t.clausula||'Cláusula não identificada')}</div>${t.citacao?`<blockquote>${e(t.citacao)}</blockquote>`:''}</div>`).join('')}`;
  const decisoes=(r.consolidado as ResultadoConsolidado & {pendenciasDetalhadas?:{rotulo:string;decisao:string;revisor:string;justificativa:string;valor_decidido:string}[]} | null)?.pendenciasDetalhadas?.filter(x=>x.decisao)||[];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Análise ${e(r.numero)}</title><style>
    @page{size:A4;margin:19mm 17mm 20mm}*{box-sizing:border-box}body{margin:0;color:#243349;font:11px/1.55 Arial,sans-serif;overflow-wrap:anywhere}
    .marca{font-size:10px;font-weight:bold;letter-spacing:2px;color:#5b56cc;margin-bottom:13px}h1{font-size:27px;line-height:1.18;margin:0 0 10px;color:#15233a}h2{font-size:17px;color:#273d68;border-bottom:2px solid #e4e7f2;padding-bottom:8px;margin:23px 0 12px;break-after:avoid}h3{font-size:12px;color:#556780;margin:17px 0 8px;break-after:avoid}
    .sub{font-size:12px;color:#6d7684;margin-bottom:18px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px;background:#f2f4f9;border:1px solid #e4e7ef;border-radius:8px}.meta span{display:block;color:#6e7d91;font-size:9px;text-transform:uppercase;margin-bottom:3px}.meta strong{font-weight:600}.aviso{background:#f8f7ff;border-left:3px solid #7d71e4;padding:11px 13px;margin:15px 0;color:#525677}
    .campo{break-inside:avoid;padding:11px 0;border-bottom:1px solid #e5e8ef}.campo.longo{break-inside:auto}.rotulo{font-size:11px;font-weight:bold;color:#293c5b}.valor{white-space:pre-wrap;margin:4px 0;font-size:11px}.fonte{font-size:9px;color:#7b8295}blockquote{margin:6px 0 0;padding:6px 10px;border-left:2px solid #d0d5e6;color:#647087;font-size:9px;background:#f8f9fc}.origens{font-size:10px;padding:0;list-style:none}.origens li{margin:5px 0}.small{font-size:9px;color:#778094}.decisao{break-inside:avoid;padding:10px;background:#f1f7f4;border-radius:6px;margin:8px 0}
    </style></head><body><div class="marca">MEDIADOR MONITOR</div><h1>${r.base?'Análise consolidada':'Análise do instrumento coletivo'}</h1><div class="sub">${e(r.tipo)} / ${e(r.numero)}</div>
    <div class="meta">${cliente?`<div><span>Cliente</span><strong>${e(cliente.razao_social)}</strong></div><div><span>CNPJ do cliente</span><strong>${e(cliente.cnpj)}</strong></div>`:''}<div><span>Registro comunicado</span><strong>${e(r.numero)}</strong></div><div><span>Vigência do instrumento</span><strong>${e(r.vigencia||'Conferir no original')}</strong></div><div><span>Análise concluída (UTC)</span><strong>${e(r.analisado_em||'Não informada')}</strong></div><div><span>Versão da análise</span><strong>${e(r.versao.slice(0,16))}</strong></div></div>
    <div class="aviso">Análise documental assistida por IA. Confira as condições e o texto integral nos documentos originais. Informações ausentes seguem a indicação da análise salva; decisões de revisão estão identificadas neste relatório.</div>
    <h2>Documentos que sustentam a análise</h2><ul class="origens">${r.arquivos.map(a=>`<li><strong>${e(a.numero)}</strong>${a.numero===r.base?' / CCT original':r.base?' / termo aditivo':' / documento original'}<br><span class="small">SHA-256: ${e(a.hash)}</span></li>`).join('')}</ul>
    ${evidencias}${r.analise.observacoes?.length?`<h2>Observações da análise</h2>${r.analise.observacoes.map(o=>`<p>${e(o)}</p>`).join('')}`:''}
    ${decisoes.length?`<h2>Decisões de revisão</h2>${decisoes.map(d=>`<div class="decisao"><strong>${e(d.rotulo)}</strong><p>${e(d.valor_decidido||'Regra existente preservada')}</p><div class="small">Responsável: ${e(d.revisor)} / Decisão: ${e(d.decisao)}<br>Justificativa: ${e(d.justificativa)}</div></div>`).join('')}`:''}
    </body></html>`;
}
export async function gerarPdfRelatorio(r:Relatorio,cliente?:{razao_social:string;cnpj:string}):Promise<Buffer> {
  const browser=await chromium.launch({headless:true,...(env.browserChannel?{channel:env.browserChannel}:{})});
  try {
    const page=await browser.newPage({javaScriptEnabled:false});
    await page.route('**/*',route=>route.abort());
    await page.setContent(renderizarRelatorioHtml(r,cliente),{waitUntil:'load',timeout:15000});
    return await page.pdf({format:'A4',printBackground:true,displayHeaderFooter:true,
      margin:{top:'19mm',bottom:'20mm',left:'17mm',right:'17mm'},headerTemplate:'<span></span>',
      footerTemplate:`<div style="font:8px Arial;color:#7b8295;width:100%;margin:0 17mm;display:flex;justify-content:space-between"><span>Mediador Monitor / ${escaparHtml(r.numero)} / v.${r.versao.slice(0,8)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`});
  } catch(e) {throw new ErroCadastro('Não foi possível gerar o PDF. Confira a instalação do Chromium (npx playwright install chromium). '+(e as Error).message,409);}
  finally {await browser.close();}
}


