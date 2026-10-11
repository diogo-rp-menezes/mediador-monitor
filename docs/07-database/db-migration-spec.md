# Migration Specification & Plan — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Status:** Proposed (bloqueado — schema não localizado)
> **Motor de banco verificado:** `better-sqlite3` ^11.5.0 (SQLite embutido, síncrono) · **ORM/query builder:** nenhum — SQL cru
> Fluxo obrigatório: **proposta → validação determinística → risco → aprovação humana → execução → verificação**. A IA nunca escreve diretamente no banco.

## 0. Situação das migrations

**Nenhuma migration real pode ser documentada neste momento.** A varredura determinística do workspace retornou:

- **Arquivo de schema esperado:** `server/db.ts` — **não encontrado** (a estrutura real varrida contém `src/`, `test/`, `web/`).
- **Tabelas detectadas:** 0 · **DDL detectado:** nenhum · **Diff entre versões de schema:** não rastreável no repositório.

Conforme as instruções obrigatórias do diagnóstico, **nenhuma mudança de schema será inventada**. Este documento registra: (a) o que falta verificar antes de qualquer migration; (b) a migration bootstrap **proposta** — devidamente rotulada como inferida — que materializaria o schema inicial caso se confirme que ele ainda não existe.

### 0.1 O que falta verificar

1. **Localizar o DDL real.** O schema pode estar inline em algum módulo de `src/` (ex.: `db.exec("CREATE TABLE IF NOT EXISTS ...")` via `better-sqlite3`), pode ainda não ter sido escrito, ou a referência `server/db.ts` pode estar desatualizada. Ver Seção 0.1 de [[db-schema-spec]].
2. **Confirmar o estado do banco em produção/uso.** Verificar se existe um arquivo `.db` SQLite em uso e, se existir, extrair o schema real via `sqlite_master` antes de propor qualquer mudança.
3. **Definir o contrato físico em [[db-schema-spec]]** e reexecutar a varredura determinística. Somente então migrations incrementais reais poderão ser especificadas com `source_state` e `target_state` rastreáveis.

---

## 1. Intent

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

**Premissas adotadas:** (1) o schema físico ainda não existe em código localizável; (2) os sinais de domínio listados na Seção 0.2 de [[db-schema-spec]] (monitoramento de CCTs/aditivos, fingerprints de documentos, usuários/sessões, locks de consolidação, cache de CNPJ, clientes/contatos/documentos) **provavelmente** se materializarão como tabelas, mas têm confiança < 0.60 e **não podem virar decisão de schema**; (3) por isso, esta migration bootstrap é apenas um **placeholder estrutural** — os objetos concretos só serão preenchidos após a verificação da Seção 0.1.

```yaml
migration:
  id: "MIG-BOOTSTRAP-001"
  title: "Bootstrap do schema inicial (placeholder — aguardando definição do contrato físico)"
  source_state: { version: "nenhum schema detectado (0 tabelas)" }
  target_state: { version: "a definir em [[db-schema-spec]] — bloqueado" }

  changes: []
    # NENHUMA mudança declarada: não há tabelas reais detectadas e o diff
    # entre versões não é rastreável. Preencher somente após a Seção 0.1.

  compatibility:
    backward_compatible: true   # bootstrap sobre banco vazio não quebra estado anterior
    forward_compatible: false   # a confirmar quando o schema alvo existir

  deployment_strategy: "expand-contract"

  rollback:
    possible: true
    strategy: "Em SQLite (better-sqlite3), envolver cada migration em transação
               explícita (BEGIN IMMEDIATE / COMMIT / ROLLBACK). Para bootstrap
               sobre banco novo, rollback = descartar o arquivo .db criado.
               Para bancos existentes, backup do arquivo .db antes da execução
               é obrigatório (SQLite não suporta rollback de DDL fora de transação
               já commitada)."
```

## 2. Plano Operacional (Expand → Migrate → Contract)

| Fase | Nome | Operações | Checks |
| :--- | :--- | :--- | :--- |
| 1 | Preflight | Backup do arquivo `.db` (se existir); confirmar versão do `better-sqlite3` (^11.5.0); confirmar que nenhum processo detém lock do banco | `PRAGMA integrity_check;` OK; `PRAGMA user_version;` registrado como baseline |
| 2 | Schema Preparation (Expand) | **[BLOQUEADO]** — nenhuma operação aditiva pode ser declarada sem tabelas reais. Quando o schema for definido: `CREATE TABLE IF NOT EXISTS ...`, `CREATE INDEX IF NOT EXISTS ...` (somente aditivo) | — |
| 3 | Data Transformation | **[BLOQUEADO]** — sem dados de origem conhecidos, nenhum backfill pode ser especificado. O script `importar-legado` (package.json) sugere migração de dados legados futura — **a investigar por humano** | — |
| 4 | Application Compatibility | Garantir que o código em `src/` que acessa o banco via SQL cru seja compatível com o schema alvo **antes** da fase Contract | Typecheck (`npm run typecheck`) e testes (`npm test`) verdes |
| 5 | Validation | — | `PRAGMA integrity_check;` OK; `PRAGMA foreign_key_check;` OK; contagem de tabelas/índices confere com [[db-schema-spec]] |
| 6 | Cleanup (Contract) | **[BLOQUEADO]** — nenhum objeto legado identificado. Só executar após confirmação humana de que a fase Expand está estável em produção | — |

## 3. Risk Assessment

```yaml
risk:
  overall_level: "MEDIUM"
  # MEDIUM não pela operação em si (indefinida), mas pela INCERTEZA:
  # o estado real do schema é desconhecido, o que impede avaliação precisa.
  dimensions:
    data_loss:
      score: 0
      evidence: ["Nenhuma operação destrutiva declarada — nenhuma tabela real detectada"]
    downtime:
      score: 0
      evidence: ["SQLite embutido (better-sqlite3, síncrono): sem servidor; indisponibilidade limitada ao processo local"]
    locking:
      score: 1
      evidence: ["SQLite usa lock de arquivo exclusivo durante escrita; better-sqlite3 é síncrono — migrations longas bloqueiam o processo"]
    compatibility:
      score: 2
      evidence: ["Código de acesso via SQL cru sem ORM — mudanças de schema exigem revisão manual de todas as queries em src/"]
    reversibility:
      score: 1
      evidence: ["Rollback depende de backup prévio do arquivo .db ou transação não commitada; DDL commitado não é reversível automaticamente"]
  destructive_operations: []
  required_controls:
    - "Backup do arquivo .db antes de qualquer execução"
    - "Execução de cada migration dentro de transação explícita (BEGIN IMMEDIATE)"
    - "Uso de PRAGMA user_version para versionamento de schema (padrão SQLite sem ORM)"
    - "Aprovação humana obrigatória antes da fase Contract"
```

## 4. Approval Gate

| Campo | Valor |
| :--- | :--- |
| Aprovação obrigatória? | **Sim** |
| Motivo | Estado do schema desconhecido (0 tabelas detectadas; `server/db.ts` não encontrado); toda migration futura é atualmente [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]; o script `importar-legado` sugere dados legados cujo formato é desconhecido |
| Aprovado por | Pendente — Engenharia/Arquitetura (owner de [[db-schema-spec]]) |
| Status | **Pending** |

## 5. Verification (pós-execução)

**Não preenchido — nenhuma migration foi aplicada.** Quando uma migration real for executada, registrar aqui:

1. **Schema:** saída de `SELECT type, name, sql FROM sqlite_master;` conferindo com [[db-schema-spec]].
2. **Integridade:** `PRAGMA integrity_check;` e `PRAGMA foreign_key_check;` sem erros.
3. **Versionamento:** `PRAGMA user_version;` igual à versão alvo da migration.
4. **Compatibilidade:** `npm run typecheck` e `npm test` verdes contra o banco migrado.
5. **Performance:** tempos das queries críticas de `src/` antes/depois (baseline a definir quando o schema existir).

> **Nota:** a execução real (SQL, rollback automático, checagem contra banco efêmero) depende de um motor determinístico de execução/validação — este documento é o contrato e o registro, não o executor.

---

**Próximo passo obrigatório:** verificação humana da localização do schema (Seção 0.1), preenchimento do contrato físico em [[db-schema-spec]] e nova varredura determinística. Somente então este documento poderá conter migrations reais, com `changes`, riscos e rollbacks rastreáveis a objetos concretos.