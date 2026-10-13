# S03-T01 — Catálogo de instrumentos e originais

Concluída em 12/10/2026. Base inspecionada: DocumentsPanel, catálogo/detalhe PostgreSQL, endpoint autenticado de originais e verificação de caminho/SHA-256. Mudanças preexistentes preservadas.

Catálogo recebeu título/orientação, filtros por cliente relacionado e disponibilidade do original, contagem e limpeza de todos os filtros. Busca por registro, tipo e ordenação crescente/decrescente permanecem combináveis. Disponibilidade aparece em badges. Ficha mantém metadados, abas e clientes relacionados.

Corrigida condição de concorrência no download: fechar/reabrir a mesma ficha agora invalida a requisição antiga por sequência própria, mesmo quando a seleção reutiliza o mesmo objeto. Fechar permite uma nova tentativa sem esperar a anterior; respostas antigas não alteram o estado da tentativa nova. Troca de contexto desmonta o painel e descarta detalhe/download pendentes.

Verificações aprovadas:

- `npm run typecheck` e build operacional/frontend.
- `npx vitest run test/postgres-documentos.test.ts test/postgres-interpretacoes.test.ts`: oito testes aprovados.
- `node test/vue-shell.e2e.mjs`: regressões completas e nova jornada `test/instrument-checks.mjs`, com filtros combinados/ordenação, ausência, clientes, download, 409, fechamento/reabertura e troca de contexto durante respostas atrasadas.
- `node test/postgres-https.integration.mjs`: jornada real completa com Vue/API/PostgreSQL/HTTPS. Nova jornada `test/instrument-integrated-checks.mjs` confere original autenticado byte a byte, cache no-store, associação ao cliente, isolamento de escritório, ausência e hash divergente exibidos na ficha. Usa arquivo sintético temporário em data, restaura os campos da fixture e remove somente o diretório temporário verificado. Banco descartável removido com ausência confirmada.
- 56 capturas em `.cache/ui-s03-t01`: oito novas da lista/ficha em claro/escuro, 1440/390 px, mais 48 de regressão real. Lista desktop clara, lista mobile escura e ficha mobile escura inspecionadas; página sem overflow horizontal, tabela/abas com rolagem interna.
- `git diff --check` sem erros; avisos conhecidos de CRLF e script clássico do tema inicial permanecem.

Primeiras execuções identificaram seletores de teste ambíguos: nome do select inclui opções e “Disponível” existe tanto na opção quanto no badge. Seletores foram delimitados ao combobox/tabela e as jornadas finais passaram.

Arquivos: `frontend/src/components/DocumentsPanel.vue`, helpers de instrumentos, runners Vue/fixture integrada, documentação e artefato Vue gerado. Contratos/backend preservados. Aceite visual humano separado; análise/evidências continuam na próxima tarefa.

Reprodução das capturas: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s03-t01'`; `npm run test:vue-ui`; `npm run test:postgres-https`. Validação interativa: `npm run dev`, autenticar, selecionar escritório e abrir Documentos → Instrumentos.

Próxima: **S03-T02 — leitura da análise estruturada e evidências**.
