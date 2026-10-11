import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {DadosEvento} from './auth-core.js';
const schema=z.discriminatedUnion('tipo',[
  z.object({tipo:z.literal('usuario'),usuario_id:z.number().int().positive()}).strict(),
  z.object({tipo:z.literal('sistema'),rotina:z.literal('preparacao-envios-v1')}).strict(),
]);
export type OrigemPreparo=z.infer<typeof schema>;
export const origemSistemaPreparo:OrigemPreparo={tipo:'sistema',rotina:'preparacao-envios-v1'};
export function validarOrigemPreparo(value:unknown){return schema.parse(value);}
/** Origin is provided by trusted HTTP/CLI code, never the request body. */
export async function auditarPreparoPostgres(client:PoolClient,office:number,origin:OrigemPreparo,action:string,
  details:Record<string,unknown>,event:DadosEvento={}){
  const actor=validarOrigemPreparo(origin),system=actor.tipo==='sistema';
  await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,criado_em,ip,user_agent,request_id,detalhes_json)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[system?null:actor.usuario_id,action,office,Date.now(),
    system?'':(event.ip??'').slice(0,96),system?'preparacao-envios-v1':(event.user_agent??'').slice(0,1000),
    event.request_id??randomUUID(),JSON.stringify({...details,origem:actor})]);
}

