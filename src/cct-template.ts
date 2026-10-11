/** Fonte canônica: TEMPLATE_CCT.md enviado pelo usuário. Não altere IDs sem migrar as análises. */
export const VERSAO_TEMPLATE_CCT = "1.0.0" as const;
export const NAO_CONSTA_CCT = "Não consta na CCT" as const;
export interface CampoDefCct { id: string; rotulo: string; instrucao: string }
export interface GrupoDefCct { titulo: string | null; campos: CampoDefCct[] }
export interface SecaoDefCct { titulo: string; grupos: GrupoDefCct[] }
export const SECOES_CCT: SecaoDefCct[] = [
  {
    "titulo": "1. Identificação e Metadados (Chave Única)",
    "grupos": [
      {
        "titulo": null,
        "campos": [
          {
            "id": "s01_numero_do_registro_no_mte",
            "rotulo": "Número do Registro no MTE",
            "instrucao": "[Ex: SP001234/2024 ou \"Não consta na CCT\"]"
          },
          {
            "id": "s01_codigo_da_solicitacao_mediador",
            "rotulo": "Código da Solicitação (Mediador)",
            "instrucao": "[Ex: MR012345/2024 ou \"Não consta na CCT\"]"
          },
          {
            "id": "s01_sindicato_laboral_trabalhadores",
            "rotulo": "Sindicato Laboral (Trabalhadores)",
            "instrucao": "[Nome completo e CNPJ, se disponível]"
          },
          {
            "id": "s01_sindicato_patronal_empregadores",
            "rotulo": "Sindicato Patronal (Empregadores)",
            "instrucao": "[Nome completo e CNPJ, se disponível]"
          },
          {
            "id": "s01_vigencia",
            "rotulo": "Vigência",
            "instrucao": "[Data Início] a [Data Fim]"
          },
          {
            "id": "s01_data_base_da_categoria",
            "rotulo": "Data-Base da Categoria",
            "instrucao": "[Mês de referência, ex: Maio]"
          },
          {
            "id": "s01_abrangencia_territorial",
            "rotulo": "Abrangência Territorial",
            "instrucao": "[Cidades/Estados cobertos]"
          },
          {
            "id": "s01_categoria_profissional",
            "rotulo": "Categoria Profissional",
            "instrucao": "[Descrição sucinta da categoria abrangida]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "2. Cláusulas Econômicas e Salariais",
    "grupos": [
      {
        "titulo": "2.1. Pisos Salariais / Salário Normativo",
        "campos": [
          {
            "id": "s02_piso_geral",
            "rotulo": "Piso Geral",
            "instrucao": "[Valor R$ ou \"Não consta na CCT\"]"
          },
          {
            "id": "s02_pisos_por_funcao_cargo",
            "rotulo": "Pisos por Função / Cargo",
            "instrucao": ""
          },
          {
            "id": "s02_observacoes_regras_de_piso",
            "rotulo": "Observações/Regras de Piso",
            "instrucao": "[Regras específicas para novos contratados, período de experiência, etc.]"
          }
        ]
      },
      {
        "titulo": "2.2. Reajuste e Correção Salarial",
        "campos": [
          {
            "id": "s02_percentual_de_reajuste",
            "rotulo": "Percentual de Reajuste",
            "instrucao": "[% aplicável]"
          },
          {
            "id": "s02_data_de_aplicacao",
            "rotulo": "Data de Aplicação",
            "instrucao": "[Data de início do reajuste]"
          },
          {
            "id": "s02_retroatividade_pagamento_de_diferencas",
            "rotulo": "Retroatividade / Pagamento de Diferenças",
            "instrucao": "[Regras para pagamento de retroativos, se houver]"
          },
          {
            "id": "s02_proporcionalidade_para_novas_admissoes",
            "rotulo": "Proporcionalidade para Novas Admissões",
            "instrucao": "[Regras para quem entrou no meio do período]"
          }
        ]
      },
      {
        "titulo": "2.3. Pagamento de Salários",
        "campos": [
          {
            "id": "s02_data_prazo_limite_de_pagamento",
            "rotulo": "Data/Prazo Limite de Pagamento",
            "instrucao": "[Ex: 5º dia útil]"
          },
          {
            "id": "s02_adiantamento_salarial_vale",
            "rotulo": "Adiantamento Salarial (Vale)",
            "instrucao": "[Percentual, data de pagamento e regras]"
          },
          {
            "id": "s02_comprovante_de_pagamento_holerite",
            "rotulo": "Comprovante de Pagamento (Holerite)",
            "instrucao": "[Regras de fornecimento físico ou digital]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "3. Adicionais e Gratificações",
    "grupos": [
      {
        "titulo": null,
        "campos": [
          {
            "id": "s03_horas_extras_dias_uteis",
            "rotulo": "Horas Extras (Dias Úteis)",
            "instrucao": "[% de adicional]"
          },
          {
            "id": "s03_horas_extras_domingos_e_feriados",
            "rotulo": "Horas Extras (Domingos e Feriados)",
            "instrucao": "[% de adicional]"
          },
          {
            "id": "s03_adicional_noturno",
            "rotulo": "Adicional Noturno",
            "instrucao": "[% de adicional e horário considerado noturno]"
          },
          {
            "id": "s03_insalubridade_periculosidade",
            "rotulo": "Insalubridade / Periculosidade",
            "instrucao": "[Percentuais e base de cálculo definidos na CCT]"
          },
          {
            "id": "s03_adicional_por_tempo_de_servico_anuenio_trienio_quinquenio",
            "rotulo": "Adicional por Tempo de Serviço (Anuênio/Triênio/Quinquênio)",
            "instrucao": "[Percentual, valor e regras de concessão]"
          },
          {
            "id": "s03_gratificacao_de_funcao_quebra_de_caixa",
            "rotulo": "Gratificação de Função / Quebra de Caixa",
            "instrucao": "[Valores e condições]"
          },
          {
            "id": "s03_outros_adicionais",
            "rotulo": "Outros Adicionais",
            "instrucao": "[Descrever se houver ou \"Não consta na CCT\"]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "4. Benefícios e Auxílios",
    "grupos": [
      {
        "titulo": "4.1. Alimentação e Refeição (VA / VR)",
        "campos": [
          {
            "id": "s04_valor_diario_mensal",
            "rotulo": "Valor Diário/Mensal",
            "instrucao": "[Valor R$]"
          },
          {
            "id": "s04_desconto_maximo_do_empregado",
            "rotulo": "Desconto Máximo do Empregado",
            "instrucao": "[% ou valor R$]"
          },
          {
            "id": "s04_obrigatoriedade_em_feriados_horas_extras",
            "rotulo": "Obrigatoriedade em Feriados / Horas Extras",
            "instrucao": "[Sim/Não/Regras]"
          },
          {
            "id": "s04_estatuto_do_beneficio_pat",
            "rotulo": "Estatuto do Benefício (PAT)",
            "instrucao": "[Informa se tem natureza salarial ou indenizatória]"
          }
        ]
      },
      {
        "titulo": "4.2. Vale-Transporte (VT)",
        "campos": [
          {
            "id": "s04_desconto_do_empregado",
            "rotulo": "Desconto do Empregado",
            "instrucao": "[% aplicado sobre o salário base]"
          },
          {
            "id": "s04_possibilidade_de_pagamento_em_dinheiro",
            "rotulo": "Possibilidade de Pagamento em Dinheiro",
            "instrucao": "[Permitido/Proibido/Condições]"
          }
        ]
      },
      {
        "titulo": "4.3. Auxílio Creche / Babá",
        "campos": [
          {
            "id": "s04_valor_do_reembolso_auxilio",
            "rotulo": "Valor do Reembolso/Auxílio",
            "instrucao": "[Valor R$ ou %]"
          },
          {
            "id": "s04_idade_limite_da_crianca",
            "rotulo": "Idade Limite da Criança",
            "instrucao": "[Ex: Até 6 anos ou 72 meses]"
          },
          {
            "id": "s04_condicoes_e_elegibilidade",
            "rotulo": "Condições e Elegibilidade",
            "instrucao": "[Ex: Apenas mães, ambos os pais se na mesma empresa, etc.]"
          }
        ]
      },
      {
        "titulo": "4.4. Seguro de Vida e Auxílio Funeral",
        "campos": [
          {
            "id": "s04_valor_de_cobertura_minima",
            "rotulo": "Valor de Cobertura Mínima",
            "instrucao": "[Valor R$]"
          },
          {
            "id": "s04_custeio",
            "rotulo": "Custeio",
            "instrucao": "[Integralmente pela empresa / Coparticipação do empregado]"
          },
          {
            "id": "s04_auxilio_funeral_valor_servico",
            "rotulo": "Auxílio Funeral (Valor/Serviço)",
            "instrucao": "[Detalhamento do auxílio]"
          }
        ]
      },
      {
        "titulo": "4.5. Outros Benefícios",
        "campos": [
          {
            "id": "s04_plano_de_saude_odontologico",
            "rotulo": "Plano de Saúde / Odontológico",
            "instrucao": "[Regras, coparticipação e obrigatoriedade]"
          },
          {
            "id": "s04_cesta_basica_abono",
            "rotulo": "Cesta Básica / Abono",
            "instrucao": "[Regras de concessão]"
          },
          {
            "id": "s04_complementacao_do_auxilio_doenca_acidentario",
            "rotulo": "Complementação do Auxílio-Doença/Acidentário",
            "instrucao": "[Regras de pagamento da diferença salarial pelo empregador]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "5. Jornada de Trabalho, Escalas e Ponto",
    "grupos": [
      {
        "titulo": null,
        "campos": [
          {
            "id": "s05_carga_horaria_semanal_mensal",
            "rotulo": "Carga Horária Semanal / Mensal",
            "instrucao": "[Ex: 44h semanais / 220h mensais]"
          },
          {
            "id": "s05_jornadas_especiais_escalas_permitidas",
            "rotulo": "Jornadas Especiais / Escalas Permitidas",
            "instrucao": "[Ex: Escala 12x36, 6x1, flexibilidade de horário]"
          },
          {
            "id": "s05_banco_de_horas",
            "rotulo": "Banco de Horas",
            "instrucao": "[Prazo para compensação (ex: 6 meses, 1 ano) e regras de quitação]"
          },
          {
            "id": "s05_intervalo_intrajornada_almoco",
            "rotulo": "Intervalo Intrajornada (Almoço)",
            "instrucao": "[Possibilidade de redução (ex: para 30 min) e regras]"
          },
          {
            "id": "s05_controle_de_ponto",
            "rotulo": "Controle de Ponto",
            "instrucao": "[Sistemas alternativos/eletrônicos autorizados]"
          },
          {
            "id": "s05_teletrabalho_home_office",
            "rotulo": "Teletrabalho / Home Office",
            "instrucao": "[Ajuda de custo, infraestrutura e regras específicas]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "6. Saúde, Segurança e Faltas Justificadas",
    "grupos": [
      {
        "titulo": null,
        "campos": [
          {
            "id": "s06_atestados_medicos",
            "rotulo": "Atestados Médicos",
            "instrucao": "[Prazo de entrega à empresa, ordem de preferência de atestados]"
          },
          {
            "id": "s06_acompanhamento_medico_de_filhos_dependentes",
            "rotulo": "Acompanhamento Médico de Filhos/Dependentes",
            "instrucao": "[Quantidade de dias/horas abonados por ano]"
          },
          {
            "id": "s06_uniforme_e_epis",
            "rotulo": "Uniforme e EPIs",
            "instrucao": "[Obrigatoriedade de fornecimento gratuito e substituição]"
          },
          {
            "id": "s06_exames_medicos_ocupacionais_pcmso",
            "rotulo": "Exames Médicos Ocupacionais (PCMSO)",
            "instrucao": "[Regras específicas da categoria]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "7. Estabilidades Provisórias no Emprego",
    "grupos": [
      {
        "titulo": null,
        "campos": [
          {
            "id": "s07_gestante",
            "rotulo": "Gestante",
            "instrucao": "[Período de estabilidade além do constitucional]"
          },
          {
            "id": "s07_pre_aposentadoria",
            "rotulo": "Pré-Aposentadoria",
            "instrucao": "[Tempo necessário para se aposentar e período de estabilidade concedido]"
          },
          {
            "id": "s07_acidentado_do_trabalho",
            "rotulo": "Acidentado do Trabalho",
            "instrucao": "[Prazos e regras]"
          },
          {
            "id": "s07_retorno_de_ferias_outras_estabilidades",
            "rotulo": "Retorno de Férias / Outras Estabilidades",
            "instrucao": "[Descrever se houver ou \"Não consta na CCT\"]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "8. Relações Sindicais e Contribuições",
    "grupos": [
      {
        "titulo": null,
        "campos": [
          {
            "id": "s08_contribuicao_assistencial_negocial",
            "rotulo": "Contribuição Assistencial / Negocial",
            "instrucao": "[Valor, percentual e forma de desconto]"
          },
          {
            "id": "s08_direito_de_oposicao",
            "rotulo": "Direito de Oposição",
            "instrucao": "[Prazo, local e meio para manifestação de oposição pelo trabalhador]"
          },
          {
            "id": "s08_dia_da_categoria_feriado_do_sindicato",
            "rotulo": "Dia da Categoria / Feriado do Sindicato",
            "instrucao": "[Data e regras de folga/pagamento]"
          },
          {
            "id": "s08_acesso_de_dirigentes_sindicais_a_empresa",
            "rotulo": "Acesso de Dirigentes Sindicais à Empresa",
            "instrucao": "[Regras estabelecidas]"
          }
        ]
      }
    ]
  },
  {
    "titulo": "9. Disposições Gerais e Penalidades",
    "grupos": [
      {
        "titulo": null,
        "campos": [
          {
            "id": "s09_multa_por_descumprimento_da_cct",
            "rotulo": "Multa por Descumprimento da CCT",
            "instrucao": "[Valor R$ ou % aplicado sobre o salário em caso de descumprimento de cláusulas]"
          },
          {
            "id": "s09_foro_solucao_de_conflitos",
            "rotulo": "Foro / Solução de Conflitos",
            "instrucao": "[Mecanismos de negociação ou foro eleito]"
          }
        ]
      }
    ]
  }
];
export const CAMPOS_CCT = SECOES_CCT.flatMap((secao) => secao.grupos.flatMap((grupo) => grupo.campos));
export type EvidenciaCct = { clausula?: string; citacao?: string };
export interface PadraoCct { versao: string; campos: Record<string, string>; evidencias?: Record<string, EvidenciaCct> }

/** Não conserta omissões do modelo fingindo que o documento não contém informação. */
export function validarExtracaoCct(raw: unknown): PadraoCct {
  if (!raw || typeof raw !== "object") throw new Error("LLM não retornou JSON de análise.");
  const valor = raw as Record<string, unknown>;
  const dados = (valor.campos && typeof valor.campos === "object" && !Array.isArray(valor.campos))
    ? valor.campos as Record<string, unknown> : valor;
  const ausentes = CAMPOS_CCT.filter((c) => typeof dados[c.id] !== "string" || !(dados[c.id] as string).trim());
  if (ausentes.length) throw new Error(`LLM retornou análise incompleta: ${ausentes.length} campo(s) ausente(s): ${ausentes.map(c => c.rotulo).join(", ")}. Execute Reanalisar com um modelo que suporte a saída completa.`);
  const campos: Record<string, string> = {};
  for (const c of CAMPOS_CCT) {
    const v = (dados[c.id] as string).trim();
    campos[c.id] = /^n[ãa]o consta(?: na cct)?\.?$/i.test(v) ? NAO_CONSTA_CCT : v;
  }
  const rawEvidence = valor.evidencias && typeof valor.evidencias === "object" && !Array.isArray(valor.evidencias) ? valor.evidencias as Record<string, unknown> : {};
  const evidencias: Record<string, EvidenciaCct> = {};
  for (const c of CAMPOS_CCT) {
    const rawE = rawEvidence[c.id];
    if (!rawE || typeof rawE !== "object" || campos[c.id] === NAO_CONSTA_CCT) continue;
    const e = rawE as Record<string, unknown>;
    const clausula = typeof e.clausula === "string" ? e.clausula.trim() : "";
    const citacao = typeof e.citacao === "string" ? e.citacao.trim().slice(0, 200) : "";
    if (clausula || citacao) evidencias[c.id] = { ...(clausula ? { clausula } : {}), ...(citacao ? { citacao } : {}) };
  }
  return { versao: VERSAO_TEMPLATE_CCT, campos, evidencias };
}

/** Exporta apenas o layout contratado. Evidências ficam no JSON e no painel. */
export function renderizarCctMarkdown(padrao: PadraoCct): string {
  const linhas: string[] = ["# Análise Estruturada de Convenção Coletiva de Trabalho (CCT)", ""];
  for (const secao of SECOES_CCT) {
    linhas.push(`## ${secao.titulo}`, "");
    for (const grupo of secao.grupos) {
      if (grupo.titulo) linhas.push(`### ${grupo.titulo}`, "");
      for (const campo of grupo.campos) {
        const valor = padrao.campos[campo.id] ?? NAO_CONSTA_CCT;
        if (campo.rotulo === "Pisos por Função / Cargo" && valor !== NAO_CONSTA_CCT) {
          const entradas = valor.split(/\r?\n/).map(x => x.trim().replace(/^-\s*/, "")).filter(Boolean);
          linhas.push(`- **${campo.rotulo}:**`, ...entradas.map(e => `  - ${e}`));
        } else linhas.push(`- **${campo.rotulo}:** ${valor}`);
      }
      linhas.push("");
    }
    linhas.push("---", "");
  }
  return linhas.join("\n").trimEnd() + "\n";
}
