# Product Roadmap & Sprint History — Sistema de Histórico e Gestão Documental (dist-historico)

> **Horizonte de planejamento:** Trimestral · **Última atualização:** 12/10/2026

## 1. Strategic Themes (Now / Next / Later)
### Now (Trimestre Atual — Q4 2026)
* **MVP — Jornada Ponta-a-Ponta Mínima Viável** — Entregar onboarding de escritório, autenticação, cadastro de clientes, indexação de documentos com integridade (hash SHA-256), gestão manual de vínculos, geração de relatórios HTML/PDF e trilha de auditoria imutável, tudo isolado por escritório (multi-tenant) sobre better-sqlite3 com SQL cru. <!-- source: story-map#L47-L63 -->

### Next (Próximo Trimestre — Q1 2027)
* **Should Have — Automação e Completude Cadastral** — Completar gestão de contatos, automatizar vínculos onde há referências explícitas (CCT/Aditivo), processar CCTs e Aditivos com validação regulatória e renderização Markdown formal, habilitar migração retroativa de acervo legado e vigilância automática de fontes externas via Playwright + node-cron. <!-- source: story-map#L65-L83 -->

### Later (Explorando / Backlog Estratégico — Q2 2027+)
* **Could Have — Correções Avançadas e Controles Finos** — Exclusão de cadastros com política de vínculos órfãos (LGPD), invalidação de consolidação de vínculos, relatórios agendados/recorrentes por e-mail, relatórios de auditoria com filtros pré-definidos, reconfiguração de tenant, teste e pausa/reativação de vigilância. <!-- source: story-map#L85-L103 -->

---

## 2. Upcoming Sprints
### Sprint 1 — 12/10/2026 a 25/10/2026
* **Meta Central (Sprint Goal):** Entregar onboarding de escritório (REQ-001), autenticação completa login/logout/recuperação (REQ-002), cadastro e consulta de clientes (REQ-003) e utilitários transversais de sanitização (REQ-011) e hash (REQ-012) — fundação multi-tenant e segurança para todo o MVP. <!-- source: story-map#L47-L63 -->
* **Capacidade do time:** 30 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: time de 3 desenvolvedores, sprint de 10 dias úteis, foco 100% no projeto, velocidade histórica assumida 10 pts/dev/sprint; ajustar após primeira sprint real]
* **Stories planejadas:**
  - [ ] US-001 — Onboarding Inicial do Escritório e Bootstrap de Administrador (5 pts) <!-- source: user-stories#L1-L130 -->
  - [ ] US-002 — Login, Logout e Recuperação de Senha (5 pts) <!-- source: user-stories#L132-L280 -->
  - [ ] US-003 — Cadastro e Consulta de Clientes (8 pts) <!-- source: user-stories#L282-L430 -->
  - [ ] US-011 — Sanitização de Textos (escaparHtml, normalizarTexto) (2 pts) <!-- source: user-stories#L700-L780 -->
  - [ ] US-012 — Hash de Integridade (hashBytes) e Hash de Tokens (hashToken) (3 pts) <!-- source: user-stories#L782-L870 -->
* **Riscos conhecidos:** DDL não-transacional em SQLite pode violar rollback automático em migrações (R7); single point of failure — RTO ≤ 1h / RPO ≤ 15min dependem de backup/testes rigorosos (R8) <!-- source: story-map#L170-L185 -->

### Sprint 2 — 26/10/2026 a 08/11/2026
* **Meta Central (Sprint Goal):** Entregar indexação de documentos com validação, hash, extração de cabeçalho e deduplicação (REQ-004), leitura e verificação de integridade (REQ-005), gestão manual de vínculos com prevalência manual sobre automático (REQ-006), relatórios HTML (REQ-007) e PDF via Playwright (REQ-008), auditoria imutável (REQ-009) e health check/métricas básicas (REQ-010) — completar jornada ponta-a-ponta do MVP. <!-- source: story-map#L47-L63 -->
* **Capacidade do time:** 30 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: mesma capacidade da Sprint 1; validar velocity real ao final da Sprint 1]
* **Stories planejadas:**
  - [ ] US-004 — Indexação de Documento no Histórico (Upload, Validação, Hash, Cabeçalho) (8 pts) <!-- source: user-stories#L432-L540 -->
  - [ ] US-005 — Leitura e Verificação de Integridade de Documentos (5 pts) <!-- source: user-stories#L542-L630 -->
  - [ ] US-006 — Gestão Manual de Vínculos (Definir, Rejeitar, Resolver Pendências) (8 pts) <!-- source: user-stories#L632-L730 -->
  - [ ] US-007 — Geração de Relatórios HTML do Histórico (5 pts) <!-- source: user-stories#L872-L960 -->
  - [ ] US-008 — Geração de Relatórios PDF do Histórico (5 pts) <!-- source: user-stories#L962-L1050 -->
  - [ ] US-009 — Auditoria de Segurança e Cadastro (Trilha Imutável) (5 pts) <!-- source: user-stories#L1052-L1150 -->
  - [ ] US-010 — Health Check e Métricas Básicas (3 pts) <!-- source: user-stories#L1152-L1230 -->
* **Riscos conhecidos:** Playwright para PDF consome CPU/RAM significativos em single-instance (NFR-S03); observabilidade completa (NFR-O01..O06) sem libs detectadas na stack — instrumentação manual mínima no MVP (R5) <!-- source: story-map#L175-L185 -->

### Sprint 3 — 09/11/2026 a 22/11/2026
* **Meta Central (Sprint Goal):** Iniciar Should Have — entregar cadastro e consulta de contatos (REQ-013), descoberta automática de documentos de clientes (REQ-014) e indexação automática de vínculos com referências explícitas CCT/Aditivo (REQ-015) — reduzir carga operacional manual do MVP. <!-- source: story-map#L65-L83 -->
* **Capacidade do time:** 30 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: capacidade mantida; validar com velocity real das Sprints 1-2]
* **Stories planejadas:**
  - [ ] US-013 — Cadastro e Consulta de Contatos (5 pts) <!-- source: user-stories#L1232-L1340 -->
  - [ ] US-014 — Descoberta Automática de Documentos de Clientes (Candidatos para Revisão) (8 pts) <!-- source: user-stories#L1342-L1440 -->
  - [ ] US-015 — Indexação Automática de Vínculos com Referências Explícitas (CCT/Aditivo) (8 pts) <!-- source: user-stories#L1442-L1550 -->
* **Riscos conhecidos:** Ambiguidade em `referenciasExplicitas` (campos exatos: número registro, data, sindicato — a confirmar); similaridade textual para descoberta (threshold e algoritmo a definir) <!-- source: story-map#L70-L75 -->

### Sprint 4 — 23/11/2026 a 06/12/2026
* **Meta Central (Sprint Goal):** Processamento especializado de CCTs (REQ-016) e Aditivos (REQ-017) com validação de extração completa, renderização Markdown formal apenas layout contratual, e registro de sindicato (REQ-018) — completar automação de documentos contratuais. <!-- source: story-map#L65-L83 -->
* **Capacidade do time:** 30 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: capacidade mantida]
* **Stories planejadas:**
  - [ ] US-016 — Processamento de CCTs (Validação Extração, Renderização Markdown) (8 pts) <!-- source: user-stories#L1552-L1660 -->
  - [ ] US-017 — Processamento de Aditivos (Validação, Renderização, Vinculação a CCT) (5 pts) <!-- source: user-stories#L1662-L1740 -->
  - [ ] US-018 — Registro de Sindicato em Documentos (3 pts) <!-- source: user-stories#L1742-L1820 -->
* **Riscos conhecidos:** Checklist regulatório `validarExtracaoCct` (NR, cláusulas obrigatórias) a definir; template Markdown versionado e engine (Handlebars/Nunjucks) não detectado na stack <!-- source: story-map#L70-L75 -->

### Sprint 5 — 07/12/2026 a 20/12/2026
* **Meta Central (Sprint Goal):** Migração retroativa de arquivos existentes via job `node-cron` de longa duração com progresso via polling/WebSocket (REQ-019) e configuração de vigilância/monitoramento automático com Playwright + node-cron (REQ-020) — habilitar onboarding de escritórios com acervo legado e coleta contínua. <!-- source: story-map#L65-L83 -->
* **Capacidade do time:** 30 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: capacidade mantida; Sprint 5 pode ser impactada por feriados de fim de ano]
* **Stories planejadas:**
  - [ ] US-019 — Migração Retroativa de Arquivos Existentes (indexarArquivosExistentes) (8 pts) <!-- source: user-stories#L1822-L1930 -->
  - [ ] US-020 — Configuração de Vigilância/Monitoramento Automático (Playwright + node-cron) (13 pts) <!-- source: user-stories#L1932-L2060 -->
* **Riscos conhecidos:** Migração retroativa pode atrasar onboarding de escritórios com grande acervo (R3); vigilância Playwright consome CPU/RAM — limitar jobs concorrentes, monitorar `watch_overlap_count` e `sqlite_write_lock_wait_seconds` (R4) <!-- source: story-map#L175-L185 -->

### Sprint 6 — 04/01/2027 a 17/01/2027
* **Meta Central (Sprint Goal):** Iniciar Could Have — exclusão de cadastro com tratamento de vínculos órfãos (REQ-021, política a validar com Compliance/Jurídico), invalidação de consolidação de vínculos (REQ-022) e relatórios agendados/recorrentes via e-mail (REQ-023). <!-- source: story-map#L85-L103 -->
* **Capacidade do time:** 30 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: capacidade mantida; validar velocity real ao final da Sprint 5]
* **Stories planejadas:**
  - [ ] US-021 — Exclusão de Cadastro com Tratamento de Vínculos Órfãos (8 pts) <!-- source: user-stories#L2062-L2160 -->
  - [ ] US-022 — Invalidação de Consolidação de Vínculos (5 pts) <!-- source: user-stories#L2162-L2240 -->
  - [ ] US-023 — Relatórios Agendados/Recorrentes (Entrega por E-mail via nodemailer) (5 pts) <!-- source: user-stories#L2242-L2330 -->
* **Riscos conhecidos:** Política de vínculos órfãos (BR-18) não definida — decidir antes do Could: (a) anonimizar + manter, (b) marcar `orfao=true`, (c) bloquear exclusão; regra exata de `invalidarConsolidacao` (reverter vs marcar `nao_valido`) a definir <!-- source: story-map#L185-L195 -->

### Sprint 7 — 18/01/2027 a 31/01/2027
* **Meta Central (Sprint Goal):** Completar Could Have — relatórios de auditoria específicos com filtros pré-definidos (REQ-024), reconfiguração de escritório existente (REQ-025), teste de configuração de vigilância antes de salvar (REQ-026) e pausar/reativar vigilância (REQ-027). <!-- source: story-map#L85-L103 -->
* **Capacidade do time:** 30 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: capacidade mantida]
* **Stories planejadas:**
  - [ ] US-024 — Relatórios de Auditoria Específicos (Filtros Pré-definidos de Ações Sensíveis) (3 pts) <!-- source: user-stories#L2332-L2410 -->
  - [ ] US-025 — Reconfiguração de Escritório Existente (SMTP, Caminhos, Parâmetros Watch) (3 pts) <!-- source: user-stories#L2412-L2500 -->
  - [ ] US-026 — Teste de Configuração de Vigilância Antes de Salvar (Execução Única Playwright) (5 pts) <!-- source: user-stories#L2502-L2590 -->
  - [ ] US-027 — Pausar/Reativar Vigilância (Manter Configuração, Parar Job no node-cron) (2 pts) <!-- source: user-stories#L2592-L2670 -->
* **Riscos conhecidos:** Formato configuração vigilância (JSON/DSL/visual editor para seletores Playwright) em aberto; credenciais portais externos — armazenamento/rotação a definir <!-- source: story-map#L95-L100 -->

---

## 3. Closed Sprints
Sem histórico de sprints registrado no sistema — preencher manualmente.

---

## 4. Milestones & Releases
| Milestone | Data Alvo | Escopo | Status |
| :--- | :--- | :--- | :--- |
| **MVP Release (v1.0)** | 08/11/2026 | US-001 a US-012 (REQ-001 a REQ-012) — Onboarding, Auth, Clientes, Documentos, Vínculos Manuais, Relatórios HTML/PDF, Auditoria, Health/Metrics, Utilitários | Planejado |
| **Should Release (v1.1)** | 20/12/2026 | US-013 a US-020 (REQ-013 a REQ-020) — Contatos, Descoberta Auto, Indexação Auto CCT/Aditivo, Processamento CCT/Aditivo/Markdown, Sindicato, Migração Legado, Vigilância | Planejado |
| **Could Release (v1.2)** | 31/01/2027 | US-021 a US-027 (REQ-021 a REQ-027) — Exclusão LGPD, Invalidação Consolidação, Relatórios Agendados, Auditoria Modelos, Reconfig Tenant, Teste/Pausa Vigilância | Planejado |

---

## 5. Velocity Trend
Sem histórico de sprints registrado no sistema — preencher manualmente.

---

## 6. Dependencies & Blockers Ativos
| Item | Bloqueado por | Dono | Previsão de resolução |
| :--- | :--- | :--- | :--- |
| **US-001/US-002/US-003** (MVP foundation) | Definição final de `hashToken` (bcrypt/PBKDF2/argon2 via crypto nativo) e `normalizarTexto` (case, acentos, pontuação) | Tech Lead / PO | Antes da Sprint 1 (12/10/2026) |
| **US-004/US-005** (Documentos) | Confirmação de `pdf-parse` + `word-extractor` para extração cabeçalho sem IA; limite 10MB arquivo | Tech Lead | Antes da Sprint 2 (26/10/2026) |
| **US-006/US-014/US-015** (Vínculos) | Parser `referenciasExplicitas` (campos exatos: número registro, data, sindicato); algoritmo similaridade textual (Levenshtein/Jaro-Winkler) | PO / Domain Expert | Antes da Sprint 3 (09/11/2026) |
| **US-016/US-017** (CCT/Aditivo) | Checklist regulatório `validarExtracaoCct` (NR, cláusulas obrigatórias); template `renderizarCctMarkdown` aprovado + engine (Handlebars/Nunjucks) | Compliance / PO | Antes da Sprint 4 (23/11/2026) |
| **US-019** (Migração Legado) | Política de quarentena para arquivos corrompidos/não suportados; estratégia retomada job cancelado | Tech Lead | Antes da Sprint 5 (07/12/2026) |
| **US-020** (Vigilância) | Formato configuração seletores Playwright (JSON/DSL/visual editor); armazenamento/rotação credenciais portais externos (cofre/variáveis ambiente) | Tech Lead / SecOps | Antes da Sprint 5 (07/12/2026) |
| **US-021** (Exclusão LGPD) | **Política de vínculos órfãos definida e aprovada por Compliance/Jurídico** (BR-18: anonimizar/marcar/bloquear) | Compliance / Jurídico / PO | Antes da Sprint 6 (04/01/2027) |
| **US-022** (Invalidação) | Regra exata: reversão estado anterior vs marcação `nao_valido` | PO / Domain Expert | Antes da Sprint 6 (04/01/2027) |
| **US-026** (Teste Vigilância) | Timeout execução teste Playwright (60s assumido); storage temporário screenshots/arquivos | Tech Lead | Antes da Sprint 7 (18/01/2027) |
| **Observabilidade Completa** (NFR-O01..O06) | Seleção libs (Prometheus client, OpenTelemetry, Grafana, Alertmanager) — nenhuma detectada na stack | Tech Lead / Platform | Should/Could (pós-MVP) |
| **DDL Transacional SQLite** | Validação de migrações `ALTER TABLE` etc. em SQLite no pipeline CI; estratégia expand/contract se não transacionáveis | Tech Lead / DevOps | Contínuo (iniciar Sprint 1) |
| **Single Point of Failure** | Backup cifrado agendado 15 min (`node-cron`); `test:sqlite-recuperacao` e `test:postgres-recuperacao-limpa` no CI semanal; runbook DR exercitado trimestralmente | DevOps / Tech Lead | Contínuo (iniciar Sprint 1) |