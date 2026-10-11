import { DadosCnpjSchema, ErroCadastro, cnpjValido, normalizarCnpj, type DadosCnpj } from './cadastros.js';

const FONTE = 'BrasilAPI / Minha Receita' as const;
const TTL = 15 * 60 * 1000;
const texto = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const data = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(texto(v)) ? texto(v) : '';
const codigo = (v: unknown) => typeof v === 'number' || typeof v === 'string' ? String(v).padStart(7, '0') : '';

/** Seleciona somente dados cadastrais; não importa sócios nem destinatários de e-mail. */
function mapear(raw: unknown, cnpj: string, agora: Date): DadosCnpj {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ErroCadastro('A consulta retornou dados inválidos. Tente novamente mais tarde.', 502);
  const r = raw as Record<string, unknown>;
  if (normalizarCnpj(texto(r.cnpj)) !== cnpj) throw new ErroCadastro('O CNPJ retornado pela consulta não corresponde ao informado.', 502);
  const resultado = DadosCnpjSchema.safeParse({
    cnpj, fonte: FONTE, consultado_em: agora.toISOString(),
    razao_social: texto(r.razao_social), nome_fantasia: texto(r.nome_fantasia), uf: texto(r.uf), municipio: texto(r.municipio),
    endereco: { logradouro: [texto(r.descricao_tipo_de_logradouro), texto(r.logradouro)].filter(Boolean).join(' '),
      numero: texto(r.numero), complemento: texto(r.complemento), bairro: texto(r.bairro), cep: texto(r.cep).replace(/\D/g, '') },
    cnae_principal: { codigo: codigo(r.cnae_fiscal), descricao: texto(r.cnae_fiscal_descricao) },
    cnaes_secundarios: Array.isArray(r.cnaes_secundarios) ? r.cnaes_secundarios.map(item => {
      const c = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { codigo: codigo(c.codigo), descricao: texto(c.descricao) };
    }) : [],
    situacao_cadastral: texto(r.descricao_situacao_cadastral), data_situacao_cadastral: data(r.data_situacao_cadastral),
    natureza_juridica: texto(r.natureza_juridica), porte: texto(r.porte), inicio_atividade: data(r.data_inicio_atividade)
  });
  if (!resultado.success) throw new ErroCadastro('A consulta retornou dados incompletos ou em formato inesperado. O cadastro manual continua disponível.', 502);
  return resultado.data;
}

/** Consulta pontual, com timeout, cache curto e uma única requisição simultânea por CNPJ. */
export function criarConsultaCnpj(opcoes: { fetch?: typeof fetch; agora?: () => Date; timeoutMs?: number } = {}) {
  const buscar = opcoes.fetch ?? globalThis.fetch;
  const agora = opcoes.agora ?? (() => new Date());
  const cache = new Map<string, { dados: DadosCnpj; expira: number }>();
  const pendentes = new Map<string, Promise<DadosCnpj>>();
  async function carregar(cnpj: string): Promise<DadosCnpj> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs ?? 12000);
    try {
      const resposta = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'MediadorMonitor/0.4.1 (consulta de CNPJ)' }
      });
      if (resposta.status === 404) throw new ErroCadastro('CNPJ não encontrado na base consultada. Você pode preencher o cadastro manualmente.', 404);
      if (resposta.status === 429) throw new ErroCadastro('O serviço atingiu o limite de consultas. Aguarde e tente novamente.', 429);
      if (!resposta.ok) throw new ErroCadastro('O serviço de consulta está indisponível. Tente novamente mais tarde ou preencha manualmente.', 503);
      const dados = mapear(await resposta.json(), cnpj, agora());
      cache.set(cnpj, { dados, expira: agora().getTime() + TTL });
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
      return dados;
    } catch (e) {
      if (e instanceof ErroCadastro) throw e;
      if (controller.signal.aborted) throw new ErroCadastro('A consulta demorou mais que o esperado. Tente novamente ou preencha o cadastro manualmente.', 504);
      throw new ErroCadastro('Não foi possível consultar o CNPJ. Verifique a conexão ou preencha o cadastro manualmente.', 502);
    } finally { clearTimeout(timer); }
  }
  return async (raw: string): Promise<DadosCnpj> => {
    const cnpj = normalizarCnpj(raw);
    if (!cnpjValido(cnpj)) throw new ErroCadastro('CNPJ inválido: confira os dígitos verificadores.');
    const anterior = cache.get(cnpj);
    if (anterior && anterior.expira > agora().getTime()) return structuredClone(anterior.dados);
    let tarefa = pendentes.get(cnpj);
    if (!tarefa) {
      tarefa = carregar(cnpj).finally(() => pendentes.delete(cnpj));
      pendentes.set(cnpj, tarefa);
    }
    return structuredClone(await tarefa);
  };
}
export const consultarCnpj = criarConsultaCnpj();
