# Product Roadmap & Sprint History — mte-mediador-monitor-unificado

> **Horizonte de planejamento:** Trimestral · **Última atualização:** 09/10/2026

## 1. Strategic Themes (Now / Next / Later)
### Now (Sprint Atual / Trimestre Atual — Out/Nov 2026)
* **Entrega do MVP (Release 1.0)** — Jornada ponta-a-ponta funcional: autenticação, coleta automatizada, extração de texto, validação de CNPJ, migração de legado, validação humana de extrações e renderização de CCT em Markdown. Objetivo: substituir processo manual de monitoramento de CCTs por fluxo automatizado auditável.

### Next (Próximo Trimestre — Nov/Dez 2026)
* **Resiliência, Segurança e Eficiência Operacional (Release 1.1)** — Recuperação de senha self-service, controle de concorrência no SQLite, cache de CNPJ com TTL e alertas automáticos de mudança de layout em fontes externas. Objetivo: eliminar dependência de admin para reset de senha, estabilizar escritas concorrentes, reduzir latência de consultas CNPJ e detectar falhas de coleta proativamente.

### Later (Explorando / Backlog Estratégico — 2027)
* **Refinamentos de UX e Automações Avançadas** — Painel de monitoramento em tempo real, auditoria de cadastro em lote e histórico de versões de CCTs. Objetivo: visibilidade operacional, compliance proativo e rastreabilidade total de alterações contratuais.

## 2. Upcoming Sprints
### Sprint 1 — 09/10/2026 a 23/10/2026
* **Meta Central (Sprint Goal):** Entregar autenticação básica com sessão segura (US-001) e iniciar coleta automatizada via Playwright (US-002), mitigando risco de segurança da alta complexidade ciclomática nas funções de auth.
* **Capacidade do time:** 20 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: time de 2 devs × 10 dias úteis × 1 ponto/dia/dev; foco em refatoração de auth + coleta)
* **Stories planejadas:**
  - [ ] US-001 — Autenticação Básica e Sessão (5 pts) — REQ-001
  - [ ] US-002 — Coleta Automatizada via Playwright (8 pts) — REQ-002
* **Riscos conhecidos:** Refatoração de `criarAutenticacao` (CC 22) e `criarAcessoHttp` (CC 61) pode demandar mais esforço que o estimado; dependência de `playwright:install` em ambiente de staging.

### Sprint 2 — 26/10/2026 a 06/11/2026
* **Meta Central (Sprint Goal):** Completar pipeline de extração (US-003) e validação de CNPJ (US-004), habilitando a migração de dados legados (US-005) com validação via `check:dry`.
* **Capacidade do time:** 20 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: mesma capacidade; extração PDF/DOC e consulta CNPJ externa são paralelas)
* **Stories planejadas:**
  - [ ] US-003 — Extração de Texto (PDF/DOC) (5 pts) — REQ-003
  - [ ] US-004 — Validação de CNPJ e Cadastro Básico (3 pts) — REQ-004
  - [ ] US-005 — Migração de Dados Legados (8 pts) — REQ-005
* **Riscos conhecidos:** Volume e formato dos dados legados desconhecidos; serviço externo de CNPJ não confirmado [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]; `check:dry` pode revelar inconsistências que bloqueiam migração.

### Sprint 3 — 09/11/2026 a 20/11/2026
* **Meta Central (Sprint Goal):** Fechar MVP com validação humana de extrações (US-006) e renderização Markdown (US-007), completando a jornada ponta-a-ponta do Release 1.0.
* **Capacidade do time:** 20 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: fluxo de aprovação humano no loop + template Markdown exigem validação com PO/Jurídico)
* **Stories planejadas:**
  - [ ] US-006 — Validação de Extração e Alterações (5 pts) — REQ-006
  - [ ] US-007 — Renderização de CCT em Markdown (3 pts) — REQ-007
* **Riscos conhecidos:** Algoritmo de diff para US-006 não definido; template Markdown pendente de aprovação jurídica; integração ponta-a-ponta pode revelar gaps de schema no `better-sqlite3`.

### Sprint 4 — 23/11/2026 a 04/12/2026
* **Meta Central (Sprint Goal):** Entregar Release 1.1 — recuperação de senha via e-mail (US-008) e controle de concorrência `reservarConsolidacao` (US-009), eliminando intervenção manual de admin e estabilizando escritas no SQLite.
* **Capacidade do time:** 20 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: SMTP validado em staging; estratégia de lock SQLite definida)
* **Stories planejadas:**
  - [ ] US-008 — Fluxo Completo de Recuperação de Senha via E-mail (5 pts) — REQ-008
  - [ ] US-009 — Controle de Concorrência via `reservarConsolidacao` (5 pts) — REQ-009
* **Riscos conhecidos:** Entregabilidade de e-mail (spam/bloqueio corporativo); implementação de lock no SQLite single-writer pode exigir `journal_mode=WAL` e `busy_timeout` ajustados.

### Sprint 5 — 07/12/2026 a 18/12/2026
* **Meta Central (Sprint Goal):** Completar Release 1.1 com cache de CNPJ com TTL (US-010) e alertas de mudança de layout (US-011), fechando corte Should → Could.
* **Capacidade do time:** 20 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: TTL de cache acordado; canal de alerta definido — e-mail/webhook)
* **Stories planejadas:**
  - [ ] US-010 — Cache de Consultas de CNPJ para Performance (3 pts) — REQ-010
  - [ ] US-011 — Alertas de Mudança de Layout em Fontes Externas (5 pts) — REQ-011
* **Riscos conhecidos:** Heurística de sugestão de seletor para alertas (US-011) pode gerar falsos positivos; fallback de cache stale (US-010) requer teste com serviço externo instável.

### Sprint 6 — 05/01/2027 a 16/01/2027
* **Meta Central (Sprint Goal):** Iniciar Slice 3 (Could Have) com painel de monitoramento em tempo real (US-012), aproveitando stack `web/` existente.
* **Capacidade do time:** 20 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: framework frontend em `web/` já definido; API de status + SSE/WS especificada)
* **Stories planejadas:**
  - [ ] US-012 — Painel de Monitoramento de Status de Coleta em Tempo Real (8 pts) — REQ-012
* **Riscos conhecidos:** Atualização em tempo real (polling vs SSE/WS) impacta carga no nó único; responsividade 1366px–1920px (NFR-U01) deve ser validada.

### Sprint 7 — 19/01/2027 a 30/01/2027
* **Meta Central (Sprint Goal):** Auditorias de cadastro em lote (US-013) e histórico de versões de CCTs (US-014), completando backlog estratégico do Slice 3.
* **Capacidade do time:** 20 pontos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: rate-limits do serviço CNPJ conhecidos; esquema `cct_versions` aprovado)
* **Stories planejadas:**
  - [ ] US-013 — Auditoria de Cadastro Automatizada por Lotes (5 pts) — REQ-013
  - [ ] US-014 — Histórico de Versões de CCTs Consolidadas (5 pts) — REQ-014
* **Riscos conhecidos:** Janela noturna de 4h para 5.000 CNPJs (US-013) depende de rate-limits externos; imutabilidade de versões (US-014) requer triggers SQLite testados.

## 3. Closed Sprints
Sem histórico de sprints registrado no sistema — preencher manualmente.

## 4. Milestones & Releases
| Milestone | Data Alvo | Escopo | Status |
| :--- | :--- | :--- | :--- |
| **MVP — Release 1.0** | 20/11/2026 | US-001 a US-007 (REQ-001 a REQ-007): Autenticação, Coleta, Extração, CNPJ, Migração, Validação, Renderização Markdown | Planejado |
| **Release 1.1 (Should Have)** | 18/12/2026 | US-008 a US-011 (REQ-008 a REQ-011): Recuperação senha, Concorrência, Cache CNPJ TTL, Alertas layout | Planejado |
| **Slice 3 — Could Have (Parcial)** | 30/01/2027 | US-012 a US-014 (REQ-012 a REQ-014): Painel tempo real, Auditoria lotes, Histórico versões | Planejado |
| **Corte MVP → Should** | 20/11/2026 | Usuário loga, sistema coleta documento, empresa vinculada via CNPJ, Markdown final gerado com sucesso | Planejado |
| **Corte Should → Could** | 18/12/2026 | Estabilidade de concorrência (`reservarConsolidacao`) e recuperação de senha homologadas; elimina dependência de admin para resets | Planejado |

## 5. Velocity Trend
Sem histórico de sprints registrado no sistema — preencher manualmente.

## 6. Dependencies & Blockers Ativos
| Item | Bloqueado por | Dono | Previsão de resolução |
| :--- | :--- | :--- | :--- |
| US-001 (Auth) | Refatoração `criarAutenticacao`/`criarAcessoHttp` aprovada; schema usuários/sessões confirmado | Tech Lead | 09/10/2026 (início Sprint 1) |
| US-002 (Coleta) | `loadWatchConfig` documentado com seletores por fonte; lista de fontes-alvo validada | PO / Analista | 15/10/2026 |
| US-004 (CNPJ) | Fornecedor/serviço de consulta CNPJ definido + credenciais | PO / Infra | 26/10/2026 (início Sprint 2) |
| US-005 (Migração) | Especificação completa formato dados legados + mapeamento campo-a-campo | DBA / Analista Legado | 02/11/2026 |
| US-006 (Validação) | Algoritmo de diff selecionado/testado com amostras reais CCTs | Tech Lead / Jurídico | 09/11/2026 (início Sprint 3) |
| US-007 (Render) | Template Markdown aprovado por Jurídico; campos obrigatórios definidos | Jurídico / PO | 09/11/2026 (início Sprint 3) |
| US-008 (Recuperação) | Credenciais SMTP validadas em staging; template e-mail aprovado | Infra / PO | 23/11/2026 (início Sprint 4) |
| US-009 (Concorrência) | Estratégia de lock SQLite definida (tabela aux vs `sqlite3_lock` vs `busy_timeout`) | Tech Lead | 23/11/2026 (início Sprint 4) |
| US-010 (Cache CNPJ) | TTL padrão acordado (24h/72h?); esquema `cnpj_cache` aprovado | PO / Tech Lead | 07/12/2026 (início Sprint 5) |
| US-011 (Alertas) | Canal de alerta padrão definido (e-mail admin? webhook Slack/Teams?); payload padronizado | PO / Infra | 07/12/2026 (início Sprint 5) |
| US-012 (Painel) | API de status definida (REST + SSE/WS); design dashboard validado com PO | Tech Lead / UX | 05/01/2027 (início Sprint 6) |
| US-013 (Auditoria Lote) | Frequência/janela acordada; rate-limit serviço CNPJ conhecido para configurar delay | PO / Infra | 19/01/2027 (início Sprint 7) |
| US-014 (Histórico) | Esquema `cct_versions` aprovado; política de retenção definida | Tech Lead / Jurídico | 19/01/2027 (início Sprint 7) |