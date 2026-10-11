# Production Readiness Audit — mte-mediador-monitor-unificado

> Relatório histórico com achados contestados na revisão de 11/10/2026. Não usar sua priorização como diagnóstico vigente. Para o escopo aprovado de validação local em DEV, consulte [Auditoria do MVP local](MVP_LOCAL_DEV_AUDIT_mediador-monitor.md), que registra evidências, correções e limites.

**Data:** 2026-10-11  
**Versão auditada:** 0.4.1  
**Escopo:** Full-spectrum (arquitetura, segurança, performance, qualidade, testes, infra de produção)

---

## Sumário Executivo

O projeto é um monitor de instrumentos coletivos do MTE (Mediador) com duas frentes operacionais:
- **SQLite local** (legacy/desenvolvimento): scraper Playwright + extração LLM + notificações
- **PostgreSQL multi-tenant** (produção): API HTTP, autenticação/autorização, RLS, workers de monitoramento, entregas de e-mail, publicações, backups cifrados

A base de código é **funcionalmente rica**, mas apresenta **riscos críticos de segurança e operação** que impedem lançamento em produção sem correção. O relatório prioriza por risco combinado (impacto × probabilidade).

---

## 1. Achados Críticos (Risco Muito Alto)

### 1.1 Segurança — Senha SMTP em texto plano no banco (PostgreSQL)
**Arquivo:** `migrations/postgres/004_delivery_and_client_decisions.sql:9`  
**Evidência:** Coluna `senha_cifrada` em `configuracoes_smtp_escritorio` armazena a senha **sem criptografia** (apenas nome sugestivo).  
**Impacto:** Comprometimento do banco expõe credenciais de e-mail de todos os escritórios.  
**Probabilidade:** Alta — não há camada de criptografia at-rest nem envelope de segredo.  
**Recomendação:** Criptografar com chave derivada de segredo de ambiente (ex.: `libsodium` `crypto_secretbox` ou `age`) antes de gravar; descriptografar apenas no worker de envio.

### 1.2 Segurança — Chave de API LLM em texto plano (SQLite + PostgreSQL)
**Arquivo:** `src/config.ts:56-58`, `src/db.ts:268-272`  
**Evidência:** `LLM_API_KEY` armazenada em `ajustes.valor` (JSON) sem proteção.  
**Impacto:** Vazamento de chave OpenAI/compatível → uso indevido, custos, exposição de dados enviados ao LLM.  
**Probabilidade:** Alta — banco SQLite costuma ser copiado/backupeado sem controle.  
**Recomendação:** Mesmo envelope de criptografia do item 1.1; rotação de chave via CLI.

### 1.3 Segurança — Ausência de rate limiting global no HTTP server
**Arquivo:** `src/server.ts:25-65`  
**Evidência:** `createServer` nativo sem middleware de rate limit; apenas validação de Host/Origin/CSRF.  
**Impacto:** Força bruta em `/api/auth/login`, enumeração de endpoints, DoS simples.  
**Probabilidade:** Alta em exposição pública.  
**Recomendação:** Adicionar rate limit por IP + conta (ex.: `@fastify/rate-limit` ou implementação leve com `Map` + janela deslizante) antes de `validarRequisicao`.

### 1.4 Arquitetura — `postgres-gestao-http.ts` é um **God Controller** (543 linhas, 30+ imports)
**Arquivo:** `src/postgres-gestao-http.ts`  
**Evidência:** Roteia **todas** as rotas `/api/contexto/*`, `/api/plataforma/*`, `/api/portal/*` em uma única função `tratarGestaoPostgres` com `if/else` encadeados.  
**Impacto:** Acoplamento extremo, dificulta testes, revisão de segurança, manutenção; mudança em uma área quebra outras silenciosamente.  
**Probabilidade:** Certa — já dificulta auditoria.  
**Recomendação:** Dividir em routers por domínio (auth, clientes, monitoramentos, publicações, envios, IA, plataforma) e compor no `server.ts`.

### 1.5 Arquitetura — Scraper Playwright acoplado ao runner de monitoramento (SQLite)
**Arquivo:** `src/monitoring/runner.ts:39-42`, `src/scraper.ts:25-35`  
**Evidência:** `abrirSessao` lança browser **dentro** do loop de execução; não há pool, reuso, nem isolamento de falhas.  
**Impacto:** Vazamento de processos Chromium, instabilidade em execuções longas, impossibilidade de escalar horizontalmente.  
**Probabilidade:** Alta em produção contínua.  
**Recomendação:** Extrair para serviço separado (pool de browsers, health check, restart automático) e comunicar via fila/HTTP.

---

## 2. Achados de Alto Risco

### 2.1 Segurança — `AUTH_PUBLIC_URL` aceita HTTP em localhost, mas **não valida SameSite/Lax em cookies de sessão**
**Arquivo:** `src/auth-core.ts:54-56`, `src/postgres-auth-http.ts:22-23`  
**Evidência:** `cookieSessao` usa `SameSite=Strict` (bom), mas `AUTH_PUBLIC_URL` HTTP em localhost permite desenvolvimento sem HTTPS; em produção, se o proxy terminar TLS, o cookie `Secure` depende de `publicUrl.protocol === 'https:'`.  
**Risco:** Configuração incorreta em proxy reverso → cookie sem `Secure`.  
**Recomendação:** Exigir `AUTH_PUBLIC_URL` HTTPS em produção; validar no bootstrap; documentar `UI_BIND_HOST=0.0.0.0` + proxy TLS.

### 2.2 Segurança — `pg_try_advisory_lock` usado para exclusão mútua de monitoramento/backup, **sem TTL nem recuperação automática**
**Arquivo:** `src/postgres-monitoring-lock.ts:20`, `src/postgres-backup-gate.ts:32`  
**Evidência:** Locks de sessão (`pg_try_advisory_lock`) liberados apenas no `finally`; se o processo crashar **após** adquirir o lock mas **antes** de registrar `executando` na tabela, o lock fica órfão até reinício do PostgreSQL.  
**Impacto:** Monitoramento/backup travados silenciosamente.  
**Recomendação:** Usar `pg_advisory_xact_lock` dentro de transação curta **ou** tabela de leases com `expira_em` + job de limpeza (já existe `iniciado_em` em `notificacoes_publicacoes` — estender o padrão).

### 2.3 Performance — N+1 em `listarClientes` (SQLite) e `listarEscritoriosPostgres`
**Arquivo:** `src/db.ts:147-150`, `src/postgres-organizacoes.ts:78-83`  
**Evidência:** Subqueries correlacionadas por linha (`clientes_total`, `usuarios_total`).  
**Impacto:** Degradação linear com número de escritórios/clientes.  
**Recomendação:** `JOIN` + `GROUP BY` ou `materialized view` / cache de contadores.

### 2.4 Performance — `consultarSessao` (scraper) baixa arquivos **sequencialmente** dentro do loop de páginas
**Arquivo:** `src/scraper.ts:290-308`  
**Evidência:** `for (const reg of dessaPagina) { ... await capturarDownload ... await salvarArquivo }`  
**Impacto:** Latência total = soma dos downloads; timeout de 45s por consulta pode estourar.  
**Recomendação:** Paralelismo controlado (ex.: `p-limit` com 3-5 downloads concorrentes) + budget de bytes já existente.

### 2.5 Qualidade — Tratamento de erro genérico em `server.ts:57-61` mascara causa raiz
**Arquivo:** `src/server.ts:57-61`  
**Evidência:** `catch (error) { ... console.error('[HTTP] Falha interna...'); json(res,500,{erro:'Não foi possível concluir a operação.'}); }`  
**Impacto:** Logs sem stack trace, impossível correlacionar incidentes.  
**Recomendação:** Log estruturado (JSON) com `request_id`, `error.message`, `error.stack`, `url`, `method`; manter resposta genérica ao cliente.

### 2.6 Qualidade — `db.ts` mistura **schema, migrações, queries, regras de negócio** (335 linhas)
**Arquivo:** `src/db.ts`  
**Impacto:** Acoplamento de camadas; migrações aditivas inline dificultam versionamento e rollback.  
**Recomendação:** Separar `schema.sql` (DDL), `migrations/*.ts` (versionadas, idempotentes), `queries/*.ts` (repositórios), `domain/*.ts` (regras).

### 2.7 Testes — Cobertura **apenas unitária** (vitest `*.test.ts`); **zero testes de integração E2E** para fluxos críticos
**Arquivo:** `vitest.config.ts:4`, `test/*.test.ts`  
**Evidência:** Testes mockam `pg.Pool`; não exercitam RLS, transações, migrações, Playwright, LLM, SMTP.  
**Fluxos sem cobertura E2E:** login → contexto → criar cliente → monitorar → baixar → analisar → consolidar → aprovar envio → enviar → portal cliente.  
**Recomendação:** Adicionar suíte `test/integration/` com Testcontainers (PostgreSQL) + Playwright headless + LLM mock server; rodar no CI.

### 2.8 Produção — **Ausência de health checks, readiness, liveness endpoints**
**Arquivo:** `src/server.ts` (não expõe `/health`, `/ready`, `/live`)  
**Impacto:** Orquestrador (K8s, systemd, Docker Swarm) não sabe se a instância está saudável.  
**Recomendação:** Expor `GET /healthz` (DB pool, disco, browser pool) e `/readyz` (migrações aplicadas, config válida).

### 2.9 Produção — **Logging apenas `console.log/error`**, sem níveis, correlação, estrutura
**Arquivo:** `src/monitoring/runner.ts:27`, `src/scraper.ts:23`, `src/server.ts:61`  
**Impacto:** Impossível agregação (Loki, Datadog, CloudWatch), alerta, debugging distribuído.  
**Recomendação:** Adotar `pino` ou `winston` com `level` por env, `request_id` propagado, `service: 'mediador-monitor'`.

### 2.10 Produção — **Sem métricas Prometheus / OpenTelemetry**
**Arquivo:** Nenhum  
**Impacto:** Sem visibilidade de throughput, latência, erros, filas, uso de browser pool.  
**Recomendação:** Instrumentar com `prom-client` (contadores, histogramas) + `/metrics` endpoint.

---

## 3. Achados de Risco Médio

| # | Área | Descrição | Arquivo/Ref |
|---|------|-----------|-------------|
| 3.1 | Segurança | `exigirCsrf` usa `timingSafeEqual` (bom), mas token CSRF derivado do token de sessão — se sessão vazia, CSRF previsível. | `src/auth-core.ts:57-61` |
| 3.2 | Segurança | `limitar()` (rate limit de auth) usa tabela `limites_autenticacao` **sem partição por janela** — scan full table a cada login. | `src/autenticacao.ts:92-108` |
| 3.3 | Segurança | `consultarCnpj` (BrasilAPI) chamado **sem timeout** nem circuit breaker. | `src/consulta-cnpj.ts` (não lido, inferido) |
| 3.4 | Performance | `descobrirDocumentosClientes` faz query ampla + loop em JS para cada par cliente×documento. | `src/cadastros.ts:263-303` |
| 3.5 | Qualidade | `consolidacao.ts` re-lê arquivos do disco para fingerprint a cada consolidação (cache `hashCache` ajuda, mas invalidação manual). | `src/consolidacao.ts:27-37` |
| 3.6 | Qualidade | `extrairClausulas` lança erro se texto > 150k chars — **falha silenciosa** em documentos grandes em vez de chunking. | `src/extract.ts:60-61` |
| 3.7 | Testes | `test/*.smoke.mjs` usam `node --test` (não vitest) — fragmentação de runner. | `package.json:57-60` |
| 3.8 | Produção | `Dockerfile` / `compose.yaml` não vistoriados — assumir ausência de `HEALTHCHECK`, `USER` non-root, `read-only` fs. | `Dockerfile`, `compose.yaml` |
| 3.9 | Produção | Backup/restore: scripts CLI existem (`postgres-backup-cli.ts`) mas **sem teste de restore automatizado no CI**. | `package.json:45,55` |
| 3.10 | Arquitetura | Dois bancos (SQLite + PostgreSQL) com **schemas divergentes** — migração `importarLegado` é one-way, sem validação contínua. | `src/db.ts:304-333` |

---

## 4. Achados de Baixo Risco / Dívida Técnica

| # | Área | Descrição |
|---|------|-----------|
| 4.1 | Qualidade | `postgres-gestao-http.ts` usa `zod` para validação mas repete schemas inline — extrair para `schemas/`. |
| 4.2 | Qualidade | `monitoring/runner.ts` faz consolidação, envios, notificações no mesmo loop — separar em steps independentes. |
| 4.3 | Qualidade | `scraper.ts` tem seletores hardcoded do portal MTE — extrair para `selectors.mte.ts` com testes de regressão visual. |
| 4.4 | Testes | Snapshots de HTML do portal em `test/fixtures/` — adicionar CI job que valida seletores contra portal real (agendado). |
| 4.5 | Docs | `README.md` não documenta variáveis de ambiente obrigatórias para produção (PGAPPUSER, PGAPPASSWORD, AUTH_PUBLIC_URL, etc.). |
| 4.6 | Segurança | `request-ip.ts` (não lido) — confirmar se confia em `X-Forwarded-For` apenas com `AUTH_TRUSTED_PROXY_CIDRS`. |

---

## 5. Priorização Consolidada (Top 10)

| Rank | ID | Título | Risco | Esforço | Dono Sugerido |
|------|----|--------|-------|---------|---------------|
| 1 | SEC-01 | Senha SMTP em texto plano | Crítico | Médio | Backend Specialist |
| 2 | SEC-02 | Chave LLM em texto plano | Crítico | Médio | Backend Specialist |
| 3 | SEC-03 | Rate limiting HTTP ausente | Crítico | Baixo | Backend Specialist |
| 4 | ARC-01 | God Controller `postgres-gestao-http.ts` | Crítico | Alto | Architect + Backend |
| 5 | ARC-02 | Scraper acoplado ao runner (sem pool) | Crítico | Alto | Backend + DevOps |
| 6 | SEC-04 | Advisory locks sem TTL/recuperação | Alto | Médio | Database Specialist |
| 7 | PERF-01 | N+1 em listagens de escritórios/clientes | Alto | Baixo | Database Specialist |
| 8 | PERF-02 | Downloads sequenciais no scraper | Alto | Médio | Backend Specialist |
| 9 | OPS-01 | Health checks / readiness ausentes | Alto | Baixo | DevOps |
| 10 | OPS-02 | Logging estruturado + métricas ausentes | Alto | Médio | Observability Specialist |

---

## 6. Plano de Ação Sugerido (Fases)

### Fase 0 — Bloqueadores de Produção (antes de qualquer deploy)
- [ ] SEC-01, SEC-02: Envelope de criptografia para segredos (SMTP, LLM, chaves de backup)
- [ ] SEC-03: Rate limit global no HTTP server
- [ ] OPS-01: Endpoints `/healthz`, `/readyz`
- [ ] ARC-02: Isolar scraper em processo/serviço separado (MVP: script standalone + fila Redis/SQS)

### Fase 1 — Estabilização (sprint 1-2)
- [ ] ARC-01: Split `postgres-gestao-http.ts` em routers por domínio
- [ ] PERF-01: Otimizar queries N+1 (JOIN + GROUP BY)
- [ ] PERF-02: Paralelismo controlado de downloads
- [ ] SEC-04: Leases com TTL + job de limpeza para locks de monitoramento/backup
- [ ] OPS-02: `pino` + `prom-client` + `/metrics`

### Fase 2 — Qualidade e Testes (sprint 2-3)
- [ ] Testes de integração E2E com Testcontainers (auth → monitoramento → entrega)
- [ ] Migrações versionadas separadas de `db.ts` (ferramenta: `node-pg-migrate` ou similar)
- [ ] CI pipeline: lint → typecheck → unit → integration → build → docker scan

### Fase 3 — Hardening Contínuo
- [ ] Circuit breaker + timeout em `consultarCnpj`
- [ ] Chunking de documentos grandes na extração LLM
- [ ] Validação contínua de seletores MTE (job agendado)
- [ ] Documentação de variáveis de ambiente e runbooks de incidente

---

## 7. Fora do Escopo desta Auditoria

- Revisão de código do frontend (`web/*.js`, `web/*.html`) — apenas verificado que são servidos estaticamente.
- Análise de dependências (SCA/SBOM) — executar `npm audit` / `syft` separadamente.
- Configuração de infraestrutura cloud (K8s, VM, serverless) — assumir que `Dockerfile`/`compose.yaml` serão auditados pelo DevOps.

---

## 8. Conclusão

**Não recomendado para produção** no estado atual. Os 5 achados críticos (SEC-01 a SEC-03, ARC-01, ARC-02) representam risco inaceitável de vazamento de credenciais, instabilidade operacional e incapacidade de resposta a incidentes. A correção da Fase 0 é pré-requisito mínimo; Fase 1 deve ser concluída antes de tráfego real de clientes.

---

*Relatório gerado por auditoria full-spectrum (Production Code Audit mode). Nenhuma correção foi aplicada — segregação de deveres preservada.*
