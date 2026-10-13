# S05-T02 — Solicitação de coleta por consulta

Concluída em 12/10/2026. Mudanças anteriores preservadas; Sprint 05 em andamento.

Monitoramento incorpora `CollectionRequest.vue`, disponível a administrador/operador do escritório. O modal consulta GET `/api/contexto/monitoramentos`, apresenta somente as consultas autorizadas e deixa as inativas indisponíveis. Exibe CNPJ, categoria, UF, título, vigência e tipos salvos; confirmação explícita é renovada ao trocar a seleção ou atualizar consultas. Vazio, carregamento, falha e retry têm estados próprios.

Conferência prévia em `frontend/src/monitoring.ts`: consulta ativa, identificação por CNPJ/categoria/título, tipos reconhecidos pelo catálogo compartilhado com o backend, UF e vigência compatíveis com o consumidor. A inspeção/execução encontrou uma diferença existente entre cadastro e coleta: o cadastro aceita texto livre na vigência, mas `prepararFiltros` aceita Vigentes, Todos, Não Vigentes e aliases. A UI bloqueia, por exemplo, “2026” e orienta corrigir o cadastro; não altera silenciosamente o filtro. Contratos e schema do backend permanecem existentes.

POST `/api/contexto/execucoes` envia exclusivamente `{monitoramento_id}` com CSRF e contexto. O servidor determina escritório/ator e mantém autorização, auditoria, recusa de consulta alheia/inativa e duplicação pendente. Durante envio, seleção, confirmação e fechamento ficam bloqueados; falha preserva a seleção e confirmação. Sucesso só aparece após resposta persistida, informa o ID da execução e consulta novamente o histórico. A UI não cria registros nem conclui execuções por conta própria.

Carregamento de consultas é abortável; desmontagem e guarda de geração rejeitam respostas antigas, inclusive sucesso de POST após troca de escritório. A configuração não é congelada no pedido: o worker lê os filtros vigentes quando reserva a execução, conforme contrato atual. Essa condição e a dependência de worker/limites são informadas no modal.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`: Vue e 148 módulos operacionais.
- `npx vitest run test/collection-query.test.ts test/postgres-monitoring-requests.test.ts test/postgres-monitoring-http.test.ts test/postgres-monitoring-collection.test.ts test/postgres-monitoring-executor.test.ts test/postgres-monitoring-persistence.test.ts test/polling.test.ts test/api-transport.test.ts`: 39 testes, incluindo quatro novos de conferência de filtros e vigência. Contrato estrito, contexto/ator, autorização/CSRF/auditoria, reserva, persistência, execução e cancelamento do polling preservados.
- `node test/vue-shell.e2e.mjs`: regressão completa e novo `collection-checks.mjs`. Erro/vazio/retry, falta de filtros/tipos, confirmação renovada, payload/CSRF, campos ocupados/Escape e resposta antiga descartada na troca de contexto. Caso adicional de vigência incompatível aprovado em execução dirigida do mesmo helper.
- `node test/postgres-https.integration.mjs`: regressão completa e novo `collection-integrated-checks.mjs`. Administrador, operador e administrador da plataforma com contexto autorizado solicitam pela UI; suporte não recebe ação e POST retorna 403. Cancelamento do modal não grava; falha 503 controlada permite retry sem perda da confirmação; resposta 202 corresponde à linha persistida e auditada com ator real. Duplicação pendente retorna 409, consulta inativa/alheia retorna 404 e corpo com escritório injetado retorna 400, sem execuções adicionais.
- Cada perfil autorizado usa pool runtime de privilégio mínimo, exclusividade, reserva, executor, trabalho de coleta e persistência reais. Apenas abrir/consultar/fechar a fronteira do scraper é controlado. Filtros recebidos são conferidos; Vue observa `executando`; retorno vazio é persistido com `encontrados:0`, `novos_catalogo:0`, hash e token removido na conclusão. Estado `concluida` persiste após recarga. Catálogo de registros permanece idêntico. Fixtures limpas e banco descartável removido com ausência confirmada.
- 140 capturas válidas em `.cache/ui-s05-t02`: quatro novas da confirmação, claro/escuro, 1440/390 px, e 136 de regressão. Desktop claro e mobile escuro inspecionados; sem overflow da página.
- `git diff --check` sem erros. Aviso conhecido do script clássico de tema no build preservado.

Correções no ensaio: espera por visibilidade de uma opção de seletor nativo substituída por presença no DOM; limpeza fecha modais para não encobrir a falha original. Fixture de vigência corrigida para uma opção aceita pelo consumidor, e regressão da opção anual inválida acrescentada à UI. Jornada completa repetida e aprovada após os ajustes.

Limitações: sem coleta MTE externa, IA ou SMTP. Resultado vazio controlado comprova persistência e transições, sem afirmar descoberta remota ou novos instrumentos. A conferência da UI não substitui autorização do backend; o endpoint existente não congela filtros ou aceita token de versão. Agendas, edição de limites, cancelamento de execução e recuperação seguem S05-T03–T05. Histórico mantém a janela de 100 da S05-T01. Aceite visual humano separado.

Reprodução: após build, `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s05-t02'`; `node test/vue-shell.e2e.mjs`; `node test/postgres-https.integration.mjs`. Fluxo local: `npm run dev`, selecionar escritório → Monitoramento → Solicitar coleta → consulta → conferir filtros → confirmar. Processamento operacional exige iniciar o worker do projeto separadamente.

Próxima: **S05-T03 — agenda por intervalo/semanal, dias, hora e fuso**.
