# Story Map & Slicing Strategy — Sistema de Histórico e Gestão Documental (dist-historico)

> Baseado na metodologia de *User Story Mapping* (Jeff Patton). O eixo horizontal representa a jornada do usuário; o eixo vertical representa a priorização por release/slice.

## 1. Backbone (Atividades do Usuário)
Onboarding & Configuração do Escritório → Gestão de Cadastros → Gestão Documental & Indexação → Gestão de Vínculos & CCTs/Aditivos → Relatórios & Auditoria → Operação & Manutenção

## 2. Horizontal Axis (User Journey Steps)
| Etapa | Objetivo do Usuário | Tarefas Associadas |
| :--- | :--- | :--- |
| **1. Onboarding Inicial & Provisionamento Admin** | Colocar o escritório operacional com administrador provisionado e credenciais definidas | Cadastrar escritório (CNPJ validado), bootstrap de administrador, primeiro login, definição de credencial |
| **2. Cadastro e Consulta de Clientes** | Manter base de clientes normalizada e buscável para suportar vínculos e documentos | Listar, criar, detalhar, editar clientes; validação e normalização de CNPJ/textos |
| **3. Cadastro e Consulta de Contatos** | Vincular pessoas de referência aos clientes para correspondência e contexto | Listar, criar, editar, excluir contatos por cliente; normalização de textos |
| **4. Indexação de Documentos (incl. migração retroativa)** | Ingerir documentos no histórico com integridade verificada e metadados extraídos | Upload/seleção de arquivos, validação de formato/tamanho, leitura de bytes, hash SHA-256, extração de cabeçalho (sem IA), persistência de metadados, deduplicação por hash; migração em lote de acervo legado |
| **5. Gestão de Vínculos (automática + revisão manual + pendências)** | Associar documentos a clientes, CCTs a aditivos, e consolidar o histórico com rastreabilidade | Indexação automática de vínculos (com referências explícitas), revisão manual de pendências (confirmar/rejeitar/deferir), descoberta de documentos de clientes, invalidação de consolidação, prevalência do manual sobre automático |
| **6. Processamento de CCTs e Aditivos** | Validar extração completa, gerar documento formal contratual (Markdown) e registrar sindicato | Validação de extração (nenhum conteúdo omitido), renderização Markdown apenas layout acordado, registro de sindicato signatário |
| **7. Geração de Relatórios (HTML/PDF)** | Produzir relatórios do histórico com dados íntegros, textos sanitizados e opção de PDF | Filtros (período, cliente, tipo, status), consulta isolada por escritório, verificação de integridade (hashBytes), renderização HTML com escape, geração PDF (headless), download/envio |
| **8. Autenticação & Acesso (login, recuperação, logout)** | Acesso seguro e controlado ao sistema com trilha de tentativas | Login com hash de credencial, logout, recuperação de senha via e-mail (token hasheado), bootstrap de admin na primeira execução |
| **9. Auditoria & Trilha de Segurança** | Consultar trilha imutável de ações sensíveis e de cadastro com filtros e exportação | Abas segurança/cadastros, filtros (período, ator, ação, entidade), paginação, detalhe expandido, export CSV/PDF, auto-auditoria de acesso à auditoria |
| **10. Migração & Manutenção de Versão** | Evoluir schema e dados com zero perda, backup cifrado, recuperação testada | Migrações transacionais com rollback automático, backup agendado (15 min) cifrado AES-256-GCM, health/readiness checks, métricas Prometheus, tracing OpenTelemetry |
| **11. Exclusão de Cadastros** | Remover permanentemente clientes/contatos considerando impactos em vínculos históricos | Confirmação com digitação de nome, execução transacional, auditoria, tratamento de vínculos órfãos (política a validar) |

```mermaid
graph LR
    A[1. Onboarding Inicial & Provisionamento Admin] --> B[2. Cadastro e Consulta de Clientes]
    B --> C[3. Cadastro e Consulta de Contatos]
    C --> D[4. Indexação de Documentos (incl. migração retroativa)]
    D --> E[5. Gestão de Vínculos (automática + revisão manual + pendências)]
    E --> F[6. Processamento de CCTs e Aditivos]
    F --> G[7. Geração de Relatórios (HTML/PDF)]
    A --> H[8. Autenticação & Acesso (login, recuperação, logout)]
    H --> B
    H --> C
    H --> D
    H --> E
    H --> F
    H --> G
    G --> I[9. Auditoria & Trilha de Segurança]
    D --> I
    E --> I
    F --> I
    J[10. Migração & Manutenção de Versão] --> A
    J --> D
    J --> G
    E --> K[11. Exclusão de Cadastros]
    C --> K
    B --> K
```

## 3. Vertical Axis (MoSCoW Slicing)

### Slice 1: MVP (Must Have) — Release 1
* **Objetivo do slice:** Entregar a jornada ponta-a-ponta mínima viável: onboarding de escritório, autenticação, cadastro de clientes, indexação de documentos com integridade, gestão manual de vínculos, geração de relatórios HTML/PDF e trilha de auditoria — tudo isolado por escritório (multi-tenant) e operando sobre better-sqlite3 com SQL cru.
* **Stories:**
  - **REQ-001** — Onboarding inicial do escritório e bootstrap de administrador — *Etapa 1*
  - **REQ-002** — Login, logout e recuperação de senha — *Etapa 8*
  - **REQ-003** — Cadastro e consulta de clientes — *Etapa 2*
  - **REQ-004** — Indexação de documento no histórico (upload, validação, hash, cabeçalho) — *Etapa 4*
  - **REQ-005** — Leitura e verificação de integridade de documentos — *Etapa 4*
  - **REQ-006** — Gestão manual de vínculos (definir, rejeitar, resolver pendências) — *Etapa 5*
  - **REQ-007** — Geração de relatórios HTML do histórico — *Etapa 7*
  - **REQ-008** — Geração de relatórios PDF do histórico — *Etapa 7*
  - **REQ-009** — Auditoria de segurança e cadastro (trilha imutável) — *Etapa 9*
  - **REQ-010** — Health check e métricas básicas — *Etapa 10*
  - **REQ-011** — Sanitização de textos (escaparHtml, normalizarTexto) — *Etapa 4*
  - **REQ-012** — Hash de integridade (hashBytes) e hash de tokens (hashToken) — *Etapa 4*

> [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Premissas do MVP: (a) melhor-sqlite3 é o motor operacional confirmado; (b) autenticação baseada em hashToken (bcrypt/PBKDF2 via crypto nativo) sem MFA; (c) relatório PDF via Playwright headless já disponível na stack; (d) isolamento multi-tenant via `office_id` em todas as queries; (e) migração retroativa (REQ-019) fica para Should por ser operação de onboarding opcional por escritório.

### Slice 2: Should Have — Release 2
* **Objetivo do slice:** Completar a gestão cadastral (contatos), automatizar vínculos onde há evidências explícitas, processar CCTs/Aditivos com validação e renderização formal, e habilitar migração de acervo legado e vigilância automática de fontes externas.
* **Stories:**
  - **REQ-013** — Cadastro e consulta de contatos — *Etapa 3*
  - **REQ-014** — Descoberta automática de documentos de clientes (candidatos para revisão) — *Etapa 5*
  - **REQ-015** — Indexação automática de vínculos com referências explícitas (CCT/Aditivo) — *Etapa 5*
  - **REQ-016** — Processamento de CCTs (validação extração, renderização Markdown) — *Etapa 6*
  - **REQ-017** — Processamento de Aditivos (validação, renderização, vinculação a CCT) — *Etapa 6*
  - **REQ-018** — Registro de sindicato em documentos — *Etapa 6*
  - **REQ-019** — Migração retroativa de arquivos existentes (indexarArquivosExistentes) — *Etapa 10*
  - **REQ-020** — Configuração de vigilância/monitoramento automático (playwright + node-cron) — *Etapa 10*

> [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Premissas do Should: (a) `referenciasExplicitas` extrai número de registro, data e sindicato da CCT original — campos exatos a confirmar; (b) `validarExtracaoCct` usa checklist regulatório (NR, cláusulas obrigatórias) a definir; (c) vigilância usa Playwright para login/download em portais sindicais — credenciais externas armazenadas cifradas (cofre/variáveis de ambiente); (d) migração retroativa roda como job `node-cron` de longa duração com progresso via polling/WebSocket.

### Slice 3: Could Have — Backlog
* **Objetivo do slice:** Funcionalidades de correção avançada, relatórios agendados/específicos, reconfiguração de tenant e controles finos de vigilância — valor incremental, não bloqueantes para operação core.
* **Stories:**
  - **REQ-021** — Exclusão de cadastro com tratamento de vínculos órfãos — *Etapa 11*
  - **REQ-022** — Invalidação de consolidação de vínculos (reverter ou marcar inválido) — *Etapa 5*
  - **REQ-023** — Relatórios agendados/recorrentes (entrega por e-mail via nodemailer) — *Etapa 7*
  - **REQ-024** — Relatórios de auditoria específicos (filtros pré-definidos de ações sensíveis) — *Etapa 7*
  - **REQ-025** — Reconfiguração de escritório existente (SMTP, caminhos, parâmetros de watch) — *Etapa 1*
  - **REQ-026** — Teste de configuração de vigilância antes de salvar (execução única Playwright) — *Etapa 10*
  - **REQ-027** — Pausar/reativar vigilância (manter configuração, parar job no node-cron) — *Etapa 10*

> [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Premissas do Could: (a) BR-18 (exclusão) requer decisão sobre cascata: vínculos órfãos mantidos/anônimos/removidos — impacto em relatórios históricos; (b) `invalidarConsolidacao` (BR-19) afeta apenas consolidação lógica, não apaga documentos/metadados; (c) relatórios agendados reutilizam `renderizarRelatorioHtml` + `gerarPdfRelatorio` + `nodemailer`; (d) interface de seletores Playwright (code editor visual? JSON? DSL?) a definir.

### Won't Have (Neste Ciclo)
* **Extração de cabeçalho com inteligência artificial** — explicitamente fora de escopo (BRD Seção 5, BR-11: "sem uso de inteligência artificial").
* **Aplicativo desktop / empacotamento Tauri** — projeto não possui `src-tauri/Cargo.toml` (Stack verificada).
* **Auto-scaling horizontal / cluster distribuído** — NFR-S03 define "escala vertical apenas"; single-instance por design.
* **MFA (autenticação multifator)** — roadmap conforme NFR-SEC03 ("MFA não implementado").
* **RBAC granular (papéis além de admin/usuario)** — UC-08 assume apenas "admin" e "usuario"; expansão requer validação de negócio.
* **Integrações externas não mapeadas** (ex.: API Receita Federal para validação CNPJ além do algoritmo) — BR-01 diz "validado" via `cnpjValido`; fonte a confirmar.

## 4. Mapa Visual (Matriz Completa)
| | 1. Onboarding | 2. Clientes | 3. Contatos | 4. Indexação Docs | 5. Vínculos | 6. CCTs/Aditivos | 7. Relatórios | 8. Auth | 9. Auditoria | 10. Migração/Manutenção | 11. Exclusão |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MVP** | REQ-001 | REQ-003 | | REQ-004, REQ-005, REQ-011, REQ-012 | REQ-006 | | REQ-007, REQ-008 | REQ-002 | REQ-009 | REQ-010 | |
| **Should** | | | REQ-013 | REQ-019 | REQ-014, REQ-015 | REQ-016, REQ-017, REQ-018 | | | | REQ-020 | |
| **Could** | REQ-025 | | | | REQ-022 | | REQ-023, REQ-024 | | | REQ-026, REQ-027 | REQ-021 |
| **Won't** | IA no cabeçalho, Tauri, MFA, RBAC granular | | | | | | | | | Auto-scaling horizontal, integrações não mapeadas | |

## 5. Critérios de Corte entre Releases
* **MVP → Should:** O MVP deve permitir que um escritório faça onboarding, cadastre clientes, indexe documentos, vincule manualmente, gere relatórios e tenha auditoria — tudo funcionando ponta-a-ponta. O Should adiciona automação de vínculos (onde há referências explícitas), contatos, processamento especializado de CCT/Aditivo e migração de acervo legado.
* **Should → Could:** O Should entrega automações que reduzem esforço manual (descoberta de docs, indexação automática CCT/Aditivo, vigilância). O Could adiciona correções (invalidação, exclusão com política de órfãos), relatórios agendados/específicos e controles finos de vigilância.
* **Definição de "Pronto para Lançar" por Slice:** Todos os REQs do slice implementados, testados (unitário + integração ≥ 80% cobertura nos domínios críticos), documentados (API spec, user stories), com health/metrics/auditoria instrumentados, e validados em ambiente de staging com dados representativos de pelo menos 1 escritório beta.

## 6. Riscos de Slicing
| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| **MVP sem contatos (REQ-013)** impede referenciar pessoas nos clientes para correspondência/notificações | Médio | Contatos são Should; MVP usa apenas dados do cliente (razão social, CNPJ, endereço). Validar com Product se fluxo de notificação é crítico no MVP. |
| **MVP sem indexação automática de vínculos (REQ-015)** exige revisão manual de todos os vínculos CCT/Aditivo | Alto (carga operacional) | MVP prioriza vínculo manual (BR-04: manual prevalece). Automação com `referenciasExplicitas` no Should reduz backlog. Instrumentar métrica de "pendentes por analista/dia" no MVP. |
| **Migração retroativa (REQ-019) no Should** pode atrasar onboarding de escritórios com grande acervo legado | Médio | Onboarding MVP (REQ-001) permite iniciar vazio (AS-1 no UC-11). Migração roda em background (job `node-cron`) sem bloquear operação. Relatório de progresso e falhas (Flow 10). |
| **Vigilância Playwright (REQ-020) no Should** consome CPU/RAM significativos em single-instance (NFR-S03) | Alto (estabilidade) | Limitar jobs concorrentes por instância; monitorar `watch_overlap_count` e `sqlite_write_lock_wait_seconds` via `/metrics`; alerta se > 2s lock (NFR-O05). Dimensionar host verticalmente. |
| **Exclusão com vínculos órfãos (REQ-021 no Could)** — política não definida (BR-18) | Alto (integridade histórica) | Decidir antes do Could: (a) manter vínculos com `cliente_id` anulado + anonimização LGPD, (b) marcar vínculos `orfao=true` e excluir de relatórios padrão, (c) bloquear exclusão| **Exclusão com vínculos órfãos (REQ-021 no Could)** — política não definida (BR-18) | Alto (integridade histórica) | Decidir antes do Could: (a) manter vínculos com `cliente_id` anulado + anonimização LGPD, (b) marcar vínculos `orfao=true` e excluir de relatórios padrão, (c) bloquear exclusão se houver vínculos confirmados — validar com Compliance e Jurídico. |
| **Observabilidade completa (NFR-O01..O06) no MVP** — nenhuma lib detectada na stack; implementação não trivial | Médio (operabilidade) | MVP inclui health/metrics básicos (REQ-010) com instrumentação manual mínima (contadores, histogramas, `/health/ready` checks). Dashboards Grafana, alertas Alertmanager e tracing OpenTelemetry 100% entram no Should/Could conforme capacidade da equipe. |
| **DDL não-transacional em SQLite** pode violar rollback automático em migrações complexas (NFR-A05, BR-17) | Alto (confiabilidade) | Testar migrações DDL em SQLite (ALTER TABLE, etc.) no pipeline de CI; se não transacionáveis, adotar estratégia "expand/contract" com scripts de rollback manuais validados; `test:sqlite-recuperacao` obrigatório no CI/CD. |
| **Single point of failure** (NFR-A04) — RTO ≤ 1h / RPO ≤ 15min dependem de backup/testes rigorosos | Alto (disponibilidade) | Backup cifrado agendado a cada 15 min (`node-cron`); `test:sqlite-recuperacao` e `test:postgres-recuperacao-limpa` no CI semanal; runbook de disaster recovery documentado e exercitado trimestralmente. |