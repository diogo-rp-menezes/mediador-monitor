# Accessibility Guidelines — MTE Mediador Monitor Unificado

> **Versão:** 1.0 · **Owner:** [Frontend/QA Lead — a definir] · **Status:** Draft
> **Nível-alvo:** WCAG 2.2 Nível AA · **Depende de:** design-tokens.md, nfr.md

## 1. Overview

O MTE Mediador Monitor Unificado é uma aplicação web server-side monolítica (Node.js + TypeScript, sem framework de UI dedicado — estilos em `web/auth-ui.css` e `web/clientes-ui.css`) que atende fluxos de autenticação, gestão de clientes e monitoramento/consolidação de CCTs. O compromisso de acessibilidade deste produto é triplo:

* **Legal:** aplicação da Lei Brasileira de Inclusão (ver seção 2), que torna a acessibilidade digital obrigatória para serviços disponibilizados ao público.
* **Ético/operacional:** os usuários do sistema (mediadores, administradores, operadores de cadastro) podem incluir pessoas com deficiência visual, motora ou cognitiva; fluxos críticos como login e consulta de CCT não podem depender exclusivamente de mouse ou de percepção de cor.
* **Qualidade:** as diretrizes aqui se conectam aos requisitos de usabilidade do NFR (NFR-U01, NFR-U02) e às lacunas reais de tokens visuais já documentadas em design-tokens.md.

## 2. Padrão de Conformidade

* **Norma de referência:** **WCAG 2.2, Nível AA**. Inclui os novos critérios da 2.2 relevantes ao produto: 2.4.11 (Focus Not Obscured), 2.5.7 (Dragging Movements), 2.5.8 (Target Size Minimum — alvos de pelo menos 24×24 CSS px), 3.2.6 (Consistent Help) e 3.3.7/3.3.8 (Redundant Entry / Accessible Authentication — particularmente relevante para a tela de login em `web/auth-ui.css`).
* **Obrigatoriedade legal aplicável:**
  * **Lei Brasileira de Inclusão nº 13.146/2015** (Estatuto da Pessoa com Deficiência), arts. 63 e 64 — acessibilidade obrigatória em sítios e aplicações web.
  * **Decreto nº 10.098/2019** — regulamenta a acessibilidade em sistemas e serviços de informação.
  * **LGPD (Lei nº 13.709/2018), Art. 9º** — transparência e acesso facilitado às informações sobre tratamento de dados pessoais, o que exige que avisos de privacidade e consentimentos sejam acessíveis (alinhado a NFR-C01).
* **Escopo:** toda a aplicação, com prioridade **Must** para os fluxos críticos: (1) autenticação/login (`auth-http.ts`, `web/auth-ui.css`), (2) cadastro e consulta de clientes (`web/clientes-ui.css`), (3) visualização de resultados de monitoramento de CCT. Fluxos exclusivamente CLI (`auth-cli.ts`, scripts `check`, `seed`) estão fora do escopo WCAG, mas devem seguir boas práticas de saída textual legível em terminal.

## 3. Contraste de Cor

Os valores abaixo foram **calculados a partir dos tokens reais** extraídos de `web/auth-ui.css:2` (única fonte de tokens existente, conforme design-tokens.md). Razões calculadas pela fórmula de luminância relativa da WCAG.

| Combinação | Contexto | Contraste Mínimo Exigido | Contraste Atual (calculado) | Status |
| :--- | :--- | :--- | :--- | :--- |
| `--ink` (#18181b) sobre `--bg` (#f1f1ef) | Corpo de texto | 4.5:1 | ≈ 15.9:1 | ✅ OK |
| `--ink` (#18181b) sobre `--bg` (#f1f1ef) | Títulos (texto grande) | 3:1 | ≈ 15.9:1 | ✅ OK |
| `--muted` (#62626b) sobre `--bg` (#f1f1ef) | Texto secundário, placeholders | 4.5:1 | ≈ 5.6:1 | ✅ OK |
| `--line` (#dedee3) sobre `--bg` (#f1f1ef) | Bordas e divisores | 3:1 (se identificarem componentes/estado) | ≈ 1.3:1 | ❌ Falha — aceitável apenas como divisor puramente decorativo |
| `--accent` sobre `--bg` | Links, botões primários, foco | 4.5:1 (texto) / 3:1 (UI) | — | ⏳ [Pendente] — token **não existe no código** (lacuna documentada em design-tokens.md); requer definição do token e auditoria automatizada pós-extração |
| `--danger` sobre `--bg` / `--panel` | Mensagens de erro de autenticação e validação de CNPJ | 4.5:1 | — | ⏳ [Pendente] — token semântico inexistente; [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] qualquer cor de erro futura deve ser validada contra `--bg` antes do merge |
| `--panel` (fundo de cards) | Superfícies secundárias | 3:1 contra `--bg` adjacente | — | ⏳ [Pendente] — token inexistente no código |

**Regras derivadas:**

1. Enquanto `--line` permanecer em #dedee3, **nenhuma informação de estado pode ser transmitida apenas por borda** (ex.: campo com erro destacado só pela cor da borda). Erros exigem texto + ícone.
2. Placeholders em `--muted` passam no contraste, mas **placeholder não substitui `<label>`** (ver seção 6).
3. Qualquer novo token de cor introduzido (especialmente `--accent` e os semânticos) deve ter sua razão de contraste calculada e registrada nesta tabela no mesmo PR, com fonte `arquivo:linha`.

## 4. Navegação por Teclado

* **Ordem de tabulação lógica garantida:** [Pendente de validação] — não há framework de UI impondo ordem; a ordem deve seguir o DOM natural das páginas servidas server-side. Proibido uso de `tabindex` positivo; `tabindex="0"` apenas para tornar elementos customizados focáveis, e `tabindex="-1"` para foco programático.
* **Foco visível em todo elemento interativo:** **lacuna crítica** — não existe token `--accent` nem estilo de focus ring definido no código (design-tokens.md, seção 2.1). Até que o token exista, a regra obrigatória é: **jamais remover o outline padrão do navegador** (`outline: none` é proibido sem substituto). Quando `--accent` for definido, o foco deve usar anel de 2px com contraste ≥ 3:1 contra o fundo adjacente (WCAG 2.4.11/2.4.13), ex.: `outline: 2px solid var(--accent); outline-offset: 2px;`.
* **Atalhos de teclado definidos:**

| Atalho | Ação | Escopo | Status |
| :--- | :--- | :--- | :--- |
| Tab / Shift+Tab | Navegar entre campos e controles | Global (formulários de auth e clientes) | Nativo do navegador — manter |
| Enter | Submeter formulário / ativar botão focado | Formulários | Nativo — manter |
| Space | Ativar botões e checkboxes focados | Formulários | Nativo — manter |
| Esc | Fechar modal/painel flutuante e retornar foco ao elemento que o abriu | Modais (quando existirem) | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — nenhum modal detectado no código atual; regra obrigatória para qualquer modal futuro |
| Cmd/Ctrl+K | Busca rápida / paleta de comandos | Global | [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — não implementado; sugerido apenas se houver busca de clientes/CCT na UI |

* **Trap de foco em modais:** nenhum modal foi detectado na varredura do código. Regra obrigatória para quando forem introduzidos: foco deve ser movido para dentro do modal ao abrir, ciclar apenas entre seus elementos (Tab no último elemento retorna ao primeiro), Esc fecha, e o foco retorna ao gatilho. Teste manual obrigatório: navegar o modal inteiro só com teclado e confirmar que o foco nunca "escapa" para o fundo da página.
* **Skip link:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] recomenda-se "Pular para o conteúdo principal" como primeiro elemento focável de cada página, apontando para `<main id="conteudo">`; não há evidência de implementação atual — verificar em `web/`.

## 5. Suporte a Screen Readers

* **HTML semântico obrigatório:**
  * Landmarks: exatamente um `<main>` por página; `<nav>` para navegação; `<aside>` para painéis complementares; `<header>`/`<footer>` onde aplicável. Proibido construir layout apenas com `<div>`.
  * Hierarquia de headings: um único `<h1>` por página (ex.: "Autenticação", "Clientes"), sem pular níveis (h1 → h2 → h3), e nunca usar heading apenas por aparência visual.
  * Tabelas de dados (ex.: listagem de clientes/CCTs) devem usar `<table>` com `<th scope="col">`, nunca grades de `<div>`.
* **Labels acessíveis:**

| Elemento | Regra |
| :--- | :--- |
| Ícone sozinho (sem texto visível) | Requer `aria-label` descritivo em português (ex.: `aria-label="Excluir cliente"`) |
| Imagem informativa | Requer `alt` descritivo |
| Imagem decorativa | `alt=""` ou `aria-hidden="true"` |
| Campo de formulário | `<label for="...">` associado obrigatoriamente (ver seção 6) |
| Botão de ação destrutiva | Texto ou `aria-label` que descreva a consequência |

* **Regiões dinâmicas (`aria-live`):** o sistema possui fluxos assíncronos relevantes (monitoramento via `node-cron`, extração de CCT em background, envio de e-mail via `nodemailer`). Quando esses status forem exibidos na UI:
  * Resultados de consulta e contadores de monitoramento: `aria-live="polite"`.
  * Falhas críticas (erro de autenticação, falha de coleta do `playwright`, erro de validação de CNPJ): `role="alert"` (equivale a `aria-live="assertive"`), com texto claro — nunca apenas cor (ver lacuna de tokens semânticos na seção 3).
  * [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — a implementação atual dessas regiões precisa ser verificada nos arquivos `web/`; a varredura não confirma nenhum `aria-live` existente.

## 6. Formulários Acessíveis

Aplicável diretamente às telas de autenticação (`auth-http.ts` / `web/auth-ui.css`) e de clientes (`web/clientes-ui.css`):

* **Associação label/input:** todo `<input>`, `<select>` e `<textarea>` deve ter `<label for="id">` explícito. Placeholder é complemento, nunca substituto.
* **Mensagens de erro:** cada erro de validação (ex.: senha incorreta, CNPJ inválido, falha de CSRF em `exigirCsrf`) deve:
  1. Ser associado ao campo via `aria-describedby="id-do-erro"`;
  2. Marcar o campo com `aria-invalid="true"`;
  3. Ser anunciado a screen readers via `role="alert"` ou resumo de erros no topo com foco programático após submit falho.
* **Validação:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] o projeto valida dados com `zod` no servidor; recomenda-se validação no submit (não inline a cada tecla, que gera ruído em screen readers), com re-exibição server-side dos erros associados aos campos. A estratégia exata precisa ser confirmada com o responsável pela UI.
* **Autenticação acessível (WCAG 3.3.8):** o login não deve exigir teste cognitivo (ex.: CAPTCHA de quebra-cabeça) sem alternativa; permitir colar senha (não bloquear paste) e suportar gerenciadores de senha (`autocomplete="current-password"` / `autocomplete="new-password"` no fluxo de `auth:redefinir`).

## 7. Motion & Preferências do Usuário

* **`prefers-reduced-motion`:** não há tokens de motion nem animações tokenizadas no código (design-tokens.md, seção 6). Regra obrigatória: qualquer transição/animação futura deve ser envolvida em `@media (prefers-reduced-motion: reduce) { ... }` desativando ou reduzindo o movimento. Status atual: ✅ conforme por ausência de animações — manter assim ou implementar a media query junto com o primeiro token de motion.
* **`prefers-color-scheme`:** **não suportado** — existe apenas tema claro único em `:root` (design-tokens.md, seção 2.3). Até que um dark mode seja projetado, a aplicação deve ignorar a preferência de tema do sistema (comportamento atual) — isso é aceitável para WCAG AA, desde que o tema único mantenha os contrastes da seção 3. Se dark mode for introduzido, todas as razões de contraste da seção 3 devem ser recalculadas para a variante escura.

## 8. Processo de Validação

* **Ferramentas automatizadas:** o projeto já possui `playwright` como dependência — recomenda-se integrar **axe-core via Playwright** (`@axe-core/playwright`) nos fluxos de teste de UI existentes (`test:auth-ui`, `test:clientes-ui`), falhando o build em violações de nível AA. Complementar com **Lighthouse** (auditoria de acessibilidade ≥ 95) nas telas de auth e clientes. [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — a integração axe-core ainda não existe no repositório e precisa ser aprovada/adicionada como dependência de desenvolvimento.
* **Frequência de auditoria:**
  * A cada PR que tocar `web/*.css` ou templates HTML servidos: rodada automatizada (axe) + verificação manual de foco visível.
  * Auditoria completa trimestral: navegação 100% por teclado + screen reader.
* **Teste manual com screen reader:** NVDA (Windows, gratuito) como referência principal; VoiceOver (macOS) como secundário. Cenários mínimos: login completo, erro de login, cadastro de cliente com erro de validação, leitura de tabela de resultados.
* **Teste de navegação 100% por teclado:** a cada release, percorrer os três fluxos críticos (seção 2) sem mouse, registrando qualquer ponto sem foco visível ou inalcançável como débito (seção 9).
* **Rastreabilidade com NFR:** esta rotina operacionaliza NFR-U01 (interface responsiva/legível nos painéis) e NFR-U02 (documento gerado por `renderizarCctMarkdown` legível — o Markdown exportado deve usar headings hierárquicos e listas reais, para ser navegável por screen readers após exportação). Ambos os IDs estão marcados como `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` no nfr.md e devem ser formalizados junto a este documento.

## 9. Débitos de Acessibilidade Conhecidos

| Item | Severidade | Componente/Tela Afetada | Prazo de Correção |
| :--- | :--- | :--- | :--- |
| Ausência de token `--accent` e de estilo de focus ring definido — risco de foco invisível se o outline padrão for removido | Alta | Global (`web/auth-ui.css`, `web/clientes-ui.css`) | Antes de qualquer nova tela; definir token + ring (ver seção 4) |
| Ausência de tokens semânticos (`--danger`, `--success`) — erros de autenticação/validação sem cor dedicada e sem garantia de contraste | Alta | Telas de auth e clientes | Próximo ciclo de UI; registrar contraste na seção 3 |
| `--line` (#dedee3) com contraste ≈ 1.3:1 — não pode ser o único indicador visual de estado/limite de componente interativo | Média | Bordas de cards/inputs | Revisar ao definir `--panel`/`--accent` |
| Relação não verificada entre `auth-ui.css` e `clientes-ui.css` (reuso de variáveis vs. valores hardcoded) — risco de contrastes não auditados | Média | Tela de clientes | Auditoria manual dos arquivos `web/` (pendente em design-tokens.md) |
| Ausência confirmada/verificável de `aria-live`, skip link e landmarks semânticos nas páginas servidas | Média | Global | Verificação manual + correção no próximo ciclo |
| Sem auditoria automatizada de acessibilidade no pipeline de testes | Média | CI/testes (`test:auth-ui`, `test:clientes-ui`) | Integrar axe-core/Playwright (seção 8) |

## 10. Referências

* [WCAG 2.2 — W3C Recommendation](https://www.w3.org/TR/WCAG22/) e [How to Meet WCAG 2.2 (Quick Reference)](https://www.w3.org/WAI/WCAG22/quickref/)
* [Lei nº 13.146/2015 — Lei Brasileira de Inclusão](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm)
* [Decreto nº 10.098/2019](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/decreto/d10098.htm)
* [LGPD — Lei nº 13.709/2018, Art. 9º](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
* design-tokens.md — fonte dos tokens `--bg`, `--ink`, `--muted`, `--line` (`web/auth-ui.css:2`) e registro das lacunas de tokens
* nfr.md — seção 5 (NFR-U01, NFR-U02) e seção 8 (NFR-C01, LGPD)
* Relatório de auditoria mais recente: **inexistente** — a primeira auditoria (automatizada + manual por teclado) está pendente e deve ser anexada aqui quando realizada.