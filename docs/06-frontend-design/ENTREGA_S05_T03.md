# S05-T03 — Agendas de coleta

Concluída em 12/10/2026. Sprint 05 em andamento; alterações anteriores preservadas.

Monitoramento incorpora `MonitoringAgendas.vue`: lista consultiva em modal, atualização/erro/retry, edição por administrador e leitura por operador/suporte. GET `/api/contexto/agendas` e PUT `/api/contexto/agendas/:monitoramento_id` mantêm o contrato existente. Uma agenda pertence à própria consulta; salvar atualiza essa configuração, sem criar entidades duplicadas.

Editor oferece ativação, intervalo inteiro de 60 a 10080 minutos ou modo semanal com dias 0–6, horário HH:mm e fuso reconhecido pelo Intl. Fuso aceita texto livre válido e sugestões; não limita contratos existentes a uma lista fixa. Intervalo fica preservado ao usar o modo semanal. Voltar sem salvar descarta o rascunho; erro preserva campos; durante PUT, campos/fechamento/novo envio ficam bloqueados. Consulta inativa permite desativar sua agenda, mas não ativá-la. Sucesso só aparece após resposta da API, seguido de nova consulta.

`frontend/src/agendas.ts` calcula a próxima ocorrência futura do calendário semanal no fuso escolhido, considerando mudança sazonal via Intl. A interface a identifica como ocorrência de calendário, não como garantia de execução. Informa que a janela semanal permanece aberta após o horário e que execuções pendentes impedem duplicação. Intervalos seguem as janelas do relógio do servidor e podem executar na janela atual ao ativar; não são contados desde o salvamento. Agendador e worker continuam necessários.

Carregamentos abortáveis e guardas de desmontagem/geração descartam respostas anteriores. A troca de escritório fecha o modal e invalida também a apresentação de sucesso de uma gravação já enviada. Não há alterações de contrato/backend, migração ou acionamento do agendador pelo navegador.

Validação:

- `npm run typecheck` e `npm run build` aprovados; Vue e 148 módulos operacionais.
- `npx vitest run test/agendas-ui.test.ts test/postgres-weekly-schedule.test.ts test/postgres-monitoring-schedule.test.ts test/postgres-monitoring-http.test.ts test/polling.test.ts test/api-transport.test.ts`: 25 testes. Quatro novos cobrem intervalo/dias/horário/fuso inválidos, próximo dia/semana no fuso e mudança sazonal. Scheduler, autorização/CSRF/auditoria e transporte preservados.
- `node test/vue-shell.e2e.mjs`: regressão completa. Novo helper `agendas-checks.mjs` incorporado ao runner e aprovado em execução dirigida: erro/retry, fuso inválido, corpo/CSRF/contexto, envio ocupado/Escape e resposta de gravação antiga descartada ao trocar escritório.
- `node test/postgres-https.integration.mjs`: jornadas anteriores preservadas e novo `agendas-integrated-checks.mjs`. Administrador e administrador da plataforma em contexto autorizado salvam intervalos e agenda semanal; dias/horário/fuso persistem na API/SQL e reabertura, intervalo persiste após recarga, cancelamento não grava, 503 preserva rascunho e retry funciona. Operador/suporte recebem somente leitura e PUT 403. Consulta de outro escritório retorna 404 e intervalo inválido retorna 400. Auditoria contém ator autenticado.
- Agendador real com pool runtime e relógio do PostgreSQL: janela semanal devida cria uma solicitação e repetição cria zero; desativação cria zero; reativação/mudança de modo com pendência cria zero. Após encerrar explicitamente a solicitação sintética na fixture, intervalo cria uma nova solicitação e repetição cria zero. Total de duas solicitações para modos distintos, uma única configuração de consulta. Consulta inativa permite desligar a agenda pela UI e recusa reativação no backend. Não há worker remoto neste cenário.
- 148 capturas em `.cache/ui-s05-t03`: oito novas de lista/editor semanal, claro/escuro, 1440/390 px, e 140 de regressão. Lista desktop clara e editor mobile escuro inspecionados; rolagem interna do modal mantém campos e botões acessíveis, sem overflow da página.
- `git diff --check` sem erros. Aviso conhecido do script clássico de tema no build permanece.

Limites: a API não fornece previsão exata de despacho nem versão otimista de agenda. A ocorrência mostrada usa relógio do navegador e calendário configurado; execução real depende do relógio do servidor, janela já usada, pendências, agendador, worker e limites. Horários locais inexistentes na transição sazonal são pulados pela previsão; horário ambíguo segue os instantes válidos do fuso. Sem scraper externo, IA ou SMTP; banco e fixtures descartáveis. Aceite visual humano separado.

Reprodução: após build, `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s05-t03'`; `node test/vue-shell.e2e.mjs`; `node test/postgres-https.integration.mjs`. Fluxo local: `npm run dev`, escritório → Monitoramento → Agendas de coleta → Configurar → Salvar agenda. Processos operacionais de agendador/worker são iniciados separadamente pelos comandos existentes do projeto.

Próxima: **S05-T04 — limites de coleta e cancelamento autorizado**.
