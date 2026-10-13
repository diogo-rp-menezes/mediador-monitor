# S05-T01 — Execuções de monitoramento

Concluída em 12/10/2026. Mudanças anteriores preservadas; Sprint 05 em andamento.

A área Monitoramento agora usa `MonitoringPanel.vue` e GET `/api/contexto/execucoes`, com sessão e headers do escritório autorizado. Mostra as últimas 100 execuções na ordem retornada pelo servidor, filtro por situação, contagem, vazio e detalhe em modal. Preserva os cinco estados: solicitada, executando, concluída, falhou e cancelada. Detalhe apresenta IDs da consulta e solicitante, datas de registro/encerramento, cancelamento solicitado e indicadores de limites de duração/volume. Solicitação de cancelamento permanece distinta da situação final.

Atualização automática a cada 10 segundos, sem sobreposição de requisições, com pausa, retomada e atualização manual. Falha mostra mensagem e identifica explicitamente os dados da última consulta bem-sucedida; tentativa automática ou manual permite reconexão. Antes da primeira consulta bem-sucedida, erro não é apresentado como histórico vazio. Modal acompanha a versão atual da linha; execução que sai da janela de 100 recebe mensagem de indisponibilidade.

`createCancelablePolling` cancela o timer e a requisição ao pausar ou desmontar. Guardas de geração também descartam respostas de transportes que ignorem cancelamento. Transporte JSON/contextual aceita `AbortSignal` opcional, preservando CSRF, contexto e expiração. A chave de escritório e a desmontagem durante troca de contexto limpam linhas, filtro e modal. Sair da área interrompe o polling.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`: Vue e 148 módulos operacionais.
- `npx vitest run test/polling.test.ts test/api-transport.test.ts`: sete testes. Serialização, retry, abort, resposta atrasada, pausa/retomada sem sobrescrita; sinal/contexto, CSRF, expiração e erros do transporte preservados.
- `node test/vue-shell.e2e.mjs`: regressão completa e novo helper `monitoring-checks.mjs`, com relógio controlado no navegador. Ciclo automático, 503/reconexão, pausa sem novas consultas, retomada, resposta atrasada durante troca de escritório e ausência de polling após sair; nenhuma mutação de monitoramento.
- `node test/postgres-https.integration.mjs`: regressão completa e novo helper `monitoring-integrated-checks.mjs`. Banco descartável com cinco estados persistidos, indicadores de cancelamento/limites, detalhes, filtro, vazio, 503/retry, mudança real de estado e retomada, recarga e isolamento A/B. Demais jornadas e papéis preservados. Fixtures removidas e ausência do banco descartável confirmada.
- 136 capturas em `.cache/ui-s05-t01`: oito novas de lista/detalhe, claro/escuro, 1440/390 px, mais 128 de regressão. Lista desktop clara e detalhe mobile escuro inspecionados; sem overflow da página.
- `git diff --check` sem erros. Aviso conhecido do script clássico de tema no build permanece.

Limites do contrato existente: janela de 100 execuções, sem paginação ou endpoint individual; detalhe usa somente os campos autorizados da listagem, sem expor `detalhes_json`, tokens do worker, caminhos ou conteúdo interno. `iniciada_em` é preenchida na criação da solicitação pelo banco, por isso a interface a rotula como “Registrada em”. A consulta e o solicitante aparecem pelos IDs fornecidos pela API; não há histórico de transições nem evidências por coleta neste contrato.

Solicitar coleta, agendas, limites editáveis, cancelamento e recuperação continuam nas S05-T02–T05. Esta entrega é de leitura e não executa scraper, modelo ou SMTP. Estados sintéticos persistidos validam a interface; não comprovam coleta remota. Aceite visual humano separado.

Reprodução: após build, `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s05-t01'`; `node test/vue-shell.e2e.mjs`; `node test/postgres-https.integration.mjs`. Fluxo local: `npm run dev`, selecionar escritório → Monitoramento → Ver detalhe / filtro / pausa / retomada.

Próxima: **S05-T02 — solicitação de coleta por consulta selecionada**.
