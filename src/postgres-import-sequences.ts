import type {PoolClient} from 'pg';
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
/** Never rewind a destination sequence, even when previously reserved IDs left gaps. */
export async function sincronizarSequenciaImportacao(client:PoolClient,table:string,column:string){
  const sequence=(await client.query(`SELECT c.relname nome FROM pg_class c
    WHERE c.oid=pg_get_serial_sequence($1,$2)::regclass AND c.relnamespace='public'::regnamespace`,[table,column])).rows[0]?.nome as string|undefined;
  if(!sequence)throw new Error('Sequência de importação ausente.');
  const state=(await client.query(`SELECT last_value::text valor,is_called FROM public.${quote(sequence)}`)).rows[0];
  const maximum=(await client.query(`SELECT COALESCE(max(${quote(column)}),0)::text valor FROM public.${quote(table)}`)).rows[0].valor;
  const current=BigInt(state.valor)+(state.is_called?1n:0n),fromRows=BigInt(maximum)+1n;
  const next=current>fromRows?current:fromRows;
  await client.query('SELECT setval($1::regclass,$2::bigint,false)',['public.'+quote(sequence),(next>0n?next:1n).toString()]);
}

