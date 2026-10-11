import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import type { Db } from './db.js';
import { env } from './config.js';
import { lerConsolidacao, type ResultadoConsolidado } from './consolidacao.js';
import { CAMPOS_CCT, SECOES_CCT, validarExtracaoCct, type PadraoCct } from './cct-template.js';
import { ehAditivoCct, ehCct } from './vinculos.js';
import { ErroCadastro } from './cadastros.js';
import type { Extracao } from './types.js';

import { hashBytes, escaparHtml, arquivoPermitido, renderizarRelatorioHtml, gerarPdfRelatorio, type ArquivoRelatorio, type Relatorio } from './relatorio-core.js';
export { hashBytes, escaparHtml, arquivoPermitido, renderizarRelatorioHtml, gerarPdfRelatorio, type ArquivoRelatorio, type Relatorio } from './relatorio-core.js';
interface DocRow { numero_registro:string; tipo:string; vigencia:string; arquivo_path:string|null; arquivo_hash:string|null; extracao_json:string|null; analise_status:string; analise_concluida_em:string|null }

/** Reutilizado pelos downloads e anexos: nunca entrega caminhos arbitrários ou fora das pastas de dados. */
export function obterRelatorio(db:Db,numero:string):Relatorio {
  const row=db.prepare('SELECT * FROM registros WHERE numero_registro=?').get(numero) as DocRow|undefined;
  if(!row)throw new ErroCadastro('Registro não encontrado.',404);
  if(row.analise_status!=='analisado'||!row.extracao_json)throw new ErroCadastro('Aguarde uma análise concluída sem falhas antes de preparar o envio.',409);
  const analise=JSON.parse(row.extracao_json) as Extracao;
  if(analise.padrao) analise.padrao=validarExtracaoCct(analise.padrao);
  else if(!analise.aditivo?.alteracoes?.length&&!Object.keys(analise.topicos||{}).length)throw new ErroCadastro('A análise salva está vazia. Execute Reanalisar.',409);
  let base:string|null=ehCct(row.tipo)?numero:null;
  if(ehAditivoCct(row.tipo)) {
    const v=db.prepare("SELECT base_registro,status FROM vinculos_aditivos WHERE aditivo_registro=?").get(numero) as {base_registro:string|null;status:string}|undefined;
    if(!v?.base_registro||!['confirmado','automatico'].includes(v.status))throw new ErroCadastro('Confirme a CCT original deste aditivo antes do envio.',409);
    base=v.base_registro;
  }
  const aditivos=base ? db.prepare(`SELECT aditivo_registro FROM vinculos_aditivos WHERE base_registro=? AND status IN ('automatico','confirmado') ORDER BY aditivo_registro`).all(base) as {aditivo_registro:string}[] : [];
  let consolidado:ResultadoConsolidado|null=null;
  if(base&&aditivos.length) {
    const c=lerConsolidacao(db,base);
    if(c?.status!=='consolidado'||!c.resultado)throw new ErroCadastro('Atualize a consolidação da CCT e dos aditivos antes de preparar o envio.',409);
    if(c.resultado.pendencias.length)throw new ErroCadastro(`Resolva as ${c.resultado.pendencias.length} pendências da consolidação antes de enviar ao cliente.`,409);
    consolidado=c.resultado;
    consolidado.padrao=validarExtracaoCct(consolidado.padrao);
  }
  const numeros=base&&aditivos.length?[base,...aditivos.map(a=>a.aditivo_registro)]:[numero];
  const arquivos:ArquivoRelatorio[]=[];
  for(const n of numeros) {
    const doc=db.prepare('SELECT * FROM registros WHERE numero_registro=?').get(n) as DocRow;
    if(doc.analise_status!=='analisado')throw new ErroCadastro(`A análise de ${n} ainda precisa ser concluída.`,409);
    if(!doc.arquivo_path)throw new ErroCadastro(`Documento original de ${n} ainda não foi baixado.`,409);
    const path=arquivoPermitido(doc.arquivo_path), bytes=readFileSync(path), hash=hashBytes(bytes);
    if(doc.arquivo_hash&&doc.arquivo_hash!==hash)throw new ErroCadastro(`O arquivo de ${n} foi alterado. Baixe e reanalise antes de enviar.`,409);
    const ext=bytes.subarray(0,4).toString('latin1')==='%PDF'?'.pdf':'.doc';
    arquivos.push({numero:n,path,nome:n.replace(/[^A-Z0-9_-]/gi,'_')+'_original'+ext,hash,bytes:bytes.length});
  }
  const versao=hashBytes(JSON.stringify({numero,analise,consolidado,arquivos:arquivos.map(a=>({numero:a.numero,hash:a.hash}))}));
  return {numero,tipo:row.tipo,vigencia:row.vigencia,base:consolidado?base:null,versao,analise,consolidado,arquivos,analisado_em:row.analise_concluida_em||''};
}

