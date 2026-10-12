# Non-Functional Requirements (NFR) — dist-historico (Sistema de Histórico e Gestão Documental)

> **Versão:** 1.0 · **Status:** Draft · **Owner:** Engenharia/Arquitetura

## 1. Performance

* **NFR-P01:** Tempo de resposta da API (endpoints de leitura: `listarClientes`, `listarContatos`, `lerDocumento`, `renderizarRelatorioHtml`) ≤ 200 ms no p95 e ≤ 500 ms no p99, medido em ambiente de homologação com base de dados representativa (≈ 10k clientes, 50k documentos). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-P02:** Tempo de resposta da API (endpoints de escrita: `salvarCliente`, `salvarContato`, `indexarMetaDocumento`, `indexarVinculo`, `definirVinculo`) ≤ 300 ms no p95 e ≤ 800 ms no p99, considerando o lock de escrita único do SQLite (WAL mode habilitado). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-P03:** Geração de relatório PDF (`gerarPdfRelatorio`) para até 500 registros ≤ 5 s no p95. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-P04:** Extração de cabeçalho de documento (`extrairCabecalho`) via `pdf-parse` / `word-extractor` ≤ 2 s por documento (PDF/DOCX até 10 MB). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-P05:** Time to First Byte (TTFB) da aplicação Vue (Vite dev / build preview) ≤ 100 ms em rede local. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-P06:** Largest Contentful Paint (LCP) das páginas críticas (dashboard, lista de clientes, detalhe de documento) ≤ 2.5 s em conexão 4G simulada. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **Método de medição:** Testes de carga com **k6** (scripts em `test:load` a serem criados) executados contra instância local com `better-sqlite3` em modo WAL; métricas de frontend via **Lighthouse CI** no pipeline de `build:frontend`. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 2. Escalabilidade

* **NFR-S01:** Suportar **até 50 usuários concorrentes por escritório (tenant)** com degradação de latência ≤ 20% em relação à linha de base de usuário único, limitado pelo single-writer lock do SQLite. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-S02:** Throughput mínimo de **30 req/s de leitura** e **10 req/s de escrita** por instância do processo Node.js (single-threaded event loop + SQLite WAL). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-S03:** Estratégia de escala vertical (aumento de CPU/RAM do host) como única opção suportada; **não há suporte a auto-scaling horizontal, clustering Node.js ou replicação multi-região** na arquitetura atual (monolito server-side + SQLite embarcado). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-S04:** Isolamento de carga entre escritórios via transações `withPostgresOfficeTransaction` (ou equivalente SQLite) — nenhuma query cross-tenant em operações normais. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **Observação:** A dependência `pg` existe no `package.json` e o glossário cita rotinas "Postgres"; a convivência de `better-sqlite3` (operacional) e `pg` (migração/backup?) **precisa ser confirmada com a engenharia** antes de dimensionar capacidade. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 3. Disponibilidade & Confiabilidade

* **NFR-A01:** Uptime alvo **99.5% (SLA)** / **99.9% (SLO interno)** medido mensalmente, exceto janelas de manutenção programadas (backup, migração). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-A02:** RTO (Recovery Time Objective) ≤ **1 hora** para restauração a partir de backup cifrado (`backup:cifrar`, `postgres:backup:criar-pacote-isolado`). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-A03:** RPO (Recovery Point Objective) ≤ **15 minutos** — frequência de snapshots/backups incrementais via `node-cron` (script `postgres:agendar` / `postgres:backup`). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-A04:** **Single point of failure assumido:** instância única do processo Node.js + arquivo SQLite local. Mitigação: backup automatizado cifrado, scripts de recuperação testados (`test:postgres-recuperacao-limpa`, `test:postgres-recuperacao-remapeada`, `sqlite:recuperacao:inspecionar`). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-A05:** Migrações de versão (`migrarCadastros`, `migrarAutenticacao`, `db:migrate`) executadas em transação atômica (`withPostgresTransaction` / equivalente SQLite) com rollback automático em falha; **zero perda de dados** (BR-17). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 4. Segurança

* **NFR-SEC01:** Dados sensíveis em repouso: **arquivo SQLite cifrado** (via `backup:cifrar` / `backup:chaves`) e variáveis de ambiente (`.env` via `dotenv`) não comitadas. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC02:** Dados em trânsito: **TLS 1.3 obrigatório** — scripts `ui:https`, `test:https-local`, `test:postgres-https` indicam suporte a HTTPS local; certificados válidos em produção. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC03:** Autenticação baseada em credenciais hash (`hashToken`, `criarAutenticacao`, `definirCredencial`); **tokens de recuperação nunca armazenados em claro** (BR-13). MFA **não implementado** na stack atual — item para roadmap. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC04:** Controle de acesso multi-tenant: isolamento por `exigirCadastroEscritorio` + `withPostgresOfficeTransaction`; **nenhuma query cross-tenant** exceto autenticação/admin (`withPostgresGlobalTransaction`). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC05:** Conta de runtime do banco com **princípio do menor privilégio** (`postgresRuntimeConfigFromEnv`, `validarPapelRuntimePostgres`) — nunca usa role de migração/admin (BR-15). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC06:** Sanitização de saída: todos os textos renderizados em relatórios HTML/PDF passam por `escaparHtml` (BR-11). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC07:** Validação de entrada via **Zod** (`zod` v3.23.8) em todos os endpoints públicos; rejeição de payloads inválidos com 400. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC08:** Conformidade com **OWASP Top 10** (validação, autenticação, logging de falhas via `auditarSeguranca` BR-12) — verificação via checklist manual a cada release. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-SEC09:** Rotação de segredos (chaves de cifragem backup, SMTP, JWT se houver) a cada **90 dias** via procedimento operacional documentado. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 5. Usabilidade & Acessibilidade

* **NFR-U01:** Conformidade **WCAG 2.1 AA** nos fluxos críticos (login, cadastro cliente, indexação documento, relatórios). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-U02:** Suporte a leitores de tela (NVDA, VoiceOver) — labels ARIA, ordem de foco lógica, contraste ≥ 4.5:1. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-U03:** Interface responsiva **320 px – 1920 px** (breakpoints mobile/tablet/desktop) — Vue 3 + CSS nativo (sem framework UI detectado). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-U04:** Feedback de estado de carregamento (skeleton/spinner) em operações assíncronas longas (`indexarArquivosExistentes`, `gerarPdfRelatorio`, `playwright` downloads). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 6. Observabilidade

* **NFR-O01:** **Logs estruturados (JSON)** em `stdout`/`stderr` com campos: `timestamp`, `level`, `traceId`, `officeId`, `userId`, `action`, `durationMs`, `error?`. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-O02:** Endpoint **`/health`** (liveness/readiness) expondo: status do processo, conectividade SQLite, contagem de conexões ativas, última migração aplicada. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-O03:** Endpoint **`/metrics`** (formato Prometheus) com: `http_requests_total{method,route,status}`, `http_request_duration_seconds{route,quantile}`, `sqlite_write_lock_wait_seconds`, `db_size_bytes`, `backup_last_success_timestamp`. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-O04:** **Tracing distribuído (OpenTelemetry)** em 100% das requisições HTTP críticas (escrita, relatórios, autenticação) — propagação de `traceparent` para logs. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-O05:** Alertas configurados (via coletor externo — ex: Prometheus Alertmanager / Grafana Cloud) para: p95 latência > 500 ms, taxa de erro 5xx > 1%, `sqlite_write_lock_wait_seconds` > 2 s, backup falho, disco > 80%. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-O06:** Auditoria de segurança (`auditarSeguranca`) e cadastro (`auditarCadastro`) **já implementadas no domínio** (BR-12) — logs de auditoria devem seguir o mesmo formato estruturado do NFR-O01. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **Nota:** **Nenhuma biblioteca de observabilidade (Winston, Pino, OpenTelemetry SDK, Prometheus client) detectada nas dependências** — todos os itens acima são **metas a implementar**.

## 7. Manutenibilidade & Qualidade de Código

* **NFR-M01:** Cobertura mínima de testes **80%** (linhas/funções/branches) medida via **Vitest** (`test`, `test:vue-ui`, `test:smoke`, `test:status`, etc.). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-M02:** Complexidade ciclomática **≤ 10** por função (ESLint `complexity` rule) — exceções justificadas em comentário. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-M03:** **TypeScript strict mode** (`typescript` v5.6.3, `vue-tsc` v2.2.12) — zero erros `any` implícito em código novo; `typecheck` passa no CI. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-M04:** Documentação de API (endpoints HTTP) mantida via **OpenAPI 3.1** (arquivo `openapi.yaml` versionado) — atualizada a cada release que altere contratos. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-M05:** Dependências auditadas a cada PR (`npm audit --audit-level=high`) e `dependabot`/`renovate` configurado. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 8. Compliance & Regulatório

* **NFR-C01:** **LGPD / GDPR** — implementação de "direito ao esquecimento": endpoint `excluirCadastro` (BR-18) remove dados pessoais do cliente e anonimiza vínculos/auditoria associados em ≤ 30 dias após solicitação. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-C02:** Retenção de logs de auditoria (`auditarSeguranca`, `auditarCadastro`) por **mínimo 5 anos** (política trabalhista/sindical) — armazenados no mesmo SQLite (tabela `auditoria`) com backup cifrado. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-C03:** Integridade de documentos: `hashBytes` (SHA-256) calculado no `indexarMetaDocumento` e verificado no `lerDocumentoBytes` (BR-08) — qualquer divergência bloqueia uso e gera alerta. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-C04:** Trilha de auditoria imutável: inserts only na tabela de auditoria; **nenhum UPDATE/DELETE** permitido via conta de runtime (BR-15, NFR-SEC05). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 9. Portabilidade & Compatibilidade

* **NFR-PO01:** Compatibilidade com **últimas 2 versões estáveis** de Chrome, Firefox, Safari, Edge (desktop e mobile) — validado via **Playwright** (`playwright` v1.48.0, scripts `test:vue-ui`, `test:auth-ui`, etc.). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-PO02:** Deploy suportado em **Linux (amd64/arm64)** com Node.js **≥ 20 LTS** (versão do `package.json` engines não especificada — assumir 20+). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-PO03:** **Sem dependência de cloud provider específico** — roda em VM, container (Dockerfile a ser criado), ou bare-metal; arquivo SQLite em volume persistente. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-PO04:** Build frontend (`build:frontend`) gera assets estáticos servidos pelo mesmo processo Node.js (Vite preview / build output) — **não requer CDN ou servidor web separado**. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 10. Custo (Cost Efficiency)

* **NFR-CO01:** Custo de infraestrutura **≤ USD 50/mês por escritório ativo** (VM 2 vCPU / 4 GB RAM / 50 GB SSD + backup storage) — estimativa baseada em arquitetura monolítica single-instance. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-CO02:** Zero custo de licenciamento de software (todas as dependências `dependencies_reais` e `dev_dependencies_reais` são **open-source / MIT / Apache-2.0**). **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**
* **NFR-CO03:** Custo operacional recorrente limitado a: hospedagem, serviço SMTP (ex: SendGrid, AWS SES) para `nodemailer`, e eventual armazenamento de backups cifrados. **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**

## 11. Rastreabilidade

| ID | Requisito Relacionado (BRD) | Prioridade | Status de Validação |
| :--- | :--- | :--- | :--- |
| NFR-P01 | BR-01, BR-02, BR-07, BR-08 (listar/ler) | Must | Não validado |
| NFR-P02 | BR-01, BR-02, BR-03, BR-04, BR-07 (escrita) | Must | Não validado |
| NFR-P03 | BR-11 (relatórios PDF) | Should | Não validado |
| NFR-P04 | BR-07, BR-08, BR-09 (extração/validação) | Must | Não validado |
| NFR-S01 | BR-03, BR-16 (multi-tenant isolado) | Must | Não validado |
| NFR-S02 | BR-16 (transacionalidade) | Must | Não validado |
| NFR-A01 | BR-17 (migrações seguras) | Must | Não validado |
| NFR-A02 | BR-17, scripts `backup:*`, `recuperacao:*` | Must | Não validado |
| NFR-SEC01 | BR-13, BR-15, `backup:cifrar` | Must | Não validado |
| NFR-SEC02 | Scripts `*https*` | Must | Não validado |
| NFR-SEC03 | BR-13, BR-14 (auth/admin) | Must | Não validado |
| NFR-SEC04 | BR-03, BR-16 (isolamento tenant) | Must | Não validado |
| NFR-SEC05 | BR-15 (menor privilégio) | Must | Não validado |
| NFR-SEC06 | BR-11 (escaparHtml) | Must | Não validado |
| NFR-SEC07 | BR-01, BR-02 (Zod validation) | Must | Não validado |
| NFR-C01 | BR-18 (excluirCadastro) | Must | Não validado |
| NFR-C02 | BR-12 (auditoria) | Must | Não validado |
| NFR-C03 | BR-08 (hashBytes) | Must | Não validado |
| NFR-C04 | BR-12, BR-15 (auditoria imutável) | Must | Não validado |
| NFR-O01..O06 | BR-12 (auditoria) + observabilidade geral | Should | Não validado |
| NFR-M01 | Scripts `test:*` (Vitest, Playwright) | Should | Não validado |
| NFR-M03 | `typecheck`, `vue-tsc` | Must | Não validado |

> **Observação final:** Todos os valores numéricos (latência, throughput, uptime, custos, prazos) são **propostas iniciais baseadas na stack real (SQLite + Node.js monolítico + Vue)** e **devem ser validadas/ajustadas pela engenharia e pelo produto** antes de tornarem-se compromissos formais. Itens marcados com **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** indicam exatamente essa necessidade.