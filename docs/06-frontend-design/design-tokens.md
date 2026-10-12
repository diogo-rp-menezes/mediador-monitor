# Design Tokens — MTE Mediador Monitor Unificado

> **Documento histórico.** A referência vigente é [UI_UX_OFICIAL.md](UI_UX_OFICIAL.md). Este inventário descreve a UI legada e não deve orientar novas implementações quando houver divergência.

> **Versão:** 1.0 · **Owner:** [Design/Frontend Lead — a definir] · **Status:** Draft
> **Fonte de implementação:** `web/auth-ui.css` (variáveis CSS em `:root`, linha 2) e `web/clientes-ui.css`. Não há `tailwind.config`, objeto de tema TS/JS nem variáveis de pré-processador no repositório.

## 1. Overview

Este documento é a fonte única da verdade para os valores visuais primitivos das interfaces web do produto (telas de autenticação e de clientes, servidas pela aplicação server-side monolítica). A varredura determinística do workspace encontrou **apenas 4 variáveis CSS declaradas**, todas em `web/auth-ui.css:2`. Nenhum componente deve introduzir valores hardcoded fora destes tokens; categorias sem token declarado estão explicitamente marcadas como ausentes, e qualquer valor inferido carrega o rótulo `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`.

## 2. Color Tokens

### 2.1 Cores Base (Primitivas)

| Token | Valor (Hex) | Fonte | Uso Pretendido |
| :--- | :--- | :--- | :--- |
| `--bg` | `#f1f1ef` | `web/auth-ui.css:2` (`:root`) | Fundo principal da aplicação |
| `--ink` | `#18181b` | `web/auth-ui.css:2` (`:root`) | Texto principal / cor de tinta |
| `--muted` | `#62626b` | `web/auth-ui.css:2` (`:root`) | Texto secundário, placeholders |
| `--line` | `#dedee3` | `web/auth-ui.css:2` (`:root`) | Bordas e divisores |

> **Tokens do template sem correspondente no código:** `--panel` e `--accent` **não estão declarados** em nenhum arquivo de estilo do repositório. Não há token de fundo de cards/painéis nem de cor de ação primária/links/foco — isso é uma lacuna real a ser endereçada antes de expandir a UI.

### 2.2 Cores Semânticas

**Não há tokens semânticos declarados no código.** Nenhuma variável `--success`, `--warning`, `--danger` ou `--info` foi encontrada em `web/auth-ui.css`, `web/clientes-ui.css` ou qualquer outro arquivo do workspace. Estados de erro (ex.: falhas de autenticação, validação de CNPJ) e de sucesso atualmente não possuem cor dedicada — lacuna a verificar com o responsável pela UI.

### 2.3 Modos (Light/Dark)

**Não há suporte a dark mode declarado no código.** Existe apenas um conjunto de variáveis em `:root`, sem variante `.dark`, media query `prefers-color-scheme` ou toggle de tema detectado.

| Token | Light Mode (único) | Dark Mode |
| :--- | :--- | :--- |
| `--bg` | `#f1f1ef` | Não implementado |
| `--ink` | `#18181b` | Não implementado |
| `--muted` | `#62626b` | Não implementado |
| `--line` | `#dedee3` | Não implementado |

* **Estratégia de troca de tema:** inexistente no código — tema claro único.

## 3. Typography

### 3.1 Font Families

**Não há tokens de família tipográfica declarados no código.** Nenhuma variável `--font-*`, nenhuma extensão de `fontFamily` em config Tailwind (o projeto não possui `tailwind.config`) e nenhum `@font-face` ou `font-family` customizado foi reportado pela varredura. As telas dependem da stack padrão do navegador — **requer verificação** se isso é intencional.

### 3.2 Type Scale

**Não há escala tipográfica declarada no código.** Nenhum token de tamanho/line-height/peso foi encontrado nos arquivos de estilo analisados. Não é possível preencher a tabela de `text-xs` a `text-xl` sem inventar valores — item em aberto para o Design/Frontend Lead.

## 4. Spacing & Sizing

### 4.1 Escala de Espaçamento

**Não há escala de espaçamento declarada como token no código.** Nenhuma variável CSS de espaçamento, nenhuma extensão de `spacing` em config e nenhum pré-processador foram detectados.

* **Grid base:** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` — na ausência de tokens, recomenda-se adotar múltiplos de 4px como convenção futura, mas isso **não** está estabelecido no código atual.

### 4.2 Border Radius

**Não há tokens de border radius declarados no código.** Nenhuma variável `--radius-*` ou configuração equivalente foi encontrada.

### 4.3 Shadows / Elevation

**Não há tokens de sombra/elevação declarados no código.** Nenhuma variável `--shadow-*` ou `box-shadow` tokenizada foi encontrada nos arquivos analisados.

## 5. Breakpoints

**Não há breakpoints customizados declarados no código.** Nenhuma media query tokenizada, nenhuma config de `screens` e nenhuma variável de breakpoint foram detectadas. A responsividade das telas `web/auth-ui.css` e `web/clientes-ui.css`, se existir, está em media queries ad hoc não tokenizadas — **requer verificação manual** dos arquivos para confirmar.

## 6. Motion Tokens

**Não há tokens de movimento declarados no código.** Nenhuma variável de duração (`--duration-*`), easing ou `transition`/`animation` tokenizada foi encontrada. `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` — se micro-interações forem necessárias (ex.: feedback nos fluxos de autenticação), sugere-se definir ao menos `duration-fast` (~150ms) e `duration-base` (~250ms), mas nenhum valor existe hoje no repositório.

## 7. Governança dos Tokens

* **Processo de adição/alteração de token:** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` — não há processo formalizado no repositório. Recomendação: qualquer novo token deve ser adicionado como variável CSS em `:root` (seguindo o padrão existente em `web/auth-ui.css:2`), via PR com revisão de engenharia, e registrado neste documento com fonte `arquivo:linha`.
* **Ferramenta de sincronização:** nenhuma detectada (sem Style Dictionary, sem plugin de tokens, sem arquivo `tokens.json`).
* **Como evitar drift entre design e código:** hoje o código **é** a única fonte — não há arquivo Figma ou design tool referenciado no repositório. O drift imediato a resolver é entre `web/auth-ui.css` (que declara as 4 variáveis) e `web/clientes-ui.css` (que não declara variáveis próprias segundo a varredura): verificar se `clientes-ui.css` consome as variáveis de `auth-ui.css` ou se usa valores hardcoded.

## 8. Referências

* `web/auth-ui.css` — linha 2: declaração das 4 variáveis CSS em `:root` (`--bg`, `--ink`, `--muted`, `--line`) — **única fonte de tokens existente**.
* `web/clientes-ui.css` — analisado; nenhuma variável CSS própria detectada.
* Não há `tailwind.config`, `tokens.json`, tema TS/JS ou link de ferramenta de design no repositório.

---

### Resumo de lacunas (itens em aberto)

1. Ausência de tokens semânticos (`--success`, `--warning`, `--danger`, `--info`) — crítico para telas de erro de autenticação e validação.
2. Ausência de `--panel` e `--accent` — sem cor de ação primária definida.
3. Tipografia, espaçamento, radius, sombras, breakpoints e motion **totalmente não tokenizados**.
4. Sem dark mode e sem estratégia de tema.
5. Relação entre `auth-ui.css` e `clientes-ui.css` quanto ao reuso das variáveis precisa de verificação manual.
