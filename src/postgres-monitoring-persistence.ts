import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import type {Watch} from './config.js';
import type {ConsultaResultado} from './scraper.js';
import type {TrabalhoMonitoramento} from './postgres-monitoring-executor.js';
import {TIPOS_VALIDOS} from './instrumentos.js';
import {withPostgresOfficeTransaction} from './postgres-transaction.js';
import {ErroCadastro} from './cadastros.js';
import {validarOriginalColetado,conferirBytesOriginalColetado} from './postgres-monitoring-original.js';
import {limiteVolumeMonitoramentoBytes,conferirVolumeMonitoramento} from './postgres-monitoring-limits.js';

type Reserva=Parameters<TrabalhoMonitoramento>[0];
const recordSchema=z.object({numeroRegistro:z.string().regex(/^[A-Z]{2}\d{6}\/\d{4}$/),
  numeroSolicitacao:z.string().max(100),tipo:z.string().refine(tipo=>TIPOS_VALIDOS.has(tipo)&&tipo!=='Todos os tipos'),
  vigencia:z.string().max(500),partes:z.string().max(20000),indice:z.number().int().nonnegative()}).strict();
const fields=['nome','cnpj_filtro','categoria','uf','vigencia','titulo'] as const;
const sameFilter=(a:Record<string,unknown>,b:Record<string,unknown>)=>fields.every(field=>a[field]===b[field])&&
  JSON.stringify(a.tipos_json)===JSON.stringify(b.tipos_json);

/** Saves public metadata/original references and private collection evidence atomically; no IA or deliveries. */
export function criarPersistenciaColetaPostgres(pool:Pool,options:{maxBytes?:number}={}){
  return async(reserva:Reserva,watch:Watch,result:ConsultaResultado,signal:AbortSignal)=>{
    signal.throwIfAborted();
    if(result.erros.length)throw new ErroCadastro('Resultado incompleto.',409);
    const limit=options.maxBytes??Math.min(limiteVolumeMonitoramentoBytes(reserva.escritorio_id),reserva.limites?reserva.limites.volume_mib*1048576:Infinity);
    conferirVolumeMonitoramento({},[...result.arquivos.values()],limit);
    const parsed=z.array(recordSchema).max(10000).parse(result.registros);
    const records=new Map<string,Omit<z.infer<typeof recordSchema>,'indice'>>();
    for(const {indice:_,...record} of parsed){
      if(watch.tipo!=='Todos os tipos'&&record.tipo!==watch.tipo)throw new ErroCadastro('Resultado não corresponde ao tipo consultado.',409);
      const previous=records.get(record.numeroRegistro);
      if(previous&&JSON.stringify(previous)!==JSON.stringify(record))throw new ErroCadastro('Resultados duplicados divergentes.',409);
      records.set(record.numeroRegistro,record);
    }
    const ordered=[...records.values()].sort((a,b)=>a.numeroRegistro.localeCompare(b.numeroRegistro));
    const originals=new Map<string,Awaited<ReturnType<typeof validarOriginalColetado>>>();
    for(const [number,file] of result.arquivos){
      if(!records.has(number))throw new ErroCadastro('Original não corresponde ao lote consultado.',409);
      originals.set(number,await validarOriginalColetado(number,file,signal));
    }
    const originalEvidence=[...originals].map(([numero,file])=>({numero,hash:file.hash,bytes:file.bytes})).sort((a,b)=>a.numero.localeCompare(b.numero));
    const hash=createHash('sha256').update(JSON.stringify({registros:ordered,originais:originalEvidence})).digest('hex');
    return withPostgresOfficeTransaction(pool,reserva.escritorio_id,async client=>{
      signal.throwIfAborted();
      if(!(await client.query('SELECT id FROM escritorios WHERE id=$1 AND ativo=true FOR SHARE',[reserva.escritorio_id])).rowCount)
        throw new ErroCadastro('Escritório indisponível para coleta.',409);
      const execution=(await client.query(`SELECT detalhes_json FROM execucoes_escritorio WHERE id=$1 AND escritorio_id=$2
        AND status='executando' AND detalhes_json->>'formato'='monitoramento-execucao-v1'
        AND detalhes_json->>'reserva_token'=$3 FOR UPDATE`,[reserva.id,reserva.escritorio_id,reserva.token])).rows[0];
      if(!execution||execution.detalhes_json.cancelamento_solicitado===true)throw new ErroCadastro('Reserva cancelada ou indisponível para coleta.',409);
      const current=(await client.query(`SELECT id,sindicato_id,nome,cnpj_filtro,categoria,uf,tipos_json,vigencia,titulo
        FROM monitoramentos_escritorios WHERE id=$1 AND escritorio_id=$2 AND ativo=true FOR SHARE`,
      [execution.detalhes_json.monitoramento_id,reserva.escritorio_id])).rows[0];
      if(!current||current.id!==reserva.monitoramento.id||!sameFilter(current,reserva.monitoramento)||
        watch.name!==current.nome||watch.cnpj!==current.cnpj_filtro||watch.categoria!==current.categoria||watch.uf!==current.uf||
        watch.vigencia!==current.vigencia||watch.titulo!==current.titulo||!current.tipos_json.includes(watch.tipo))
        throw new ErroCadastro('Filtros da coleta alterados ou incompatíveis com a reserva.',409);
      const previous=execution.detalhes_json.coletas?.[watch.tipo];
      if(previous){
        if(previous.hash!==hash)throw new ErroCadastro('Esta consulta já foi persistida com outro resultado.',409);
        for(const [number,file] of originals){
          const saved=(await client.query('SELECT arquivo_path,arquivo_hash FROM registros WHERE numero_registro=$1 FOR SHARE',[number])).rows[0];
          if(!saved?.arquivo_path||saved.arquivo_hash!==file.hash)throw new ErroCadastro('Original persistido indisponível ou divergente.',409);
          conferirBytesOriginalColetado({path:saved.arquivo_path,hash:saved.arquivo_hash,bytes:file.bytes});
        }
        signal.throwIfAborted();return previous;
      }
      conferirVolumeMonitoramento(execution.detalhes_json.coletas??{},originalEvidence,limit);
      let novos=0,originaisAssociados=0;
      for(const record of ordered){
        signal.throwIfAborted();
        // The global registry stores only public MTE fields, never office names or filters.
        const inserted=await client.query(`INSERT INTO registros(numero_registro,numero_solicitacao,watch,tipo,vigencia,partes)
          VALUES($1,$2,'MTE',$3,$4,$5) ON CONFLICT(numero_registro) DO NOTHING RETURNING numero_registro`,
        [record.numeroRegistro,record.numeroSolicitacao,record.tipo,record.vigencia,record.partes]);
        novos+=inserted.rowCount??0;
        const file=originals.get(record.numeroRegistro);
        if(file){
          conferirBytesOriginalColetado(file);
          const saved=(await client.query('SELECT arquivo_path,arquivo_hash FROM registros WHERE numero_registro=$1 FOR UPDATE',[record.numeroRegistro])).rows[0];
          if(saved.arquivo_path||saved.arquivo_hash){
            if(!saved.arquivo_path||saved.arquivo_hash!==file.hash)throw new ErroCadastro('Original existente divergente; revisão administrativa necessária.',409);
            conferirBytesOriginalColetado({path:saved.arquivo_path,hash:saved.arquivo_hash,bytes:file.bytes});
          }else{
            await client.query(`UPDATE registros SET arquivo_path=$2,arquivo_hash=$3,arquivo_tamanho=$4,arquivo_nome=$5,download_erro=NULL
              WHERE numero_registro=$1`,[record.numeroRegistro,file.path,file.hash,file.bytes,file.original]);
            originaisAssociados++;
          }
        }
        await client.query(`INSERT INTO registros_sindicatos(numero_registro,sindicato_id) VALUES($1,$2)
          ON CONFLICT(numero_registro,sindicato_id) DO NOTHING`,[record.numeroRegistro,current.sindicato_id]);
      }
      const evidence={hash,encontrados:ordered.length,novos_catalogo:novos,originais_associados:originaisAssociados,
        originais:originalEvidence,numeros_registro:ordered.map(record=>record.numeroRegistro)};
      const collections={...(execution.detalhes_json.coletas??{}),[watch.tipo]:evidence};
      await client.query(`UPDATE execucoes_escritorio SET detalhes_json=jsonb_set(detalhes_json,'{coletas}',$3::jsonb)
        WHERE id=$1 AND escritorio_id=$2`,[reserva.id,reserva.escritorio_id,JSON.stringify(collections)]);
      signal.throwIfAborted();return evidence;
    });
  };
}

