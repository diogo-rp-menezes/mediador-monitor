import Database from 'better-sqlite3';
import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {conferirArquivosPacoteMigracao} from './postgres-migration-package.js';
import {identificarOpcoesImportacao} from './postgres-import-checkpoint.js';
import {vincularOpcoesEstadoImportacao} from './postgres-import-admission.js';
import type {PlanoIdentidade} from './postgres-import-references.js';
import {converterEstadoEnvioLegado,converterEstadoNotificacaoLegada} from './postgres-import-deliveries.js';
import {assinarManifestoMigracao} from './postgres-migration-manifest.js';
import {resumirPendenciasRecuperacao} from './postgres-recovery-summary.js';

export function classificarFilaRecuperacao(source:string,target:string|null,expected:string){
  if(target===null)return 'registro_destino_ausente';
  if(['enviando','preparando','incerto'].includes(source)||['enviando','preparando','incerto'].includes(target))return 'entrega_exige_conferencia';
  if(source==='enviado'&&target==='enviado')return 'historico_enviado_nao_repetir';
  if(target==='enviado')return 'entrega_posterior_registrada_nao_repetir';
  if(target===expected)return 'estado_importado_preservado';
  return 'alteracao_exige_revisao';
}

export function resumirTentativasRecuperacao(attempts:{resultado:string;message_id:unknown}[],status:string,messageId:unknown){
  const accepted=attempts.filter(row=>['aceito_smtp','enviado'].includes(row.resultado));
  const unknown=attempts.filter(row=>!['aceito_smtp','enviado','incerto','falhou'].includes(row.resultado));
  const alertas:string[]=[];
  if(status==='enviado'&&!accepted.length)alertas.push('estado_enviado_sem_tentativa_aceita');
  if(status==='enviado'&&messageId&&!accepted.some(row=>row.message_id===messageId))alertas.push('message_id_sem_correspondencia_na_aceitacao');
  if(unknown.length)alertas.push('resultado_tentativa_desconhecido');
  if(attempts.some(row=>row.resultado==='incerto'))alertas.push('tentativa_incerta_exige_conferencia');
  return {aceitacoes_smtp_registradas:String(accepted.length),resultados_incertos:String(attempts.filter(row=>row.resultado==='incerto').length),
    falhas_registradas:String(attempts.filter(row=>row.resultado==='falhou').length),alertas};
}

/** Administrative, read-only inventory. Never claims SMTP delivery or authorizes queue release. */
export async function compararFilasRecuperacaoPostgres(pool:Pool,path:string,key:Buffer){
  const {manifest}=conferirArquivosPacoteMigracao(path,key);
  const client=await pool.connect();
  let db:Database.Database|undefined;
  try{
    db=new Database(manifest.origem.snapshot,{readonly:true,fileMustExist:true});
    db.pragma('query_only = ON');db.exec('BEGIN');
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if((await client.query('SELECT current_database() nome')).rows[0].nome!==manifest.destino.database)throw new Error('Destino diverge do pacote de recuperação.');
    const saved=(await client.query('SELECT * FROM importacao_privada.lotes WHERE id=1')).rows[0];
    if(!saved||saved.origem_hash!==manifest.origem.conteudo_hash||saved.modo!=='conciliacao')throw new Error('Recibo incompatível com a recuperação.');
    const plans=saved.planos_json as PlanoIdentidade[];
    const expectedOptions=vincularOpcoesEstadoImportacao(identificarOpcoesImportacao(plans,key,'conciliacao'),{origem_hash:manifest.origem.conteudo_hash,destino_hash:manifest.destino.conteudo_hash});
    if(saved.opcoes_hash!==createHash('sha256').update(expectedOptions+manifest.assinatura).digest('hex'))throw new Error('Manifesto diverge do recibo operacional.');
    const rows=(await client.query('SELECT tabela,origem_id::text,destino_id::text FROM importacao_privada.identidades ORDER BY tabela,origem_id')).rows;
    const maps=new Map(rows.map(row=>[`${row.tabela}:${row.origem_id}`,row.destino_id as string]));
    const mapped=(table:string,id:unknown)=>{
      const value=maps.get(`${table}:${id}`);
      const savedId=plans.find(plan=>plan.tabela===table)?.mapeamentos.find(mapping=>String(mapping.origem_id)===String(id))?.destino_id;
      if(value===undefined||String(savedId)!==value)throw new Error('Mapa de identidade incompatível com o recibo.');
      return value;
    };
    const resultados:{tabela:string;origem_id:string;destino_id:string;situacao:string;alertas:string[];evidencias:Record<string,unknown>}[]=[];
    const novas:Record<string,string>={};
    const sourceTables=new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
    const sourceAttempts=sourceTables.has('tentativas_envio')?db.prepare('SELECT id,envio_id,resultado,message_id FROM tentativas_envio').safeIntegers().all() as Record<string,unknown>[]:[];
    const targetAttempts=(await client.query('SELECT id,envio_id,escritorio_id,resultado,message_id FROM tentativas_envio ORDER BY id')).rows;
    const consulted:Record<string,unknown>={tentativas:targetAttempts,mapas:rows,opcoes_hash:saved.opcoes_hash,manifesto_assinatura:manifest.assinatura};
    for(const [table,column] of [['envios_clientes','status'],['notificacoes_publicacoes','estado']] as const){
      const columns=table==='envios_clientes'?'id,status,escritorio_id,cliente_id,contato_id,numero_registro,versao,message_id':'id,estado,escritorio_id,cliente_id,usuario_id,publicacao_id,tentativas';
      const targets=(await client.query(`SELECT ${columns} FROM ${table} ORDER BY id`)).rows;
      consulted[table]=targets;
      const targetMap=new Map(targets.map(row=>[String(row.id),row]));
      const ids=new Set<string>();
      if(sourceTables.has(table))for(const source of db.prepare(`SELECT ${columns} FROM ${table} ORDER BY id`).safeIntegers().iterate() as Iterable<Record<string,unknown>>){
        const id=mapped(table,source.id),target=targetMap.get(id);ids.add(id);
        const expected=table==='envios_clientes'?converterEstadoEnvioLegado(source):converterEstadoNotificacaoLegada(source);
        let situacao=classificarFilaRecuperacao(String(source[column]),target?String(target[column]):null,String(expected[column]));
        const alertas:string[]=[],evidencias:Record<string,unknown>={};
        if(target){
          const refs=table==='envios_clientes'?{escritorio_id:'escritorios',cliente_id:'clientes',contato_id:'contatos'}:{escritorio_id:'escritorios',cliente_id:'clientes',usuario_id:'usuarios',publicacao_id:'publicacoes_documentos'};
          if(Object.entries(refs).some(([field,parent])=>String(target[field])!==mapped(parent,source[field]))||
            (table==='envios_clientes'&&(target.numero_registro!==source.numero_registro||target.versao!==source.versao)))situacao='identidade_documento_divergente';
          if(table==='envios_clientes'){
            const oldAttempts=sourceAttempts.filter(row=>String(row.envio_id)===String(source.id));
            const currentAttempts=targetAttempts.filter(row=>String(row.envio_id)===id);
            const importedIds=new Set<string>();
            for(const attempt of oldAttempts){
              const attemptId=mapped('tentativas_envio',attempt.id);importedIds.add(attemptId);
              const current=targetAttempts.find(row=>String(row.id)===attemptId);
              if(!current)alertas.push('tentativa_importada_ausente');
              else if(String(current.envio_id)!==id||String(current.escritorio_id)!==mapped('escritorios',source.escritorio_id)||current.resultado!==attempt.resultado||current.message_id!==attempt.message_id)alertas.push('tentativa_importada_divergente');
            }
            if(currentAttempts.some(row=>String(row.escritorio_id)!==String(target.escritorio_id)))alertas.push('tentativa_em_outro_escritorio');
            const summary=resumirTentativasRecuperacao(currentAttempts.map(row=>({resultado:String(row.resultado),message_id:row.message_id})),String(target.status),target.message_id);
            const {alertas:attemptAlerts,...counts}=summary;alertas.push(...attemptAlerts);
            Object.assign(evidencias,counts,{tentativas_importadas:String(oldAttempts.length),tentativas_adicionais:String(currentAttempts.filter(row=>!importedIds.has(String(row.id))).length)});
          }else Object.assign(evidencias,{tentativas_registradas:String(target.tentativas),historico_individual_disponivel:false});
        }
        resultados.push({tabela:table,origem_id:String(source.id),destino_id:id,situacao,alertas:[...new Set(alertas)],evidencias});
      }
      novas[table]=String(targets.filter(row=>!ids.has(String(row.id))).length);
    }
    await client.query('COMMIT');
    return {modo:'comparacao_recuperacao',somente_leitura:true,filas_liberadas:false,conciliacao_concluida:false,
      manifesto_assinatura:manifest.assinatura,evidencias_hash:assinarManifestoMigracao(consulted,key),
      registros:resultados,linhas_destino_fora_do_lote:novas,
      resumo:resumirPendenciasRecuperacao(resultados,novas),
      limites:['Estados de banco não comprovam entrega SMTP; conferir o provedor e as tentativas.',
        'Linhas fora do lote podem ser anteriores ou posteriores à migração e exigem revisão.',
        'O relatório não concilia outros cadastros nem libera filas ou remove bloqueios.']};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();db?.close();}
}

