# S02-T01 — Listas de clientes/contatos e ficha

Concluída em 12/10/2026. Base: RegistryPanel, ClientSheet, CSS compartilhado e contrato `src/postgres-gestao-http.ts`. Alterações existentes da S01-T04 preservadas.

Listas receberam cabeçalho descritivo, ação principal de criação, contagem de resultados e limpeza conjunta de busca/situação. Busca usa campos cadastrais explícitos, ignora acentos/caixa e aceita CNPJ formatado. Situação mantém ativos/inativos/todos. A ficha destaca identidade e situação da empresa, mantendo dados, modo de envio e vínculos completos. Tabelas permanecem com rolagem interna em mobile. Ações existentes e confirmações de exclusão foram preservadas.

Não houve alteração de payload, autorização ou backend. O servidor continua recusando exclusão com vínculos/histórico; suporte continua somente leitura. Documentos/aplicabilidade da ficha seguem identificados como pendentes para S04.

Arquivos: `frontend/src/components/RegistryPanel.vue`, `frontend/src/components/ClientSheet.vue`, `frontend/src/dialog.css`, `test/registry-integrated-checks.mjs`, `test/ui-integrated-fixture.mjs` e artefato Vue gerado.

Verificações aprovadas:

- `npm run typecheck` e `npm run test:vue-ui`: regressões de CRUD, edição, confirmações, vínculos e suporte aprovadas.
- Build completo aprovado na execução de `npm run test:postgres-https`; durante o desenvolvimento, a nova jornada parou em seletores exatos de labels de selects. Seletores corrigidos; nenhuma alteração no editor foi necessária.
- `node test/postgres-https.integration.mjs` aprovado após a correção, com Chromium/API/PostgreSQL reais: busca sem resultado e limpeza, CNPJ formatado, busca de cargo sem acento, ficha, cliente inativado e restaurado, filtros após recarga, exclusão de cliente com histórico recusada, contato criado/editado/inativado/excluído com recargas, cancelamento de exclusão e ausência final confirmada.
- Suporte abre ficha sem editar e não cria contatos; API recusa escrita. Regressões completas de sessão, contexto A/B, navegação, concessões, logout, portal e documentos aprovadas. Banco descartável removido com ausência confirmada.
- 28 capturas em `.cache/ui-s02-t01`: oito novas de ficha/contatos em claro/escuro e 1440/390 px, mais vinte de regressão. Lista desktop clara, contatos mobile escuro e ficha mobile clara inspecionados; sem overflow horizontal da página nos cenários automatizados. Tabela pode rolar internamente.
- `git diff --check` aprovado; avisos CRLF e aviso conhecido do Vite sobre script clássico de tema inicial permanecem.

Reprodução completa: definir `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s02-t01'` e executar `npm run test:postgres-https`. O runner usa origem HTTPS localhost com porta aleatória e a encerra ao terminar. Validação interativa: `npm run dev`, autenticar na origem impressa e abrir `/#/cadastros`.

Aceite visual humano separado da conclusão técnica. Próxima: **S02-T02 — editor de cliente e consulta CNPJ com campos completos**.
