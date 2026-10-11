# Database Schema Specification — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Owner:** Engenharia/Arquitetura · **Status:** Draft (bloqueado — schema não localizado)
> Contrato físico do banco. Cada objeto aqui declarado é a fonte da verdade para gerar `database/schema/` — **nunca edite o SQL gerado diretamente**; edite este contrato e regenere.
>
> **Motor de banco verificado:** `better-sqlite3` ^11.5.0 (SQLite embutido, síncrono) · **ORM/query builder:** nenhum — SQL cru · **Empacotamento Tauri/Rust:** ausente.

## 0. Situação do contrato físico

**O schema físico não pôde ser localizado automaticamente e, portanto, este documento NÃO declara nenhuma tabela, coluna, constraint, índice, view, function ou trigger.**

A varredura determinística do workspace retornou:

- **Arquivo de schema esperado:** `server/db.ts` — **não encontrado** no workspace (a estrutura real varrida contém `src/`, `test/`, `web/`; ver ASM-003 em [[db-domain-model]]).
- **Tabelas detectadas:** 0
- **Chaves estrangeiras detectadas:** 0
- **DDL (`CREATE TABLE`, `CREATE INDEX`, etc.) detectado:** nenhum

Conforme a instrução obrigatória do diagnóstico, **nenhuma tabela será inventada neste documento**. As seções 1–8 abaixo estão intencionalmente vazias de objetos reais e registram apenas o que falta verificar.

### 0.1 O que falta verificar

1. **Localizar a definição do schema.** O glossário referencia `server/db.ts` como fonte de schema, mas esse arquivo não existe na estrutura varrida. Hipóteses a confirmar por um humano:
   - o DDL pode estar **inline** em algum módulo de `src/` (ex.: chamadas `db.exec("CREATE TABLE IF NOT EXISTS ...")` via `better-sqlite3`);
   - o schema pode simplesmente **ainda não ter sido escrito**;
   - a referência `server/db.ts` pode estar **desatualizada** em relação à estrutura real do repositório.
2. **Definir o contrato físico neste documento** antes de qualquer geração de SQL. O modelo conceitual em [[db-domain-model]] também está vazio de entidades (0 detectadas) e **não deve ser convertido diretamente em SQL** sem passar por este contrato.
3. **Reexecutar a varredura determinística** após a localização/definição do schema, para regenerar este documento com tabelas, colunas, tipos, PKs, NOT NULLs e FKs reais e rastreáveis.

### 0.2 Sinais de domínio (NÃO são tabelas confirmadas)

Os artefatos-fonte mencionam conceitos que **provavelmente** se materializarão como tabelas, mas que **não foram detectados como tabelas reais** e, por isso, não aparecem na Seção 1:

- monitoramento de CCTs e aditivos;
- fingerprints de documentos (`fingerprintDocumentos`);
- usuários e sessões (`criarAutenticacao`, `cookieSessao`, `bootstrapAdministrador`);
- locks de consolidação (`reservarConsolidacao`);
- cache de CNPJ (`criarConsultaCnpj`);
- clientes, contatos e documentos de clientes (`salvarCliente`, `salvarContato`, `documentosCliente`).

Todas as suposições associadas (ASM-001 a ASM-003 em [[db-domain-model]]) têm confiança **< 0.60** e, pela regra de threshold do projeto, **não devem virar decisão de schema**.

## 1. Tables

**Nenhuma tabela detectada no schema real — esta seção está vazia por decisão, não por omissão.**

```yaml
tables: []
  # 0 tabelas reais detectadas (diagnóstico determinístico).
  # Não preencher sem evidência em código. Ver Seção 0.1.
```

> Estrutura reservada para diff incremental: quando o schema for definido, cada tabela será documentada como `### 1.N \`nome_da_tabela\`` seguindo o bloco YAML padrão do template (columns, primary_key, foreign_keys, unique_constraints, check_constraints, indexes).

## 2. Relationships

```yaml
relationships: []
  # 0 FKs detectadas no schema real. Nenhum relacionamento será inferido.
```

## 3. Constraints

```yaml
constraints: []
  # Nenhuma constraint (PK/FK/UNIQUE/CHECK/NOT_NULL) detectada.
```

## 4. Indexes

> Não crie índice "porque parece bom" — todo índice precisa de evidência ou padrão de query que o justifique.

```yaml
indexes: []
  # Nenhum índice detectado. Sem tabelas reais, não há padrão de query verificável.
```

## 5. Views

```yaml
views: []
  # Nenhuma view detectada. Qualquer view futura proposta sem evidência em código
  # deverá levar o rótulo "[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]".
```

## 6. Functions

```yaml
functions: []
  # SQLite (better-sqlite3) não possui stored procedures no sentido tradicional;
  # funções definidas pelo usuário seriam registradas em código TypeScript via
  # db.function() — nenhuma foi detectada na varredura.
```

## 7. Triggers

```yaml
triggers: []
  # Nenhum trigger detectado no schema real.
```

## 8. Diagrama Entidade-Relacionamento (Físico)

**Não é possível gerar o diagrama ER físico:** não há tabelas nem relacionamentos reais detectados. O diagrama será gerado automaticamente a partir das Seções 1 e 2 assim que o schema for definido e varrido.

```mermaid
erDiagram
    %% Schema físico ainda não definido — 0 tabelas detectadas.
    %% Ver Seção 0.1: localizar/criar o schema e reexecutar a varredura.
```

---

**Próximo passo obrigatório:** verificação humana da localização do schema (Seção 0.1), preenchimento deste contrato físico e nova varredura determinística para regenerar este documento e o [[db-domain-model]] com objetos reais e rastreáveis.