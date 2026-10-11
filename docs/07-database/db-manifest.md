# Database Manifest — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Owner:** Engenharia/Arquitetura · **Status:** Draft
> Ponto de entrada da automação Database as Code (DBaC). Todo o restante dos artefatos de banco (`docs/07-database/*`) referencia este manifesto.

```yaml
database:
  id: "mte-mediador-monitor-unificado-db"
  name: "mte-mediador-monitor-unificado"
  version: "0.1.0"
  status: "draft"

  engine:
    vendor: "sqlite"
    version: "better-sqlite3 ^11.5.0 (SQLite 3 embutido)"
    compatibility: "better-sqlite3 11.x — driver síncrono, arquivo único .sqlite local"

  architecture:
    model: "relational"
    tenancy: "single"
    consistency: "strong"
    # ACID nativo do SQLite; single-writer serializado via reservarConsolidacao (ver db-context)

  source_of_truth:
    type: "hybrid"
    location: "src/ (schema criado/ad-hoc por scripts seed, importar-legado e autenticacao.ts)"
    # ATENÇÃO: nenhum arquivo de schema versionado (schema.sql / migrations) foi detectado.
    # NENHUMA tabela foi detectada por varredura determinística — o schema físico ainda
    # precisa ser formalizado em db-schema-spec antes de drift_detection ser efetivo.

  environments:
    - name: development
      purpose: development
      notes: "Mesmo arquivo .sqlite local; npm run dev (tsx watch). Não há banco separado por ambiente — topologia de nó único."
    - name: test
      purpose: automated-validation
      notes: "vitest 2.1 + scripts test:smoke/test:auth-ui/test:clientes; banco de teste em arquivo temporário ou em memória [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]."
    - name: production
      purpose: production
      notes: "Mesmo arquivo .sqlite no servidor único (VM/bare metal/container); backup = cópia do arquivo (NFR-A02/A03). Sem réplicas, sem cluster, sem multi-AZ."

  ownership:
    team: "Engenharia/Arquitetura"
    service: "mte-mediador-monitor-unificado (monolito Node.js/TypeScript — scheduler node-cron + HTTP admin + scraper playwright)"

  governance:
    migration_policy: "manual"
    # Migrações ad-hoc via scripts CLI: seed, importar-legado, reanalisar.
    # Formalização em migrações versionadas é pendência registrada em db-migration-spec.
    destructive_changes: "approval-required"
    drift_detection: false
    # Desativado até existir schema declarado versionado (ver Notas de Governança).
    schema_validation: true
    # Validação em runtime via zod (validarExtracaoCct, exigirPermissao, exigirCsrf) —
    # validação de schema físico DDL ainda não implementada.

  artifacts:
    root: "database/"
    schema: "database/schema/          # [a criar — hoje inexistente no disco]"
    migrations: "database/migrations/  # [a criar — hoje inexistente no disco]"
    specifications: "docs/07-database/"
    tests: "database/tests/            # [a criar — testes atuais vivem em test/ na raiz]"
    documentation: "docs/07-database/db-readme.md"
```

## Artefatos da fase de banco (catálogo)

| Artefato | ID | Status |
| :--- | :--- | :--- |
| Contexto de banco e topologia | `db-context` | Derivado do SAD — nó único, arquivo `.sqlite`, single-writer |
| Modelo de domínio (entidades) | `db-domain-model` | A criar — entidades inferidas do código (CCTs, aditivos, fingerprints, usuários, sessões, tokens, cache CNPJ, locks de consolidação) |
| Especificação de schema físico (DDL) | `db-schema-spec` | **Bloqueado** — nenhuma tabela detectada na varredura; schema precisa ser definido antes de qualquer DDL |
| Segurança e ciclo de vida de dados | `db-security-lifecycle` | A criar — hash de senhas/tokens em `autenticacao.ts`; retenção/LGPD pendente |
| Especificação de migrações | `db-migration-spec` | A criar — hoje migração manual via `seed`, `importar-legado`, `reanalisar` |
| Qualidade e testes de banco | `db-test-quality` | A criar — base existente: `vitest` + scripts `test:*` |
| Performance e recuperação | `db-performance-recovery` | A criar — gargalos conhecidos: single-writer lock, extração CPU-bound no event loop; backup = cópia de arquivo |
| README da fase de banco | `db-readme` | A criar |

## Notas de Governança

- **Engine real:** `better-sqlite3` ^11.5.0, **sem ORM/query builder** — acesso via SQL cru (`prepare`, `run`, `all`, `get`, transações manuais). Nenhuma outra engine de banco consta nas dependências do projeto; qualquer menção a PostgreSQL/MySQL/MongoDB neste repositório é inválida.
- **Schema ainda não definido:** a varredura determinística **não detectou nenhuma tabela** nem arquivo de schema (`server/db.ts` não existe). Este manifesto **não inventa tabelas** — a formalização do schema é pré-requisito de `db-schema-spec` e da detecção de drift.
- **Ambientes:** a topologia real é de **nó único** (aplicação monolítica server-side com banco em arquivo local). Não existem ambientes de servidor multi-tenant, staging separado ou réplicas — o mesmo arquivo `.sqlite` atende dev e produção, diferenciado apenas por `.env` e localização do arquivo. Ambiente de teste isolado é **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**.
- **Mudanças destrutivas** (`DROP TABLE`, `DROP COLUMN`, truncamento de dados) exigem aprovação humana explícita — nunca aplicadas automaticamente, independentemente da confiança da IA na proposta.
- **Detecção de drift** entre este manifesto/schema declarado e o estado real do banco requer um motor determinístico próprio (introspecção via `sqlite_master` + comparação de checksum) — não é gerado por este template e está **desativada** até existir schema declarado; ver seção de limitações em [`db-readme.md`](./db-readme.md).
- **Backup/recuperação:** backup = cópia periódica do arquivo `.sqlite` (NFR-A02/A03); RTO ≤ 4h depende de restauração do arquivo + `.env`. Não há PITR, WAL shipping ou replicação configurados no código.