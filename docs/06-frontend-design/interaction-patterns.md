# Interaction & Motion Patterns — MTE Mediador Monitor Unificado

> **Documento histórico.** A referência vigente é [UI_UX_OFICIAL.md](UI_UX_OFICIAL.md). Este documento descreve a UI legada e não deve orientar novas implementações quando houver divergência.

> **Versão:** 1.0 · **Owner:** [Frontend/Design Lead — a definir] · **Status:** Draft
> **Depende de:** [component-library.md], [design-tokens.md], [accessibility-guidelines.md], [user-flows.md], [nfr.md]

## 1. Overview

Este documento define os padrões de microinteração, animação e feedback do MTE Mediador Monitor Unificado. **Advertência fundamental:** a varredura determinística do workspace **não detectou nenhuma biblioteca de UI/motion, nenhum componente React e nenhum token de motion** no código. A camada de UI atual consiste em HTML servido server-side pelo backend monolítico (`src/auth-http.ts`), estilizado por `web/auth-ui.css` e `web/clientes-ui.css`, com apenas 4 tokens de cor (`--bg`, `--ink`, `--muted`, `--line` — `web/auth-ui.css:2`).

Consequência: **não existe nenhuma animação ou transição implementada hoje** — o que, por ausência, torna o produto atualmente conforme com `prefers-reduced-motion` (ver accessibility-guidelines.md, seção 7). Todo o conteúdo das seções 2 a 5 é, portanto, **proposta de alvo** `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`, ancorada nos três fluxos reais documentados (Flow 1: Autenticação; Flow 2: Monitoramento e Extração de CCTs; Flow 3: Auditoria e Consolidação) e restrita aos tokens existentes. Nenhum padrão abaixo deve ser implementado sem antes resolver as lacunas de tokens (`--accent`, `--danger`, token de foco) registradas em design-tokens.md.

## 2. Princípios de Motion

* **Propósito da animação:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Animação existe apenas para comunicar **causalidade e estado** (ex.: um formulário foi enviado e está sendo validado; uma consolidação está em andamento). Nunca decorativa — coerente com a natureza operacional do produto (auditoria de CCTs, autenticação, monitoramento).
* **Duração e easing padrão:** **Não existem tokens de motion no código** (design-tokens.md, seção 6, confirma a ausência). [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Proposta de tokens a criar antes de qualquer animação:
  * `--duration-fast: 150ms` — feedback de clique/hover;
  * `--duration-base: 250ms` — transições de estado (loading → sucesso/erro);
  * `--easing-standard: ease-out` — entrada de elementos; `ease-in` apenas para saída.
  Estes valores precisam ser formalizados em design-tokens.md antes do uso.
* **Quando NÃO animar:**
  * Sempre que `prefers-reduced-motion: reduce` estiver ativo — regra obrigatória de accessibility-guidelines.md (seção 7): toda animação futura deve ser envolvida em `@media (prefers-reduced-motion: reduce) { ... }` com movimento desativado ou reduzido.
  * Em ações repetitivas de alta frequência (ex.: navegação linha a linha na tabela de auditoria do Flow 3).
  * Em operações de backend longas (extração via `playwright`, parsing via `pdf-parse`/`word-extractor`, consolidação) — nesses casos o feedback correto é **indicador de progresso persistente**, não animação de transição.

## 3. Padrões por Tipo de Interação

> Todos os itens desta seção são [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]: nenhum comportamento abaixo está implementado no código. Premissas: UI server-side com CSS ad hoc; sem biblioteca de ícones; apenas 4 tokens de cor disponíveis.

### 3.1 Feedback de Ação (Clique/Toque)

| Ação | Feedback Visual | Duração |
| :--- | :--- | :--- |
| Clique em botão (submit de login, recuperação, consolidação) | Mudança imediata para estado Loading (label substituído por indicador textual, ex.: "Validando…"); interação bloqueada contra duplo-submit | Imediato (< 100ms) |
| Hover em botão/link | **Bloqueado:** não há token `--accent` para cor de destaque. Até sua criação, o único feedback permitido é o cursor (`pointer`) e sublinhado em links | — |
| Toggle/checkbox (permissões, filtros de auditoria) | Estados nativos do navegador; proibido estilizar removendo o outline padrão (regra de accessibility-guidelines.md, seção 4) | Nativo |
| Drag & drop | **Não se aplica** — nenhum fluxo real (Flows 1–3) envolve arrastar elementos. Se introduzido futuramente, deve oferecer alternativa por teclado (WCAG 2.5.7, ver accessibility-guidelines.md, seção 2) | — |

### 3.2 Transições de Estado

| Transição | Comportamento | Componentes Afetados | Fluxo |
| :--- | :--- | :--- | :--- |
| Loading → Sucesso (login) | Substituição do indicador por redirecionamento para o dashboard após criação do `cookieSessao`; sem animação intermediária | LoginForm | Flow 1 |
| Loading → Sucesso (recuperação) | Mensagem inline persistente: "E-mail de recuperação enviado" (envio via `nodemailer`) | RecoveryForm | Flow 1 |
| Loading → Erro (credenciais/token) | Mensagem de erro inline com `role="alert"` ("Usuário não encontrado", "Token inválido"); foco programático movido para a mensagem ou para o campo com `aria-invalid="true"` | LoginForm, RecoveryForm, TextInput | Flow 1 |
| Loading → Sucesso (consolidação) | Indicador de progresso substituído pelo Markdown renderizado (`renderizarCctMarkdown`) | AuditPanel | Flow 3 |
| Loading → Erro (extração) | Documento marcado como "Erro de Extração" na listagem; mensagem "Falha ao processar arquivo. Verifique a integridade do documento fonte." | ClientesTable / AuditPanel | Flows 2, 3 |
| Expandir/Colapsar (detalhe de documento na auditoria) | **Não implementado.** Se introduzido: transição de altura ≤ 250ms, respeitando `prefers-reduced-motion` | AuditPanel | Flow 3 |

### 3.3 Navegação

| Padrão | Comportamento |
| :--- | :--- |
| Transição entre páginas | Navegação server-side padrão (full page load), sem transição animada — comportamento atual e recomendado para este produto |
| Abertura de modal/dialog | **Nenhum modal detectado no código.** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Para modais futuros (ex.: confirmação de consolidação no Flow 3): foco movido para dentro ao abrir, trap de foco, Esc fecha e retorna foco ao gatilho — regras obrigatórias de accessibility-guidelines.md (seção 4) |
| Abertura de drawer/sidebar | **Não implementado e não recomendado** — os fluxos atuais (auth, clientes, auditoria) não exigem painéis laterais flutuantes |
| Toast/notificação | **Não implementado.** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Proposta: toasts no canto superior direito, duração de 5s para sucesso, persistentes (com botão de fechar) para erro/aviso; sempre com `aria-live` adequado (ver seção 6). Aplicável aos alertas do Flow 2 ("Erro de coleta: a estrutura da fonte externa foi alterada") |

## 4. Estados Padrão de Componentes com Dados

### 4.1 Loading States

* **Padrão de skeleton vs spinner:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Nenhum dos dois existe no código. Proposta alinhada aos fluxos:
  * **Spinner/indicador textual** para ações de formulário curtas (validação de credenciais e envio de e-mail — Flow 1);
  * **Indicador de progresso persistente com texto descritivo** (ex.: "Consolidando documento…") para operações longas do Flow 3 (consolidação com `reservarConsolidacao`) e do Flow 2 (coleta via `playwright`), pois essas operações podem durar segundos a minutos;
  * **Skeleton** apenas se a listagem de clientes/documentos (`web/clientes-ui.css`) passar a carregar dados de forma assíncrona — hoje o carregamento é server-side e o skeleton não se justifica.
* **Componentes com skeleton definido:** nenhum (não implementado).

### 4.2 Empty States

* **Estrutura padrão:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Texto em `--muted` (único token disponível para texto secundário), sem ilustração/ícone (não há biblioteca de ícones no projeto): título curto + descrição + CTA opcional em texto.
* **Ocorrências reais:** Flow 2 — "Lista de documentos vazia para a fonte selecionada" (estado Empty documentado em user-flows.md); Flow 3 — painel de auditoria sem documentos extraídos.
* **Tom de voz:** não há ui-style-guide.md no repositório — [Pendente] definir tom (recomenda-se: direto, operacional, em português) antes de redigir as mensagens.

### 4.3 Error States

* **Erro de campo (inline):** mensagem em texto associada ao campo via `aria-describedby`, campo com `aria-invalid="true"` (regras de accessibility-guidelines.md, seção 6). **Bloqueio visual crítico:** não existe token `--danger` — até sua criação, o erro **não pode ser transmitido por cor**; usar texto explícito + marcador textual (ex.: "Erro:" prefixando a mensagem). A regra de accessibility-guidelines.md (seção 3) proíbe transmitir estado apenas por borda, pois `--line` tem contraste ≈ 1.3:1.
* **Erro de página/bloqueante:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Página de erro server-side simples com mensagem clara e link de retorno. Ocorrência real: sessão expirada durante auditoria → redirecionamento para login com "Sua sessão expirou. Por favor, faça login novamente." (user-flows.md, seção 3).
* **Erro de rede/timeout e concorrência:** retry manual explícito (botão "Tentar novamente") — nunca retry automático silencioso em ações de escrita. Caso real: concorrência na consolidação → ação bloqueada com "Este documento está sendo consolidado por outro usuário no momento." (Flow 3, estado Disabled).

## 5. Feedback do Sistema

| Tipo | Canal | Duração/Persistência | Fluxo |
| :--- | :--- | :--- | :--- |
| Sucesso (login, recuperação, consolidação) | [INFERIDO POR IA] Inline na página (não há sistema de toast implementado) | Persistente até a próxima ação do usuário | Flows 1, 3 |
| Aviso (mudança de layout na fonte externa, falha do `playwright`) | [INFERIDO POR IA] Banner no painel de monitoramento + registro em log | Persistente até reconhecimento | Flow 2 |
| Erro (validação, extração, autenticação) | Inline com `role="alert"` (anúncio assertivo a screen readers) | Persistente até correção | Flows 1, 2, 3 |
| Confirmação destrutiva/crítica (consolidação final, redefinição de senha) | [INFERIDO POR IA] Modal com confirmação explícita — sujeito às regras de trap de foco e Esc da seção 3.3 | Até confirmação ou cancelamento | Flows 1, 3 |

## 6. Acessibilidade de Interação

* **Foco visível em toda interação por teclado:** lacuna crítica herdada — não existe token `--accent` nem focus ring definido (design-tokens.md; accessibility-guidelines.md, seção 4). Regra vigente: **proibido `outline: none` sem substituto**; quando `--accent` existir, anel de 2px com contraste ≥ 3:1 (WCAG 2.4.11/2.4.13). Operacionaliza NFR-U01 (interface legível nos painéis) — ID marcado como `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` em nfr.md.
* **`prefers-reduced-motion` respeitado:** **Sim, por ausência** — não há animações no código (accessibility-guidelines.md, seção 7). Manter assim, ou implementar a media query obrigatoriamente junto com o primeiro token de motion.
* **Anúncio de mudanças dinâmicas para screen readers:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — a varredura não confirma nenhum `aria-live` existente nos arquivos `web/`. Regras-alvo (accessibility-guidelines.md, seção 5): `aria-live="polite"` para contadores/status de monitoramento (Flow 2); `role="alert"` para falhas críticas (erro de login, falha de coleta, erro de validação de CNPJ).
* **Timeouts de feedback:** mensagens de erro nunca desaparecem automaticamente; toasts de sucesso (se implementados) com mínimo de 5s e pausa em hover/foco.

## 7. Anti-padrões (o que evitar)

* Introduzir qualquer animação antes de criar os tokens de motion e a media query `prefers-reduced-motion` — hoje o produto é conforme por ausência; não regredir.
* Transmitir erro/estado apenas por cor ou apenas por borda — `--line` tem contraste ≈ 1.3:1 e `--danger` não existe (accessibility-guidelines.md, seção 3).
* Remover o outline padrão do navegador sem focus ring substituto definido.
* Spinner sem texto descritivo em operações longas (consolidação, extração) — o usuário precisa saber *o que* está sendo processado.
* Retry automático silencioso em ações de escrita (consolidação, definição de credencial).
* Toast que desaparece sozinho para mensagens de erro ou aviso.
* Animações acima de 400ms em ações frequentes, e qualquer loading sem feedback visual acima de 300ms.

## 8. Referências

* **Protótipos interativos:** inexistentes no repositório — não há wireframes nem protótipos (user-flows.md, seção 6).
* **design-tokens.md** — fonte única dos 4 tokens reais (`web/auth-ui.css:2`) e registro das lacunas (`--accent`, `--danger`, tokens de motion, token de foco).
* **component-library.md** — inventário (inteiramente inferido) dos elementos de UI: LoginForm, RecoveryForm, TextInput, Button, Alert/ErrorMessage, ClientesTable/AuditPanel.
* **accessibility-guidelines.md** — regras de foco (seção 4), `aria-live` (seção 5), formulários (seção 6) e motion (seção 7).
* **user-flows.md** — Flows 1–3 e tabela de Edge Cases (seção 3), origem das mensagens e estados aqui referenciados.
* **nfr.md** — NFR-U01 e NFR-U02 (usabilidade), ambos `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` na fonte.
