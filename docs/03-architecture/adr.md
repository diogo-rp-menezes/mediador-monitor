# ADR-001 — Escolha do Motor de Banco de Dados: better-sqlite3 (SQLite em Arquivo)

> **Data:** 09/10/2026 · **Status:** Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]  
> **Deciders:** Engenharia/Arquitetura · **Consulted:** Tech Lead, DBA · **Informed:** Time de Operações

## 1. Status
Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

## 2. Context & Problem Statement
O projeto requer persistência local para armazenar Convenções Coletivas de Trabalho (CCTs), aditivos, fingerprints de documentos, cache de CNPJ, usuários, sessões e locks de consolidação. A topologia definida no SAD é **monolítica single-node** (NFR-S01) com implantação em servidor de baixo recurso (NFR-PO02, NFR-CO01). O diagnóstico confirma `better-sqlite3` ^11.5.0 como única dependência de banco em produção, sem ORM/query builder. A decisão é manter SQLite em arquivo como motor principal, rejeitando PostgreSQL, MySQL ou libsql.

## 3. Decision Drivers
* **Simplicidade operacional (NFR-S01, NFR-PO02):** Zero-config, zero-ops, sem processo separado de banco
* **Portabilidade (NFR-PO02):** Arquivo único copiável entre ambientes (dev, staging, prod)
* **Custo de infraestrutura (NFR-CO01):** Sem necessidade de instância gerenciada, VM dedicada ou container sidecar
* **ACID e confiabilidade:** SQLite oferece transações ACID completas em arquivo único
* **Backup trivial (NFR-A02, NFR-A03):** Cópia do arquivo `.sqlite` atende RTO ≤ 4h / RPO ≤ 24h
* **Escrita serializada inerente (NFR-P02, NFR-S03):** Single-writer lock nativo do SQLite, mitigado por `reservarConsolidacao`

## 4. Considered Options
### Option A: better-sqlite3 (SQLite em arquivo) — **Escolhida**
* **Descrição:** Biblioteca nativa Node.js para SQLite 3, API síncrona, prepara statements, transações manuais via `db.transaction()`.
* **Prós:** 
  - Zero dependências de infraestrutura externa
  - Performance excelente para leituras (page cache nativo)
  - API síncrona simplifica código transacional
  - Backup = `cp arquivo.sqlite backup.sqlite`
  - Tamanho prático ~TB, suficiente para CCTs históricos
* **Contras:**
  - Escrita serializada (single-writer) — gargalo sob alta concorrência de escrita
  - Não escala horizontalmente (NFR-S01 assume nó único)
  - Ferramentas de migração/schema versionado manuais (`seed`, `importar-legado`)
  - Limite de conexões concorrentes (apenas 1 writer)

### Option B: PostgreSQL (instância local ou gerenciada)
* **Descrição:** Banco relacional client-server, pool de conexões, suporte a escrita concorrente, replicação.
* **Prós:**
  - Escrita concorrente nativa (MVCC)
  - Escalonamento horizontal futuro (read replicas, sharding)
  - Ecossistema maduro de migrações (ex: `node-pg-migrate`)
  - Tipos avançados (JSONB, arrays, full-text search)
* **Contras:**
  - Requer processo separado, configuração, manutenção, backups pg_dump
  - Overhead de rede (mesmo em localhost: Unix socket/TCP)
  - Custo de infraestrutura (RAM, CPU, disco) — viola NFR-CO01, NFR-PO02
  - Complexidade operacional desproporcional ao escopo atual (monolito single-node)

### Option C: libsql (fork do SQLite com replicação HTTP)
* **Descrição:** SQLite compatível com replicação nativa, suporte a embedded replica, HTTP sync.
* **Prós:**
  - Mantém simplicidade do SQLite
  - Caminho futuro para replicação/HA sem migrar para Postgres
* **Contras:**
  - Dependência adicional não presente no `package.json` real
  - Ainda em maturação (ecossistema menor que `better-sqlite3`)
  - Não resolve single-writer local; replicação adiciona complexidade de conflito
  - Viola princípio "presuma exatamente o que o JSON diz, nem mais, nem menos"

## 5. Decision Outcome
**Opção escolhida:** Option A — better-sqlite3 (SQLite em arquivo)

**Rationale:** A stack real já usa `better-sqlite3` ^11.5.0 em produção. O SAD (Seção 2, 3, 7, 12) e NFR (NFR-S01, NFR-PO02, NFR-CO01, NFR-A02, NFR-A03) explicitam que a topologia é **nó único, baixo recurso, simplicidade operacional**. PostgreSQL introduz complexidade de infraestrutura incompatível com NFR-CO01 e NFR-PO02. libsql não está na stack verificada. O single-writer lock é aceito e mitigado por `reservarConsolidacao` (SAD Seção 3, NFR-P02, NFR-S03).

### Comparison Matrix
| Critério | Peso | Option A (better-sqlite3) | Option B (PostgreSQL) | Option C (libsql) |
| :--- | :---: | :---: | :---: | :---: |
| Simplicidade operacional | 5 | 5 | 1 | 3 |
| Portabilidade (arquivo único) | 5 | 5 | 2 | 4 |
| Custo infraestrutura | 5 | 5 | 2 | 4 |
| Escrita concorrente | 3 | 1 | 5 | 2 |
| Ecossistema migrações | 2 | 2 | 5 | 3 |
| Alinhamento stack real | 5 | 5 | 1 | 1 |
| **Total ponderado** | — | **4.6** | **2.1** | **2.8** |

## 6. Consequences
### Positive
* Deploy em qualquer VM/container com Node.js 22+ — sem provisionar banco separado
* Backup/restore trivial atende NFR-A02 (RTO ≤ 4h) e NFR-A03 (RPO ≤ 24h)
* Transações ACID cross-domain (CCT + users + locks) em único `db.transaction()`
* Latência de leitura p95 < 300ms (NFR-P01) via page cache nativo

### Negative / Trade-offs
* **Escrita serializada** — sob carga de consolidação paralela, `reservarConsolidacao` vira fila (NFR-P02, NFR-S03)
* **Sem HA nativo** — falha de disco = perda total (mitigação: backup externo periódico)
* **Migrações manuais** — risco de drift de schema; `[[db-migration-spec]]` a criar
* **Limite prático ~100GB-1TB** — se base de CCTs crescer além, migração para Postgres será necessária [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

### Neutral
* Schema criado/atualizado por scripts `seed`, `importar-legado`, `reanalisar` (SAD Seção 5)
* `better-sqlite3` usa `PRAGMA journal_mode=WAL` por padrão — leitores não bloqueiam writer

## 7. Implementation Notes
* **Ações necessárias:** 
  - Formalizar `[[db-schema-spec]]` e `[[db-migration-spec]]` para versionar DDL
  - Configurar `PRAGMA cache_size` e `PRAGMA busy_timeout` explicitamente na inicialização
  - Implementar job de backup periódico (cópia atômica via `sqlite3 .backup` ou `VACUUM INTO`)
* **Prazo estimado de migração:** N/A (já implementado)
* **Rollback plan:** Se futuro crescimento exigir Postgres, manter interface de repositório (`reservarConsolidacao`, `fingerprintDocumentos`, `criarConsultaCnpj`) e trocar apenas implementação de `better-sqlite3` por `pg` + pool. SAD Seção 13 prevê isso.

## 8. Links & References
* SAD Seção 2 (Tech Stack Justification), Seção 3 (Components), Seção 5 (Data Modeling), Seção 7 (Scalability), Seção 12 (Trade-offs)
* NFR: NFR-S01, NFR-PO02, NFR-CO01, NFR-A02, NFR-A03, NFR-P02, NFR-S03
* `package.json` dependencies: `better-sqlite3` ^11.5.0 <!-- source: package.json -->
* Diagnóstico: "motor_de_banco": "better-sqlite3", "orm_ou_query_builder": "nenhum ORM/query builder encontrado" <!-- source: Diagnóstico determinístico -->


# ADR-002 — Ausência de ORM/Query Builder: SQL Cru via better-sqlite3

> **Data:** 09/10/2026 · **Status:** Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]  
> **Deciders:** Engenharia/Arquitetura · **Consulted:** Tech Lead · **Informed:** Time de Desenvolvimento

## 1. Status
Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

## 2. Context & Problem Statement
O código acessa `better-sqlite3` diretamente via `db.prepare()`, `db.exec()`, `db.transaction()`, `run()`, `all()`, `get()` — sem camada de abstração (Prisma, Drizzle, Kysely, TypeORM). O SAD (Seção 2, 5) confirma: "ORM / Query Builder: **SQL cru** (sem ORM)". A decisão é manter SQL cru, rejeitando adoção de ORM/query builder.

## 3. Decision Drivers
* **Simplicidade e controle total:** SQL explícito evita "magic" de ORM, facilita otimização de queries SQLite-específicas (ex: `PRAGMA`, `WAL`, índices parciais)
* **Schema simples e estável:** Entidades (CCTs, aditivos, fingerprints, users, sessions, cnpj_cache, consolidation_locks) não justificam overhead de ORM
* **Performance previsível:** `better-sqlite3` compila prepared statements nativamente; ORM adiciona camada de parsing/validação
* **Zero dependências extras:** `package.json` não tem `@prisma/client`, `drizzle-orm`, `kysely` — alinhado a NFR-CO01
* **Migrações manuais já existentes:** Scripts `seed`, `importar-legado`, `reanalisar` gerenciam schema ad-hoc

## 4. Considered Options
### Option A: SQL cru (better-sqlite3 direto) — **Escolhida**
* **Descrição:** Statements SQL escritos à mão em arquivos `.ts`, preparados via `db.prepare()`, tipados manualmente com Zod ou interfaces TypeScript.
* **Prós:**
  - Controle total sobre SQL gerado (índices, `PRAGMA`, hints SQLite)
  - Zero overhead de runtime — statements compilados uma vez
  - Tipagem TypeScript via `zod` schemas de entrada/saída (já usado em `validarExtracaoCct`)
  - Fácil auditoria de queries em code review
* **Contras:**
  - Boilerplate para CRUD repetitivo
  - Risco de SQL injection se não usar prepared statements (mitigado: código usa `?` placeholders)
  - Migrações manuais — sem versionamento automático de schema

### Option B: Prisma ORM
* **Descrição:** ORM type-safe com schema.prisma, migrações versionadas, client gerado.
* **Prós:**
  - Type-safety end-to-end (schema → client → código)
  - Migrações versionadas (`prisma migrate`)
  - Prisma Studio para inspeção visual
* **Contras:**
  - **Não suporta SQLite em produção oficialmente** (limitações de ALTER TABLE, concorrência)
  - Overhead significativo: engine de query, geração de client, binary query engine
  - Adiciona ~10MB+ ao bundle, tempo de build extra
  - `better-sqlite3` driver do Prisma é menos performático que uso direto

### Option C: Drizzle ORM / Kysely
* **Descrição:** Query builders leves, type-safe, sem runtime pesado, compatíveis com SQLite.
* **Prós:**
  - Menor overhead que Prisma
  - Type-safety via inferência TypeScript
  - Migrações opcionais (Drizzle Kit)
* **Contras:**
  - Ainda adiciona dependência e camada de abstração
  - Curva de aprendizado para equipe acostumada com SQL cru
  - Schema atual não complexo o suficiente para justificar

## 5. Decision Outcome
**Opção escolhida:** Option A — SQL cru via better-sqlite3 direto

**Rationale:** O diagnóstico confirma "orm_ou_query_builder": "nenhum ORM/query builder encontrado — provavelmente SQL cru". O SAD (Seção 5) reforça: "ORM/Query Builder: **Nenhum** — SQL cru via `db.prepare()`". A simplicidade do modelo (tabelas planas, poucas relações) e a necessidade de controle fino sobre SQLite (WAL, busy_timeout, índices parciais, `reservarConsolidacao` com lock table) tornam ORM desnecessário. Zod já valida entrada/saída nas fronteiras (ex: `validarExtracaoCct`).

### Comparison Matrix
| Critério | Peso | Option A (SQL cru) | Option B (Prisma) | Option C (Drizzle/Kysely) |
| :--- | :---: | :---: | :---: | :---: |
| Controle sobre SQL SQLite | 5 | 5 | 2 | 4 |
| Performance runtime | 5 | 5 | 2 | 4 |
| Type-safety | 4 | 3 (manual + Zod) | 5 | 5 |
| Migrações versionadas | 3 | 1 | 5 | 4 |
| Dependências/overhead | 5 | 5 | 1 | 3 |
| Curva de aprendizado | 3 | 5 (já conhecido) | 2 | 3 |
| Alinhamento stack real | 5 | 5 | 1 | 1 |
| **Total ponderado** | — | **4.4** | **2.3** | **3.5** |

## 6. Consequences
### Positive
* Queries otimizadas para SQLite (ex: `INSERT OR IGNORE`, `UPSERT` via `ON CONFLICT`, índices parciais)
* Bundle menor, build mais rápido, menos superfície de ataque
* Facilita debugging: SQL executado = SQL escrito

### Negative / Trade-offs
* **Boilerplate CRUD** — funções repetitivas para insert/select/update/delete
* **Migrações manuais** — `[[db-migration-spec]]` necessário para formalizar processo
* **Refatoração de schema** — busca/ substituição manual de nomes de colunas/tabelas

### Neutral
* Padrão Repository implícito já existe (`reservarConsolidacao`, `fingerprintDocumentos`, `criarConsultaCnpj` encapsulam SQL) — SAD Seção 4

## 7. Implementation Notes
* **Ações necessárias:**
  - Criar `src/db/queries.ts` centralizando prepared statements reutilizáveis
  - Adicionar `zod` schemas para tipagem de retorno de cada query (ex: `CctRowSchema`, `UserRowSchema`)
  - Documentar convenção: sempre `db.prepare()` fora de loops, `?` placeholders, transações via `db.transaction()`
* **Prazo estimado:** 1-2 sprints para centralizar queries existentes
* **Rollback plan:** Se complexidade crescer, introduzir Kysely (menor overhead) mantendo SQL cru como fallback

## 8. Links & References
* SAD Seção 2 (Tech Stack Justification), Seção 5 (Data Modeling)
* NFR: NFR-CO01, NFR-M03 (tipagem estrita via TypeScript)
* Diagnóstico: "orm_ou_query_builder": "nenhum ORM/query builder encontrado" <!-- source: Diagnóstico determinístico -->
* `package.json`: ausência de `@prisma/client`, `drizzle-orm`, `kysely` <!-- source: package.json -->


# ADR-003 — Servidor HTTP Próprio vs Framework Web (Express/Fastify/Hono)

> **Data:** 09/10/2026 · **Status:** Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]  
> **Deciders:** Engenharia/Arquitetura · **Consulted:** Tech Lead, Security · **Informed:** Time de Desenvolvimento

## 1. Status
Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

## 2. Context & Problem Statement
A aplicação expõe interface administrativa via HTTP (login, dashboard, health-check proposto NFR-O03). O código implementa roteamento, parsing de body, cookies, middlewares de CSRF (`exigirCsrf`), autorização (`exigirPermissao`) e tratamento de erros em `src/auth-http.ts` — funções `criarAcessoHttp` (complexidade 61), `validarRequisicao` (11), `tratar` (26). O SAD (Seção 2) registra: "Framework Web: **Nenhum detectado** (HTTP nativo / `auth-http.ts`)". A decisão é manter implementação própria, rejeitando Express, Fastify ou Hono.

## 3. Decision Drivers
* **Zero dependências (NFR-CO01):** Evita ~200KB+ de `node_modules` e superfície de ataque de framework
* **Controle total sobre segurança:** `exigirCsrf`, `exigirPermissao`, `hashToken`, `criarHashSenha` implementados sob medida — sem depender de middleware de terceiros
* **Requisitos específicos não-padrão:** Bootstrap admin via CLI (`auth:bootstrap`), recuperação de senha com tokens hash, integração direta com `better-sqlite3` transacional
* **Complexidade ciclomática alta já existente:** `criarAcessoHttp` (61) — refatorar para middlewares próprios é mais leve que migrar para framework
* **Escopo restrito:** Apenas rotas admin/UI (~10 endpoints), não API pública complexa

## 4. Considered Options
### Option A: HTTP nativo (implementação própria em `auth-http.ts`) — **Escolhida**
* **Descrição:** `createServer` do Node.js + roteamento manual, parsing de body/cookies, middlewares customizados.
* **Prós:**
  - Zero dependências externas
  - Controle absoluto sobre request lifecycle, CSRF, auth, error handling
  - Integração nativa com `better-sqlite3` transacional (mesmo event loop)
  - Bundle mínimo, cold start rápido
* **Contras:**
  - Reimplementa roteamento, parsing, validação — maior superfície de bugs
  - `criarAcessoHttp` (complexidade 61) difícil de manter/testar
  - Sem ecossistema de middlewares prontos (rate-limit, compression, helmet-like headers)

### Option B: Fastify
* **Descrição:** Framework web rápido, schema-based validation, plugin system, TypeScript-first.
* **Prós:**
  - Performance superior a Express
  - Validação via JSON Schema (compatível com Zod via `zod-to-json-schema`)
  - Plugin `fastify-csrf`, `fastify-secure-session`, `fastify-rate-limit` prontos
  - Encoraja modularização (resolveria complexidade de `criarAcessoHttp`)
* **Contras:**
  - Dependência extra (~500KB `node_modules`)
  - Curva de aprendizado (hooks, encapsulation, decoration)
  - Overkill para ~10 rotas admin

### Option C: Hono
* **Descrição:** Framework ultra-leve, edge-ready, API similar a Express, middleware chain simples.
* **Prós:**
  - Minúsculo (~15KB), zero deps
  - API familiar (`app.get`, `app.use`)
  - Middlewares built-in: `cors`, `csrf`, `basicAuth`, `logger`
  - Type-safe routes com Zod integration nativa
* **Contras:**
  - Ainda uma dependência externa
  - Ecossistema menor que Fastify/Express
  - Migração exigiria reescrever `auth-http.ts` completamente

### Option D: Express
* **Descrição:** Framework mais usado, middleware ecosystem vasto.
* **Prós:** Ecossistema maduro, middlewares para tudo
* **Contras:** Performance inferior, callback-based (não async/await nativo), maior bundle, manutenção legada

## 5. Decision Outcome
**Opção escolhida:** Option A — HTTP nativo (implementação própria)

**Rationale:** A stack real não tem framework web. O SAD (Seção 2) justifica: "O código implementa roteamento e middlewares próprios em `src/auth-http.ts`; adicionar framework aumentaria superfície sem benefício claro para o escopo atual." NFR-CO01 prioriza custo reduzido. A complexidade de `criarAcessoHttp` (61) é **dívida técnica a refatorar** (NFR-M01), não motivo para adotar framework. Refatorar em middlewares próprios (`csrfMiddleware`, `authMiddleware`, `permissionMiddleware`, `errorHandler`) resolve manutenibilidade sem dependência externa.

### Comparison Matrix
| Critério | Peso | Option A (Nativo) | Option B (Fastify) | Option C (Hono) | Option D (Express) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Zero dependências | 5 | 5 | 1 | 2 | 1 |
| Controle segurança (CSRF, auth custom) | 5 | 5 | 4 | 4 | 3 |
| Performance | 4 | 5 | 5 | 5 | 3 |
| Manutenibilidade (modularização) | 4 | 2 | 5 | 4 | 3 |
| Curva de aprendizado | 3 | 5 (já existe) | 2 | 3 | 4 |
| Ecossistema middlewares | 2 | 1 | 5 | 3 | 5 |
| Alinhamento stack real | 5 | 5 | 1 | 1 | 1 |
| **Total ponderado** | — | **4.2** | **3.1** | **3.1** | **2.5** |

## 6. Consequences
### Positive
* Zero dependências de framework — alinhado a NFR-CO01, NFR-PO02
* Segurança sob medida: `exigirCsrf` valida token em cookie + header, `exigirPermissao` checa RBAC direto no SQLite
* Integração transacional: handler HTTP pode usar `db.transaction()` direto

### Negative / Trade-offs
* **Dívida técnica:** `criarAcessoHttp` (61), `tratar` (26) precisam refatoração urgente (NFR-M01)
* **Reinventar roda:** Parsing multipart, rate-limit, security headers (CSP, HSTS) — implementação manual
* **Testabilidade:** Harder to unit test handlers without framework's injection

### Neutral
* Refatoração planejada: quebrar `criarAcessoHttp` em `router.ts`, `middlewares/*.ts`, `handlers/*.ts` — SAD Seção 13 (Future Evolution)

## 7. Implementation Notes
* **Ações necessárias (NFR-M01):**
  - Extrair `router.ts` com `Map<method+path, handler>`
  - Criar `middlewares/csrf.ts`, `auth.ts`, `permissions.ts`, `errorHandler.ts`
  - Mover handlers para `handlers/auth.ts`, `handlers/admin.ts`, `handlers/health.ts`
  - Adicionar testes unitários `vitest` para cada middleware/handler
* **Prazo estimado:** 2-3 sprints
* **Rollback plan:** Se refatoração falhar, migrar para Hono (menor impacto) — manter interfaces de middleware compatíveis

## 8. Links & References
* SAD Seção 2 (Tech Stack Justification), Seção 3 (Components: Servidor HTTP Admin/UI), Seção 12 (Trade-offs), Seção 13 (Future Evolution)
* NFR: NFR-CO01, NFR-M01, NFR-SEC02, NFR-O03
* Diagnóstico: Funções alta complexidade — `criarAcessoHttp` (61), `validarRequisicao` (11), `tratar` (26) <!-- source: Diagnóstico determinístico -->
* `src/auth-http.ts` — implementação atual <!-- source: src/auth-http.ts -->


# ADR-004 — Agendamento de Jobs: node-cron In-Process vs Filas Externas (BullMQ/pg-boss/cron do SO)

> **Data:** 09/10/2026 · **Status:** Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]  
> **Deciders:** Engenharia/Arquitetura · **Consulted:** Tech Lead, Operações · **Informed:** Time de Desenvolvimento

## 1. Status
Proposed [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

## 2. Context & Problem Statement
O sistema executa rotinas periódicas: `check:auto` (coleta/extração de CCTs via Playwright), `seed:auto` (manutenção de banco), consolidação com reserva. O SAD (Seção 3) define: "Scheduler (`node-cron`): Dispara rotinas periódicas... Não — roda no processo principal." `package.json` tem `node-cron` ^4.2.1 em produção. A decisão é manter `node-cron` in-process, rejeitando BullMQ (Redis), pg-boss (PostgreSQL) ou cron do sistema operacional.

## 3. Decision Drivers
* **Topologia single-node (NFR-S01):** Sem Redis, sem PostgreSQL — fila externa adiciona infraestrutura
* **Simplicidade operacional (NFR-PO02):** `node-cron` roda no mesmo processo Node.js, sem deploy separado
* **Transacionalidade com SQLite:** Jobs podem usar `db.transaction()` direto (ex: `reservarConsolidacao`)
* **Custo zero (NFR-CO01):** Sem sidecar, sem mensagem broker
* **Scripts CLI existentes:** `check`, `check:auto`, `seed`, `seed:auto`, `reanalisar` já usam `node-cron`

## 4. Considered Options
### Option A: node-cron in-process — **Escolhida**
* **Descrição:** `cron.schedule('*/15 * * * *', async () => { await checkAuto() })` dentro do processo principal.
* **Prós:**
  - Zero infraestrutura adicional
  - Acesso direto a `better-sqlite3`, `playwright`, `nodemailer` no mesmo event loop
  - Simples de debugar: logs no mesmo stdout do processo
  - Scripts `check:auto`, `seed:auto` já funcionam assim
* **Contras:**
  - Job longo (scraping + extração PDF) bloqueia event loop — NFR-P03 recomenda background
  - Crash do job derruba scheduler + HTTP server (SPOF)
  - Sem persistência de jobs — se processo reinicia, jobs perdidos (mitigado: idempotência via `fingerprintDocumentos`)
  - Sem visibilidade de fila (dashboard, retry manual, dead-letter)

### Option B: BullMQ (Redis-based queue)
* **Descrição:** Fila robusta com Redis, workers separados, retry/backoff, dashboard, rate limiting.
* **Prós:**
  - Workers isolados — extração PDF/Word não bloqueia HTTP
  - Persistência de jobs, retry automático, dead-letter queue
  - Escalonamento horizontal de workers
  - Métricas nativas (job duration, queue depth)
* **Contras:**
  - **Requer Redis** — viola NFR-S01, NFR-PO02, NFR-CO01
  - Complexidade operacional: Redis + workers + monitoramento
  - Overhead de serialização/deserialização de jobs
  - Não alinhado com stack real (sem Redis em `package.json`)

### Option C: pg-boss (PostgreSQL-based queue)
* **Descrição:** Fila usando PostgreSQL como backend, aproveita ACID do Postgres.
* **Prós:**
  - Sem Redis separado
  - Transacional com dados de negócio
* **Contras:**
  - **Requer PostgreSQL** — viola decisão ADR-001 (SQLite)
  - Mesma complexidade operacional de BullMQ

### Option D: Cron do SO (systemd timers / crontab)
* **Descrição:** Agendamento externo via `systemd` ou `cron`, invoca `npm run check` como comando.
* **Prós:**
  - Totalmente desacoplado do processo Node.js
  - Persistência de agendamento no SO
  - Logs separados (journald/syslog)
* **Contras:**
  - Perde acesso direto a `better-sqlite3` in-process (precisa CLI separado)
  - Duplicação de lógica: CLI `check` + HTTP server no mesmo código
  - Mais difícil coordenar `reservarConsolidacao` (lock table) entre processos

## 5. Decision Outcome
**Opção escolhida:** Option A — node-cron in-process

**Rationale:** Stack real tem `node-cron` ^4.2.1. SAD (Seção 3, 7, 12) assume nó único, sem message broker. NFR-S01, NFR-PO02, NFR-CO01 rejeitam Redis/Postgres. O bloqueio do event loop (NFR-P03) é **conhecido e aceito** — mitigação futura via `worker_threads` (SAD Seção 13), não troca de scheduler. Idempotência via `fingerprintDocumentos` (NFR-A04) tolera reinícios.

### Comparison Matrix
| Critério | Peso | Option A (node-cron) | Option B (BullMQ) | Option C (pg-boss) | Option D (SO cron) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Zero infra extra | 5 | 5 | 1 | 1 | 4 |
| Trans