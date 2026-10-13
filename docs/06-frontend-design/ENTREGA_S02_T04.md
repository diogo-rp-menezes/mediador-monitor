# S02-T04 — Consultas sindicais privadas

Concluída em 12/10/2026. Base inspecionada: UnionPanel, MonitoramentoSchema, handlers PostgreSQL e exclusão sujeita a vínculos. Mudanças preexistentes preservadas.

Tela refinada com título, orientação sobre escopo privado, criação como ação principal, contagem, limpeza de filtros e badges de situação. Busca ignora acentos e caixa. Formulário identifica que altera somente a consulta e desabilita campos durante salvamento. CNPJ, categoria, UF, título, vigência, tipos e situação continuam no contrato atual; sindicato não pode ser trocado na edição. Catálogo compartilhado permanece administrado na Plataforma.

Verificações aprovadas:

- `npm run typecheck`.
- `npx vitest run test/monitoramentos-escritorio.test.ts test/postgres-organizacoes.test.ts`: 23 testes.
- `node test/vue-shell.e2e.mjs`: criação/edição, filtros obrigatórios, tipos, inativação e exclusão controlados, além das regressões da UI.
- `npm run test:postgres-https`: build e jornada completa real em Chromium/API/PostgreSQL descartável. Nova jornada `test/union-integrated-checks.mjs` confere todos os filtros e dois tipos no banco após recarga; busca sem acento; exclusão recusada com cliente vinculado; inativação persistida; mesma entidade sindical com consultas distintas em A/B; exclusão permitida após remover vínculo de teste. Snapshot integral do sindicato permanece idêntico e a consulta de B não é alterada. Banco descartável removido com ausência confirmada.
- 48 capturas em `.cache/ui-s02-t04`: oito novas da lista/editor em claro/escuro, 1440/390 px, mais 40 de regressão. Lista desktop clara e editor mobile escuro inspecionados; sem overflow horizontal da página. Modal e tabelas mantêm rolagem interna quando necessária.
- `git diff --check` sem erros. Avisos conhecidos CRLF e de script clássico de tema inicial permanecem.

Durante implementação, typecheck identificou nome sindical opcional na busca; normalização passou a aceitar ausência. A primeira jornada também apontou expectativa de tipo não selecionado na fixture; o teste passou a selecionar explicitamente ambos. As verificações finais acima passaram após essas correções.

Arquivos: `frontend/src/components/UnionPanel.vue`, `test/union-integrated-checks.mjs`, `test/ui-integrated-fixture.mjs` e artefato Vue gerado. Nenhuma alteração de backend, coleta externa ou catálogo operacional.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s02-t04'`; `npm run test:postgres-https`. Validação interativa: `npm run dev`, autenticar na origem impressa, `/#/cadastros`, aba Sindicatos.

Sprint 02 encerrada tecnicamente, com build e jornada completa aprovados; aceite visual humano separado. Próxima: **S03-T01 — catálogo de instrumentos, filtros/ordenação e ficha**.
