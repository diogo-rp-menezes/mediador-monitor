# S01-T04 — Minha conta

Concluída em 12/10/2026. Inspeção de `src/postgres-auth-http.ts` confirmou `PUT /api/auth/perfil`: objeto estrito com somente `nome`, aparado, entre 2 e 250 caracteres. A resposta é a sessão atualizada. E-mail e papel não são editáveis nesse contrato.

`AccountPanel.vue` substitui o painel pendente de Perfil. Oferece nome editável, e-mail somente leitura e informações de acesso/recuperação. O formulário envia pelo transporte autenticado comum, bloqueia repetição durante envio, preserva o rascunho em falha e só confirma após resposta do servidor. A sessão retornada atualiza nome e iniciais no topo e na sidebar. Funciona sem escritório selecionado; recuperação e redefinição de senha continuam no fluxo de acesso existente.

Arquivos alterados: `frontend/src/components/AccountPanel.vue`, `frontend/src/App.vue`, `frontend/src/pending.ts`, testes Vue/fixture real/capturas e artefato Vue gerado. Não há alteração de contrato ou backend.

Validação:

- **T**: `npm run typecheck` aprovado.
- **E**: `npm run test:vue-ui` aprovado; payload somente com nome aparado e CSRF, bloqueio durante envio, falha 503 com rascunho preservado, retry, atualização da identidade e 401 redirecionando ao login com contexto removido.
- **B/P**: `npm run test:postgres-https` aprovado, incluindo build e jornada real completa da sprint. Administrador, operador, suporte e administrador da plataforma atualizam o próprio nome antes de selecionar contexto; nova consulta de sessão e recarga confirmam persistência, e-mail preservado. Logout, isolamento, navegação, concessões e portal continuam aprovados. Banco sintético removido com ausência confirmada.
- **V**: quatro capturas da conta em claro/escuro e 1440/390 px, com ausência de overflow horizontal automatizada. Desktop claro e mobile escuro inspecionados; títulos, campos e orientação de segurança legíveis. Mais 16 capturas de regressão do shell/domínios existentes.
- `git diff --check` sem erros; avisos de CRLF esperados. O aviso conhecido do Vite para o script clássico de tema inicial permanece.

Reproduzir capturas com `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s01-t04'` e `npm run test:postgres-https`. Arquivos em `.cache/ui-s01-t04/{light,dark}-{1440,390}-minha-conta.png`. A origem HTTPS de teste usa porta aleatória e encerra ao terminar. Para validação interativa, executar `npm run dev` e abrir `/#/perfil` na origem impressa, autenticado.

Sprint 01 encerrada tecnicamente; aceite visual humano permanece separado. F17 continua parcial porque a visão geral contextual está prevista em S09-T01. Próxima task elegível: **S02-T01 — listas, filtros, ações e ficha de clientes/contatos**.
