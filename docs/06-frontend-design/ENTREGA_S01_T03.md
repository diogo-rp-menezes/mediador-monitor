# S01-T03 — Navegação direta e histórico

Concluída em 12/10/2026. Base inspecionada: App.vue, shell e fixtures atuais; mudanças preexistentes preservadas.

As áreas usam `#/inicio`, `#/cadastros`, `#/monitoramento`, `#/documentos`, `#/envios`, `#/gestao`, `#/plataforma` e `#/perfil`. Exemplo local: `/app/#/documentos` na origem configurada do servidor. `/acesso#/documentos` também foi validado. O hash identifica somente a área: não contém IDs, concessões, filtros ou dados de negócio.

Cliques criam entradas no histórico; voltar/avançar e edição do hash sincronizam a área. A carga inicial aguarda sessão e restauração de contexto pela API antes de autorizar a rota. Área inexistente, hash malformado ou área proibida são substituídos por `#/inicio`, sem criar outra entrada. Trocas de contexto desmontam os painéis e limpam seu estado; o histórico nunca restaura um escritório anterior. Listeners são removidos ao desmontar o app.

Arquivos: `frontend/src/App.vue`, `test/workspace-shell-checks.mjs`, `test/ui-integrated-fixture.mjs`, `test/postgres-https.integration.mjs` e artefato Vue gerado.

Validações aprovadas:

- `npm run typecheck` e `npm run test:vue-ui`.
- `npm run test:postgres-https`, incluindo build completo, Chromium e PostgreSQL descartável: hash direto, reload, voltar/avançar para administrador, operador, suporte e plataforma; contexto restaurado pelo servidor; fallback de Escritório/Plataforma para papéis restritos.
- Portal da empresa: `/acesso#/cadastros` retorna à visão geral; link direto e reload de Documentos preservam o portal autorizado.
- Troca A→B limpa busca; voltar no histórico mantém B e não mostra A. Regressões de isolamento, CSRF, concessões, PDF e logout aprovadas. Banco desta execução removido com ausência confirmada.
- 16 capturas em `.cache/ui-s01-t03`: desktop, menu móvel, tabela, formulário e documento em claro/escuro, 1440/390 px. Captura móvel inspecionada; sem overflow da página nos cenários automatizados.
- `git diff --check` sem erros de whitespace.

Na primeira execução, os cenários passaram, mas a limpeza terminou com erro PostgreSQL de conexão encerrada pelo administrador. Duas execuções seguintes concluíram com código zero e remoção do banco confirmada; a primeira execução não foi contada como aprovada. Persiste o aviso conhecido do Vite sobre o script clássico de tema inicial.

Limites: rotas referem-se às áreas existentes; painéis ainda pendentes continuam explicitamente identificados. Não há hospedagem nova ou alteração de permissões/backend. Aceite visual humano permanece separado. Próxima task: S01-T04 (Minha conta).
