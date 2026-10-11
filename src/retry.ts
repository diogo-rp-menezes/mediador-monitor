/** Falha determinística: repetir não ajuda (seletor desatualizado, formulário mudou...). */
export class NaoRepetir extends Error {}
/** O portal exigiu verificação humana (ex.: Cloudflare). Não insistir e não tentar contornar. */
export class BloqueioError extends NaoRepetir {}

export async function comRetry<T>(fn: () => Promise<T>, tentativas: number, rotulo: string): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (e instanceof NaoRepetir) throw e;
      if (i === tentativas) break;
      const espera = Math.min(60_000, 2 ** i * 2_000) + Math.random() * 1_000; // backoff exponencial + jitter
      console.warn(`[retry] ${rotulo} falhou (${i}/${tentativas}): ${(e as Error).message}. Nova tentativa em ${Math.round(espera / 1000)}s`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw ultimo;
}
