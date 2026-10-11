# System Architecture Document (SAD) — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Owner:** Engenharia/Arquitetura · **Status:** Draft
> **ADRs relacionadas:** Nenhuma formalizada até o momento

## 1. Overview & Goals

O **mte-mediador-monitor-unificado** é uma aplicação monolítica Node.js/TypeScript projetada para monitoramento automatizado, extração e consolidação de Convenções Coletivas de Trabalho (CCTs) e instrumentos correlatos. O sistema opera como nó único (single-node) com persistência em arquivo SQLite local (`better-sqlite3`), executando rotinas agendadas via `node-cron` para coleta de dados em fontes externas (web scraping com `playwright`), processamento de documentos (PDF via `pdf-parse`, Word via `word-extractor`), consulta de CNPJs, envio de notificações por e-mail (`nodemailer`) e exposição de interface administrativa via HTTP.

**Objetivos arquiteturais principais:**
- **Simplicidade operacional**: implantação em servidor de baixo recurso sem dependências de infraestrutura distribuída (banco em arquivo, sem message broker, sem cluster).
- **Confiabilidade de extração**: tolerância a falhas de scraping (`playwright`) e processamento de documentos, com idempotência via `fingerprintDocumentos`.
- **Segurança por padrão**: autenticação com hash de senhas, proteção CSRF, controle de permissões, eliminação de logs sensíveis.
- **Observabilidade evolutiva**: substituição progressiva de `console.*` por logs estruturados, health-checks e alertas de quebra de scraping.

## 2. Tech Stack Justification

| Camada | Tecnologia Escolhida | Alternativas Consideradas | Justificativa Resumida |
| :--- | :--- | :--- | :--- |
| Language/Runtime | Node.js 22+ / TypeScript 5.6 | Deno, Bun | Ecossistema maduro, suporte nativo a `better-sqlite3` e `playwright`, toolchain já configurado (`tsx`, `vitest`). |
| Framework Web | **Nenhum detectado** (HTTP nativo / `auth-http.ts`) | Express, Fastify, Hono | O código implementa roteamento e middlewares próprios em `src/auth-http.ts` (`criarAcessoHttp`, `tratar`, `validarRequisicao`); adicionar framework aumentaria superfície sem benefício claro para o escopo atual. |
| Banco de Dados | `better-sqlite3` 11.5 (SQLite em arquivo) | PostgreSQL, MySQL, libsql | Requisito NFR-S01 (nó único), NFR-PO02 (portabilidade), NFR-CO01 (custo reduzido). SQLite atende: zero-config, ACID, backup por cópia de arquivo. |
| ORM / Query Builder | **SQL cru** (sem ORM) | Prisma, Drizzle, Kysely | Código usa `better-sqlite3` diretamente (`prepare`, `run`, `all`, `get`); schema simples, migrações manuais via scripts (`seed`, `importar-legado`). |
| Agendamento / Jobs | `node-cron` 4.2 | BullMQ, pg-boss, cron nativo do SO | Execução in-process, sem dependência de Redis; alinhado à topologia de nó único. |
| Extração de Documentos | `pdf-parse` 1.1, `word-extractor` 1.0 | `pdf2pic` + OCR, `mammoth`, `unpdf` | Dependências leves, sem binários nativos pesados; adequadas para extração textual de CCTs/aditivos. |
| Web Scraping | `playwright` 1.48 | Puppeteer, Selenium, Cheerio + fetch | Suporte a navegadores reais (Chromium/Firefox/WebKit), necessário para fontes com JavaScript pesado; já integrado nos testes (`test:smoke`, `test:gmail`). |
| Validação de Dados | `zod` 3.23 | Yup, Valibot, ArkType | Schema-first, TypeScript-first, usado em `validarExtracaoCct`, `exigirPermissao`, `exigirCsrf`. |
| Autenticação / Segurança | Implementação própria (`autenticacao.ts`, `auth-cli.ts`, `auth-http.ts`) | Passport, Lucia, NextAuth | Requisitos específicos: `criarHashSenha`, `hashToken`, `exigirCsrf`, `exigirPermissao`, `auth:bootstrap`; baixo acoplamento a frameworks. |
| E-mail | `nodemailer` 6.9 | Resend SDK, SendGrid SDK, AWS SES SDK | SMTP genérico, compatível com qualquer provedor; já usado em notificações de falha/coleta. |
| Utilitários | `dotenv` 16.4, `html-entities` 2.6 | — | Configuração via `.env` (NFR-A02), sanitização de HTML extraído de CCTs. |
| Testes | `vitest` 2.1 | Jest, Node test runner | ESM nativo, compatível com `tsx`, scripts `test:smoke`, `test:auth-ui`, `test:review`, `test:clientes-ui`. |
| Lint / Typecheck | TypeScript `typecheck`, scripts `check`/`check:auto` | ESLint, Biome | `tsc --noEmit` como gate de CI; `check:auto` sugere correções automáticas. |

## 3. High-Level Architecture

A aplicação roda como **um único processo Node.js de longa duração** (daemon via `node-cron` + servidor HTTP opcional para UI/admin). Todos os componentes compartilham o mesmo arquivo SQLite e o mesmo event loop. Não há separação de processos, containers sidecar, message brokers ou camadas de cache distribuído.

### Componentes

| Componente | Responsabilidade | Tecnologia | Escala Independente? |
| :--- | :--- | :--- | :--- |
| **Scheduler (`node-cron`)** | Dispara rotinas periódicas: `check:auto` (coleta/extração), `seed:auto` (manutenção), consolidação de CCTs. | `node-cron` 4.2 | Não — roda no processo principal. |
| **Coletor/Scraper (`playwright`)** | Navega em portais oficiais, baixa PDFs/Word de CCTs e aditivos. | `playwright` 1.48 | Não — instância de browser gerenciada in-process. |
| **Extrator de Documentos** | Converte PDF (`pdf-parse`) e Word (`word-extractor`) em texto bruto para parsing. | `pdf-parse`, `word-extractor` | Não — CPU-bound, roda no event loop (NFR-P03 recomenda background). |
| **Parser/Validador de CCT** | Extrai campos estruturados do texto bruto; `validarExtracaoCct` garante auditabilidade (NFR-C02). | TypeScript + `zod` | Não — lógica pura, síncrona. |
| **Consolidador com Reserva** | `reservarConsolidacao` serializa escritas no SQLite para evitar lock contention (NFR-P02, NFR-S03). | `better-sqlite3` transações + tabela de locks | Não — single-writer inerente ao SQLite. |
| **Consulta CNPJ com Cache** | `criarConsultaCnpj` com cache local para evitar rate-limit externo (NFR-S02). | Memória em processo (Map/TTL) | Não — cache local ao nó. |
| **Autenticação & Autorização** | `criarAutenticacao`, `criarHashSenha`, `hashToken`, `exigirPermissao`, `exigirCsrf`, bootstrap/admin recovery. | Crypto nativo (Node `crypto`), cookies/headers HTTP | Não — estado em SQLite (tabela de usuários/sessões). |
| **Servidor HTTP Admin/UI** | Expõe endpoints para dashboard, autenticação, redefinição de senha, health-check (NFR-O03). | HTTP nativo (`auth-http.ts`: `criarAcessoHttp`, `tratar`) | Não — single process. |
| **Notificações** | Envia alertas de falha/coleta via SMTP. | `nodemailer` 6.9 | Não — chamada síncrona/assíncrona no event loop. |
| **Migração/Seed/Legado** | `seed`, `importar-legado`, `reanalisar` — scripts CLI para bootstrap e manutenção. | `better-sqlite3` CLI + TypeScript | Não — tarefas pontuais. |

> **Referência visual:** O diagrama de containers (C4) é mantido em `[[uml-diagrams]]` — não duplicado aqui.

## 4. Architectural Style & Patterns

* **Estilo:** **Monolito modular** (single-process, single-database-file). Todos os módulos residem em `src/` e compartilham o mesmo runtime.
* **Padrões aplicados:**
  - **Repository Pattern (implícito):** Funções como `reservarConsolidacao`, `fingerprintDocumentos`, `criarConsultaCnpj` encapsulam acesso a dados.
  - **Circuit Breaker (manual/embrionário):** Retry/backoff em escritas SQLite (NFR-P02) e em scraping (`playwright`).
  - **Idempotência por Fingerprint:** `fingerprintDocumentos` evita duplicidade de CCTs/aditivos (NFR-A04).
  - **Cache-Aside (local):** Cache em memória para consultas de CNPJ (NFR-S02).
  - **Background Job (simulado):** `check:auto`/`seed:auto` via `node-cron`; NFR-P03 recomenda mover extração pesada para worker separado.
* **Comunicação entre componentes:** **Síncrona, in-process** (chamadas de função TypeScript). Não há IPC, filas ou eventos distribuídos. O `node-cron` dispara funções diretamente no mesmo event loop.

## 5. Data Modeling

* **Motor:** `better-sqlite3` (SQLite 3, arquivo único `.sqlite`).
* **ORM/Query Builder:** **Nenhum** — SQL cru via `db.prepare()`, `db.exec()`, transações manuais (`db.transaction()`).
* **Esquema:** Não há arquivo de schema versionado (ex: `schema.sql` ou migrations). A estrutura é criada/atualizada por scripts `seed`, `importar-legado` e código em `autenticacao.ts` (tabelas de usuários, sessões, tokens). Tabelas de CCTs, aditivos, fingerprints, cache CNPJ e locks de consolidação são inferidas do uso no código.
* **Particionamento/Sharding:** **Não aplicável** — nó único, arquivo único.
* **Migração de schema:** **Manual/Ad-hoc** via scripts CLI (`seed`, `importar-legado`, `reanalisar`). Ver `[[db-migration-spec]]` (a criar) para formalização futura.
* **Modelo conceitual de entidades:** Ver `[[db-domain-model]]` (a criar).
* **Contrato físico (DDL):** Ver `[[db-schema-spec]]` (a criar).

## 6. Integration Boundaries & APIs

| Integração | Tipo | Direção | Contrato | Criticidade |
| :--- | :--- | :--- | :--- | :--- |
| Portais oficiais de CCT (web scraping) | HTTP/HTML (via `playwright`) | Outbound | Seletores CSS/XPath mantidos no código do scraper; sem contrato formal. | **Alta** — quebra de layout quebra a coleta (NFR-O02). |
| Receita Federal / API de CNPJ | HTTPS REST | Outbound | `criarConsultaCnpj` — endpoint não documentado no código; cache local mitiga rate-limit. | **Média** — falha degrada enriquecimento, não para coleta. |
| Servidor SMTP (e-mail) | SMTP (via `nodemailer`) | Outbound | Variáveis `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. | **Média** — falha impede alertas/notificações. |
| Interface Administrativa (HTTP) | HTTP/JSON + HTML | Inbound | Rotas definidas em `auth-http.ts` (`/login`, `/logout`, `/admin/*`, health-check proposto NFR-O03). | **Alta** — única via de operação humana. |
| Sistema de arquivos (PDF/Word baixados) | FS local | I/O | Diretório temporário configurável; limpeza automática não implementada. | **Baixa** — armazenamento transitório. |

## 7. Scalability & Performance Strategy

* **Estratégia de escala:** **Vertical only** (NFR-S01). O design assume nó único; escalonamento horizontal exigiria refatoração para PostgreSQL + message queue + shared storage — fora do escopo atual.
* **Pontos de gargalo conhecidos (do diagnóstico + NFR):**
  1. **Single-writer lock do SQLite** — escritas concorrentes serializadas; `reservarConsolidacao` mitiga, mas sob carga alta torna-se fila (NFR-P02, NFR-S03).
  2. **Extração CPU-intensive (`pdf-parse`, `word-extractor`)** — bloqueia event loop; NFR-P03 exige offload para background/worker.
  3. **Scraping `playwright`** — latência de rede + renderização JS; instâncias de browser consomem memória/CPU.
  4. **Funções de alta complexidade ciclomática** — `criarAcessoHttp` (61), `criarAutenticacao` (22), `tratar` (26) dificultam manutenção e otimização (NFR-M01).
* **Estratégia de cache:**
  - **CNPJ:** Cache em memória (Map com TTL) dentro de `criarConsultaCnpj` (NFR-S02).
  - **HTTP responses:** Nenhum cache HTTP implementado (ETag, Cache-Control) — oportunidade [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA].
  - **Query SQLite:** `better-sqlite3` usa page cache do SQLite; `PRAGMA cache_size` não configurado explicitamente.

## 8. Reliability & Fault Tolerance

* **Single Points of Failure identificados:**
  1. **Arquivo `.sqlite`** — corrupção ou perda = perda total de dados (mitigação: backup periódico, NFR-A02/A03).
  2. **Processo Node.js único** — crash derruba scheduler, HTTP, scraping (mitigação: systemd/restart policy, health-check NFR-O03).
  3. **Chromium/Playwright** — atualização de browser ou dependência de sistema quebrada para coleta.
  4. **SMTP externo** — falha silencia alertas.
* **Estratégias de resiliência implementadas/planejadas:**
  - **Retry com backoff** em escritas SQLite (NFR-P02) — implementação pendente na camada de consolidação.
  - **Idempotência** via `fingerprintDocumentos` (NFR-A04) — re-processamento seguro.
  - **Timeouts** em `playwright` (navigation, selector) — configurados no código do scraper.
  - **Validação de extração** (`validarExtracaoCct`) não mascara erros (NFR-C02).
  - **Health-check endpoint** (NFR-O03) — **não implementado** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA].
* **Estratégia multi-região/multi-AZ:** **Não aplicável** (NFR-S01, NFR-PO02). Topologia de nó único em servidor/VM único. Cenários futuros de HA [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA].

## 9. Security Architecture

* **Boundary de rede:** Aplicação expõe porta HTTP (configurável via `.env`) em interface local ou VPN; **não há** load balancer, WAF, VPC/subnets gerenciados pelo código. Responsabilidade de rede é da infraestrutura de hospedagem.
* **Controles implementados (código):**
  - **Senhas:** `criarHashSenha` (bcrypt/scrypt/argon2 — verificar implementação em `autenticacao.ts`) — NFR-SEC01.
  - **CSRF:** `exigirCsrf` middleware em rotas sensíveis — NFR-SEC02.
  - **Autorização:** `exigirPermissao` (RBAC simples: admin/operador) — NFR-SEC02.
  - **Tokens de recuperação:** `hashToken` com expiração — NFR-SEC03.
  - **Bootstrap admin:** `auth:bootstrap` cria primeiro admin via CLI — NFR-SEC03.
  - **Sanitização:** `html-entities` para saída de conteúdo extraído.
* **Gaps conhecidos (NFR-SEC04):** 26 chamadas `console.*` residuais (diagnóstico) — risco de vazamento de tokens, senhas, CNPJs em logs. **Substituição por logger estruturado é obrigatória** (NFR-O01).
* **Referência detalhada:** Ver `security-policies.md` (a criar) para matriz de ameaças, criptografia em repouso (SQLite file permissions), rotação de segredos.

## 10. Observability Architecture

> **Nenhuma biblioteca de observabilidade detectada nas dependências.** As propostas abaixo são **metas a implementar**, marcadas conforme instrução.

* **Logging centralizado:** **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** Substituir `console.*` por `pino` ou `winston` com saída JSON, níveis (debug/info/warn/error), redção de campos sensíveis (senhas, tokens, CNPJs). Destino: stdout (capturado por systemd/journald) + arquivo rotativo. NFR-O01.
* **Métricas:** **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** Expor endpoint `/metrics` (Prometheus) com: latência p50/p95 de leitura/escrita SQLite, duração de extração PDF/Word, taxa de sucesso/falha de scraping, tamanho da fila de consolidação, uso de memória/CPU. NFR-O01, NFR-P01.
* **Tracing distribuído:** **Não aplicável** (monolito single-process). Tracing interno opcional via `async_hooks` ou manual spans para correlacionar job de coleta → extração → consolidação [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA].
* **Alertas:** **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** Regras sugeridas (Alertmanager/Grafana/PagerDuty):
  - Falha de scraping > 3 execuções consecutivas (NFR-O02).
  - Latência p95 leitura SQLite > 300ms (NFR-P01).
  - Lock de escrita SQLite > 5s (NFR-P02).
  - Health-check falhando > 1min (NFR-O03).
  - Espaço em disco < 10% (risco de corrupção SQLite).
* **Health-check endpoint:** **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** `GET /healthz` verificando: (1) SQLite abre e executa `SELECT 1`, (2) SMTP conecta (EHLO), (3) Playwright inicia browser (opcional, pesado). NFR-O03.

## 11. Deployment Topology

```mermaid
graph TB
    subgraph "Servidor Único (VM / Bare Metal / Container)"
        direction TB
        APP[Node.js Process\nmte-mediador-monitor-unificado]
        SQLITE[(better-sqlite3\narquivo .sqlite)]
        FS[Sistema de Arquivos\nPDFs/Word temporários]
        CRON[node-cron\nScheduler Interno]
        BROWSER[Playwright\nChromium/Firefox]
    end

    EXT_CNPJ[API Externa CNPJ] -.->|HTTPS| APP
    EXT_PORTAL[Portais CCT Oficiais] -.->|HTTPS/HTML| BROWSER
    SMTP[Servidor SMTP] <--->|SMTP| APP
    ADMIN[Operador/Administrador] -->|HTTP/HTTPS\n(VPN/Local)| APP
    BACKUP[(Backup Externo\nrsync / S3 / Volume Snapshot)] <--->|Cópia Periódica| SQLITE
    LOGS[Log Aggregator\njournald / Loki / Filebeat] <--->|stdout/json| APP
```

**Características reais (não inferidas):**
- **Zero load balancers, zero réplicas, zero clusters, zero multi-AZ.**
- **Banco:** arquivo único `.sqlite` no disco local; backup = cópia do arquivo (NFR-A02/A03).
- **Processo único:** `node-cron` roda dentro do mesmo processo do servidor HTTP.
- **Playwright:** baixa browsers no primeiro `postinstall`; roda headless no mesmo host.
- **Variáveis de ambiente:** `.env` (não versionado) carrega segredos (SMTP, JWT secret, porta HTTP).
- **Inicialização:** `npm run start` (compilado `build`) ou `npm run dev` (`tsx watch`).
- **Recuperação:** reinício do processo via systemd/docker restart policy; RTO ≤ 4h depende de restauração do `.sqlite` + `.env` (NFR-A02).

**Cenários de escala futura** (ex: migração para PostgreSQL + workers + réplicas) **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**.

## 12. Trade-offs & Known Limitations

| Decisão | Sacrifício | Benefício | Referência |
| :--- | :--- | :--- | :--- |
| **SQLite em arquivo (better-sqlite3)** | Escrita serializada; não escala horizontalmente; backup = cópia de arquivo; limite de tamanho prático ~TB | Zero-config, zero-ops, ACID, portabilidade trivial, custo near-zero | NFR-S01, NFR-PO02, NFR-CO01 |
| **Monolito single-process** | Falha derruba tudo; CPU-bound (PDF/Word) bloqueia event loop; não isola falhas de scraping | Simplicidade extrema de deploy, debug, transações atômicas cross-domain | NFR-S01 |
| **HTTP server próprio (sem framework)** | Reimplementa roteamento, parsing, middlewares; maior superfície de bugs de segurança | Zero dependências; controle total sobre CSRF, auth, request lifecycle | Diagnóstico: `auth-http.ts` |
| **Cache CNPJ apenas em memória** | Perde cache no restart; não compartilhado entre instâncias (se houver) | Simples, sem Redis; atende NFR-S02 para nó único | NFR-S02 |
| **Extração síncrona no event loop** | Bloqueia scheduler/HTTP durante PDFs grandes | Evita complexidade de worker pool, filas, IPC | NFR-P03 (recomenda mudar) |
| **Sem observabilidade nativa** | Cego em produção até implementar logs/métricas/alertas | Zero overhead até ser necessário; decisão consciente de "build later" | NFR-O01/O02/O03 |
| **Migrações manuais/ad-hoc** | Risco de drift de schema; sem versionamento de DB | Evita dependência de ferramenta de migração; schema simples | `seed`, `importar-legado` |

## 13. Future Evolution

* **Extração assíncrona (NFR-P03):** Mover `pdf-parse`/`word-extractor` para **worker threads** (`node:worker_threads`) ou processo separado (ex: `tsx` child process) com fila em SQLite (`status: pending/processing/done`).
* **Observabilidade completa (NFR-O01/O02/O03):** Adicionar `pino`, `/metrics` (Prometheus), `/healthz`, alertas Grafana/Alertmanager.
* **Refatoração de complexidade (NFR-M01):** Quebrar `criarAcessoHttp` (61), `criarAutenticacao` (22), `tratar` (26) em middlewares/handlers menores; adicionar testes unitários (`vitest`).
* **LGPD/Compliance (NFR-C01):** Implementar retenção/exclusão de dados pessoais, logs de acesso, DPIA — **[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**.
* **Hardening de segurança (NFR-SEC04):** Eliminar 26 `console.*`; adicionar rate-limiting no HTTP; CSP/HSTS headers; auditoria de dependências (`npm audit`).
* **Migração para PostgreSQL (se escala exigir):** Manter API de repositório; trocar `better-sqlite3` por `pg` + pool; adicionar migrações versionadas (ex: `node-pg-migrate`).
* **Multi-tenancy / Organizações:** Adicionar `tenant_id` nas tabelas; isolamento lógico; hoje não existe no modelo.
* **API pública / Webhooks:** Expor eventos de "nova CCT consolidada" para consumidores externos — **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**.