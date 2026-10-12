# Component Library / Inventory — MTE Mediador Monitor Unificado

> **Documento histórico.** A referência vigente é [UI_UX_OFICIAL.md](UI_UX_OFICIAL.md). Este inventário descreve a UI legada e não deve orientar novas implementações quando houver divergência.

> **Versão:** 1.0 · **Owner:** [Frontend Lead — a definir] · **Status:** Draft
> **Baseado em:** Nenhuma biblioteca de componentes — a varredura determinística do workspace **não detectou nenhuma biblioteca de UI/ícones externa** (sem React, sem shadcn/ui, sem Radix, sem Material) e **nenhum componente React/UI explicitamente identificado** na base de código.
> **Depende de:** [design-tokens.md] — única fonte de tokens: `web/auth-ui.css:2` (`--bg`, `--ink`, `--muted`, `--line`).

## 1. Overview

Este projeto **não possui uma biblioteca de componentes implementada**. A varredura determinística do workspace (52 arquivos de código, todos `.ts`/`.mjs`/`.js`) encontrou:

- **Nenhum componente React** ou equivalente de framework de UI nos diretórios de código (`src/`, `web/`, `test/`).
- **Nenhuma dependência de UI** em `package.json` — as dependências reais são `better-sqlite3`, `dotenv`, `html-entities`, `nodemailer`, `pdf-parse`, `playwright`, `word-extractor`, `zod` e `node-cron`.
- **Três arquivos em `web/`**, dos quais dois são folhas de estilo (`web/auth-ui.css` e `web/clientes-ui.css`), que estilizam telas servidas pela aplicação server-side monolítica (telas de autenticação e de clientes).

Ou seja: a "camada de UI" atual consiste em **HTML servido pelo backend com CSS ad hoc**, sem abstração de componentes reutilizáveis. Este documento, portanto, registra (a) o que existe de fato (elementos de UI implícitos nas telas de autenticação e clientes, inferidos dos User Flows e dos arquivos CSS) e (b) os gaps que precisam ser endereçados antes que um inventário de componentes real possa ser estabelecido.

## 2. Convenções Gerais

* **Padrão de composição:** **Não implementado.** Não há CVA (class-variance-authority), slots, compound components nem qualquer sistema de variantes no código — a dependência `class-variance-authority` **não existe** em `package.json`. A especificação de variantes/estados na Seção 4 é, portanto, inteiramente `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`, como proposta de alvo, não como descrição do código atual.
* **Padrão de nomenclatura:** **Não implementado.** Não há arquivos de componentes para observar convenção. Os artefatos de UI existentes seguem o padrão de nomes de arquivo por tela: `auth-ui.css`, `clientes-ui.css`.
* **Local no repositório:** os únicos artefatos visuais vivem em `web/` (3 arquivos). Não existe diretório `components/`.

## 3. Inventário de Componentes

### 3.1 Componentes confirmados no código

**Nenhum componente de UI foi confirmado pela varredura.** Não há linha de código de componente para referenciar com status "Confirmado".

### 3.2 Elementos de UI implícitos (inferidos dos User Flows e dos arquivos CSS)

Todos os itens abaixo são **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** — deduzidos dos fluxos documentados (login, recuperação de senha, painel de clientes/auditoria) e da existência de `web/auth-ui.css` e `web/clientes-ui.css`. Nenhum possui arquivo de componente na base de código.

| Componente | Categoria | Variantes | Status | Localização |
| :--- | :--- | :--- | :--- | :--- |
| LoginForm | Formulário | default, error | [INFERIDO POR IA] Não implementado como componente | Estilos prováveis em `web/auth-ui.css` |
| RecoveryForm (solicitar/redefinir senha) | Formulário | default, error, success | [INFERIDO POR IA] Não implementado como componente | Estilos prováveis em `web/auth-ui.css` |
| TextInput (e-mail, senha, CNPJ) | Formulário | default, error, disabled | [INFERIDO POR IA] Não implementado como componente | Sem arquivo dedicado |
| Button (ações de submit) | Ação | primary | [INFERIDO POR IA] Não implementado como componente | Sem arquivo dedicado |
| Alert/ErrorMessage | Feedback | error | [INFERIDO POR IA] Não implementado como componente | Sem arquivo dedicado |
| ClientesTable / AuditPanel | Dados | default, empty, loading | [INFERIDO POR IA] Não implementado como componente | Estilos prováveis em `web/clientes-ui.css` |
| SessionGuard (redirecionamento de sessão expirada) | Navegação | — | [INFERIDO POR IA] Lógica server-side (`lerCookieSessao`), sem componente visual | `src/auth-http.ts` (backend) |

## 4. Especificação por Componente

> **Aviso:** como não há componentes implementados, as especificações abaixo são **propostas de alvo** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`, derivadas dos User Flows e restritas aos 4 tokens reais existentes. Não há variantes CVA no código — a notação de variantes abaixo é conceitual.

### 4.1 Button [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Propósito:** ação primária dos formulários de autenticação (Flow 1: login, solicitar recuperação, definir nova senha) e das ações de auditoria (Flow 3: validar, consolidar, renderizar).
* **Anatomia:** label (texto). Sem ícones — nenhuma biblioteca de ícones existe no projeto.
* **Props/API (proposta):**

| Prop | Tipo | Default | Descrição |
| :--- | :--- | :--- | :--- |
| `variant` | `"primary"` | `"primary"` | Única variante proposta — não há token `--accent` para sustentar variantes adicionais |
| `disabled` | `boolean` | `false` | Bloqueio de ação (ex.: consolidação reservada por outro usuário — `reservarConsolidacao`) |
| `loading` | `boolean` | `false` | Feedback durante validação de credenciais e envio de e-mail |

* **Estados visuais (cobertura dos 6 estados primários):**

| Estado | Comportamento Visual |
| :--- | :--- |
| Default | Texto em `--ink` sobre fundo `--bg`, borda `--line` (única combinação possível com os tokens existentes) |
| Hover | [INFERIDO POR IA] Não especificável — não há token de cor de destaque; requer criação de `--accent` |
| Focus | [INFERIDO POR IA] Não especificável — não há token de foco; requer definição (lacuna crítica de acessibilidade) |
| Disabled | Texto em `--muted`, cursor bloqueado |
| Loading | Label substituído por indicador de progresso; interação bloqueada |
| Error | Não se aplica ao botão isoladamente — erro exibido via Alert/ErrorMessage |

* **Tokens consumidos:** `--ink`, `--bg`, `--muted`, `--line` (todos de `web/auth-ui.css:2`). **Ausentes e necessários:** `--accent`, token de foco.
* **Composição/Slots:** `children` como label. Sem slot de ícone (sem biblioteca de ícones).
* **Exemplo de uso:** não é possível fornecer snippet real — não há framework de componentes no projeto. A marcação atual é HTML estático servido pelo backend, estilizado por `web/auth-ui.css`.

### 4.2 TextInput [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Propósito:** campos de e-mail e senha (Flow 1) e CNPJ (telas de clientes).
* **Anatomia:** label + campo + mensagem de erro.
* **Props/API (proposta):**

| Prop | Tipo | Default | Descrição |
| :--- | :--- | :--- | :--- |
| `type` | `"text" \| "email" \| "password"` | `"text"` | Tipo do campo |
| `error` | `string \| null` | `null` | Mensagem de validação (ex.: "Token inválido", "Usuário não encontrado") |
| `disabled` | `boolean` | `false` | Campo inativo |

* **Estados visuais:**

| Estado | Comportamento Visual |
| :--- | :--- |
| Default | Borda `--line`, texto `--ink`, fundo `--bg` |
| Hover | [INFERIDO POR IA] Sem token de destaque disponível |
| Focus | [INFERIDO POR IA] Sem token de foco — lacuna de acessibilidade a resolver |
| Disabled | Texto/borda em `--muted` |
| Loading | Não se aplica |
| Error | [INFERIDO POR IA] **Não especificável** — não existe token semântico `--danger` no código (lacuna crítica registrada em design-tokens.md) |

* **Tokens consumidos:** `--ink`, `--muted`, `--line`, `--bg`. **Ausente e necessário:** `--danger` (erro), token de foco.

### 4.3 Alert / ErrorMessage [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Propósito:** exibir mensagens dos Edge Cases documentados: "Sua sessão expirou", "Token inválido", "Falha ao processar arquivo", "documento sendo consolidado por outro usuário".
* **Anatomia:** texto de mensagem; opcionalmente título.
* **Estados visuais:** Default (texto `--ink`), Error (**bloqueado**: sem token `--danger`), Disabled/Loading/Hover/Focus não se aplicam.
* **Tokens consumidos:** `--ink`, `--muted`. **Ausente e necessário:** `--danger`, `--success`, `--warning`, `--info` — nenhum token semântico existe no código.

### 4.4 ClientesTable / AuditPanel [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Propósito:** listagem de clientes/documentos para auditoria (Flow 3), com estados Empty (lista vazia) e Loading (processamento de consolidação).
* **Estados visuais:** Default (linhas separadas por `--line`), Loading (indicador durante consolidação), Empty (mensagem em `--muted`), Disabled (ações bloqueadas por `reservarConsolidacao`), Hover/Focus/Error não especificáveis com os tokens atuais.
* **Tokens consumidos:** `--line`, `--ink`, `--muted`, `--bg`.
* **Observação:** a varredura indica que `web/clientes-ui.css` **não declara variáveis próprias** — é preciso verificar manualmente se ele consome as variáveis de `auth-ui.css` ou usa valores hardcoded (lacuna herdada de design-tokens.md).

## 5. Componentes em Depreciação

| Componente | Motivo | Substituído por | Prazo de Remoção |
| :--- | :--- | :--- | :--- |
| — | Nenhum componente existe para depreciar | — | — |

## 6. Gaps Conhecidos

1. **Inexistência total de biblioteca de componentes** — não há framework de UI, diretório `components/` nem abstração reutilizável; toda a Seção 3.2 e 4 é inferência a validar.
2. **Todos os componentes listados são [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** — nenhum possui arquivo confirmado na base de código.
3. **Impossibilidade de especificar Hover, Focus e Error** com os tokens atuais: faltam `--accent`/token de foco e todos os tokens semânticos (`--danger`, `--success`, `--warning`, `--info`) — ver design-tokens.md, seção de lacunas.
4. **Sem variantes CVA** — a dependência `class-variance-authority` não existe no projeto; a cobertura de variantes/estados acima é proposta conceitual.
5. **Relação `auth-ui.css` ↔ `clientes-ui.css` não verificada** — reuso de variáveis vs. valores hardcoded requer inspeção manual.
6. **Sem catálogo visual/Storybook** e sem biblioteca de ícones.
7. **Acessibilidade não endereçada** — sem token de foco visível e sem convenção de labels/ordem de tabulação confirmada no código.

## 7. Referências

* `web/auth-ui.css` — linha 2: única fonte de tokens (`--bg`, `--ink`, `--muted`, `--line`).
* `web/clientes-ui.css` — estilos da tela de clientes; sem variáveis próprias detectadas.
* `design-tokens.md` — fonte única da verdade dos tokens e registro das lacunas visuais.
* `user-flows.md` — origem dos fluxos (autenticação, monitoramento, auditoria) que motivam os componentes inferidos.
* Não há Storybook, catálogo visual nem biblioteca base (shadcn/ui, Radix, Material) no repositório.
