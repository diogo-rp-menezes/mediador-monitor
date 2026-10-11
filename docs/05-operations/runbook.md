# Operations Runbook & System Maintenance Guide — mte-mediador-monitor-unificado

> **Owner:** Engenharia/DevOps (on-call) · **Última revisão:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — data a preencher na primeira revisão formal
> **Sistema de alerta:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Nenhum sistema de alerta (PagerDuty/Opsgenie/Alertmanager) está configurado ou detectado nos fontes. Premissa adotada: alertas hoje dependem de **notificações por e-mail via `nodemailer`** (falhas de coleta) e de observação manual de logs. Requer definição de ferramenta formal.
> **Canal de incidentes:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Nenhum canal (#incidents, Slack, Teams) definido nos fontes — requer criação pela equipe.

## 1. System Overview

* **Componentes críticos (todos no mesmo processo Node.js — topologia de nó único, SAD §3/§11):**
  - **Scheduler `node-cron`** — dispara as rotinas `check:auto` (coleta/extração de CCTs) e `seed:auto`. Uptime mínimo exigido: 99% (NFR-A01).
  - **Coletor/Scraper `playwright`** — navega portais oficiais de CCTs (Chromium headless no mesmo host).
  - **Extrator de documentos** — `pdf-parse` e `word-extractor` (CPU-bound, roda no event loop).
  - **Consolidador** — `reservarConsolidacao` serializa escritas no SQLite (NFR-S03).
  - **Servidor HTTP Admin/UI** — HTTP nativo em `src/auth-http.ts` (`npm run ui` / `npm run start`).
  - **Banco de dados** — `better-sqlite3`, arquivo único `.sqlite` em disco local (sem ORM, SQL cru).
  - **Notificações** — `nodemailer` via SMTP externo.
* **Diagrama de arquitetura:** ver `system-architecture.md` §11 (Deployment Topology) — não duplicado aqui.
* **Dependências externas críticas:**
  | Dependência | Criticidade | Efeito de falha |
  | :--- | :--- | :--- |
  | Portais oficiais de CCT (scraping) | **Alta** | Quebra de layout interrompe a coleta (NFR-O02) |
  | API externa de CNPJ | Média | Degrada enriquecimento; cache local em `criarConsultaCnpj` mitiga (NFR-S02) |
  | Servidor SMTP (`SMTP_HOST/PORT/USER/PASS` no `.env`) | Média | Silencia alertas e notificações |
  | Arquivo `.sqlite` local | **Crítica (SPOF)** | Corrupção/perda = perda total de dados (SAD §8) |

## 2. Monitoring & System Health Check

> **Estado real:** **nenhuma rota de health check explícita foi detectada no código** (varredura determinística). O endpoint `/healthz` é exigido por NFR-O03 mas **ainda não implementado** (SAD §10). Não há biblioteca de métricas/logs estruturados instalada. Até a implementação, os thresholds abaixo são verificados **manualmente** via os procedimentos da Seção 7.

| Métrica | Ferramenta | Threshold Saudável | Threshold de Alerta |
| :--- | :--- | :--- | :--- |
| Latência de leitura (p95) — consultas CCT/cadastros | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] logs de tempo de execução (NFR-P01, método de medição); futuro `/metrics` | < 300ms (NFR-P01) | > 800ms [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (premissa: ~2,5× o SLO, indicando degradação antes da violação) |
| Lock de escrita SQLite | Observação de erros `SQLITE_BUSY` nos logs / falhas de `reservarConsolidacao` | < 5s de espera (SAD §10) | > 5s ou erros `SQLITE_BUSY` recorrentes (NFR-P02) |
| Taxa de erro das rotinas `node-cron` (`check:auto`) | Contagem de falhas consecutivas nos logs / e-mails de falha | 0 falhas consecutivas | > 3 execuções consecutivas com falha (SAD §10, NFR-O02) |
| Saturação CPU/Memória do processo Node | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `top`/`htop`/systemd no host (nenhum agente de monitoramento detectado) | < 70% | > 85% — atenção especial durante extração de PDFs grandes (NFR-P03) e scraping com Chromium |
| Espaço em disco (volume do `.sqlite`) | `df -h` no host | > 20% livre | < 10% livre — risco de corrupção do SQLite (SAD §10) |
| Uptime das rotinas agendadas | Observação de 1 ciclo completo de `check:auto` | ≥ 99% (NFR-A01) | Qualquer ciclo agendado não executado |

* **Dashboards principais:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Nenhum dashboard (Grafana/Datadog) existe nos fontes. Premissa: até a implementação de NFR-O01/O03, a "fonte de verdade" operacional são os logs do processo (stdout capturado pelo systemd/journald) e os e-mails de notificação de falha.
* **Health check endpoint:** **não implementado.** Até lá, verificação manual de saúde (SAD §10 / Deployment Plan §7):
  1. Processo ativo: `systemctl status <serviço>` ou equivalente;
  2. Banco íntegro: `npm run check:dry` — deve reportar zero inconsistências;
  3. SMTP: confirmar recebimento dos e-mails de notificação das rotinas.
* **Métricas específicas de banco:** ver `db-performance-recovery` (se existir) — não duplicado aqui.

## 3. On-Call & Escalation

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — Nenhuma estrutura de on-call está definida nos fontes. Premissa adotada (alinhada aos SLAs do Deployment Plan §6 e ao RTO de 4h do NFR-A02):

| Nível | Papel | Tempo de resposta esperado |
| :--- | :--- | :--- |
| L1 | On-call engineer (Engenharia) | 15 min |
| L2 | Tech Lead / Eng Lead | 30 min |
| L3 | Eng Manager / Incident Commander | 1h |

* SLAs de remediação por severidade (Test Strategy §8 / Deployment Plan §6): **P0 ≤ 4h** (alinhado ao RTO NFR-A02); P1 no próximo ciclo com hotfix PATCH fora de ciclo.

## 4. Failure Recovery Procedures

### Incident Type 1: Processo Node.js fora do ar (scheduler + HTTP indisponíveis)
* **Symptom:** Rotinas `check:auto` não executam; interface admin não responde; nenhum e-mail de notificação é gerado.
* **Possíveis Causas:** crash por exceção não tratada; OOM durante extração de PDF grande ou scraping (Chromium); falha do host.
* **Diagnóstico:**
  1. `systemctl status <serviço>` e `journalctl -u <serviço> --since "1h ago"` — identificar stack trace do crash;
  2. Verificar memória do host (`free -m`) — suspeita de OOM se extração/scraping estava em curso;
  3. Verificar disco (`df -h`) — disco cheio corrompe escrita e derruba o processo.
* **Remediation:**
  1. Reiniciar o processo: restart policy do systemd ou manualmente com `npm run start` (artefato compilado em `dist/`);
  2. Se OOM recorrente em extração: reprocessar documentos pendentes em janela de baixo uso e priorizar a evolução NFR-P03 (extração assíncrona);
  3. Se o processo não subir por erro de banco, seguir Incident Type 2.
* **Verificação pós-remediação:** processo ativo; `npm run check:dry` sem inconsistências; próxima execução agendada do `node-cron` observada com sucesso (Deployment Plan §7).
* **Severidade típica:** P1 (P0 se houver indício de perda de dados).

### Incident Type 2: Falha/lock/corrupção do banco SQLite
* **Symptom:** erros `SQLITE_BUSY` persistentes, falhas em `reservarConsolidacao`, erro ao abrir o arquivo `.sqlite`, ou `check:dry` reportando inconsistências.
* **Possíveis Causas:** contenção de single-writer sob carga (NFR-P02/S03); disco cheio; corrupção do arquivo por kill abrupto durante escrita.
* **Diagnóstico:**
  1. Confirmar que **apenas um processo** acessa o `.sqlite` (nenhum CLI `seed`/`importar-legado` rodando em paralelo com o servidor);
  2. Verificar disco (`df -h`) e permissões do arquivo;
  3. Testar integridade abrindo o banco e rodando `npm run check:dry`.
* **Remediation:**
  1. **Lock transitório:** aguardar drenagem das escritas e reiniciar o processo; o retry/backoff de NFR-P02 deve absorver locks curtos;
  2. **Corrupção confirmada:** parar o processo, restaurar o backup mais recente do `.sqlite` (RPO ≤ 24h — NFR-A03), restaurar `.env` se necessário, reiniciar com `npm run start`;
  3. Após restauração, executar `npm run reanalisar` se houver suspeita de dados de extração inconsistentes, e `npm run check` para validar a base.
* **Verificação pós-remediação:** `check:dry` sem erros; um ciclo completo de `check:auto` executado com sucesso; integridade de vínculos empresa↔CCT preservada (critério DoD US-005).
* **Severidade típica:** P0 (risco de perda de dados — SAD §8 SPOF #1).

### Incident Type 3: Coleta quebrada — falhas de scraping Playwright
* **Symptom:** e-mails de notificação de falha de coleta; > 3 execuções consecutivas falhando (limiar SAD §10); nenhuma CCT nova consolidada.
* **Possíveis Causas:** mudança de layout/seletores nos portais oficiais (US-011, NFR-O02); Chromium desatualizado ou dependência de sistema quebrada; indisponibilidade da fonte externa.
* **Diagnóstico:**
  1. Ler logs da última execução de `check:auto` — identificar seletor/timeout falho;
  2. Testar manualmente a fonte no navegador;
  3. Verificar instalação do browser: `npm run playwright:install` (requerido no `postinstall`).
* **Remediation:**
  1. Se dependência de browser: reinstalar com `npm run playwright:install` e reiniciar;
  2. Se quebra de seletor: hotfix PATCH fora de ciclo (Deployment Plan §3 — cadência de release), ajustando seletores no scraper;
  3. Se fonte externa fora do ar: aguardar e monitorar; a coleta é idempotente via `fingerprintDocumentos` (NFR-A04), reprocessamento é seguro.
* **Verificação pós-remediação:** execução manual `npm run check` concluída com sucesso e novos documentos consolidados sem duplicidades.
* **Severidade típica:** P1.

### Incident Type 4: Consumo excessivo de memória/CPU
* **Symptom:** processo Node próximo de 85%+ de memória/CPU; interface admin lenta; rotinas atrasadas.
* **Possíveis Causas:** extração síncrona de PDFs grandes bloqueando o event loop (NFR-P03); múltiplas instâncias Chromium do Playwright; cache CNPJ em memória crescendo.
* **Diagnóstico:**
  1. `top`/`htop` — confirmar se o consumo coincide com janela de execução de `check:auto`;
  2. Verificar processos Chromium órfãos (`ps aux | grep chromium`).
* **Remediation:**
  1. Imediato: reiniciar o processo fora do horário das rotinas críticas;
  2. Matar processos Chromium órfãos;
  3. Estrutural: priorizar NFR-P03 (mover extração para background/worker) — limitação conhecida (SAD §12).
* **Verificação pós-remediação:** memória estável < 70% durante um ciclo completo de coleta.
* **Severidade típica:** P2 (P1 se derrubar o processo — vira Incident Type 1).

### Incident Type 5: SMTP indisponível (alertas silenciados)
* **Symptom:** rotinas executam, mas nenhum e-mail de notificação chega; erros de `nodemailer` nos logs.
* **Possíveis Causas:** credenciais `SMTP_*` expiradas/rotacionadas; servidor SMTP fora; porta bloqueada.
* **Diagnóstico:** verificar `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`); testar conectividade com o host SMTP.
* **Remediation:** corrigir credenciais no `.env` (provisionado manualmente no host — Deployment Plan §8) e reiniciar o processo; **compensar o silêncio** verificando manualmente os logs das rotinas do período.
* **Verificação pós-remediação:** e-mail de notificação da próxima rotina recebido.
* **Severidade típica:** P2 (degrada observabilidade — tratar com urgência por mascarar outros incidentes).

## 5. Backup & Rollback Protocol

> A política detalhada de backup/RPO/RTO do banco vive em `db-performance-recovery` (se existir) e nos NFRs — não duplicada aqui. Referências diretas: **RTO ≤ 4h (NFR-A02)**, **RPO ≤ 24h (NFR-A03)**, backup = cópia do arquivo `.sqlite` + `.env` (SAD §11). [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Frequência sugerida: backup diário para atender o RPO (Deployment Plan §8) — frequência exata é estratégia operacional a definir.

* **Rollback de deploy (topologia de nó único — Deployment Plan §5):**
  1. Parar o processo;
  2. Restaurar o artefato da tag SemVer anterior (`vX.Y.Z-1`);
  3. Se a release executou migração de schema ou `importar-legado`: restaurar o backup do `.sqlite` feito **imediatamente antes do deploy** (obrigatório em todo deploy);
  4. Restaurar `.env` anterior se variáveis mudaram;
  5. Reiniciar com `npm run start` e executar a verificação pós-deploy (Deployment Plan §7).
  * **Tempo alvo:** ≤ 1h [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — confortavelmente dentro do RTO de 4h.
* **Gatilhos de rollback:** falha de verificação pós-deploy; rotinas `node-cron` falhando em todas as fontes (P1); erro de escrita no `.sqlite` após deploy (P0); qualquer bug P0/P1 introduzido pela release.
* **Backup de configuração (fora do banco):** `.env` de produção (contém segredos SMTP, segredo de sessão, porta HTTP) — copiado junto ao `.sqlite` em todo deploy e na rotina de backup, com permissões restritas de arquivo.

## 6. Maintenance Windows

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — Nenhuma janela formal definida nos fontes. Premissas adotadas (Deployment Plan §2, Stage 5):
* **Janela padrão:** fora do horário de execução das rotinas críticas de coleta (`check:auto` via `node-cron`), preferencialmente início do dia útil, **evitando sextas-feiras** — maximiza o tempo de reação dentro do RTO de 4h.
* **Comunicação prévia necessária:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] aviso aos stakeholders com 48h de antecedência para janelas com migração de dados; hotfixes P0 são expeditos (SLA ≤ 4h).

## 7. Runbook de Rotina (Checklists Operacionais)

**Diário:**
- [ ] Verificar que o processo Node.js está ativo (systemd/restart policy)
- [ ] Confirmar execução bem-sucedida do último ciclo de `check:auto` (logs + e-mails de notificação)
- [ ] Verificar ausência de erros `SQLITE_BUSY` recorrentes e de falhas de scraping > 3 consecutivas
- [ ] Verificar espaço em disco do volume do `.sqlite` (> 20% livre)

**Semanal:**
- [ ] Executar `npm run check:dry` e confirmar zero inconsistências na base
- [ ] Revisar logs em busca de `console.*` residuais vazando dados sensíveis (meta zero — NFR-SEC04; 26 ocorrências conhecidas no diagnóstico)
- [ ] Confirmar que o backup do `.sqlite` + `.env` está ocorrendo na frequência definida (RPO ≤ 24h)
- [ ] Revisar alertas/notificações silenciados ou ignorados

**Mensal:**
- [ ] Executar `npm run typecheck` e `npm run test` na base atual (saúde do código — NFR-M02/M03)
- [ ] Rodar `npm audit` e tratar vulnerabilidades críticas (Deployment Plan §2, Stage 1)
- [ ] Revisar crescimento do arquivo `.sqlite` e do diretório temporário de PDFs/Word (limpeza automática não implementada — SAD §6)
- [ ] Revisar custos de infraestrutura do servidor único (NFR-CO01)
- [ ] Testar restauração de backup em staging (rollback de migração testado é critério de saída — Deployment Plan §5)

**Trimestral:**
- [ ] Rotacionar segredos SMTP e de sessão [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (sugerido a cada 90 dias — Deployment Plan §8)
- [ ] Validar credenciais administrativas e, se necessário, redefinir via `npm run auth:redefinir`

## 8. Post-Incident Process

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — Nenhum processo de postmortem definido nos fontes. Premissas adotadas:
* **Postmortem obrigatório para:** incidentes P0 (corrupção/perda de dados do `.sqlite`, indisponibilidade total > RTO) e P1 (coleta quebrada, processo fora do ar).
* **Template de postmortem:** linha do tempo → causa raiz → impacto (dados afetados, ciclos de coleta perdidos) → o que funcionou/falhou na resposta → ações de follow-up com dono e prazo (ex.: acelerar NFR-O01/O02/O03 de observabilidade, NFR-P03 de extração assíncrona).
* **Prazo para publicar postmortem:** 5 dias úteis após a resolução.

## 9. Contacts & Escalation Paths

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — Nenhum contato de emergência está definido nos fontes; a tabela abaixo usa os papéis mencionados nos artefatos e **precisa ser preenchida com nomes e contatos reais**.

| Sistema/Serviço | Responsável | Contato de Emergência |
| :--- | :--- | :--- |
| Aplicação (processo Node, scheduler, scraping) | Engenharia / On-call L1 | [A PREENCHER] |
| Qualidade de código / releases / hotfixes | Eng Lead (L2) | [A PREENCHER] |
| Banco de dados `.sqlite` (backup/restauração) | Engenharia + responsável de infraestrutura | [A PREENCHER] |
| Servidor SMTP | Responsável de infraestrutura | [A PREENCHER] |
| Validação de dados de CCT (migração, vínculos empresa↔CCT) | Product Owner | [A PREENCHER] |
| Gestão de incidentes P0 | Eng Manager / Incident Commander (L3) | [A PREENCHER] |