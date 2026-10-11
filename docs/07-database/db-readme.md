# mte-mediador-monitor-unificado — Database README

> **Versão:** 1.0 · **Owner:** Engenharia/Arquitetura · **Status:** Draft (bloqueado — schema físico não localizado)
> **Motor de banco verificado:** `better-sqlite3` ^11.5.0 (SQLite embutido, síncrono, arquivo único `.sqlite` local) · **ORM/query builder:** nenhum — SQL cru (`prepare`, `run`, `all`, `get`, transações manuais) · **Topologia:** monolito Node.js/TypeScript, nó único, single-tenant.

## 1. Purpose

O banco de dados deste projeto é um **SQLite embutido** acessado via `better-sqlite3` (driver síncrono), persistido em um **arquivo único `.sqlite` local** ao processo. Ele dá suporte ao monolito `mte-mediador-monitor-unificado` — scheduler `node-cron`, HTTP admin e scraper `playwright` — com consistência forte (ACID nativo do SQLite) e escrita serializada (single-writer, incluindo lock de consolidação via `reservarConsolidacao`). Ver [[db-manifest]] e [[db-context]].

## 2. Architecture

- **Modelo:** relacional, single-tenant, consistência forte.
- **Acesso:** SQL cru via `better-sqlite3` — **não há ORM nem query builder** no projeto; qualquer menção a PostgreSQL/MySQL/MongoDB/Prisma é inválida neste repositório.
- **Topologia:** nó único — o mesmo arquivo `.sqlite` atende dev e produção, diferenciado apenas por `.env` e localização do arquivo. Não há réplicas, cluster, staging separado ou multi-AZ.
- **Estado do schema:** **0 tabelas detectadas** pela varredura determinística; o arquivo de schema esperado (`server/db.ts`) **não existe**. Ver [[db-schema-spec]] §0.

## 3. Domains & Core Entities

**Nenhuma entidade/tabela confirmada.** O modelo de domínio ([[db-domain-model]]) está vazio de entidades detectadas (0 encontradas). Existem apenas **sinais de domínio** com confiança < 0.60 que **não podem virar decisão de schema**:

- monitoramento de CCTs e aditivos;
- fingerprints de documentos (`fingerprintDocumentos`);
- usuários e sessões (`criarAutenticacao`, `cookieSessao`, `bootstrapAdministrador`);
- locks de consolidação (`reservarConsolidacao`);
- cache de CNPJ (`criarConsultaCnpj`);
- clientes, contatos e documentos de clientes (`salvarCliente`, `salvarContato`, `documentosCliente`).

Estes sinais **provavelmente** se materializarão como tabelas, mas exigem verificação humana antes de qualquer DDL.

## 4. Source of Truth

Conforme [[db-manifest]]:

- **Tipo:** híbrido — o schema é criado/ad-hoc por scripts em `src/` (seed, `importar-legado`, `autenticacao.ts`).
- **Não existe arquivo de schema versionado** (`schema.sql` / migrations) no disco.
- **Consequência:** a detecção de drift está **desativada** até existir um contrato físico declarado em [[db-schema-spec]] e materializado em `database/schema/`.

## 5. Migration Strategy

Ver [[db-migration-spec]]. Política atual:

- **Migrações manuais/ad-hoc** via scripts CLI: `seed`, `importar-legado`, `reanalisar`. A formalização em migrações versionadas é pendência registrada.
- **Fluxo obrigatório para qualquer migration futura:** proposta → validação determinística → risco → **aprovação humana** → execução → verificação. A IA nunca escreve diretamente no banco.
- **Estratégia de deploy:** expand-contract.
- **Rollback:** transação explícita (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`); para bancos existentes, **backup do arquivo `.sqlite` antes da execução é obrigatório** (DDL commitado não é reversível).
- **Versionamento de schema:** `PRAGMA user_version` (padrão SQLite sem ORM).
- **Mudanças destrutivas** (`DROP TABLE`, `DROP COLUMN`, truncamento): exigem aprovação humana explícita — nunca automáticas.

## 6. Environments

| Environment | Purpose |
| :--- | :--- |
| Development | Mesmo arquivo `.sqlite` local; `npm run dev` (tsx watch). Sem banco separado por ambiente. |
| Test | `vitest` 2.1 + scripts `test:smoke`/`test:auth-ui`/`test:clientes`; banco de teste em arquivo temporário ou em memória **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**. |
| Staging | **Não existe** — topologia de nó único; não há ambiente de staging separado. |
| Production | Mesmo arquivo `.sqlite` no servidor único (VM/bare metal/container); backup = cópia do arquivo (NFR-A02/A03). Sem réplicas. |

## 7. Security

Ver [[db-security-lifecycle]]. Pontos centrais:

- **SQLite não possui roles, usuários de banco, GRANT/REVOKE nem Row-Level Security.** O controle de acesso vive em duas camadas fora do banco:
  1. **Sistema operacional:** arquivo `.sqlite` e `.env` com `chmod 600`, dono = usuário do serviço.
  2. **Aplicação:** RBAC enforceado em middleware (`exigirPermissao` em `src/auth-http.ts`, NFR-SEC02); todo endpoint HTTP deve passar por `validarRequisicao`/`tratar`.
- **SQL injection:** todo acesso via `db.prepare()` com parâmetros bindados; é proibido concatenar input externo em SQL.
- **Dados sensíveis (evidência em código, mapeamento por coluna pendente de schema):** hash de senhas (`criarHashSenha` — algoritmo exato a confirmar), tokens de sessão/recuperação armazenados só como hash (`hashToken`, NFR-SEC03), PII de contatos (LGPD, NFR-C01 — proibida em logs, NFR-SEC04).
- **Segredos:** exclusivamente em `.env` (dotenv), não versionado; nunca em schema, seed ou comentários.
- **Criptografia em repouso:** `better-sqlite3` não oferece criptografia nativa no build utilizado; proteção depende de permissões de filesystem e, se exigido, criptografia de disco no host **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**.
- **Lifecycle:** políticas de retenção por entidade **pendentes** (aguardando schema); gaps abertos: limpeza de documentos temporários PDF/Word não implementada, purga de sessões expiradas não detectada, processo de exclusão do titular (LGPD Art. 18) não implementado.

## 8. Backup, Recovery & Observability

Ver [[db-performance-recovery]] (a criar) e [[db-manifest]]:

- **Backup:** cópia periódica do arquivo `.sqlite` + `.env` (NFR-A02/A03); deve ser criptografado em repouso no destino externo.
- **Recuperação:** restauração do arquivo + `.env`; RTO ≤ 4h. **Não há PITR, WAL shipping ou replicação configurados no código.**
- **Gargalos conhecidos:** lock single-writer do SQLite (escrita serializada; `better-sqlite3` é síncrono — operações longas bloqueiam o processo) e extração de documentos CPU-bound no event loop.
- **Observabilidade de banco:** não instrumentada; verificação manual via `PRAGMA integrity_check;` e `PRAGMA foreign_key_check;`.

## 9. Change Management

1. **Proposta:** toda mudança de schema começa como edição no contrato físico [[db-schema-spec]] — nunca edição direta de SQL gerado.
2. **Validação determinística:** reexecução da varredura do workspace para regenerar artefatos com objetos reais e rastreáveis.
3. **Avaliação de risco:** dimensões data_loss, downtime, locking, compatibility, reversibility (ver [[db-migration-spec]] §3).
4. **Aprovação humana obrigatória** antes de execução — em especial para a fase Contract e qualquer operação destrutiva.
5. **Execução:** dentro de transação explícita, com backup prévio do arquivo `.sqlite`.
6. **Verificação pós-execução:** `sqlite_master` confere com o contrato, `PRAGMA integrity_check;` / `PRAGMA foreign_key_check;` sem erros, `PRAGMA user_version;` na versão alvo, `npm run typecheck` e `npm test` verdes.

## 10. Directory Structure

```text
database/
├── dbac.yaml           # [a criar] manifesto DBaC (conteúdo em docs/07-database/db-manifest.md)
├── model/              # [a criar] modelo canônico (derivado de db-domain-model.md)
├── schema/             # [a criar] SQL gerado a partir de db-schema-spec.md — não editar manualmente
├── migrations/         # [a criar] uma pasta por migration, referenciando db-migration-spec.md
├── seeds/              # [a criar] hoje seeds vivem como scripts npm (seed, seed:auto)
└── tests/              # [a criar] testes atuais vivem em test/ na raiz
```

**Estado real no disco:** nenhum dos diretórios acima existe ainda. Os artefatos da fase de banco vivem em `docs/07-database/` e referenciam os ids do catálogo: `db-manifest`, `db-context`, `db-domain-model`, `db-schema-spec`, `db-security-lifecycle`, `db-migration-spec`, `db-test-quality`, `db-performance-recovery`.

## 11. Como inspecionar o banco localmente (engine real: better-sqlite3)

Não há servidor de banco para conectar — o banco é um arquivo `.sqlite` aberto pelo processo Node.js. Opções reais com a stack presente:

- **Via código (a forma suportada pelo projeto):** um script `tsx` que abre o arquivo com `better-sqlite3` e introspeciona o schema:

```ts
import Database from "better-sqlite3";
const db = new Database(process.env.CAMINHO_BANCO ?? "app.sqlite", { readonly: true });
console.log(db.prepare("SELECT type, name, sql FROM sqlite_master").all());
console.log(db.pragma("integrity_check"));
console.log(db.pragma("user_version"));
```

- **PRAGMAs úteis (via `db.pragma(...)`):** `integrity_check`, `foreign_key_check`, `user_version`, `table_info(<tabela>)`, `index_list(<tabela>)`.
- **Backup local:** copiar o arquivo `.sqlite` com o processo parado (ou garantir que nenhuma escrita esteja em curso), junto com o `.env`.

> Não existem comandos de outras engines (psql, mysql, mongosh etc.) aplicáveis a este projeto.

## 12. Limitações Atuais do Sistema DBaC (importante)

### O que é determinístico hoje

- Engine e dependências extraídas do `package.json` real (`better-sqlite3` ^11.5.0, sem ORM).
- Varredura determinística do workspace: 52 arquivos, estrutura `src/`, `test/`, `web/`; **0 tabelas, 0 FKs, 0 DDL detectados**; `server/db.ts` não encontrado.
- Evidências de código citadas nos artefatos (funções como `criarAutenticacao`, `hashToken`, `reservarConsolidacao`, scripts `seed`/`importar-legado`) vêm de arquivos que existem no disco.
- Render incremental por tabela está previsto no contrato [[db-schema-spec]] (estrutura reservada `### 1.N`), mas **não há tabelas para renderizar** até o schema ser definido.

### O que é inferido ou pendente

- **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** Ambiente de teste com banco em arquivo temporário ou em memória.
- **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** Migration bootstrap `MIG-BOOTSTRAP-001` (placeholder estrutural — nenhum objeto concreto declarado).
- **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** Criptografia de disco/volume no host; purga periódica de sessões; retenção LGPD (cliente ativo + 5 anos); determinismo dos seeds.
- **[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]** Políticas de retenção LGPD por entidade e processo de exclusão do titular.

### Capacidades que dependem de motor determinístico (não implementadas)

| Capacidade | Status |
| :--- | :--- |
| Introspecção de banco existente (brownfield) | Não implementado |
| Schema Diff / Drift Report contra banco vivo | Não implementado (desativado até existir schema declarado) |
| Execução de migration em banco efêmero + verificação automática | Não implementado |
| Compatibility Matrix automática app↔schema | Não implementado |
| Changelog e Validation Report gerados automaticamente | Não implementado |

Esses pontos podem virar uma frente de trabalho separada (conector de introspecção via `sqlite_master` + engine de validação), fora do escopo do sistema de templates/artefatos atual.

---

**Próximo passo obrigatório (bloqueia `db-schema-spec`, `db-domain-model`, `db-migration-spec`, `db-security-lifecycle` §§3–5):** verificação humana da localização do schema — confirmar se o DDL está inline em algum módulo de `src/` (ex.: `db.exec("CREATE TABLE IF NOT EXISTS ...")`), se ainda não foi escrito, ou se a referência `server/db.ts` está desatualizada — seguida de nova varredura determinística para regenerar todos os artefatos com objetos reais e rastreáveis.