# Business Requirements Document (BRD) — Sistema de Histórico e Gestão Documental (dist-historico)

> **Versão:** 1.0 · **Status:** Draft · **Owner:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] · **Última atualização:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]
> **Stakeholders:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] — Sponsor, Product, Engenharia e Compliance são papéis esperados, mas os nomes não são deriváveis do código.

## 1. Executive Summary & Vision

Escritórios que lidam com Convenções Coletivas de Trabalho (CCT), aditivos e documentação sindical enfrentam dificuldade para organizar, vincular e auditar grandes volumes de documentos e cadastros de clientes. O sistema (contexto `dist-historico`) centraliza o histórico de vínculos, documentos e cadastros, com indexação, extração de cabeçalhos, validação de CNPJ, geração de relatórios (HTML/PDF) e trilha de auditoria de segurança. A visão é ser a fonte única e rastreável do histórico documental e cadastral, com vínculos automáticos revisáveis manualmente e controle de acesso por escritório (multi-tenant).

## 2. Problem Statement

* **Problema central:** A gestão do histórico de vínculos (empregados, CCTs, aditivos, sindicatos) e dos documentos associados é manual, dispersa e sem rastreabilidade: documentos baixados não ficam vinculados aos registros, aditivos não são associados às CCTs originais, e não há auditoria confiável de quem acessou ou alterou o quê.
* **Evidências:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] Não há dados de pesquisa, tickets ou feedback no repositório. A existência de rotinas como `indexarArquivosExistentes` (migração retroativa de documentos já baixados) e `resolverReferenciasPendentes` (tratamento de vínculos pendentes) indica dores reais de desorganização documental, mas a quantificação do problema requer levantamento com o negócio.
* **Custo de não agir:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Risco de inconsistência cadastral e documental (vínculos errados ou perdidos), impossibilidade de auditar acessos e alterações, retrabalho na localização de documentos e exposição a risco regulatório por falta de trilha de auditoria. Premissa: o domínio (CCTs, sindicatos, vínculos empregatícios) é sensível a conformidade.

## 3. Target Audience & Personas

> [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] — personas são decisão de negócio/pesquisa de usuário, não algo derivável de `server/`.
> [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — As personas abaixo são hipóteses derivadas dos termos do glossário (ex.: `bootstrapAdministrador`, `exigirCadastroEscritorio`, `auditarCadastro`). Premissas: o sistema é multi-escritório (multi-tenant), com pelo menos um papel administrador e usuários operacionais de cadastro/documentos.

| Persona | Perfil | Necessidade Principal | Ganho Esperado |
| :--- | :--- | :--- | :--- |
| Administrador do Escritório | Responsável pela configuração inicial e gestão de usuários do escritório | Garantir que o escritório esteja cadastrado (`exigirCadastroEscritorio`) e que exista um administrador desde a primeira execução (`bootstrapAdministrador`) | Implantação rápida e controle de acesso desde o dia um |
| Analista de Cadastros | Usuário operacional que mantém clientes, contatos e documentos | Cadastrar e consultar clientes/contatos (`salvarCliente`, `listarClientes`, `detalheCliente`, `salvarContato`, `listarContatos`) com dados normalizados (`normalizarCnpj`, `normalizarTexto`) | Cadastros consistentes e buscáveis, sem duplicidade por variação de formato |
| Analista de Documentos/Vínculos | Responsável por indexar documentos e revisar vínculos automáticos | Indexar documentos (`indexarMetaDocumento`, `indexarVinculo`), revisar vínculos (`definirVinculo`, `rejeitarVinculo`) e resolver pendências (`resolverReferenciasPendentes`) | Histórico completo e vínculos corretos com intervenção manual quando necessário |
| Auditor/Compliance | Verifica conformidade e rastreabilidade | Trilha de auditoria (`auditarSeguranca`, `auditarCadastro`) e integridade de arquivos (`hashBytes`) | Capacidade de responder "quem fez o quê e quando" com evidências |

## 4. Core Objectives & Success Metrics

> [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — Não há métricas, baselines ou metas no repositório. Os objetivos abaixo são propostas derivadas das capacidades observadas no glossário; todos os números precisam ser definidos pelo negócio.

| Objetivo | KPI (Métrica) | Baseline Atual | Meta | Prazo |
| :--- | :--- | :--- | :--- | :--- |
| Centralizar o histórico documental | % de documentos indexados no histórico (`indexarMetaDocumento`) | A definir | A definir | A definir |
| Reduzir vínculos pendentes | Quantidade de referências pendentes não resolvidas (`resolverReferenciasPendentes`) | A definir | A definir | A definir |
| Garantir rastreabilidade | % de ações sensíveis com registro de auditoria (`auditarSeguranca`, `auditarCadastro`) | A definir | 100% (proposta) | A definir |
| Automatizar associação de aditivos a CCTs | % de aditivos vinculados automaticamente com `referenciasExplicitas` | A definir | A definir | A definir |

* **North Star Metric:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Proposta: percentual de registros do histórico com documento vinculado e verificado (integridade via `hashBytes`).
* **Guardrail Metrics:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Zero perda de dados em migrações (`migrarCadastros`, `migrarAutenticacao`); nenhum vínculo revisado manualmente sobrescrito por automação (`indexarArquivosExistentes`); isolamento de dados entre escritórios (`withPostgresOfficeTransaction`).

## 5. Scope Boundaries

### In-Scope
* Gestão de cadastros de clientes e contatos (`salvarCliente`, `listarClientes`, `detalheCliente`, `excluirCadastro`, `salvarContato`, `listarContatos`), com validação e normalização (`cnpjValido`, `normalizarCnpj`, `normalizarTexto`).
* Indexação e consulta de documentos no histórico (`indexarMetaDocumento`, `lerDocumento`, `lerDocumentoBytes`, `arquivoPermitido`, `detectarFormato`, `extrairCabecalho`), incluindo migração retroativa (`indexarArquivosExistentes`).
* Gestão de vínculos: indexação (`indexarVinculo`), vínculo manual (`definirVinculo`), rejeição (`rejeitarVinculo`), consolidação e invalidação (`invalidarConsolidacao`), resolução de pendências (`resolverReferenciasPendentes`) e descoberta de documentos de clientes (`descobrirDocumentosClientes`, `decidirDocumentoCliente`, `contextoDocumentoCliente`).
* Tratamento de CCTs e aditivos (`ehCct`, `ehAditivoCct`, `referenciasExplicitas`, `validarExtracaoCct`, `renderizarCctMarkdown`) e registro de documentos sindicais (`registrarSindicatoDocumento`).
* Relatórios do histórico em HTML e PDF (`renderizarRelatorioHtml`, `gerarPdfRelatorio`, `escaparHtml`) e integridade de conteúdo (`hashBytes`).
* Autenticação e administração de acesso (`login`, `logout`, `criarAutenticacao`, `definirCredencial`, `solicitarRecuperacao`, `recuperar`, `hashToken`, `bootstrapAdministrador`, `possuiAdministrador`, `migrarAutenticacao`).
* Auditoria (`auditarSeguranca`, `auditarCadastro`) e monitoramento configurável (`loadWatchConfig`).
* Operação multi-escritório com isolamento transacional (`exigirCadastroEscritorio`, `withPostgresOfficeTransaction`, `withPostgresGlobalTransaction`, `withPostgresTransaction`).

### Out-of-Scope
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Extração de cabeçalho com inteligência artificial — o glossário afirma explicitamente que `extrairCabecalho` ocorre "sem uso de inteligência artificial".
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Aplicativo desktop/empacotamento Tauri — o projeto não possui `src-tauri/Cargo.toml`.
* [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] Demais exclusões de escopo (integrações externas, módulos futuros) não são deriváveis do código.

### Future Considerations (Not Now)
* [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] Não há evidência no código de itens conscientemente adiados; esta lista deve ser preenchida pelo Product Lead.

## 6. Business Rules & Constraints

> Observação de rastreabilidade: a varredura determinística não detectou tabelas nem rotas no código; as regras abaixo estão ancoradas nos fluxos/termos canônicos do Glossário (artefato-fonte), que é a fonte disponível de comportamento real.

* **BR-01:** Todo CNPJ informado deve ser validado (`cnpjValido`) e normalizado (`normalizarCnpj`) antes de ser persistido, garantindo que o mesmo CNPJ seja reconhecido de forma idêntica em todo o sistema. Aplica-se aos fluxos `salvarCliente` e `descobrirDocumentosClientes`.
* **BR-02:** Textos de cadastro (nomes, descrições) devem ser padronizados via `normalizarTexto` para permitir buscas e comparações consistentes. Aplica-se a `salvarCliente` e `salvarContato`.
* **BR-03:** Nenhuma operação protegida pode prosseguir sem que o escritório esteja devidamente cadastrado (`exigirCadastroEscritorio`); a validação prévia bloqueia o andamento em caso de cadastro inexistente ou incompleto.
* **BR-04:** Um vínculo definido manualmente (`definirVinculo`) prevalece sobre qualquer associação automática; processos de automação (ex.: `indexarArquivosExistentes`) não podem sobrescrever vínculos revisados manualmente.
* **BR-05:** A associação automática de um aditivo a uma CCT (`ehAditivoCct`, `ehCct`) só pode ocorrer quando o aditivo faz referência formal ao registro da CCT original (`referenciasExplicitas`); caso contrário, o vínculo permanece pendente até `resolverReferenciasPendentes`.
* **BR-06:** A confirmação automática em `descobrirDocumentosClientes` só é permitida quando há evidências suficientes; coincidências parciais geram candidatos para revisão, nunca confirmação direta.
* **BR-07:** Somente arquivos que atendam aos critérios da empresa (`arquivoPermitido`) podem ser incluídos no relatório ou no histórico; o formato deve ser identificado por `detectarFormato` antes do processamento.
* **BR-08:** O conteúdo processado de um documento deve corresponder fielmente ao que foi verificado: a leitura de bytes (`lerDocumentoBytes`) ocorre sobre o documento já conferido, e a integridade é comprovada por `hashBytes`.
* **BR-09:** A extração de dados de CCT deve ser validada (`validarExtracaoCct`) para garantir que nenhum conteúdo presente no documento seja omitido no registro.
* **BR-10:** O documento formal da CCT (`renderizarCctMarkdown`) contém apenas o layout contratual acordado; evidências e justificativas permanecem registradas separadamente no sistema.
* **BR-11:** A geração de relatórios (`renderizarRelatorioHtml`, `gerarPdfRelatorio`) usa exclusivamente informações já registradas, sem nova consulta à inteligência artificial; textos exibidos devem passar por `escaparHtml`.
* **BR-12:** Toda ação sensível de segurança (tentativas de acesso, autenticações) e de cadastro deve ser auditável (`auditarSeguranca`, `auditarCadastro`), permitindo rastrear quem fez o quê e quando.
* **BR-13:** Tokens de acesso/recuperação nunca são armazenados em claro: devem passar por `hashToken` antes de persistência. A redefinição de credencial (`definirCredencial`) só ocorre após validação da identidade do solicitante no fluxo `solicitarRecuperacao`/`recuperar`.
* **BR-14:** Deve existir ao menos um administrador no sistema (`possuiAdministrador`); na primeira execução, `bootstrapAdministrador` provisiona automaticamente a conta de administrador.
* **BR-15:** A conta de runtime do banco de dados opera com permissões mínimas, nunca com a conta de administrador/migração (`postgresRuntimeConfigFromEnv`), e o isolamento de papéis é verificado por `validarPapelRuntimePostgres`.
* **BR-16:** Operações no banco são executadas de forma transacional — ou tudo confirma, ou nada é aplicado (`withPostgresTransaction`); operações com escopo de escritório registram o escritório apenas durante a operação (`withPostgresOfficeTransaction`); consultas multi-tenant são restritas a tarefas de autenticação e administração central (`withPostgresGlobalTransaction`).
* **BR-17:** Migrações (`migrarCadastros`, `migrarAutenticacao`) devem preservar integralmente registros, análises, configurações e vínculos anteriores, sem perda de dados.
* **BR-18:** A exclusão de cadastro (`excluirCadastro`) é permanente; a decisão de excluir deve considerar os vínculos históricos associados. [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA quanto ao tratamento de vínculos órfãos — o glossário não detalha o comportamento em cascata.]
* **BR-19:** A invalidação de consolidação (`invalidarConsolidacao`) deve fazer os registros consolidados voltarem ao estado anterior ou serem marcados como não válidos, preservando rastreabilidade da ação.

## 7. Assumptions & Dependencies

* **Premissas:**
  * O sistema opera como aplicação web server-side, multi-escritório (multi-tenant), com isolamento de dados por escritório.
  * O armazenamento operacional usa o motor `better-sqlite3` (conforme stack verificada), com SQL cru (sem ORM). O glossário menciona rotinas nomeadas "Postgres" e a dependência `pg` existe no `package.json`; a convivência dos dois motores e qual é efetivamente o banco de produção precisa ser confirmada com a engenharia. [REQUER VALIDAÇÃO HUMANA]
  * Envio de e-mails (recuperação de senha) é feito via `nodemailer`; automações agendadas via `node-cron`; extração de documentos via `pdf-parse` e `word-extractor`; automação de navegador via `playwright` (provável captura/download de documentos — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]).
* **Dependências externas:**
  * Servidor de e-mail (SMTP) para os fluxos `solicitarRecuperacao`/`recuperar`.
  * Fontes externas de documentos acessadas via automação (`playwright`) — detalhes não deriváveis do código. [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]
  * [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] Dependências regulatórias do domínio trabalhista/sindical (CCTs, aditivos) devem ser mapeadas pelo Compliance.

## 8. Risks & Mitigations (Business-Level)

| Risco | Probabilidade | Impacto | Mitigação |
| :--- | :--- | :--- | :--- |
| Vínculos automáticos incorretos entre aditivos e CCTs comprometem o histórico | Média | Alto | Confirmação automática apenas com `referenciasExplicitas` (BR-05); revisão manual via `definirVinculo`/`rejeitarVinculo` com prevalência do manual (BR-04) |
| Perda ou corrupção de dados em migrações de versão | Média | Alto | BR-17 exige preservação integral em `migrarCadastros`/`migrarAutenticacao`; execução transacional (BR-16) |
| Falta de trilha de auditoria em ações sensíveis (risco regulatório) | Baixa | Alto | BR-12 torna auditoria obrigatória (`auditarSeguranca`, `auditarCadastro`) |
| Exposição de credenciais/tokens | Baixa | Alto | BR-13 (`hashToken`), conta de runtime com permissões mínimas (BR-15) |
| Documento alterado entre verificação e uso, gerando relatório inconsistente | Baixa | Médio | BR-08 (`lerDocumentoBytes` + `hashBytes`) |
| Ambiguidade sobre o motor de banco real (SQLite vs. rotinas "Postgres" no glossário) | Média | Médio | Validação com engenharia antes de decisões de infraestrutura e licenciamento (ver Seção 7) |

## 9. Financial Considerations

> [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] — orçamento, ROI e headcount são decisão de negócio; não há nenhuma fonte no repositório que sustente um número aqui.
> [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — Premissas: aplicação server-side única, sem custos de licenciamento de dependências (todas as dependências listadas são open-source); custos recorrentes prováveis limitados a hospedagem e servidor SMTP.

* **Investimento estimado:** A definir pelo Sponsor/Engenharia (esforço de desenvolvimento e implantação).
* **ROI esperado / Payback:** A definir; sugerir quantificação a partir da redução de retrabalho na localização de documentos e da mitigação de risco regulatório (Seção 2).
* **Modelo de custo recorrente:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Infraestrutura de hospedagem da aplicação web, serviço de e-mail (SMTP) e manutenção/evolução. Sem evidência de custos de licenças de software no repositório.

## 10. Go-to-Market Considerations

> [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] — estratégia de lançamento/enablement é decisão de negócio, não algo derivável de `server/`.
> [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — Premissas: produto B2B para escritórios (multi-tenant), com onboarding que exige cadastro do escritório e provisionamento de administrador.

* **Estratégia de lançamento:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Sugestão: rollout gradual por escritório (beta fechado com 1–2 escritórios), aproveitando que `bootstrapAdministrador` e `exigirCadastroEscritorio` já estruturam o onboarding por tenant; `indexarArquivosExistentes` permite migrar o acervo documental pré-existente de cada escritório no onboarding.
* **Comunicação & Enablement:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Treinar analistas de cadastros e de vínculos nos fluxos de revisão manual (BR-04, BR-05) e o time de compliance nos relatórios de auditoria; materiais necessários: guia de onboarding do escritório e manual de revisão de vínculos.

## 11. Approval & Sign-off

| Papel | Nome | Status | Data |
| :--- | :--- | :--- | :--- |
| Sponsor | [ENTRADA HUMANA NECESSÁRIA] | Pendente | |
| Product Lead | [ENTRADA HUMANA NECESSÁRIA] | Pendente | |
| Engineering Lead | [ENTRADA HUMANA NECESSÁRIA] | Pendente | |

## 12. Revision History

| Versão | Data | Autor | Mudanças |
| :--- | :--- | :--- | :--- |
| 1.0 | [ENTRADA HUMANA NECESSÁRIA] | Pipeline de documentação (geração assistida) | Criação inicial a partir do Glossário e da stack verificada |