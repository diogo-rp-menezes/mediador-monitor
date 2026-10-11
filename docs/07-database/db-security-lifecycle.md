# Database Security & Data Lifecycle — mte-mediador-monitor-unificado (SQLite / better-sqlite3)

> **Versão:** 1.0 · **Owner:** Engenharia/Arquitetura (Security Lead a designar) · **Status:** Draft (bloqueado — schema físico não localizado)
> **Motor de banco verificado:** `better-sqlite3` ^11.5.0 (SQLite embutido, síncrono, arquivo local `.sqlite`) · **ORM:** nenhum — SQL cru · **Topologia:** aplicação web server-side, single-process, single-tenant.
> **Artefatos-fonte:** [[db-schema-spec]] v1.0, [[security-policies]] v1.0, diagnóstico determinístico do workspace.

## 0. Situação do schema (premissa deste documento)

O artefato-fonte [[db-schema-spec]] registra que **o schema físico não foi localizado** (0 tabelas, 0 FKs, 0 DDL detectados; `server/db.ts` não existe na estrutura varrida). A classificação automática por coluna do diagnóstico também retornou **nenhuma coluna com padrão de dado sensível** — consequência direta da ausência de schema detectável, e não evidência de que não existam dados sensíveis.

Conforme as instruções obrigatórias, **este documento não inventa tabelas, colunas ou políticas de retenção por entidade**. As seções abaixo declaram (a) os controles de segurança aplicáveis à engine real `better-sqlite3` independentemente do schema, e (b) o que falta verificar antes de preencher as políticas por entidade.

### 0.1 O que falta verificar

1. Localizar/definir o schema físico (ver [[db-schema-spec]] §0.1) e reexecutar a varredura determinística.
2. Confirmar o algoritmo exato de `criarHashSenha` em `src/autenticacao.ts` (pendência já registrada em [[security-policies]] §5).
3. Confirmar a existência e estrutura das tabelas de sessões/tokens referenciadas por `hashToken` e `cookieSessao`.
4. Definir, com validação humana, as políticas de retenção LGPD por entidade (Seção 4).

## 1. Roles & Permissions

**SQLite não possui roles de servidor, usuários de banco nem GRANT/REVOKE.** O arquivo `.sqlite` é acessado por um único processo Node.js com as permissões do usuário de SO que o executa. Portanto, o controle de acesso a dados é enforceado em **duas camadas reais**, nenhuma delas dentro do banco:

```yaml
roles:
  # NÃO existem roles no nível do banco (SQLite não suporta).
  # Camada 1 — Sistema operacional (única proteção real do arquivo):
  - name: "os_service_user"
    purpose: "Usuário de SO dono do processo Node.js e do arquivo .sqlite"
    permissions:
      filesystem:
        - path: "<caminho configurado em .env>/app.sqlite"
          operations: ["read", "write"]
          mode: "600"   # chmod 600 — somente o dono lê/escreve
        - path: ".env"
          operations: ["read"]
          mode: "600"
  # Camada 2 — Aplicação (RBAC enforceado em middleware, não no banco):
  - name: "admin"
    purpose: "Acesso administrativo total via interface HTTP"
    enforcement: "middleware exigirPermissao em src/auth-http.ts (NFR-SEC02)"
  - name: "operador"
    purpose: "Operação sem privilégios administrativos"
    enforcement: "middleware exigirPermissao em src/auth-http.ts (NFR-SEC02)"
```

> **Regra:** qualquer novo endpoint HTTP DEVE passar por `validarRequisicao`/`tratar` + `exigirPermissao` ([[security-policies]] §2). Não há como delegar autorização ao banco — ela vive exclusivamente no código da aplicação.

## 2. Row-Level Security

```yaml
row_level_security: []
  # SQLite NÃO possui Row-Level Security nativo. Nenhuma policy será declarada.
```

**Controle substituto aplicável:** como o sistema é **single-tenant** ([[security-policies]] §1, NFR-S01), não há isolamento entre tenants a enforcear. O isolamento entre usuários (admin vs. operador) é feito por `exigirPermissao` na camada HTTP. Se uma necessidade futura exigir filtragem por linha (ex.: operador vê apenas seus clientes), ela deverá ser implementada **obrigatoriamente nas queries SQL da aplicação** (cláusulas `WHERE` com o identidade da sessão), nunca assumida como capacidade do banco.

## 3. Sensitive Data

**Nenhuma coluna real foi detectada** (schema ausente — ver Seção 0). A tabela abaixo registra **apenas as classes de dado sensível com evidência em código** (funções e fluxos reais do diagnóstico), sem vinculá-las a colunas inventadas. O mapeamento `tabela.coluna` será preenchido após a definição do schema.

```yaml
sensitive_data:
  # Mapeamento por coluna: PENDENTE — aguardando schema físico (Seção 0.1).
  # Classes com evidência em código (função real → tratamento real):
  - evidence: "criarHashSenha (src/autenticacao.ts)"
    classification: "restricted"
    protection: "hash irreversível; algoritmo exato a confirmar [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA: recomendado scrypt de node:crypto]"
  - evidence: "hashToken / cookieSessao (tokens de sessão e recuperação)"
    classification: "restricted"
    protection: "armazenamento apenas como hash; expiração curta (NFR-SEC03)"
  - evidence: "salvarContato / dados de contato de clientes e administradores"
    classification: "restricted (PII — LGPD, NFR-C01)"
    protection: "acesso apenas autenticado (RBAC); proibido em logs (NFR-SEC04)"
  - evidence: "fingerprintDocumentos / cache de CNPJ (criarConsultaCnpj)"
    classification: "internal"
    protection: "acesso restrito ao processo"

secrets:
  prohibited_in_schema: true   # nenhuma credencial/segredo em default, seed ou comentário
  storage: "exclusivamente em .env (dotenv), não versionado, chmod 600 — ver security-policies §7"
```

**Criptografia em repouso do arquivo:** `better-sqlite3` não oferece criptografia nativa no build utilizado. A proteção do `.sqlite` depende de permissões de filesystem (`chmod 600`, dono = usuário do serviço) e, se exigido por compliance, criptografia de disco/volume no host [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — decisão de infraestrutura, já registrada em [[security-policies]] §5].

**Prevenção de SQL injection:** todo acesso usa `db.prepare()` com parâmetros bindados; é **proibido** concatenar/interpolar input externo em SQL ([[security-policies]] §8). Esta é a principal defesa de segurança de dados disponível na engine real.

## 4. Data Lifecycle por Entidade

**Não é possível declarar lifecycle por entidade:** não há entidades/tabelas confirmadas no schema real ([[db-schema-spec]] §1 vazio por decisão). Nenhuma política de retenção, arquivamento ou eliminação por entidade tem evidência no código, portanto nenhuma será inventada aqui.

```yaml
data_lifecycle: []
  # PENDENTE — aguardando schema físico. Quando as tabelas forem definidas,
  # cada entidade com dado pessoal ou operacional deverá ter entrada própria
  # (creation, active_duration, archival, retention, deletion, legal_retention_required).
```

**O que já tem evidência ou diretriz (independente de schema):**

- **Documentos temporários (PDF/Word) da coleta:** o SAD registra que **limpeza automática não está implementada** — é obrigatório implementar remoção após extração bem-sucedida (gap aberto, [[security-policies]] §5). Método: hard delete do arquivo temporário.
- **Sessões e tokens de recuperação:** expiração curta já prevista via `hashToken` (NFR-SEC03); sessões expiradas devem ser purgadas periodicamente do SQLite [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — mecanismo de purga não detectado no código].
- **Dados pessoais de contato (LGPD, NFR-C01):** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — hipótese registrada em [[security-policies]] §5: retenção enquanto o cliente estiver ativo + 5 anos (obrigações trabalhistas); exclusão por remoção do registro no SQLite + eliminação de backups expirados. Processo de exclusão do titular (LGPD Art. 18) **não implementado** — pendente.
- **Backups:** o backup (NFR-A02) inclui o `.sqlite` e o `.env`; deve ser criptografado em repouso no destino externo, e a eliminação de dados pessoais deve considerar a expiração dos backups que os contenham [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA].

## 5. Seeds (Dev/Test)

O projeto possui scripts reais de seed: `seed` e `seed:auto` (package.json). O conteúdo exato dos datasets não foi extraído pelo diagnóstico.

```yaml
seed:
  environments: ["development", "test"]
  purpose: "Massa de dados sintética para desenvolvimento e testes (scripts npm run seed / seed:auto)"
  rules:
    production_allowed: false
    contains_real_data: false   # proibido usar cópia do .sqlite de produção com dados de clientes (security-policies §5)
    secrets_allowed: false      # nenhuma credencial real em seed; senhas de teste apenas via hash
  datasets:
    - name: "[a preencher após inspeção dos scripts de seed — conteúdo não extraído pelo diagnóstico]"
      deterministic: true   # [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] determinismo a confirmar no código do seed
```

> **Regra (alinhada a [[security-policies]] §5):** ambientes de dev/test devem usar massa sintética gerada por `seed`, nunca cópia integral do `.sqlite` de produção contendo PII de clientes.

---

**Próximo passo obrigatório:** localizar/definir o schema físico ([[db-schema-spec]] §0.1), reexecutar a varredura determinística e então preencher: mapeamento de colunas sensíveis (Seção 3), lifecycle por entidade (Seção 4) e datasets de seed (Seção 5) — todos com rastreabilidade a objetos reais.