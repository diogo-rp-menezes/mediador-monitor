import type {Pool} from 'pg';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {withPostgresTransaction} from './postgres-transaction.js';
import {inventariarArquivosBackup,type ReferenciaArquivoBackup} from './postgres-backup-inventory.js';
import type {ReferenciaRecuperadaBackup} from './backup-package.js';

const original=z.object({numero_registro:z.string(),arquivo_path:z.string().min(1),arquivo_hash:z.string().regex(/^[a-f0-9]{64}$/)});
const attachment=z.object({path:z.string().min(1),hash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative()}).passthrough();
const snapshot=z.object({anexos:z.array(attachment).min(1)}).passthrough();

/** Rehearsal only. No operational target, services, approvals or queue states are activated. */
export async function remapearArquivosBackupIsolado(pool:Pool,database:string,recoveredRoot:string,references:ReferenciaRecuperadaBackup[]){
  if(!/^mediador_import_test_[a-f0-9]{32}$/.test(database))throw new Error('Remapeamento permitido apenas em destino de ensaio.');
  const root=resolve(recoveredRoot);
  const aliases=new Map<string,string>();
  for(const entry of references){if(!entry.origin||!/^files\/[a-f0-9]{64}\.bin$/.test(entry.path)||aliases.has(entry.origin))throw new Error('Mapa de recuperação inválido.');aliases.set(entry.origin,join(root,...entry.path.split('/')));}
  return withPostgresTransaction(pool,async client=>{
    if((await client.query('SELECT current_database() AS nome')).rows[0]?.nome!==database)throw new Error('Destino divergente.');
    await client.query("SELECT set_config('app.escritorio_id','',true),set_config('app.global_access','true',true)");
    await client.query('LOCK TABLE registros,envios_clientes IN ACCESS EXCLUSIVE MODE');
    const originals=(await client.query('SELECT numero_registro,arquivo_path,arquivo_hash FROM registros WHERE arquivo_path IS NOT NULL ORDER BY numero_registro')).rows.map(row=>original.parse(row));
    const deliveries=(await client.query('SELECT id,snapshot_json FROM envios_clientes WHERE snapshot_json IS NOT NULL ORDER BY id')).rows.map(row=>({id:row.id,snapshot:snapshot.parse(typeof row.snapshot_json==='string'?JSON.parse(row.snapshot_json):row.snapshot_json)}));
    const refs:ReferenciaArquivoBackup[]=[],destinations=new Map<string,string>();
    const map=(path:string)=>{const destination=aliases.get(path);if(!destination)throw new Error('Referência ausente no mapa de recuperação.');destinations.set(path,destination);return destination;};
    for(const doc of originals)refs.push({source:map(doc.arquivo_path),sha256:doc.arquivo_hash});
    for(const delivery of deliveries)for(const file of delivery.snapshot.anexos)refs.push({source:map(file.path),sha256:file.hash,bytes:file.bytes});
    await inventariarArquivosBackup(refs,[root]);
    // All bytes are verified before the first write; SQL failures roll back every path.
    for(const doc of originals)await client.query('UPDATE registros SET arquivo_path=$1 WHERE numero_registro=$2',[map(doc.arquivo_path),doc.numero_registro]);
    for(const delivery of deliveries){const remapped={...delivery.snapshot,anexos:delivery.snapshot.anexos.map(file=>({...file,path:map(file.path)}))};await client.query(`UPDATE envios_clientes SET snapshot_json=$1::jsonb,
      aprovado_por=CASE WHEN status='na_fila' THEN NULL ELSE aprovado_por END,
      aprovado_em=CASE WHEN status='na_fila' THEN NULL ELSE aprovado_em END,
      contexto_aprovacao=CASE WHEN status='na_fila' THEN NULL ELSE contexto_aprovacao END,
      motivo=CASE WHEN status='na_fila' THEN 'Caminhos alterados na recuperação; prepare e revise novamente antes do envio.' ELSE motivo END,
      status=CASE WHEN status='na_fila' THEN 'revisao' ELSE status END WHERE id=$2`,[JSON.stringify(remapped),delivery.id]);}
    return {originais:originals.length,envios:deliveries.length,arquivos:destinations.size};
  });
}

