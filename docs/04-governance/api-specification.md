# API & Integration Contract Specification — mte-mediador-monitor-unificado

> **Versão da API:** não versionada (nenhum prefixo `/v1` detectado no código) · **Protocolo:** HTTP/JSON + HTML (server-side) · **Base URL:** `http://<host>:<PORTA_HTTP>` (porta configurável via `.env`)
> **Autenticação:** Sessão via cookies/headers HTTP (implementação própria em `src/auth-http.ts` / `autenticacao.ts`)

## 1. Overview

O **mte-mediador-monitor-unificado** é uma aplicação monolítica Node.js/TypeScript de nó único. Sua interface HTTP existe primariamente para **operação administrativa humana** (dashboard, autenticação, redefinição de senha), não como API pública para integrações de terceiros. O servidor HTTP é implementado **sem framework** (HTTP nativo do Node.js), com roteamento e middlewares próprios em `src/auth-http.ts` (`criarAcessoHttp`, `tratar`, `validarRequisicao`).

**Consumidores esperados:** operadores/administradores humanos via navegador (VPN ou rede local).

**Princípios de design:** simplicidade operacional, segurança por padrão (CSRF, RBAC simples), zero dependências de framework web.

## 2. Conventions

* **Formato:** JSON (`application/json`) para respostas de API; HTML para páginas administrativas.
* **Versionamento:** **Não implementado** — nenhum prefixo de versão ou header de versão foi detectado no código. [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Recomenda-se adotar prefixo `/v1/` antes de qualquer exposição externa.
* **Convenção de nomes:** Não determinável automaticamente (rotas não localizadas — ver seção 4).
* **Paginação:** **Não evidenciada no código.** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Meta: cursor-based via `?cursor=&limit=` para listagens de CCTs.
* **Rate Limiting:** **Não implementado.** O SAD (seção 13) lista rate-limiting no HTTP como item de hardening pendente (NFR-SEC04). [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

## 3. Authentication & Authorization

Com base no System Architecture Document (que referencia o código real em `src/auth-http.ts` e `autenticacao.ts`):

* **Mecanismo:** Autenticação própria com sessão persistida em SQLite (tabelas de usuários/sessões/tokens). Senhas com hash via `criarHashSenha`; tokens de recuperação via `hashToken` com expiração. Transporte por cookies/headers HTTP.
* **Proteção CSRF:** middleware `exigirCsrf` aplicado em rotas sensíveis (NFR-SEC02).
* **Escopos/Permissões:** RBAC simples via middleware `exigirPermissao` — papéis **admin** e **operador** (NFR-SEC02).
* **Bootstrap:** o primeiro administrador é criado via CLI (`auth:bootstrap`), não por endpoint HTTP (NFR-SEC03).

## 4. Endpoints

### 4.1 Rotas reais detectadas automaticamente

**Nenhuma rota/IPC foi detectada automaticamente no código.** O arquivo de rotas (`server/express-app.ts`) não foi localizado no workspace — o que é consistente com o SAD, que indica que o projeto **não usa Express** e implementa roteamento próprio em `src/auth-http.ts`. A extração automática de rotas não cobriu esse roteador customizado.

**O que falta verificar:** leitura manual de `src/auth-http.ts` (funções `criarAcessoHttp`, `tratar`, `validarRequisicao`) para extrair a tabela exata de método/path/handler. Até que isso ocorra, **nenhum endpoint abaixo deve ser tratado como contrato confirmado**.

### 4.2 Endpoints referenciados no SAD (não confirmados por inspeção de rotas)

Os caminhos abaixo são citados no System Architecture Document (seção 6) como definidos em `auth-http.ts`, mas **sem método HTTP, handler ou contrato confirmados**:

| Path (conforme SAD) | Propósito provável | Status |
| :--- | :--- | :--- |
| `/login` | Autenticação de operador/admin | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] |
| `/logout` | Encerramento de sessão | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] |
| `/admin/*` | Interface administrativa (dashboard, gestão) | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] |

#### `POST /login` — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Purpose:** Autenticar usuário e estabelecer sessão.
* **Auth requerida:** Não (endpoint público; protegido por CSRF via `exigirCsrf`).

##### Request — Body Schema (hipotético)

```typescript
interface LoginRequest {
  usuario: string;   // identificador do operador/admin
  senha: string;     // verificada contra criarHashSenha
  csrfToken: string; // exigido pelo middleware exigirCsrf
}
```

##### Response (hipotético)

* **Sucesso:** estabelecimento de cookie de sessão + redirecionamento ou JSON de confirmação — formato exato não confirmado no código.
* **Falha:** formato de erro não confirmado (ver seção 6).

#### `POST /logout` — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Purpose:** Invalidar a sessão corrente (remoção do registro de sessão no SQLite).
* **Auth requerida:** Sim — sessão ativa + token CSRF.

#### `GET /admin/*` — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Purpose:** Dashboard administrativo e operações de gestão (detalhes não determináveis sem inspeção de `auth-http.ts`).
* **Auth requerida:** Sim — `exigirPermissao` com papel `admin` (rotas de operador podem existir sob outro prefixo; não confirmado).

### 4.3 Endpoints propostos (não implementados)

#### `GET /healthz` — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

Proposto no SAD (NFR-O03) e **explicitamente marcado como não implementado**.

* **Purpose:** Health-check para monitoramento externo e restart policies (systemd/docker).
* **Auth requerida:** Não.

##### Response — 200 OK — Schema proposto

```typescript
interface HealthResponse {
  status: "ok" | "degraded";
  checks: {
    sqlite: boolean;   // SELECT 1 executado com sucesso
    smtp: boolean;     // EHLO ao servidor SMTP (nodemailer)
    playwright?: boolean; // inicialização de browser (check pesado, opcional)
  };
}
```

#### `GET /metrics` — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

Proposto no SAD (NFR-O01) para exposição de métricas (latência SQLite p50/p95, duração de extração PDF/Word, taxa de sucesso de scraping, fila de consolidação). **Não implementado** — nenhuma biblioteca de métricas consta nas dependências reais.

## 5. Data Models

**Nenhuma tabela foi detectada automaticamente no schema.** O SAD indica que a estrutura do banco é criada de forma ad-hoc por scripts (`seed`, `importar-legado`) e pelo código de `autenticacao.ts`, sem arquivo de schema versionado.

Entidades **inferidas do uso no código** (conforme SAD, seção 5) — todas [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]:

```typescript
// NÃO confirmado por DDL — inferido do SAD
interface Usuario {
  id: number;
  usuario: string;
  hashSenha: string;   // produzido por criarHashSenha
  papel: "admin" | "operador";
}

interface Sessao {
  token: string;       // hashToken
  usuarioId: number;
  expiraEm: string;    // ISO 8601
}

interface Cct {
  // campos não determináveis — parser validado por validarExtracaoCct (zod)
  // fingerprint via fingerprintDocumentos garante idempotência
}
```

**O que falta verificar:** DDL real das tabelas (usuários, sessões, tokens, CCTs, aditivos, fingerprints, cache CNPJ, locks de consolidação) via inspeção dos scripts `seed`/`importar-legado` e de `autenticacao.ts`. Os artefatos `db-domain-model` e `db-schema-spec` estão marcados como "a criar" no SAD.

## 6. Error Handling Standard

**Nenhum envelope de erro padronizado foi detectado no código** (rotas não localizadas; o projeto não usa Express, portanto não se pode presumir `res.status(...).json({ error: ... })`). O tratamento de requisições ocorre nas funções `tratar` e `validarRequisicao` de `auth-http.ts`, cujo formato de resposta de erro não foi extraído automaticamente.

Formato **proposto** — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Mensagem legível para humanos",
    "details": []
  }
}
```

| Código HTTP | Código Interno (proposto) | Descrição | Ação Recomendada |
| :--- | :--- | :--- | :--- |
| 400 | `VALIDATION_ERROR` | Payload inválido (falha em `validarRequisicao`/zod) | Corrigir campos indicados |
| 401 | `UNAUTHENTICATED` | Sessão ausente/expirada | Reautenticar via `/login` |
| 403 | `FORBIDDEN` | `exigirPermissao` negou acesso ou `exigirCsrf` falhou | Verificar papel/CSRF token |
| 404 | `NOT_FOUND` | Recurso inexistente | Verificar identificador |
| 500 | `INTERNAL_ERROR` | Erro inesperado (ex: lock SQLite, falha de scraping) | Retry / verificar logs |

**O que falta verificar:** os códigos e formatos reais emitidos por `tratar`/`validarRequisicao` em `src/auth-http.ts`.

## 7. Changelog da API

| Versão | Data | Mudança | Breaking? |
| :--- | :--- | :--- | :--- |
| — | — | Nenhuma versão formal da API registrada; interface HTTP interna sem versionamento | — |