# Test Strategy — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Owner:** Engenharia/QA · **Status:** Draft
>
> *Nota de Transparência:* Ferramentas, comandos e parâmetros que não foram detectados diretamente no código ou nos artefatos-fonte (`dev-environment`, `system-architecture`, `nfr`, `user-stories`) estão marcados com `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`.

## 1. Objectives & Quality Goals

* **Zero regressões críticas nos fluxos do MVP (Slice 1):** autenticação (US-001), coleta via Playwright (US-002), extração PDF/DOC (US-003), validação de CNPJ (US-004), migração de legado (US-005), validação humana de extrações (US-006) e renderização Markdown (US-007) devem estar cobertos por testes automatizados antes de qualquer release.
* **Garantir integridade de dados no `better-sqlite3`:** nenhum teste de release pode passar com corrupção, duplicidade (violação de `fingerprintDocumentos` — NFR-A04) ou perda de vínculos na migração (US-005).
* **Reduzir risco de segurança no MVP:** cobertura obrigatória dos cenários BDD de autenticação (login, senha incorreta, CSRF via `exigirCsrf`, autorização via `exigirPermissao`) — NFR-SEC01, NFR-SEC02, NFR-SEC03.
* **Eliminar os 26 `console.*` residuais (NFR-SEC04)** com gate de qualidade que impeça reintrodução.
* **Reduzir complexidade ciclomática com rede de segurança de testes:** refatoração de `criarAcessoHttp` (CC 61), `criarAutenticacao` (CC 22) e `tratar` (CC 26) — NFR-M01 — só é considerada "done" com testes unitários cobrindo os caminhos antes e depois da refatoração (DoD da US-001).
* **MTTD (tempo de detecção de bugs):** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` meta de detecção de falhas de coleta (quebra de seletores Playwright) em < 5 min via alertas (US-011, NFR-O02); demais falhas detectadas no próximo ciclo de CI.

## 2. Test Pyramid

Ancorada estritamente nos runners e scripts reais detectados no `package.json`:

| Camada | Cobertura Mínima | Ferramenta (real) | Comando(s) real(is) | Frequência de Execução | Responsável |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Unit Tests** | 80% global; 95% em auth/CNPJ/fingerprint `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` | **Vitest 2.1** (devDependency real) | `npm run test` (`vitest run`), `npm run test:clientes` (`vitest run test/clientes.test.ts`) | A cada commit (CI) | Dev |
| **Smoke / Integration Tests** | Fluxos críticos: template CCT, estado de análise, wizard Gmail, revisões | **Node test runner nativo** (`node --test`, scripts reais) | `npm run test:smoke` (`test/template-cct.smoke.mjs`), `npm run test:status` (`test/analysis-state.smoke.mjs`), `npm run test:gmail` (`test/gmail-wizard.smoke.mjs`), `npm run test:review` (`test/revisoes.smoke.mjs`) | A cada PR | Dev |
| **E2E Tests** | Jornadas principais: login/auth, fluxo de clientes | **Playwright 1.48** (dependency real; browsers via `npm run playwright:install`) | `npm run test:auth-ui` (`test/auth-ui.e2e.mjs`), `npm run test:clientes-ui` (`test/clientes-ui.e2e.mjs`) | A cada deploy para staging | QA |
| **Contract Tests** | N/A — não há runner de contrato instalado | **Nenhuma detectada.** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` O sistema não expõe API pública versionada (SAD §6); as integrações outbound (portais CCT via scraping, API de CNPJ, SMTP) não têm contrato formal. Recomendação: testes de contrato implícitos via *fixtures de HTML* das fontes externas para detectar quebra de seletores (US-011) e mocks do serviço de CNPJ (US-004). Ferramenta dedicada (ex: Pact) **não é recomendada** neste estágio — não há consumidores de API interna. | — | A cada release | Dev |

**Notas de ancoragem:**
- NFR-M02 exige explicitamente cobertura `vitest` dos fluxos `test:smoke`, `test:auth-ui` e `test:review` — tratados como gate obrigatório.
- Não existe framework de testes de carga instalado; ver §5.
- O projeto **não usa** Jest, Cypress, Supertest ou Testcontainers — nenhum deles deve ser introduzido sem decisão arquitetural.

## 3. Test Environments

| Ambiente | Propósito | Dados | Acesso |
| :--- | :--- | :--- | :--- |
| **Local** | Desenvolvimento e testes unitários/smoke | Banco SQLite descartável criado por `npm run seed`; fixtures de PDF/DOC de amostra (DoD da US-003 exige corpus real das fontes-alvo) | Dev |
| **CI** | Validação automatizada de PR (`vitest run` + `node --test` + `npm run typecheck`) | Banco SQLite efêmero em diretório temporário; sem credenciais reais (`.env` de teste) | Pipeline |
| **Staging** | Homologação pré-produção; execução de `check:auto`, `seed:auto`, `importar-legado` e E2E Playwright | Cópia **anonimizada** dos dados legados (DoR da US-005 exige staging com cópia real — dados pessoais devem ser mascarados, ver §6); SMTP de teste; serviço de CNPJ em ambiente sandbox `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` | QA/PO |
| **Produção** | Smoke tests pós-deploy | Real (somente leitura nos smoke tests) | Automação |

**Restrições da topologia real (SAD §11):** nó único, arquivo `.sqlite` local, sem containers/docker-compose detectados. Não há ambiente multi-nó nem testes de failover entre réplicas — fora de escopo por NFR-S01.

## 4. Coverage Targets

* **Mínimo global:** 80% de linhas/branches via Vitest `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` (o NFR-M02 exige cobertura dos fluxos críticos, mas não define percentual numérico).
* **Crítico (regras de negócio e segurança):** 95% `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` em:
  - `src/autenticacao.ts` (`criarAutenticacao`, `criarHashSenha`, `hashToken`, `solicitarRecuperacao`, `recuperar`, `definirCredencial`) — NFR-SEC01/SEC03;
  - `src/auth-http.ts` (`criarAcessoHttp`, `validarRequisicao`, `tratar`, `exigirCsrf`, `exigirPermissao`) — NFR-SEC02;
  - `normalizarCnpj`, `cnpjValido`, `criarConsultaCnpj` (incl. cache hit/miss/stale — US-004/US-010);
  - `fingerprintDocumentos`, `validarExtracaoCct` (não mascaramento de erros — NFR-C02);
  - `reservarConsolidacao` (retry/backoff, timeout — US-009, NFR-P02/S03).
* **Exclusões justificadas:** scripts CLI pontuais de bootstrap (`auth:bootstrap`, `importar-legado` — validados por smoke/dry-run em staging), arquivos de configuração e `web/` (coberto por E2E, não por unit).
* **Gate adicional de qualidade (não-cobertura):** `npm run typecheck` (TypeScript estrito — NFR-M03) deve passar em todo PR; complexidade ciclomática de `criarAutenticacao` ≤ 10 e `criarAcessoHttp` ≤ 15 após refatoração (DoD US-001); zero `console.*` em `src/` (NFR-SEC04).

## 5. Non-Functional Testing

* **Performance:**
  - **Leitura (NFR-P01):** p95 < 300ms em consultas de CCT/cadastros. Medição via testes de benchmark em Vitest `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` (não há k6/Gatling instalado; recomenda-se benchmark simples com `vitest bench` ou script de medição antes de introduzir ferramenta externa).
  - **Cache CNPJ (NFR-S02):** cache hit p95 < 10ms (DoD US-010) — teste unitário com assert de tempo.
  - **Escrita/concorrência (NFR-P02, NFR-S03):** teste de carga do DoD da US-009 — 10 writers concorrentes × 1000 escritas, zero corrupção, zero timeout indevido; writer morrendo com lock deve liberar (timeout/cleanup).
  - **Extração (NFR-P03):** teste validando que extração de PDF/DOC roda via background (`check:auto`) sem bloquear o event loop.
* **Segurança:**
  - Cenários BDD de US-001/US-008 automatizados: login inválido, CSRF ausente/inválido (HTTP 403), permissão insuficiente (HTTP 403), token de recuperação expirado/reutilizado/adulterado, prevenção de enumeração de e-mails, política de complexidade de senha.
  - Verificação de que senhas existem apenas como hash (`criarHashSenha`) — NFR-SEC01.
  - Auditoria de dependências: `npm audit` em CI `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` (sugerido no SAD §13; não há SAST/DAST instalado — Semgrep/OWASP ZAP são recomendações futuras, não requisito atual).
* **Acessibilidade:** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` NFR-U01/U02 são marcados como entrada humana nos artefatos-fonte. Recomendação: axe-core integrado aos E2E Playwright para o painel (US-012, Slice 3), com critérios WCAG 2.1 AA básicos (contraste, navegação por teclado, labels) — validar com PO antes de tornar gate.
* **Resiliência/Chaos:**
  - Falha induzida de fontes externas: seletor alterado, HTTP 404/500, timeout de rede — coleta deve logar, alertar e **continuar nas demais fontes** (US-002 Scenarios 2/4, US-011).
  - Falha do serviço de CNPJ: erro claro, sem cache de resultado negativo, fallback de cache stale (US-004 Scenario 3, US-010 Scenario 4).
  - Falha parcial de migração: re-execução idempotente de `importar-legado` (US-005 Scenario 4); `check:dry` deve bloquear migração com inconsistências.
  - Lock SQLite mantido > 30s: `ConsolidationLockTimeout` com falha graciosa (US-009 Scenario 3).

## 6. Test Data Management

* **Estratégia de geração:**
  - `npm run seed` / `npm run seed:auto` (scripts reais) para popular banco de desenvolvimento/teste.
  - Fixtures de documentos: corpus real de PDFs/DOCs das fontes-alvo (DoR da US-003), incluindo casos negativos: PDF corrompido, formato não suportado, documento duplicado (mesmo fingerprint).
  - Fixtures de HTML das fontes externas para simular respostas do Playwright sem rede (incluindo variante com layout alterado para US-011).
  - CNPJs de teste: válidos (dígitos verificadores corretos), inválidos, e mock do serviço externo para cenários de timeout/5xx.
* **Dados sensíveis:**
  - **Proibido** usar dados reais de produção (CNPJs, e-mails, senhas) fora de produção sem anonimização — alinhado a NFR-C01 (LGPD) `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` (NFR-C01 é marcado como entrada humana; a política de anonimização precisa de validação formal).
  - Cópia de dados legados em staging (US-005) deve passar por mascaramento de dados pessoais antes do uso.
  - Logs de teste não devem conter senhas, tokens ou CNPJs reais (NFR-SEC04).
  - Amostras de HTML em alertas truncadas (5KB) para não vazar dados sensíveis (US-011).

## 7. Regression Strategy

* **Suite de regressão (ordem de execução):**
  1. `npm run typecheck` — gate de tipagem estrita (NFR-M03);
  2. `npm run test` — suite Vitest completa;
  3. `npm run test:smoke` + `npm run test:status` + `npm run test:gmail` + `npm run test:review` — smoke tests Node nativos;
  4. `npm run test:clientes` — suite Vitest de clientes;
  5. Em staging: `npm run test:auth-ui` + `npm run test:clientes-ui` — E2E Playwright;
  6. Pré-release de migração: `npm run check:dry` com zero erros, seguido de `importar-legado` em staging (DoD US-005).
* **Frequência:** itens 1–4 a cada PR; item 5 a cada deploy em staging; item 6 antes de qualquer release que toque schema ou migração.
* **Critérios de entrada de release:** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` suite completa verde em staging; `check:dry` sem inconsistências; validação manual de 100% dos vínculos empresa↔CCT preservados (DoD US-005).
* **Critérios de saída de release:** 0 bugs P0/P1 abertos; zero `console.*` em `src/`; complexidade ciclomática das funções de auth dentro das metas do DoD US-001; rollback de migração testado e documentado.

## 8. Bug Triage & Severity

`[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` — SLAs não definidos nos artefatos-fonte; proposta abaixo alinhada às NFRs de disponibilidade (NFR-A01: uptime 99% das rotinas; NFR-A02: RTO ≤ 4h).

| Severidade | Definição | Exemplos neste projeto | SLA de correção |
| :--- | :--- | :--- | :--- |
| Crítica (P0) | Perda/corrupção de dados, sistema fora, vulnerabilidade de segurança explorável | Corrupção do `.sqlite`; migração com perda de vínculos; senha armazenada em texto claro; bypass de `exigirCsrf`/`exigirPermissao` | Imediato (≤ 4h, alinhado ao RTO NFR-A02) |
| Alta (P1) | Funcionalidade principal do MVP quebrada | Coleta `check:auto` falhando em todas as fontes; extração mascarando erros (viola NFR-C02); login indisponível; duplicatas passando pelo `fingerprintDocumentos` | 24h |
| Média (P2) | Funcionalidade secundária afetada com workaround | Falha de coleta em uma fonte (alerta disparado, demais OK); cache CNPJ sem fallback stale; renderização Markdown com campo opcional faltando | Próxima sprint |
| Baixa (P3) | Cosmético/menor | Formatação do Markdown; mensagens de CLI; complexidade ciclomática acima da meta em função não crítica | Backlog |

## 9. Reporting & Metrics

* **Dashboards:** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` — não há ferramenta de observabilidade instalada (SAD §10). Recomendação alinhada ao SAD: relatório de cobertura do Vitest em CI; painel de status de coleta (US-012, Slice 3) como fonte de métricas operacionais de falha de scraping; endpoint `/healthz` (NFR-O03) para smoke pós-deploy.
* **Métricas de qualidade acompanhadas:** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`
  - Cobertura de testes (global e nos módulos críticos do §4);
  - Taxa de falha de build em CI e flakiness dos E2E Playwright (especialmente `test:auth-ui`, `test:clientes-ui`);
  - Escape rate de bugs P0/P1 para produção;
  - MTTR alinhado ao RTO (NFR-A02 ≤ 4h);
  - Contagem de `console.*` residuais em `src/` (meta: 0 — NFR-SEC04);
  - Complexidade ciclomática das funções listadas no diagnóstico (meta: `criarAutenticacao` ≤ 10, `criarAcessoHttp` ≤ 15 — NFR-M01);
  - Taxa de falha de coleta por fonte (alertas US-011 / NFR-O02).

## 10. Roles & Responsibilities

| Papel | Responsabilidade |
| :--- | :--- |
| **Dev** | Testes unitários (Vitest) e smoke/integration (`node --test`); manter `typecheck` verde; refatoração de complexidade com rede de testes (NFR-M01); eliminar `console.*` (NFR-SEC04); fixtures de PDF/DOC/HTML e mocks de CNPJ |
| **QA** | E2E Playwright (`test:auth-ui`, `test:clientes-ui`); testes exploratórios dos fluxos BDD das US-001 a US-007; validação de migração em staging (`check:dry` + `importar-legado`); testes de falha induzida (fontes, CNPJ, lock SQLite) |
| **Eng Lead** | Gate de qualidade em releases (critérios do §7); aprovação de exclusões de cobertura; triagem de P0/P1; validação das metas de performance (NFR-P01/P02/S02) |
| **PO/Stakeholder** | `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` Validação de critérios de aceite BDD; aprovação de template Markdown (DoR US-007); validação visual do output renderizado (NFR-U02); definição de TTL de cache CNPJ e janela de migração |