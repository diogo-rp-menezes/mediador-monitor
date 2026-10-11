import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Pool, QueryResultRow } from 'pg';
import { ErroCadastro } from './cadastros.js';
import { withPostgresOfficeTransaction } from './postgres-transaction.js';
import { prepararRelatorioPublicacaoPostgres } from './postgres-consolidacao.js';
import { arquivoPermitido, gerarPdfRelatorio, hashBytes } from './relatorio-core.js';
import {validarTipoDestinatario} from './preferencias-envio.js';
import {auditarPreparoPostgres,validarOrigemPreparo,origemSistemaPreparo,type OrigemPreparo} from './postgres-preparation-origin.js';
import type {DadosEvento} from './auth-core.js';
import {comEscritorArquivosPostgres} from './postgres-backup-gate.js';

type Snapshot={para:string;contato:string;cliente:string;cnpj:string;assunto:string;texto:string;html:string;versao:string;anexos:{nome:string;path:string;hash:string;bytes:number}[]};
type Pair={cliente_id:number;contato_id:number;numero_registro:string;razao_social:string;nome_fantasia:string;cnpj:string;contato:string;email:string;tipos_json:unknown};

function mensagem(report:{tipo:string;numero:string;vigencia:string;versao:string;base:string|null},pair:Pair){
  const cliente=pair.nome_fantasia||pair.razao_social;
  const assunto=`[Novo documento] ${report.tipo} ${report.numero} - ${cliente}`;
  const texto=`Olá, ${pair.contato}.\n\nFoi disponibilizado um instrumento coletivo relacionado a ${pair.razao_social} (CNPJ ${pair.cnpj}).\n\nTipo: ${report.tipo}\nRegistro: ${report.numero}\nVigência: ${report.vigencia||'Confira no documento original'}\nVersão da análise: ${report.versao.slice(0,16)}\n\nSeguem em anexo os documentos originais e o PDF da análise.\n\nA análise é assistida por IA. Confira as condições e o texto integral dos documentos antes de aplicar as informações.\n\nMediador Monitor`;
  const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
  return {assunto,texto,html:`<div style="font:15px/1.6 Arial,sans-serif"><p>Olá, ${esc(pair.contato)}.</p><p>Foi disponibilizado um instrumento coletivo relacionado a <strong>${esc(pair.razao_social)}</strong> (CNPJ ${esc(pair.cnpj)}).</p><p><strong>${esc(report.tipo)}</strong><br>Registro: ${esc(report.numero)}<br>Vigência: ${esc(report.vigencia||'Confira no original')}<br>Versão: ${esc(report.versao.slice(0,16))}</p><p>Seguem em anexo os documentos originais e o PDF da análise.</p><p>Mediador Monitor</p></div>`};
}

export async function prepararEnviosPostgres(pool:Pool,officeId:number,clienteId?:number,target?:{contato_id:number;numero_registro:string},
  options:{origem?:OrigemPreparo;evento?:DadosEvento}={}):Promise<{preparados:number;bloqueados:number}>{
  const origin=validarOrigemPreparo(options.origem??origemSistemaPreparo);
  return comEscritorArquivosPostgres(pool,async signal=>{
  const pairs=await withPostgresOfficeTransaction(pool,officeId,async client=>{
    const result=await client.query<Pair&QueryResultRow>(`SELECT d.cliente_id,cc.contato_id,d.numero_registro,c.razao_social,c.nome_fantasia,c.cnpj,t.nome contato,t.email,cc.tipos_json
    FROM clientes_documentos d JOIN clientes c ON c.id=d.cliente_id AND c.escritorio_id=d.escritorio_id
    JOIN clientes_contatos cc ON cc.cliente_id=d.cliente_id AND cc.escritorio_id=d.escritorio_id
    JOIN contatos t ON t.id=cc.contato_id AND t.escritorio_id=cc.escritorio_id
    WHERE d.escritorio_id=$1 AND d.status='confirmado' AND d.incluir_envio AND c.ativo AND t.ativo AND cc.receber_email
      AND ($2::integer IS NULL OR d.cliente_id=$2)
      AND ($3::integer IS NULL OR cc.contato_id=$3) AND ($4::text IS NULL OR d.numero_registro=$4)
      ORDER BY d.numero_registro,cc.contato_id LIMIT 20`,[officeId,clienteId??null,target?.contato_id??null,target?.numero_registro??null]);
    return result.rows;
  });
  let preparados=0,bloqueados=0;
  for(const pair of pairs){
    signal.throwIfAborted();
    let reservaId:number|null=null;
    try{
      const prepared=await prepararRelatorioPublicacaoPostgres(pool,officeId,pair.cliente_id,pair.numero_registro);
      validarTipoDestinatario(pair.tipos_json,prepared.relatorio.tipo);
      const reserved=await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const superseded=await client.query(`UPDATE envios_clientes SET status='cancelado',motivo='Conteúdo alterado: prepare e revise a nova versão.',proxima_tentativa=NULL,atualizado_em=now()
          WHERE escritorio_id=$1 AND cliente_id=$2 AND contato_id=$3 AND numero_registro=$4 AND versao<>$5 AND status IN ('bloqueado','revisao','na_fila','falhou') RETURNING id`,[officeId,pair.cliente_id,pair.contato_id,pair.numero_registro,prepared.relatorio.versao]);
        if(superseded.rowCount)await auditarPreparoPostgres(client,officeId,origin,'ENVIOS_PREPARACAO_VERSOES_SUPERADAS',
          {envio_ids:superseded.rows.map(row=>row.id)},options.evento);
        const row=await client.query<{id:number;status:string;snapshot_json:unknown}&QueryResultRow>(`INSERT INTO envios_clientes(escritorio_id,cliente_id,contato_id,numero_registro,versao,status)
          VALUES($1,$2,$3,$4,$5,'bloqueado') ON CONFLICT(cliente_id,contato_id,numero_registro,versao) DO UPDATE SET atualizado_em=envios_clientes.atualizado_em
          RETURNING id,status,snapshot_json`,[officeId,pair.cliente_id,pair.contato_id,pair.numero_registro,prepared.relatorio.versao]);
        const item=row.rows[0];
        if(item.snapshot_json||!['bloqueado','revisao','falhou'].includes(item.status))return null;
        const changed=await client.query(`UPDATE envios_clientes SET status='preparando',erro=NULL WHERE id=$1 AND escritorio_id=$2 AND status IN ('bloqueado','revisao','falhou')`,[item.id,officeId]);
        if(changed.rowCount)await auditarPreparoPostgres(client,officeId,origin,'ENVIO_PREPARACAO_INICIADA',{envio_id:item.id},options.evento);
        return changed.rowCount?item.id:null;
      });
      if(!reserved)continue;
      reservaId=reserved;
      const pdf=await gerarPdfRelatorio(prepared.relatorio,prepared.cliente);
      signal.throwIfAborted();
      const dir=resolve('data','envios',randomUUID());mkdirSync(dir,{recursive:true});
      const anexos:Snapshot['anexos']=[];
      for(const file of prepared.relatorio.arquivos){const bytes=readFileSync(arquivoPermitido(file.path));if(hashBytes(bytes)!==file.hash)throw new ErroCadastro('Documento alterado durante a preparação.',409);const name=file.nome;const path=join(dir,name);writeFileSync(path,bytes,{flag:'wx'});anexos.push({nome:name,path,hash:file.hash,bytes:bytes.length});}
      const pdfName=`${pair.numero_registro.replace(/[^A-Z0-9_-]/gi,'_')}_analise.pdf`,pdfPath=join(dir,pdfName);writeFileSync(pdfPath,pdf,{flag:'wx'});anexos.push({nome:pdfName,path:pdfPath,hash:hashBytes(pdf),bytes:pdf.length});
      const snap:Snapshot &{preparacao:OrigemPreparo}={para:pair.email,contato:pair.contato,cliente:pair.razao_social,cnpj:pair.cnpj,versao:prepared.relatorio.versao,...mensagem(prepared.relatorio,pair),anexos,preparacao:origin};
      const current=await prepararRelatorioPublicacaoPostgres(pool,officeId,pair.cliente_id,pair.numero_registro);
      signal.throwIfAborted();
      if(current.fingerprint!==prepared.fingerprint)throw new ErroCadastro('Conteúdo alterado durante a preparação. Prepare novamente.',409);
      const saved=await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const result=await client.query(`UPDATE envios_clientes SET snapshot_json=$1::jsonb,status='revisao',motivo=NULL,erro=NULL,aprovado_por=NULL,aprovado_em=NULL,contexto_aprovacao=NULL,atualizado_em=now()
        WHERE id=$2 AND escritorio_id=$3 AND status='preparando' AND EXISTS (
          SELECT 1 FROM clientes c JOIN clientes_contatos cc ON cc.cliente_id=c.id AND cc.escritorio_id=c.escritorio_id
          JOIN contatos t ON t.id=cc.contato_id AND t.escritorio_id=cc.escritorio_id
          JOIN clientes_documentos d ON d.cliente_id=c.id AND d.escritorio_id=c.escritorio_id
          WHERE c.id=envios_clientes.cliente_id AND c.escritorio_id=$3 AND t.id=envios_clientes.contato_id
            AND d.numero_registro=envios_clientes.numero_registro AND c.ativo AND t.ativo AND cc.receber_email
            AND d.status='confirmado' AND d.incluir_envio AND c.razao_social=$4 AND c.cnpj=$5 AND t.nome=$6 AND t.email=$7
            AND cc.tipos_json=$8::jsonb
        )`,[JSON.stringify(snap),reserved,officeId,pair.razao_social,pair.cnpj,pair.contato,pair.email,typeof pair.tipos_json==='string'?pair.tipos_json:JSON.stringify(pair.tipos_json)]);
        if(result.rowCount)await auditarPreparoPostgres(client,officeId,origin,'ENVIO_PREPARACAO_CONCLUIDA',{envio_id:reserved},options.evento);
        return result;
      });
      if(!saved.rowCount)throw new ErroCadastro('Preparação concorrente interrompida. Reprepare o envio.',409);
      preparados++;
    }catch(error){
      bloqueados++;
      if(reservaId!==null)await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const changed=await client.query(`UPDATE envios_clientes SET status='falhou',erro=$1,atualizado_em=now()
          WHERE escritorio_id=$2 AND id=$3 AND status='preparando'`,[(error as Error).message.slice(0,2000),officeId,reservaId]);
        if(changed.rowCount)await auditarPreparoPostgres(client,officeId,origin,'ENVIO_PREPARACAO_FALHOU',{envio_id:reservaId},options.evento);
      });
    }
  }
  return {preparados,bloqueados};
  });
}


