# UI Style Guide — MTE Mediador Monitor Unificado

> **Versão:** 1.0 · **Owner:** [Design/Frontend Lead — a definir] · **Status:** Draft
> **Depende de:** design-tokens.md, component-library.md, accessibility-guidelines.md
> **Fonte de implementação:** `web/auth-ui.css` (variáveis CSS em `:root`, linha 2) e `web/clientes-ui.css`. Não há framework de UI, biblioteca de componentes, `tailwind.config` nem ferramenta de design referenciada no repositório.

## 1. Overview & Princípios de Design

O MTE Mediador Monitor Unificado é uma aplicação web server-side monolítica (Node.js + TypeScript) cujas telas — autenticação (`web/auth-ui.css`) e clientes (`web/clientes-ui.css`) — são HTML servido pelo backend com CSS ad hoc. A identidade visual atual é **neutra e minimalista por construção**: apenas 4 tokens de cor existem (`--bg`, `--ink`, `--muted`, `--line`), todos em tons de cinza, sem cor de destaque.

Princípios norteadores (derivados do que o código efetivamente expressa):

1. **Clareza sobre densidade** — os fluxos críticos (login, recuperação de senha, consulta de clientes/CCTs) devem ser legíveis e diretos; a paleta neutra existente reforça isso.
2. **O código é a fonte da verdade** — não há Figma nem `tokens.json`; todo valor visual deve existir como variável CSS em `:root` antes de ser usado (ver design-tokens.md, seção 7).
3. **Nenhum valor hardcoded fora dos tokens** — lacunas de tokens (semânticos, `--accent`, tipografia) são bloqueantes para novos padrões visuais, não contornáveis com valores soltos.
4. **Acessibilidade como restrição de design** — WCAG 2.2 AA e a Lei Brasileira de Inclusão nº 13.146/2015 condicionam todas as decisões de cor e foco (ver accessibility-guidelines.md).

## 2. Voz Visual

* **Personalidade da marca:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — com base na paleta neutra real (cinzas `#f1f1ef` a `#18181b`) e na natureza operacional do produto (monitoramento de CCTs, auditoria), a personalidade inferida é: **técnica, sóbria, confiável, sem ornamento**. Não há diretriz de marca formalizada no repositório.
* **Referências visuais (moodboard):** **inexistente** — nenhum link de ferramenta de design ou moodboard foi encontrado no repositório. Item em aberto para o Design Lead.
* **O que evitar:**
  * Introduzir cores fora dos tokens declarados (hoje só existem 4; qualquer nova cor exige token novo em `:root` + registro em design-tokens.md).
  * Transmitir estado apenas por cor de borda — `--line` (#dedee3) tem contraste ≈ 1.3:1 sobre `--bg` e falha como indicador (accessibility-guidelines.md, seção 3).
  * Gradientes, sombras decorativas e animações — nenhum token de sombra ou motion existe; introduzi-los sem tokenização viola o princípio 3.
  * Remover o outline padrão do navegador sem substituto (proibido até existir token de foco — accessibility-guidelines.md, seção 4).

## 3. Layout & Grid

* **Sistema de grid:** **não declarado no código.** Nenhum token de espaçamento, container ou grid foi detectado pela varredura. [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — recomenda-se adotar múltiplos de 4px como convenção futura e um container centralizado de largura máxima para as telas de formulário, mas **nada disso está estabelecido no código atual**.
* **Densidade de informação:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — telas de autenticação (login, recuperação) devem ser espaçadas e de coluna única; a tela de clientes/auditoria (tabela) tende a densidade maior. Premissa baseada nos User Flows, não em código.
* **Padrões de página:**

| Tipo de Página | Estrutura | Exemplo |
| :--- | :--- | :--- |
| Lista/Tabela | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Título (`<h1>`) + tabela semântica com `<th scope="col">`, linhas separadas por `--line`, estado vazio em `--muted` | Tela de clientes (`web/clientes-ui.css`) — elemento inferido "ClientesTable / AuditPanel" em component-library.md |
| Detalhe/Formulário | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Coluna única centrada sobre `--bg`, campos com `<label>` associado, erro via `role="alert"` | Telas de login e recuperação de senha (`web/auth-ui.css`) — elementos inferidos "LoginForm" / "RecoveryForm" |
| Dashboard | **Não existe no produto** — nenhuma tela de dashboard foi detectada; não especificar padrão | — |

## 4. Uso de Cor

Tokens reais (fonte: `web/auth-ui.css:2`, escopo `:root`):

| Token | Valor | Uso obrigatório |
| :--- | :--- | :--- |
| `--bg` | `#f1f1ef` | Fundo principal de todas as páginas |
| `--ink` | `#18181b` | Texto principal, títulos, labels |
| `--muted` | `#62626b` | Texto secundário, placeholders, estados vazios, texto desabilitado |
| `--line` | `#dedee3` | Bordas e divisores **puramente decorativos** |

* **Hierarquia visual via cor:** com os tokens atuais, a hierarquia é construída apenas por contraste tipográfico (`--ink` vs. `--muted`) e por divisores (`--line`). **Não existe cor de ação** — `--accent` não está declarado; botões primários e links não têm cor dedicada. Esta é uma lacuna crítica (design-tokens.md, seção 2.1): até que `--accent` exista, ações primárias devem se diferenciar por peso/borda, nunca por cor inventada.
* **Regras de contraste mínimo:** ver accessibility-guidelines.md, seção 3. Resumo calculado a partir dos tokens reais:
  * `--ink` sobre `--bg`: ≈ 15.9:1 ✅ (texto e títulos)
  * `--muted` sobre `--bg`: ≈ 5.6:1 ✅ (texto secundário)
  * `--line` sobre `--bg`: ≈ 1.3:1 ❌ — proibido como único indicador de estado ou limite de componente interativo
* **Uso de cor semântica (sucesso/erro/aviso):** **bloqueado** — não existem tokens `--success`, `--warning`, `--danger` ou `--info` no código. Até que sejam criados e auditados (contraste ≥ 4.5:1 sobre `--bg`, registrado na tabela de accessibility-guidelines.md no mesmo PR), mensagens de erro e sucesso devem ser transmitidas por **texto explícito + `role="alert"`**, nunca por cor.

## 5. Tipografia em Contexto

**Não há tokens tipográficos declarados no código** — nenhuma variável `--font-*`, nenhum `@font-face`, nenhuma escala de tamanhos (design-tokens.md, seção 3). As telas usam a stack padrão do navegador. A tabela abaixo registra o que é verificável e o que está pendente:

| Elemento | Token de Tipografia | Cor | Peso |
| :--- | :--- | :--- | :--- |
| H1 (título de página) | [VERIFICAR NO CÓDIGO] — sem token; padrão do navegador | `--ink` (#18181b) | [VERIFICAR NO CÓDIGO] |
| H2 (seção) | [VERIFICAR NO CÓDIGO] — sem token | `--ink` (#18181b) | [VERIFICAR NO CÓDIGO] |
| Corpo | [VERIFICAR NO CÓDIGO] — sem token | `--ink` (#18181b) | [VERIFICAR NO CÓDIGO] |
| Label/Caption | [VERIFICAR NO CÓDIGO] — sem token | `--muted` (#62626b) para texto auxiliar; `--ink` para labels de campo | [VERIFICAR NO CÓDIGO] |

Regras independentes de token: um único `<h1>` por página, hierarquia sem pular níveis, headings nunca usados apenas por aparência (accessibility-guidelines.md, seção 5). A definição da escala tipográfica é item em aberto do Design/Frontend Lead.

## 6. Padrões de Conteúdo (UX Writing)

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — não há guia de redação no repositório; as premissas abaixo derivam das mensagens reais citadas nos artefatos-fonte (ex.: "Sua sessão expirou", "Token inválido", "Usuário não encontrado", "documento sendo consolidado por outro usuário") e do idioma do produto (português brasileiro).

* **Tom de voz nos textos de UI:** direto, em português brasileiro, sem jargão técnico desnecessário; frases curtas orientadas à ação do usuário.
* **Padrões de mensagens de erro:** estrutura obrigatória **o que aconteceu + como resolver** (ex.: "Sua sessão expirou. Faça login novamente."). Erros devem ser associados ao campo via `aria-describedby` + `aria-invalid="true"` e anunciados com `role="alert"` (accessibility-guidelines.md, seção 6). Nunca depender de cor — não há token `--danger`.
* **Padrões de call-to-action:** verbo no imperativo ("Entrar", "Redefinir senha", "Validar"), sem reticências e sem rótulos genéricos como "OK".
* **Formatação de números/datas/moeda:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — por se tratar de produto brasileiro com dados de CNPJ e CCTs, presume-se locale `pt-BR` (datas `dd/mm/aaaa`, CNPJ formatado `00.000.000/0000-00`), mas **não há código de formatação confirmado** na varredura; verificar implementação real antes de formalizar.

## 7. Iconografia

* **Biblioteca de ícones:** **nenhuma** — a varredura não detectou nenhuma dependência de ícones em `package.json` (component-library.md, seção 1). Não usar ícones até que uma biblioteca seja adotada formalmente.
* **Tamanhos padrão:** não aplicável — pendente da adoção de biblioteca.
* **Regras de uso (obrigatórias quando ícones forem introduzidos):** ícone sozinho requer `aria-label` descritivo em português (ex.: `aria-label="Excluir cliente"`); ícone decorativo usa `aria-hidden="true"`; alvos de toque mínimos de 24×24 CSS px (WCAG 2.5.8).

## 8. Imagens & Mídia

* **Proporções aceitas:** **não definidas** — nenhum uso de imagem foi detectado no código. Item em aberto.
* **Tratamento de placeholder/loading:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — não há skeletons nem spinners implementados; para os estados de loading inferidos (consolidação de documentos, validação de credenciais), recomenda-se indicador textual + bloqueio de interação, anunciado via `aria-live="polite"`. Nenhuma implementação existe hoje.
* **Empty states — padrão visual:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — mensagem em `--muted` (#62626b) descrevendo o estado vazio + CTA textual quando aplicável (ex.: lista de clientes vazia). Sem ilustrações — não há assets de imagem no repositório.

## 9. Padrões de Layout Responsivo

* **Comportamento mobile-first vs desktop-first:** **não verificável** — não há breakpoints tokenizados nem media queries reportadas pela varredura (design-tokens.md, seção 5). Se existirem media queries ad hoc em `web/auth-ui.css`/`web/clientes-ui.css`, precisam de inspeção manual. [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — recomenda-se mobile-first como convenção futura, sem valor estabelecido hoje.
* **O que colapsa/esconde em telas pequenas:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — para a tabela de clientes, presume-se necessidade de rolagem horizontal ou priorização de colunas em telas estreitas; nada disso está implementado/confirmado. Proibido esconder conteúdo essencial sem alternativa acessível.

## 10. Checklist de Revisão Visual

* [ ] Usa apenas tokens do design-tokens.md — hoje limitados a `--bg`, `--ink`, `--muted`, `--line` (`web/auth-ui.css:2`); nenhum valor hardcoded
* [ ] Componentes usados existem no component-library.md — **atenção:** nenhum componente tem status Confirmado; todos são [INFERIDO POR IA] e exigem validação antes do uso como referência
* [ ] Contraste de texto validado contra a tabela de accessibility-guidelines.md (seção 3); novos tokens de cor registrados no mesmo PR
* [ ] Estados de hover/focus/disabled definidos — **bloqueado para hover/focus** até existirem `--accent` e token de foco; outline padrão do navegador jamais removido sem substituto
* [ ] Erros transmitidos por texto + `role="alert"`, nunca apenas por cor (ausência de `--danger`)
* [ ] Comportamento responsivo testado — **pendente:** breakpoints não definidos; verificar media queries ad hoc nos arquivos `web/`
* [ ] Relação `auth-ui.css` ↔ `clientes-ui.css` verificada (reuso de variáveis vs. valores hardcoded) — lacuna aberta herdada de design-tokens.md

## 11. Referências

* `web/auth-ui.css` — linha 2: única fonte de tokens (`--bg`, `--ink`, `--muted`, `--line`)
* `web/clientes-ui.css` — estilos da tela de clientes; sem variáveis próprias detectadas (reuso a verificar)
* design-tokens.md — fonte única da verdade dos tokens e registro de lacunas
* component-library.md — inventário (nenhum componente confirmado; todos inferidos)
* accessibility-guidelines.md — contrastes calculados, regras de foco, formulários e débitos de acessibilidade
* **Figma/design tool:** inexistente — nenhum link ou arquivo de design no repositório
* **Style guide route no código:** inexistente — não há rota de catálogo visual nem Storybook