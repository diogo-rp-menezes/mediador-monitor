# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Semantic Versioning](https://semver.org/lang/pt-BR/).

> **Nota de transparência:** não há tags de versão, histórico de releases ou arquivo `CHANGELOG` prévio detectados no workspace. O projeto encontra-se em fase pré-release (MVP — Release 1.0 planejado para 20/11/2026, conforme o Roadmap §4). Portanto, **não existem versões lançadas a documentar**; todo o conteúdo planejado está consolidado na seção `[Unreleased]`, cross-referenciado com os artefatos-fonte `roadmap` (Sprints 1–7, milestones) e `deployment-plan` (estratégia de versionamento SemVer e tags `vX.Y.Z`). Itens sem evidência direta no código estão marcados com `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`.

## [Unreleased]

Conteúdo planejado para o **MVP — Release 1.0** (data alvo: 20/11/2026 — Roadmap §4, milestone "MVP — Release 1.0"). Será promovido a `[1.0.0]` quando o gate de deploy em produção for aprovado (deployment-plan §6).

### Added
* Implementa autenticação básica com sessão segura (US-001 / REQ-001 — Sprint 1), incluindo bootstrap de credenciais administrativas via `npm run auth:bootstrap` e redefinição via `npm run auth:redefinir` (`src/auth-cli.ts`, `src/autenticacao.ts`, `src/auth-http.ts`).
* Implementa coleta automatizada de documentos via Playwright (US-002 / REQ-002 — Sprint 1), com instalação de browser via `npm run playwright:install`.
* Implementa extração de texto de documentos PDF e DOC (US-003 / REQ-003 — Sprint 2) com `pdf-parse` e `word-extractor`.
* Implementa validação de CNPJ e cadastro básico de empresas (US-004 / REQ-004 — Sprint 2).
* Implementa migração de dados legados via `npm run importar-legado` (US-005 / REQ-005 — Sprint 2), com validação prévia por `npm run check:dry` e critério de 100% dos vínculos empresa↔CCT preservados (DoD US-005).
* Implementa validação humana de extrações e alterações (US-006 / REQ-006 — Sprint 3), com smoke test `npm run test:review`.
* Implementa renderização de CCT em Markdown (US-007 / REQ-007 — Sprint 3), com smoke test `npm run test:smoke` (`test/template-cct.smoke.mjs`).
* Adiciona rotinas agendadas de coleta com `node-cron` (`npm run check:auto`, `npm run seed:auto`).
* Adiciona comando de reanálise via `npm run reanalisar` e listagem via `npm run list`.
* Adiciona interface web server-side (`npm run ui` / `npm run dev` — `src/server.ts`, diretório `web/`), com testes E2E `npm run test:clientes-ui` e `npm run test:auth-ui`.
* Adiciona persistência em SQLite via `better-sqlite3` (arquivo local, nó único — topologia conforme deployment-plan §1).
* Adiciona envio de e-mails transacionais via `nodemailer` (configuração SMTP por `.env` com `dotenv`).
* Adiciona validação de dados com `zod` e decodificação de entidades HTML com `html-entities`.
* Adiciona suites de testes: Vitest (`npm run test`, `npm run test:clientes`) e smoke tests `node --test` (`test:smoke`, `test:status`, `test:gmail`, `test:review`).

### Changed
* _Nenhuma mudança de comportamento registrada — versão inicial ainda não lançada._

### Deprecated
* _Nenhuma funcionalidade marcada para remoção._

### Removed
* _Nenhuma funcionalidade removida._

### Fixed
* _Nenhuma correção de bug registrada em versão lançada._

### Security
* Refatora funções de autenticação com complexidade ciclomática alta — `criarAutenticacao` (CC 22, `src/autenticacao.ts:156`), `criarAcessoHttp` (CC 61, `src/auth-http.ts:16`), `tratar` (CC 26, `src/auth-http.ts:65`), `validarRequisicao` (CC 11, `src/auth-http.ts:30`) e `lerSenha` (CC 12, `src/auth-cli.ts:6`) — meta da Sprint 1 para mitigação de risco de segurança (Roadmap §2).
* Elimina as 26 chamadas `console.*` residuais em `src/` (ex: `src/auth-cli.ts:49/55/60`, `src/index.ts:10/11`) — gate de release obrigatório no pipeline de CI (deployment-plan §2, Stage 1; NFR-SEC04), para evitar vazamento de dados sensíveis em logs.
* Garante que segredos (SMTP, segredo de sessão) permaneçam exclusivamente em `.env` não versionado, fora do artefato de build (deployment-plan §8).

---

## Planejamento de versões futuras (não lançadas)

> `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` — As versões abaixo são **projeções** derivadas dos milestones do Roadmap §4 e da política SemVer do deployment-plan §3. Nenhuma tag `vX.Y.Z` existe no repositório; datas e números de versão precisam ser confirmados pelo Eng Lead no momento de cada release.

### [1.0.0] - 2026-11-20 (planejado)
* Promove o conteúdo de `[Unreleased]` (US-001 a US-007) — jornada ponta-a-ponta: autenticação, coleta, extração, CNPJ, migração, validação humana e renderização Markdown.
* Critérios de saída (deployment-plan §6/§7): suite verde em staging, `check:dry` sem erros, 0 bugs P0/P1, rollback de migração testado, backup pré-deploy do `.sqlite` e `.env`.

### [1.1.0] - 2026-12-18 (planejado)
* **Added:** recuperação de senha self-service via e-mail (US-008 / REQ-008 — Sprint 4); controle de concorrência no SQLite via `reservarConsolidacao` (US-009 / REQ-009 — Sprint 4); cache de consultas CNPJ com TTL (US-010 / REQ-010 — Sprint 5); alertas automáticos de mudança de layout em fontes externas (US-011 / REQ-011 — Sprint 5).

### [1.2.0] - 2027-01-30 (planejado) `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`
* **Added:** painel de monitoramento de status de coleta em tempo real (US-012 / REQ-012 — Sprint 6); auditoria de cadastro automatizada por lotes (US-013 / REQ-013 — Sprint 7); histórico de versões de CCTs consolidadas (US-014 / REQ-014 — Sprint 7).
* Premissa: o número `1.2.0` é inferido (o Roadmap nomeia o marco apenas como "Slice 3 — Could Have (Parcial)", sem número de versão); por se tratar de funcionalidades retrocompatíveis, aplica-se bump MINOR conforme deployment-plan §3.

---

## Convenções deste projeto
* **MAJOR (X):** mudança incompatível de schema do SQLite, de formato de dados migrados (`importar-legado`) ou de comportamento de autenticação/autorização (deployment-plan §3).
* **MINOR (Y):** nova funcionalidade retrocompatível (ex: novo fluxo de coleta, novo endpoint admin).
* **PATCH (Z):** correções de bug, ajustes de seletores de scraping (US-011) e refatorações sem mudança de comportamento (ex: redução de complexidade — NFR-M01). Hotfixes PATCH podem ocorrer fora de ciclo para quebra de coleta ou incidentes P0/P1 (SLA P0 ≤ 4h — deployment-plan §6).
* **Tags de release:** `v<MAJOR.MINOR.PATCH>` em `main`, com artefato `mte-mediador-monitor-unificado-vX.Y.Z.tar.gz` (deployment-plan §2, Stage 3).
* Cada entrada deve ser curta, no imperativo/passado direto, e referenciar a User Story/requisito relacionado quando possível: `Implementa cache de CNPJ com TTL (US-010)`.