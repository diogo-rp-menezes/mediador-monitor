# Database Performance, Recovery & Observability — mte-mediador-monitor-unificado (SQLite via better-sqlite3)

> **Versão:** 1.0 · **Owner:** Engenharia/Arquitetura · **Status:** Draft (bloqueado — schema físico não localizado)
>
> **Motor de banco verificado:** `better-sqlite3` ^11.5.0 — SQLite embutido, **síncrono**, arquivo único local, **single-writer**. **ORM/query builder:** nenhum — SQL cru. **Topologia:** aplicação web/server-side em **nó único** (sem cluster, sem réplicas, sem pool de conexões multi-usuário).
>
> **Dependências deste documento:** [[db-schema-spec]] (0 tabelas detectadas — contrato físico vazio) e [[nfr]] (fonte dos SLOs de performance, RPO/RTO e observabilidade).

## 0. Situação e premissas

O schema físico **não foi localizado** pela varredura determinística (0 tabelas, 0 índices, 0 FKs — ver Seção 0 de [[db-schema-spec]]). Portanto:

- **Nenhuma query crítica, índice ou métrica por tabela será inventada neste documento.** As seções abaixo definem targets, estratégias de backup/recovery e observabilidade **ao nível da engine** (SQLite/better-sqlite3), que é o que existe de verificável hoje.
- Tudo que depender de tabelas reais (índices esperados, latência por query, capacidade por tabela) está marcado como **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** ou como pendente de verificação.
- Os SLOs abaixo estão alinhados com o [[nfr]]: NFR-P01 (p95 < 300ms em leituras), NFR-P02 (retry/backoff para single-writer lock), NFR-A02 (RTO ≤ 4h), NFR-A03 (RPO ≤ 24h), NFR-A01 (uptime ≥ 99% das rotinas `node-cron`).

### 0.1 Características reais da engine (o que muda tudo)

| Característica | Realidade no projeto | Implicação operacional |
| :--- | :--- | :--- |
| Modelo de concorrência | **Single-writer**: apenas uma transação de escrita por vez; escritas concorrentes resultam em `SQLITE_BUSY` | Escritas (consolidação de CCTs) precisam de serialização em aplicação — o código já sinaliza isso via `reservarConsolidacao` (NFR-S03) |
| API | **Síncrona** (`better-sqlite3` bloqueia o event loop do Node.js durante a query) | Queries longas bloqueiam todo o servidor HTTP; extração pesada (`pdf-parse`, `word-extractor`) deve rodar fora da thread principal (NFR-P03) |
| Journal mode | **Não verificado no código** — precisa confirmar se `PRAGMA journal_mode=WAL` está configurado | WAL é fortemente recomendado: permite leitores durante escrita e reduz contenção; rollback journal (default) bloqueia leitores durante escritas |
| Backup | Banco = **arquivo único** `.db`/`.sqlite` local | Backup = cópia de arquivo consistente (`VACUUM INTO` ou API de backup do SQLite); **não existem** snapshots de volume, multi-AZ ou read replicas nesta topologia |
| Pool de conexões | **Não se aplica** — uma conexão por processo é o padrão correto | Não configurar pools estilo Postgres/MySQL |

## 1. Performance Targets

```yaml
performance:
  workload: "mixed"   # leituras de consulta (CCTs, cadastros) + escritas em lote (consolidação, seed, importar-legado)
  targets:
    reads:  { p50_ms: "[INFERIDO — definir após schema]", p95_ms: 300, p99_ms: "[INFERIDO — definir após schema]" }
    # p95 = 300ms vem de NFR-P01 (verificado). p50/p99 não têm fonte — não inventados.
    writes: { p95_ms: "[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] sugerido < 1000ms incluindo retry por SQLITE_BUSY (NFR-P02)" }
  throughput:
    reads_per_second: "[não mensurável sem schema/carga real — pendente]"
    writes_per_second: "[limitado pelo single-writer do SQLite; throughput efetivo = 1 escritor serializado]"
  capacity:
    expected_rows: "[desconhecido — 0 tabelas detectadas; definir após contrato físico]"
    growth_per_month: "[desconhecido — depende do volume de CCTs/aditivos monitorados; ENTRADA HUMANA NECESSÁRIA]"
```

### Estratégias de performance ao nível da engine

1. **Habilitar WAL mode** — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `PRAGMA journal_mode=WAL;` na abertura do banco. Não foi detectado no código varrido; sem ele, leitores bloqueiam durante escritas, ameaçando o NFR-P01.
2. **`busy_timeout` + retry/backoff nas escritas** — ancorado em **NFR-P02** (verificado): configurar `PRAGMA busy_timeout` e/ou retry com backoff exponencial em torno das operações de consolidação, para que `SQLITE_BUSY` não vire erro 500.
3. **Serialização de escritas em aplicação** — ancorado em **NFR-S03** (verificado): o mecanismo `reservarConsolidacao` já existe como sinal de lock lógico; garantir que toda escrita em lote (`seed`, `importar-legado`, consolidação de CCTs) passe por ele.
4. **Transações para escritas em lote** — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] envolver `seed`/`importar-legado` em `db.transaction()` do better-sqlite3 (uma transação única é ordens de magnitude mais rápida que N inserts autocommit no SQLite).
5. **Trabalho pesado fora da thread principal** — ancorado em **NFR-P03** (verificado): extração via `pdf-parse`/`word-extractor` e coleta via `playwright` rodam em scripts de background (`check:auto`, `node-cron`), nunca inline no request HTTP.
6. **Cache de CNPJ** — ancorado em **NFR-S02** (verificado): `criarConsultaCnpj` deve consultar cache local antes da dependência externa.

### Queries Críticas

**Nenhuma query crítica pode ser listada:** o schema físico tem 0 tabelas e nenhum SQL foi detectado na varredura. A tabela abaixo registra apenas os **candidatos de domínio** (sinais de código, confiança < 0.60 em [[db-domain-model]]) — **não são queries confirmadas** e não recebem índices inventados.

| ID | Propósito | Latência Máx. | Índices Esperados |
| :--- | :--- | :--- | :--- |
| QUERY-001 | [PENDENTE] Consulta de CCTs/aditivos consolidados (sinal: `fingerprintDocumentos`, `validarExtracaoCct`) | p95 < 300ms (NFR-P01) | [não definir sem tabela real] |
| QUERY-002 | [PENDENTE] Consulta de clientes/contatos/documentos (sinais: `salvarCliente`, `salvarContato`, `documentosCliente`) | p95 < 300ms (NFR-P01) | [não definir sem tabela real] |
| QUERY-003 | [PENDENTE] Validação de sessão/autenticação (sinais: `criarAutenticacao`, `cookieSessao`) | [INFERIDO] p95 < 100ms — está no caminho de toda requisição | [não definir sem tabela real] |
| QUERY-004 | [PENDENTE] Lookup de cache de CNPJ (sinal: `criarConsultaCnpj`) | p95 < 300ms (NFR-P01) | [não definir sem tabela real] |

> **Regra (herdada de [[db-schema-spec]], Seção 4):** nenhum índice será criado "porque parece bom" — todo índice exige evidência de padrão de query após a definição do schema.

## 2. Backup & Recovery

Topologia real: **arquivo SQLite local em nó único**. Backup e recovery são operações **sobre o arquivo** — não existem snapshots EBS, multi-AZ, PITR gerenciado ou read replicas neste projeto.

```yaml
recovery:
  backup:
    frequency: "diário"          # derivado de NFR-A03 (RPO ≤ 24h) — verificado como meta, agendamento operacional a implementar
    retention: "[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] sugerido: 30 dias diários + 12 mensais"
    types: ["full"]              # SQLite em arquivo único: backup full via cópia consistente; 'incremental' não se aplica nativamente
    method: |
      [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]
      Preferir VACUUM INTO '/backups/mte-YYYYMMDD.db' (cópia consistente online, segura mesmo com WAL)
      ou a API de backup do better-sqlite3 (db.backup()). NUNCA copiar o arquivo .db com cp
      enquanto houver escritor ativo sem WAL/checkpoint — risco de cópia inconsistente.
      Backup deve incluir também o arquivo .env (NFR-A02).
  rpo_target: "24h"              # NFR-A03 — verificado
  rto_target: "4h"               # NFR-A02 — verificado: restaurar arquivo .sqlite + .env e subir o nó
  disaster_recovery:
    regions: ["nó único local — sem multi-região (NFR-S01)"]
    failover_strategy: "restauração manual do backup do arquivo em novo nó + reexecução de auth:bootstrap se necessário; sem failover automático"
  restore_test_frequency: "[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] sugerido: trimestral — restaurar o backup em diretório temporário, abrir com better-sqlite3 e rodar PRAGMA integrity_check + test:smoke"
```

### Procedimento de restore (alinhado ao RTO de 4h)

1. Parar o processo Node.js (garante que não há escritor ativo no arquivo).
2. Copiar o backup mais recente (≤ 24h, conforme RPO) para o caminho do banco.
3. Executar `PRAGMA integrity_check;` na base restaurada — se falhar, usar o backup anterior.
4. Restaurar/verificar o `.env` (NFR-A02 menciona explicitamente as variáveis de ambiente como parte do recovery).
5. Subir a aplicação (`start`) e validar com `test:smoke`.
6. Reexecutar `auth:bootstrap` apenas se a base restaurada não contiver o administrador.

### Integridade contínua

- **NFR-A04 (verificado):** `fingerprintDocumentos` garante que reprocessamentos não dupliquem CCTs/aditivos — é o mecanismo de idempotência que protege a base após restores parciais ou reexecuções de `importar-legado`.
- [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Agendar `PRAGMA integrity_check` semanal via `node-cron` (a infra de agendamento já existe no projeto) e alertar em caso de corrupção.

## 3. Observability

Estado real: o diagnóstico encontrou **26 chamadas `console.*` residuais** (ex.: `src/auth-cli.ts`, `src/index.ts`) — **não há logging estruturado, métricas ou alerting implementados no código hoje**. Tudo nesta seção é, portanto, proposta a implementar, ancorada nos NFRs de observabilidade (NFR-O01, NFR-O02, NFR-O03) e na exigência de segurança NFR-SEC04 (eliminar `console.*` para não vazar dados sensíveis em logs).

```yaml
observability:
  metrics:
    - name: "sqlite_busy_errors_total"        # [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]
      warning_threshold: "> 5 em 5min"
      critical_threshold: "> 20 em 5min"      # indica contenção de single-writer (NFR-P02/S03)
    - name: "query_duration_ms"               # por operação crítica, após schema definido
      warning_threshold: "p95 > 300"          # NFR-P01 — verificado como target
      critical_threshold: "p95 > 1000"
    - name: "db_file_size_bytes"
      warning_threshold: "[INFERIDO] crescimento > 50% m/m"  # baseline inexistente sem schema
      critical_threshold: "[definir após baseline]"
    - name: "cron_job_success"                # rotinas node-cron (check:auto)
      warning_threshold: "1 falha consecutiva"
      critical_threshold: "2 falhas consecutivas"   # ameaça NFR-A01 (uptime ≥ 99% do monitoramento)
    - name: "wal_checkpoint_lag"              # [INFERIDO] só se WAL for habilitado
      warning_threshold: "arquivo -wal > 50MB"
      critical_threshold: "arquivo -wal > 200MB"
  alerts:
    - name: "Falha de coleta Playwright"      # NFR-O02 — verificado como requisito
      condition: "erro de scraping/parsing por mudança de layout em fonte externa"
      severity: "high"
    - name: "Health-check degradado"          # NFR-O03 — verificado como requisito
      condition: "endpoint de health-check falha ao abrir o arquivo better-sqlite3 OU ao alcançar o SMTP (nodemailer)"
      severity: "critical"
    - name: "Backup ausente"
      condition: "nenhum backup full bem-sucedido nas últimas 25h"   # protege RPO de 24h (NFR-A03)
      severity: "high"
    - name: "Corrupção de banco"
      condition: "PRAGMA integrity_check retorna erro"
      severity: "critical"
    - name: "Lock de consolidação preso"      # sinal de código: reservarConsolidacao
      condition: "[INFERIDO] reserva de consolidação ativa por mais de 30min sem conclusão"
      severity: "medium"
  migration_monitoring:
    lock_duration: true        # crítico no SQLite: DDL toma lock exclusivo de escrita; medir duração
    execution_duration: true
    affected_rows: true
    errors: true
    # Observação: não há sistema de migrations detectado no código (sem ORM, sem diretório de migrations).
    # [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Definir ferramenta/processos de migração junto com o schema.
```

### Logging (NFR-O01 / NFR-SEC04)

- **Substituir as 26 chamadas `console.*`** por logger estruturado (nível, timestamp, contexto de operação) — requisito verificado (NFR-O01, NFR-SEC04).
- Eventos mínimos a logar: falha de extração de CCT (`validarExtracaoCct` — nunca mascarar erros, NFR-C02), `SQLITE_BUSY` com contagem de retries, início/fim de consolidação com duração, resultado de backup e de `integrity_check`.
- **Nunca logar** senhas, tokens (`hashToken`), cookies de sessão ou dados pessoais de contatos (LGPD — NFR-C01).

## 4. Pendências obrigatórias (bloqueadores)

1. **Localizar/definir o schema físico** (Seção 0.1 de [[db-schema-spec]]) e reexecutar a varredura — sem isso, as Seções 1 (queries críticas, índices, capacidade) permanecem pendentes.
2. **Verificar no código** se `PRAGMA journal_mode=WAL` e `busy_timeout` estão configurados na abertura do banco.
3. **Implementar o agendamento de backup** (hoje é apenas meta de RPO no NFR-A03; nenhum script de backup foi detectado entre os scripts do `package.json`).
4. **Validar humanamente** todos os itens marcados [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA], especialmente thresholds de alerta, retenção de backup e frequência de teste de restore.