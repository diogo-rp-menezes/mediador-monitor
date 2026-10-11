# Database Domain & Entity Model — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Owner:** Engenharia/Arquitetura · **Status:** Draft
> Modelo conceitual — a IA pode inferir este modelo a partir do domínio, mas ele nunca deve ser convertido diretamente em SQL sem passar pelo contrato físico em [[db-schema-spec]].

## 1. Domain

```yaml
domain:
  id: "monitoramento-cct-aditivos"
  name: "Monitoramento de CCTs e Aditivos"
  description: "Domínio de persistência do sistema mte-mediador-monitor-unificado: monitoramento de Convenções Coletivas de Trabalho (CCTs) e aditivos, fingerprints de documentos, usuários e sessões, locks de consolidação e cache de CNPJ. Motor de banco verificado: better-sqlite3 (SQLite embutido), sem ORM — SQL cru."
```

## 2. Entities

**NENHUMA entidade/tabela foi detectada deterministicamente no schema do projeto.**

A varredura determinística do workspace (ver diagnóstico) retornou **0 tabelas reais** e **0 chaves estrangeiras** no arquivo de schema. Conforme a instrução obrigatória do diagnóstico, **nenhuma entidade será inventada neste documento**: o modelo conceitual de entidades ainda precisa ser definido.

```yaml
entities: []
  # Nenhuma tabela real detectada no schema.
  # O schema físico ainda precisa ser definido antes que este modelo
  # conceitual possa ser preenchido com entidades rastreáveis.
```

### 2.1 O que falta verificar

Para que este documento possa ser preenchido com entidades reais, é necessário:

1. **Localizar ou criar o arquivo de schema** — o diagnóstico não encontrou nenhum arquivo de definição de schema (DDL) no workspace. O glossário menciona `server/db.ts` como fonte de schema, mas esse arquivo **não consta** entre os 52 arquivos parseados (a estrutura real é `src/`, `test/`, `web/`). É preciso confirmar se o schema está embutido em código (ex.: `CREATE TABLE` inline via `better-sqlite3` em algum módulo de `src/`) ou se ainda não foi escrito.
2. **Definir o contrato físico em [[db-schema-spec]]** — nenhuma entidade deste modelo conceitual deve virar SQL sem passar por esse contrato.
3. **Reexecutar a varredura determinística** após a definição do schema, para que as entidades, atributos e FKs sejam extraídos de fonte real.

### 2.2 Sinais de domínio observados (NÃO são entidades confirmadas)

Os artefatos-fonte (Database Context e Glossário) mencionam conceitos que **provavelmente** se materializarão como tabelas, mas que **não foram detectados como tabelas reais** e, portanto, não podem ser promovidos a entidades deste modelo:

- dados de monitoramento de CCTs e aditivos (Database Context, seções 1 e 3);
- fingerprints de documentos (termo canônico `fingerprintDocumentos` no glossário);
- usuários e sessões (termos `criarAutenticacao`, `cookieSessao`, `bootstrapAdministrador`);
- locks de consolidação (termo `reservarConsolidacao`);
- cache de CNPJ (termo `criarConsultaCnpj`);
- clientes, contatos e documentos de clientes (termos `salvarCliente`, `salvarContato`, `documentosCliente` — esta última é a única "Core Entity" listada pelo glossário, porém sem tabela correspondente detectada).

Qualquer uso desses conceitos como entidade de schema exige validação humana e evidência em código (ver Seção 3).

## 3. Evidence & Assumptions

```yaml
assumptions:
  - id: "ASM-001"
    claim:
      object: "(schema inteiro)"
      interpretation: "O banco persiste dados de monitoramento de CCTs e aditivos, fingerprints, usuários/sessões, locks de consolidação e cache de CNPJ — mas nenhuma tabela correspondente foi detectada no workspace."
    confidence: 0.40
    evidence:
      - source: "db-context (Database Context, seção 1 — Purpose)"
      - source: "diagnóstico determinístico: 'Tabelas/Entidades reais detectadas (0)'"
    status: "requires_validation"

  - id: "ASM-002"
    claim:
      object: "(entidade documentosCliente)"
      interpretation: "O glossário classifica 'documentosCliente' como Core Entity, mas sem atributos, relacionamentos ou tabela detectados — não pode ser promovida a entidade de schema."
    confidence: 0.50
    evidence:
      - source: "glossario (seção 3 — Entidades de Domínio)"
    status: "requires_validation"

  - id: "ASM-003"
    claim:
      object: "(localização do schema)"
      interpretation: "O glossário referencia 'server/db.ts' como fonte de schema, mas esse arquivo não existe na estrutura real varrida (src/, test/, web/) — a referência pode estar desatualizada ou o schema pode estar inline em outro módulo."
    confidence: 0.55
    evidence:
      - source: "glossario (cabeçalho — menção a server/db.ts)"
      - source: "diagnóstico determinístico: 'Arquivos por diretório de topo: src/, test/, web/'"
    status: "requires_validation"
```

**Regra de threshold:**

| Confiança | Ação |
| :--- | :--- |
| ≥ 0.95 | Pode ser incorporado automaticamente |
| 0.80 – 0.94 | Pode ser proposto, requer revisão leve |
| 0.60 – 0.79 | Requer revisão humana explícita |
| < 0.60 | Não deve virar decisão de schema |

**Situação atual:** todas as suposições acima estão **abaixo de 0.60** — nenhuma delas deve virar decisão de schema. O próximo passo obrigatório é a definição/verificação humana do schema físico (SQLite via `better-sqlite3`, SQL cru, sem ORM), seguida de nova varredura determinística para regenerar este modelo com entidades reais e rastreáveis.