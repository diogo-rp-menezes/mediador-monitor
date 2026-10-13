# S05-T04 — Limites de coleta e cancelamento autorizado

Concluída em 12/10/2026. Sprint 05 em andamento; alterações anteriores preservadas.

Monitoramento incorpora `MonitoringLimits.vue`, com consulta dos valores configurados, tetos da plataforma e limites efetivos. Administradores podem salvar execuções por hora, duração em segundos e volume em MiB; campos vazios enviam null e herdam os tetos. Operador e suporte consultam sem edição. Validação exige inteiros, mínimos 1/10/1 e máximos definidos pelo servidor. PUT mantém o contrato vigente e a auditoria existente. Novas reservas recebem os limites efetivos; reservas em andamento conservam os valores já recebidos.

O detalhe da execução oferece confirmação de cancelamento para administrador/operador quando a API retorna `cancelavel`. A listagem acrescenta apenas essa capacidade booleana: solicitada, ou executando com reserva, sem pedido anterior. Nenhum token é retornado. Estados finais e execuções sem reserva não oferecem a ação. O backend continua revalidando estado, reserva, permissão e escritório na mutação.

POST `/api/contexto/execucoes/:id/cancelar` envia apenas `{}`. Uma solicitação em fila pode ser imediatamente cancelada pelo servidor. Uma execução reservada recebe o pedido e permanece Executando até o worker encerrar o trabalho; a interface não altera o estado por conta própria. A tela consulta novamente mesmo com atualização automática pausada. Conflito mostra erro e reconfere o estado, sem fingir sucesso. Confirmação, fechamento e repetição ficam bloqueados durante o envio. Trocar escritório desmonta o componente e descarta respostas antigas; consultas de limites são abortáveis.

Validação:

- `npm run typecheck` e `npm run build` aprovados; Vue e 148 módulos operacionais. Aviso conhecido do script clássico de tema permanece.
- `npx vitest run test/postgres-monitoring-settings.test.ts test/postgres-monitoring-requests.test.ts test/postgres-monitoring-limits.test.ts test/postgres-monitoring-http.test.ts test/postgres-monitoring-executor.test.ts test/postgres-monitoring-reservation.test.ts test/polling.test.ts`: 29 testes aprovados. Asserção adicional de projeção da capacidade aprovada em nova execução dos três testes de requests. Cobrem tetos/herança, autorização/CSRF, reserva/limite por hora, duração/volume e espera pelo encerramento do trabalho antes de liberar a reserva.
- `node test/vue-shell.e2e.mjs`: regressão completa e novo helper `limits-cancellation-checks.mjs` aprovados. Falha GET/retry, mínimo, corpo com null, CSRF/contexto, busy/Escape e respostas antigas de limites e cancelamento descartadas na troca de escritório.
- `node test/postgres-https.integration.mjs`: integração real com novo `limits-cancellation-integrated-checks.mjs`. Administrador e plataforma em contexto autorizado salvam 10 execuções/hora, 10 segundos e 1 MiB; API/recarga e reserva real conferem esses valores. Restauração por campos vazios persiste null. Erro 503 preserva rascunho; mínimo inválido bloqueia e API recusa máximo inválido. Operador/suporte não editam limites e PUT recebe 403.
- Administrador, operador e plataforma cancelam uma solicitação em fila; fechar a confirmação não grava. Um worker real sob exclusividade recebe o cancelamento, sinaliza abort e espera uma barreira controlada: SQL e Vue continuam Executando, concluida_em permanece null e o pedido aparece registrado. Ao liberar o trabalho, o worker encerra como Cancelada. Execução sem reserva e estados finais não oferecem ação. Execução encerrada entre leitura e POST retorna 409 e atualiza a tela; ID de outro escritório recebe 409 sem alteração. Suporte não vê a ação e POST recebe 403. Auditoria registra os dois cancelamentos e o ator autenticado.
- 140 capturas efetivamente geradas em `.cache/ui-s05-t04`, incluindo oito novas de limites/pedido e 132 de regressão; claro/escuro em 1440/390 px. Limites desktop claro e pedido mobile escuro inspecionados. Modal usa rolagem interna para campos/ações extensos; página sem overflow horizontal.
- `git -c core.safecrlf=false diff --check` aprovado.

Limitações: não há versão otimista dos limites; o servidor revalida o teto vigente ao salvar. Se a reconsulta falhar, o erro da listagem identifica dados anteriores e permite retry. Execução sem reserva exige recuperação administrativa, prevista na próxima task. Os testes usam PostgreSQL/HTTPS descartáveis e trabalho controlado, sem scraper externo, IA ou SMTP. Banco removido com ausência confirmada. Aceite visual humano separado.

Fluxo local: escritório → Monitoramento → Limites de coleta; ou Ver detalhe → confirmar pedido → Solicitar cancelamento. Para capturas: após build, `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s05-t04'`; `node test/postgres-https.integration.mjs`.

Próxima: **S05-T05 — recuperação de execuções interrompidas**.
