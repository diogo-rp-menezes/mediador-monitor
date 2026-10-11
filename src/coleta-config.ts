import {z} from 'zod';
import {env} from './config.js';

const schema=z.object({
  headless:z.boolean(),
  canal:z.string().trim().max(100).regex(/^[a-zA-Z0-9_-]*$/),
  timeout_ms:z.number().int().min(1000).max(240000),
  formulario_timeout_ms:z.number().int().min(1000).max(60000),
  max_paginas:z.number().int().min(1).max(50),
}).strict();

/** Only non-secret collection options; values are captured when the process starts. */
export function configuracaoColeta(values:unknown={headless:env.headless,canal:env.browserChannel,timeout_ms:env.timeoutMs,formulario_timeout_ms:env.formTimeoutMs,max_paginas:env.maxPages}){
  return schema.parse(values);
}
