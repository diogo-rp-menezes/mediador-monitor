import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {ErroCadastro} from './cadastro-erro.js';
export const COOKIE_SESSAO = 'mediador_sessao';
export const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;
export const INATIVIDADE_SESSAO_MS = 30 * 60 * 1000;
export const DURACAO_RECUPERACAO_MS = 30 * 60 * 1000;
export type PapelPlataforma = 'administrador_plataforma' | 'suporte';
export interface Identidade {
  usuario_id: number; nome: string; email: string; papel_plataforma: PapelPlataforma | null;
  sessao_hash: string; expira_em: number;
}
export interface DadosEvento { ip?: string; user_agent?: string; request_id?: string }
export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
export const SenhaSchema = z.string().max(128).refine(v => [...v].length >= 15 && v.trim().length > 0,
  'Use uma senha com pelo menos 15 caracteres.');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const tokenValido = (v: string) => /^[A-Za-z0-9_-]{43}$/.test(v);
export const novoToken = () => randomBytes(32).toString('base64url');
export const tokenCsrf = (token: string) => hashToken('csrf:' + token);

let derivacoes = 0;
const aguardando: Array<() => void> = [];
async function derivar(senha: string, salt: Buffer): Promise<Buffer> {
  if (derivacoes >= 2) await new Promise<void>(resolve => aguardando.push(resolve));
  else derivacoes++;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(senha, salt, 32,
      { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (erro, result) => erro ? reject(erro) : resolve(result)));
  } finally {
    const proxima = aguardando.shift();
    if (proxima) proxima(); else derivacoes--;
  }
}
export async function criarHashSenha(senha: string): Promise<string> {
  SenhaSchema.parse(senha);
  const salt = randomBytes(16), hash = await derivar(senha, salt);
  return `scrypt$131072$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verificarSenha(senha: string, salvo?: string): Promise<boolean> {
  const valido = !!salvo && /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(salvo);
  const partes = valido ? salvo!.split('$') : [];
  const calculado = await derivar(senha, valido ? Buffer.from(partes[4], 'hex') : Buffer.alloc(16));
  const esperado = valido ? Buffer.from(partes[5], 'hex') : Buffer.alloc(32);
  return timingSafeEqual(calculado, esperado) && valido;
}

export function lerCookieSessao(cookie = ''): string {
  const encontrados = cookie.split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE_SESSAO + '='));
  if (encontrados.length !== 1) return '';
  const token = encontrados[0].slice(COOKIE_SESSAO.length + 1);
  return tokenValido(token) ? token : '';
}
export function cookieSessao(token: string, secure: boolean, remover = false): string {
  return `${COOKIE_SESSAO}=${remover ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${remover ? 0 : DURACAO_SESSAO_MS / 1000}${secure ? '; Secure' : ''}`;
}
export function exigirCsrf(token: string, recebido: unknown): void {
  const esperado = tokenCsrf(token);
  if (typeof recebido !== 'string' || !/^[a-f0-9]{64}$/.test(recebido) || !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado)))
    throw new ErroCadastro('Requisição não autorizada. Atualize a página.', 403);
}

