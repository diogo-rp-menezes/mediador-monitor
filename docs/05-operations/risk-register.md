# Risk Register — mte-mediador-monitor-unificado

> **Owner:** Engenharia/Arquitetura (PM/Eng Lead a designar) · **Última revisão:** — · **Cadência de revisão:** Quinzenal [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]
> **Artefatos-fonte:** BRD v1.0 (§7–8), NFR v1.0, SAD v1.0, Security Policies v1.0, diagnóstico determinístico do workspace

## 1. Matriz de Riscos

| ID | Categoria | Risco | Probabilidade | Impacto | Score (P×I) | Mitigação | Plano de Contingência | Dono | Status | Data Identificação |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| RISK-001 | Segurança & Compliance | Falhas de segurança no fluxo de autenticação — funções críticas com complexidade ciclomática alta (`criarAcessoHttp` CC 61; `tratar` CC 26; `criarAutenticacao` CC 22) concentram lógica de acesso, elevando risco de caminhos de validação esquecidos (NFR-M01) | Média (2) | Alto (3) | **6** | Refatorar em funções menores (NFR-M01); auditoria manual obrigatória de qualquer alteração em `auth-http.ts` até a refatoração; suítes `test:auth-ui` e `test:review` cobrindo 401/403/CSRF | Derrubar processo/isolar host; preservar `.sqlite` e logs para forense; rotação de todos os segredos do `.env`; correção em até 24h (severidade crítica, Security Policies §11) | Engenharia | Aberto | — |
| RISK-002 | Segurança & Compliance | Vazamento de informação sensível em logs — 26 chamadas `console.*` residuais (`src/auth-cli.ts`, `src/index.ts`, entre outros) podem expor tokens, senhas, CNPJs e PII (NFR-SEC04) | Média (2) | Médio (2) | 4 | Eliminação obrigatória das 26 chamadas e substituição por logger estruturado com redação de campos sensíveis (NFR-O01) antes de qualquer exposição da interface HTTP fora de ambiente local | Rotação imediata de segredos potencialmente expostos; purga dos logs contaminados; revisão do escopo do vazamento | Engenharia | Aberto | — |
| RISK-003 | Técnico | Erros de extração de CCT não detectados, contaminando a base consolidada | Média (2) | Alto (3) | **6** | `validarExtracaoCct` com transparência (não mascara erros — NFR-C02); `validarAlteracoes` só aprova modificações com evidências textuais autênticas; `fingerprintDocumentos` para integridade e duplicidade (NFR-A04) | Abortar consolidação do documento afetado sem derrubar a rotina; reanálise sob demanda via script `reanalisar`; correção manual com referência textual da fonte | Engenharia | Aberto | — |
| RISK-004 | Operacional | Quebra do monitoramento por mudança de layout nas fontes externas coletadas via `playwright` (sem contrato formal — SAD §6) | Alta (3) | Médio (2) | **6** | `loadWatchConfig` configurável; alertas de falha de coleta (NFR-O02: falha de scraping > 3 execuções consecutivas); `test:smoke` acompanhando atualizações de browser | Reanálise sob demanda (`reanalisar`); correção manual de seletores CSS/XPath; coleta manual temporária da fonte afetada | Engenharia | Aberto | — |
| RISK-005 | Técnico | Perda ou duplicidade de dados na migração do legado (`migrarCadastros` / `migrarAutenticacao`, script `importar-legado`) | Baixa (1) | Alto (3) | 3 | Preservação integral assegurada pelo processo de migração; `fingerprintDocumentos` para detectar duplicidades; `protegerLegado` para retrocompatibilidade; ensaio prévio via `check:dry` | Rollback para o sistema legado (mantido retrocompatível via `protegerLegado`); restauração do `.sqlite` a partir de backup; reexecução corrigida da migração | Engenharia | Aberto | — |
| RISK-006 | Técnico | Limite de concorrência/escala do banco em nó único — *single-writer lock* do `better-sqlite3` serializa escritas sob carga (NFR-P02, NFR-S03) | Baixa (1) | Médio (2) | 2 | `reservarConsolidacao` para evitar conflitos de consolidação concorrente; estratégia de retry/backoff em escritas (NFR-P02); dimensionamento de carga | Fila de consolidação com reprocessamento idempotente (`fingerprintDocumentos`); escalonamento vertical do nó; migração futura para PostgreSQL fora do escopo atual (SAD §13) | Engenharia | Aberto | — |
| RISK-007 | Segurança & Compliance | Acesso indevido por ausência ou falha de controle de permissão | Baixa (1) | Alto (3) | 3 | `exigirPermissao` em ações sensíveis; `exigirCsrf` em toda requisição que altera estado (NFR-SEC02); `auth:bootstrap` controlado; `definirCredencial` restrito a uso interno após validação do token de recuperação | Revogação imediata de sessões; rotação do segredo de sessão (invalida todas as sessões ativas); auditoria de acessos nos logs estruturados | Engenharia | Aberto | — |
| RISK-008 | Negócio | Interrupção ou mudança contratual do fornecedor de consulta de CNPJ — fornecedor não identificável no repositório (item em aberto no BRD §7) | Média (2) | Médio (2) | 4 | `criarConsultaCnpj` já evita buscas duplicadas e responde rápido a consultas repetidas (cache local — NFR-S02); verificar termos do fornecedor (pendência registrada) | Falha degrada enriquecimento cadastral, não para a coleta (SAD §6 — criticidade média); operar com cache local até restabelecimento; avaliar fornecedor substituto | Negócio/Engenharia | Aberto | — |
| RISK-009 | Operacional | Perda total de dados por corrupção ou perda do arquivo `.sqlite` — single point of failure (SAD §8); política de backup ainda não definida operacionalmente (item em aberto no BRD §12) | Baixa (1) | Alto (3) | 3 | Definir rotina de backup periódico do arquivo `.sqlite` + `.env` (NFR-A02: RTO ≤ 4h; NFR-A03: RPO ≤ 24h); backup externo criptografado em repouso | Restauração a partir do backup conforme RTO ≤ 4h; reinício do processo via systemd/restart policy; reprocessamento idempotente de coletas via `fingerprintDocumentos` | Operações | Aberto | — |
| RISK-010 | Operacional | Crash do processo Node.js único derruba simultaneamente scheduler (`node-cron`), HTTP e scraping (SAD §8 — SPOF) | Média (2) | Médio (2) | 4 | Restart policy (systemd/docker); health-check endpoint `GET /healthz` verificando SQLite, SMTP e Playwright (NFR-O03 — a implementar); alerta de health-check falhando > 1min | Reinício automático do processo; verificação de integridade do `.sqlite` na subida; reexecução das rotinas agendadas perdidas | Operações | Aberto | — |
| RISK-011 | Técnico | Extração CPU-intensive (`pdf-parse`, `word-extractor`) bloqueia o event loop, degradando scheduler e HTTP (NFR-P03) | Média (2) | Médio (2) | 4 | Processar extração de forma assíncrona/background via `check:auto` (NFR-P03); evolução futura para worker threads ou processo separado com fila em SQLite (SAD §13) | Adiar rotinas pesadas para janelas de baixo uso; monitorar duração de extração via métricas (NFR-O01) | Engenharia | Aberto | — |
| RISK-012 | Segurança & Compliance | Dependências de baixa manutenção (`pdf-parse` 1.1, `word-extractor` 1.0) com CVEs potencialmente não corrigidos (Security Policies §9) | Média (2) | Médio (2) | 4 | `npm audit` em CI a cada merge e semanalmente; política de atualização: críticas em 7 dias, altas em 30 dias; monitorar abandono dos pacotes | Avaliar e trocar por substitutos mantidos; isolar parsing de documentos malformados (falha aborta o documento, não a rotina) | Engenharia | Aberto | — |
| RISK-013 | Regulatório | Não conformidade com LGPD no tratamento de dados de contato de clientes e administradores — processo de exclusão de dados pessoais não implementado (NFR-C01; Security Policies §12) [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] | Média (2) | Alto (3) | **6** | Implementar política de retenção/exclusão (hipótese: retenção enquanto cliente ativo + 5 anos por obrigações trabalhistas); proibição de PII em logs (NFR-SEC04); logs de acesso e DPIA | Processo manual de exclusão sob demanda do titular (Art. 18) até automação; remoção do registro no SQLite + exclusão em backups expirados; notificação conforme exigências legais | Compliance/Jurídico | Aberto | — |
| RISK-014 | Operacional | Acúmulo de documentos temporários (PDF/Word) em disco — limpeza automática não implementada (SAD §6; Security Policies §5); risco de esgotamento de disco e corrupção do SQLite | Média (2) | Médio (2) | 4 | Implementar remoção automática após extração bem-sucedida (gap registrado como obrigatório); alerta de espaço em disco < 10% | Limpeza manual emergencial do diretório temporário; expansão de disco do nó | Operações | Aberto | — |
| RISK-015 | Segurança & Compliance | Interface administrativa HTTP sem TLS no código — servidor HTTP nativo não implementa TLS (Security Policies §5) | Baixa (1) | Alto (3) | 3 | Expor a interface apenas em interface local/VPN ou atrás de proxy reverso com TLS 1.2+ terminado na infraestrutura | Bloqueio imediato de acesso externo via firewall do host; rotação do segredo de sessão se houver suspeita de interceptação | Engenharia/Infra | Aberto | — |
| RISK-016 | Técnico | Drift de schema do banco — migrações manuais/ad-hoc via `seed`/`importar-legado`, sem versionamento de schema (SAD §5, §12) | Média (2) | Médio (2) | 4 | Formalizar migrações versionadas (`db-migration-spec` a criar); validação de schema no `typecheck`/CI | Reconstrução do schema via scripts `seed`; restauração de backup; reprocessamento idempotente | Engenharia | Aberto | — |
| RISK-017 | Operacional | Falha do SMTP externo silencia alertas e bloqueia fluxo de recuperação de senha (`solicitarRecuperacao` → `recuperar`) | Média (2) | Baixo (1) | 2 | Health-check verificando conectividade SMTP (NFR-O03); monitoramento de falhas de envio | Redefinição de senha via CLI (`auth:redefinir`) como caminho alternativo; troca de provedor SMTP via `.env` | Operações | Aberto | — |
| RISK-018 | Segurança & Compliance | Conteúdo hostil de fontes externas — HTML de portais (via `playwright`) e PDFs/Word malformados processados in-process; browser de scraping roda no mesmo host do banco (Security Policies §1–2) | Média (2) | Médio (2) | 4 | Perfil de browser efêmero sem compartilhar cookies/credenciais da sessão administrativa; validação `zod` em todo dado extraído antes de persistir; sanitização de output via `html-entities`; nomes de arquivos baixados regerados internamente (anti path traversal) | Isolamento do host; descarte do documento malicioso; revisão das fontes afetadas; firewall de egress limitando destinos | Engenharia | Aberto | — |

## 2. Critérios de Priorização

* **Probabilidade:** Alta (>60%) = 3 · Média (30–60%) = 2 · Baixa (<30%) = 1
* **Impacto:** Alto (bloqueia release / dado sensível / perda financeira relevante) = 3 · Médio (degrada experiência ou operação) = 2 · Baixo (cosmético) = 1
* **Score:** Probabilidade × Impacto (1–9) — riscos com **Score ≥ 6 exigem plano de mitigação ativo e plano de contingência formal** (RISK-001, RISK-003, RISK-004, RISK-013).

## 3. Riscos por Categoria

### Técnicos
* **RISK-003 (Score 6):** Contaminação da base consolidada por erros de extração de CCT — mitigado por `validarExtracaoCct` (NFR-C02) e `fingerprintDocumentos` (NFR-A04).
* **RISK-005 (Score 3):** Perda/duplicidade na migração do legado — mitigado por `protegerLegado` e ensaio via `check:dry`.
* **RISK-006 (Score 2):** Single-writer lock do `better-sqlite3` — mitigado por `reservarConsolidacao` e retry/backoff (NFR-P02).
* **RISK-011 (Score 4):** Bloqueio do event loop por extração CPU-intensive (NFR-P03).
* **RISK-016 (Score 4):** Drift de schema por migrações manuais/ad-hoc.

### Negócio
* **RISK-008 (Score 4):** Dependência de fornecedor de consulta de CNPJ não identificado no repositório — item em aberto exigindo verificação contratual (BRD §7).

### Segurança & Compliance
* **RISK-001 (Score 6):** Complexidade ciclomática alta em autenticação (`criarAcessoHttp` 61, `tratar` 26, `criarAutenticacao` 22).
* **RISK-002 (Score 4):** 26 chamadas `console.*` residuais com risco de vazamento de segredos/PII (NFR-SEC04).
* **RISK-007 (Score 3):** Falha de controle de permissão — mitigado por `exigirPermissao`/`exigirCsrf`.
* **RISK-012 (Score 4):** Dependências de baixa manutenção (`pdf-parse`, `word-extractor`).
* **RISK-015 (Score 3):** Ausência de TLS no servidor HTTP nativo — exposição restrita a local/VPN.
* **RISK-018 (Score 4):** Conteúdo hostil de scraping/parsing processado no mesmo host do banco.

### Operacionais
* **RISK-004 (Score 6):** Quebra de coleta por mudança de layout em fontes externas (probabilidade alta — BRD §8).
* **RISK-009 (Score 3):** Perda do arquivo `.sqlite` sem política de backup definida (pendência do BRD §12).
* **RISK-010 (Score 4):** Crash do processo único derruba scheduler + HTTP + scraping.
* **RISK-014 (Score 4):** Acúmulo de temporários sem limpeza automática.
* **RISK-017 (Score 2):** Falha de SMTP silencia alertas e recuperação de senha.

### Regulatório
* **RISK-013 (Score 6):** Não conformidade LGPD — processo de exclusão de dados pessoais não implementado (NFR-C01) [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA: premissa de que dados de contato de clientes/administradores configuram PII sob LGPD, conforme Security Policies §5 e §12].

## 4. Riscos Aceitos (Accepted Risks)

| ID | Risco | Justificativa da Aceitação | Aprovado por |
| :--- | :--- | :--- | :--- |
| — | Ausência de escalonamento horizontal (nó único, SQLite em arquivo) | Decisão arquitetural consciente registrada no SAD §12: simplicidade operacional, custo near-zero e portabilidade trivial superam a limitação de escrita serializada no horizonte atual (NFR-S01, NFR-PO02, NFR-CO01) | Pendente — Eng Lead |
| — | Cache de CNPJ apenas em memória (perde no restart) | Simples, sem dependência adicional; atende NFR-S02 para nó único (SAD §12) | Pendente — Eng Lead |
| — | Ausência temporária de observabilidade nativa | Decisão consciente de "build later" registrada no SAD §12; implementação de logs/métricas/alertas é pré-requisito de GA (NFR-O01/O02/O03) | Pendente — Eng Lead |

> Nenhum risco com Score ≥ 6 pode ser aceito sem aprovação formal do Sponsor — atualmente todos estão **Abertos** com mitigação ativa.

## 5. Histórico de Materialização

| ID | Data | O que aconteceu | Ação tomada | Lição aprendida |
| :--- | :--- | :--- | :--- | :--- |
| — | — | Nenhum risco materializado registrado até o momento (projeto em fase pré-GA; critérios de prontidão para GA definidos no BRD §10) | — | — |

---

> **Pendências de validação humana que afetam este registro:** algoritmo exato de `criarHashSenha` (impacta RISK-001); política de backup operacional (impacta RISK-009); fornecedor da consulta de CNPJ (impacta RISK-008); política de retenção LGPD (impacta RISK-013); valores de timeout do scraper (impacta RISK-004). Datas de identificação e donos formais devem ser preenchidos na primeira revisão com o Eng Lead.