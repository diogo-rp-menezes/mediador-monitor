# Database Test & Data Quality Specification — mte-mediador-monitor-unificado (SQLite via better-sqlite3)

> **Versão:** 1.0 · **Owner:** Engenharia/QA · **Status:** Draft (bloqueado — schema não localizado)
> Complementa [[test-strategy]] com testes específicos de banco de dados. Depende diretamente de [[db-schema-spec]], que está **bloqueado**: a varredura determinística detectou **0 tabelas, 0 FKs e nenhum DDL** no workspace.
>
> **Motor verificado:** `better-sqlite3` ^11.5.0 (SQLite embutido, síncrono, arquivo `.sqlite` local, nó único) · **ORM:** nenhum — SQL cru · **Runners de teste reais:** Vitest 2.1 (`npm run test`) e Node test runner nativo (`node --test`, scripts `test:smoke`/`test:status`/`test:gmail`/`test:review`).

## 0. Situação e premissas

**Nenhuma tabela real foi detectada no schema** (ver [[db-schema-spec]] §0). Conforme a instrução obrigatória do diagnóstico, **este documento NÃO declara testes estruturais contra tabelas inventadas**. As seções 1, 2 e 5 estão intencionalmente vazias de alvos concretos e registram apenas o que falta verificar; as seções 3 e 4 contêm apenas testes que **não dependem de tabelas** (invariantes do próprio SQLite e da camada de acesso).

### 0.1 O que falta verificar (herdado de [[db-schema-spec]] §0.1)

1. Localizar a definição do schema — hipótese: DDL inline em módulos de `src/` via `db.exec("CREATE TABLE IF NOT EXISTS ...")`, ou schema ainda não escrito, ou referência `server/db.ts` desatualizada.
2. Definir o contrato físico em [[db-schema-spec]] e reexecutar a varredura determinística.
3. **Somente então** preencher as Seções 1, 2 e 5 deste documento com alvos reais e rastreáveis, e regenerar este artefato.

### 0.2 Sinais de domínio (NÃO são alvos de teste confirmados)

Os artefatos-fonte mencionam conceitos que provavelmente virarão tabelas — fingerprints de documentos (`fingerprintDocumentos`), usuários/sessões (`criarAutenticacao`, `cookieSessao`), locks de consolidação (`reservarConsolidacao`), cache de CNPJ (`criarConsultaCnpj`), clientes/contatos/documentos (`salvarCliente`, `salvarContato`, `documentosCliente`) — mas com confiança < 0.60. **Nenhum teste abaixo os referencia como objetos de banco.** Quando o schema for definido, cada um deverá gerar entradas nas Seções 1, 2 e 5.

## 1. Schema Tests

**Nenhum alvo real disponível — seção vazia por decisão, não por omissão.**

| ID | Tipo | Alvo | Condição Esperada |
| :--- | :--- | :--- | :--- |
| — | — | — | Aguardando definição do schema ([[db-schema-spec]] §0.1). Nenhum teste `table_exists` / `column_exists` / `constraint` / `index` será escrito sem evidência em código. |

> **Estrutura reservada:** quando o schema for definido, cada tabela real gerará, no mínimo: um teste `table_exists`, um `column_exists` por coluna do contrato, um teste por PK/UNIQUE/CHECK/NOT NULL declarada e um teste por índice justificado em [[db-schema-spec]] §4. Execução via Vitest contra banco SQLite efêmero em diretório temporário (alinhado a [[test-strategy]] §3, ambiente CI).

## 2. Integrity Tests

**Nenhuma FK real detectada — seção vazia por decisão.**

| ID | Tipo | Alvo | Condição Esperada |
| :--- | :--- | :--- | :--- |
| — | — | — | 0 FKs detectadas no schema real. Nenhum relacionamento será inferido. |

> **Estrutura reservada:** para cada FK futura, um teste `foreign_key` validando (a) rejeição de inserção órfã com `PRAGMA foreign_keys = ON` e (b) comportamento de delete/update conforme a cláusula declarada no contrato. Nota crítica de SQLite: `better-sqlite3` **não** habilita enforcement de FK por padrão — o teste de bootstrap do banco (TEST-021 abaixo) cobre isso.

## 3. Invariant Tests (regras de negócio no banco)

Os únicos invariantes especificáveis hoje são os do **próprio engine e da camada de acesso**, independentes de tabelas. Demais invariantes de negócio (ex.: unicidade de fingerprint — NFR-A04; preservação de vínculos na migração — US-005) ficam **bloqueados** até o schema existir e estão listados em §3.1 como pendentes, sem SQL inventado.

```yaml
invariant_tests:
  - id: "TEST-020"
    description: "Integridade física do arquivo SQLite: PRAGMA integrity_check deve retornar 'ok' após qualquer suite que escreva no banco (gate anti-corrupção, alinhado a NFR-P02/S03 e à triagem P0 de [[test-strategy]] §8)."
    query: |
      PRAGMA integrity_check;
    expected_rows: 1
    expected_value: "ok"

  - id: "TEST-021"
    description: "Bootstrap do banco habilita enforcement de chaves estrangeiras (better-sqlite3 não o faz por padrão). Sem tabelas reais, valida-se apenas que a conexão criada pela camada de acesso reporta foreign_keys = 1."
    query: |
      PRAGMA foreign_keys;
    expected_rows: 1
    expected_value: 1

  - id: "TEST-022"
    description: "Concorrência de escrita: 10 writers concorrentes × 1000 escritas em banco temporário, zero corrupção (integrity_check = 'ok' ao final) e zero timeout indevido — DoD da US-009 / NFR-P02 / NFR-S03, conforme [[test-strategy]] §5. Writer morrendo com lock deve liberar (timeout/cleanup gracioso, ConsolidationLockTimeout)."
    query: |
      PRAGMA integrity_check;  -- executado após o cenário de carga
    expected_rows: 1
    expected_value: "ok"

  - id: "TEST-023"
    description: "Journal mode e busy_timeout da conexão estão configurados conforme a camada de acesso real (valores exatos a confirmar no código de bootstrap do banco — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] quanto aos valores esperados; o teste deve falhar se a conexão usar journal_mode DELETE sem justificativa, dado o requisito de concorrência NFR-S03)."
    query: |
      PRAGMA journal_mode;
      PRAGMA busy_timeout;
    expected_rows: 2
```

### 3.1 Invariantes de negócio pendentes (bloqueados — sem tabelas reais)

| Invariante (origem) | Por que está pendente |
| :--- | :--- |
| Unicidade de fingerprint de documentos — NFR-A04, duplicatas não passam por `fingerprintDocumentos` ([[test-strategy]] §8 P1) | Tabela de documentos não detectada; constraint UNIQUE não confirmada. |
| Preservação de vínculos empresa↔CCT na migração — DoD US-005 (validação de 100% dos vínculos) | Tabelas de empresas/CCTs não detectadas; FKs não confirmadas. |
| Senhas existem apenas como hash (`criarHashSenha`) — NFR-SEC01 | Tabela de usuários não detectada; teste hoje só é possível na camada de função, não no banco. |
| Cache CNPJ sem resultado negativo e com fallback stale — US-004/US-010 | Tabela de cache não detectada. |
| Idempotência de re-execução de `importar-legado` — US-005 Scenario 4 | Depende das constraints UNIQUE/PK ainda não definidas. |

## 4. Security Tests

SQLite embutido via `better-sqlite3` **não possui sistema de roles/GRANT** — o controle de acesso é feito na camada HTTP (`exigirCsrf`, `exigirPermissao` em `src/auth-http.ts`), coberto pela estratégia de testes de segurança de [[test-strategy]] §5 (não duplicado aqui). Os testes de segurança **de banco** aplicáveis são:

| ID | Role | Operação | Esperado |
| :--- | :--- | :--- | :--- |
| TEST-030 | aplicação (conexão única) | Leitura de coluna de credencial em qualquer tabela futura de usuários | **Bloqueado** — tabela não detectada. Quando definida: toda consulta deve retornar somente hash (`criarHashSenha`), nunca texto claro — NFR-SEC01. |
| TEST-031 | aplicação | Execução de queries com entrada do usuário | Permitido apenas via prepared statements do `better-sqlite3` (binding de parâmetros); teste deve tentar injeção (`' OR 1=1 --`) em cada ponto de acesso real e esperar zero linhas indevidas. Alvos concretos pendentes do schema. |
| TEST-032 | processo de teste | Inspeção de logs de teste | Negado vazamento: logs não devem conter senhas, tokens ou CNPJs reais (NFR-SEC04); amostras de HTML truncadas em 5KB (US-011). |
| TEST-033 | aplicação | Arquivo `.sqlite` em ambiente de teste/CI | Permitido somente banco efêmero em diretório temporário com `.env` de teste, sem credenciais reais ([[test-strategy]] §3); dados legados em staging somente anonimizados (NFR-C01 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]). |

## 5. Data Quality Rules

**Nenhuma coluna real detectada — não há `tabela.coluna` verificável.** As regras abaixo cobrem apenas o que é derivável sem inventar campos; as regras por coluna ficam bloqueadas aguardando o contrato físico.

```yaml
data_quality:
  - id: "DQ-001"
    field: "(banco inteiro)"
    rule: "custom"  # PRAGMA integrity_check = 'ok' após cada suite de escrita
    threshold_pct: 100
  - id: "DQ-002"
    field: "(banco inteiro)"
    rule: "custom"  # PRAGMA foreign_keys = 1 em toda conexão criada pela camada de acesso
    threshold_pct: 100
  # Regras por coluna (NOT NULL, UNIQUE, PK, FK, DEFAULT) serão derivadas 1:1 das
  # constraints declaradas em [[db-schema-spec]] quando o schema for definido.
  # Nenhuma regra de coluna será escrita antes disso.

anomaly_detection:
  enabled: false  # Sem ferramenta de observabilidade instalada (SAD §10) e sem tabelas reais.
                  # [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] para qualquer ferramenta futura.

severity_thresholds:
  warning: "qualquer falha de DQ-002 (foreign_keys desligado) em ambiente de teste"
  critical: "qualquer falha de DQ-001 (integrity_check != 'ok') — triagem P0 conforme [[test-strategy]] §8; corrupção de .sqlite é severidade Crítica com SLA ≤ 4h (NFR-A02)"
```

### 5.1 Regras de qualidade pendentes (bloqueadas — sem colunas reais)

| Regra futura (origem) | Constraint esperada a confirmar no schema |
| :--- | :--- |
| CNPJ normalizado e válido (`normalizarCnpj`, `cnpjValido`) — US-004 | CHECK de formato/dígitos ou validação na camada de acesso — a definir no contrato. |
| Fingerprint de documento único — NFR-A04 | UNIQUE na coluna de fingerprint — a confirmar. |
| E-mails de contato (`salvarContato`) | NOT NULL + formato — a confirmar. |
| Tokens de sessão/recuperação (`hashToken`, `cookieSessao`) | Armazenamento somente como hash, expiração obrigatória — a confirmar. |

## 6. Execução e alinhamento com a estratégia de testes

- **Runners (reais, sem duplicar [[test-strategy]]):** testes de banco rodam como parte da camada **Unit/Integration** — Vitest (`npm run test`) para TEST-020/021/023 e regras DQ; o cenário de carga TEST-022 segue o DoD da US-009 já previsto em [[test-strategy]] §5. Nenhum runner novo é introduzido; qualquer ferramenta adicional (ex.: framework de data quality dedicado) seria `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`.
- **Dados de teste:** banco SQLite efêmero por suíte; `npm run seed` / `npm run seed:auto` para dados de desenvolvimento; fixtures e anonimização conforme [[test-strategy]] §6 (não duplicado aqui).
- **Gate de regressão:** os testes deste documento entram no passo 2 da ordem de regressão de [[test-strategy]] §7 (`npm run test`). O item 6 (`check:dry` + `importar-legado` em staging) permanece como gate de migração e passará a exercitar as regras DQ por coluna assim que existirem.

---

**Próximo passo obrigatório:** verificação humana da localização do schema ([[db-schema-spec]] §0.1), preenchimento do contrato físico, nova varredura determinística e regeneração deste documento com alvos reais nas Seções 1, 2 e 5 — cada teste rastreável a uma tabela/coluna/constraint efetivamente detectada.