# S05-T05 — Recuperação de execuções interrompidas

Concluída em 12/10/2026. A Sprint 05 está tecnicamente concluída; mudanças anteriores foram preservadas.

O detalhe de uma execução de monitoramento ativa agora mostra **Recuperar execução interrompida** somente para administrador do escritório, inclusive administrador da plataforma atuando nesse contexto. A ação exige justificativa de pelo menos oito caracteres e a confirmação explícita de que o consumidor anterior foi encerrado. Operador e suporte permanecem sem essa ação e o servidor também recusa os respectivos POSTs.

O formulário explica a consequência operacional: a recuperação não repete a coleta. O endpoint `POST /api/contexto/execucoes/:id/recuperar` obtém exclusividade do escritório, invalida o token da reserva anterior, mantém os dados de coleta já preservados, registra a auditoria e marca a mesma execução como `falhou`. Caso outro consumidor ainda mantenha a exclusividade, a recuperação recebe 409, o rascunho é preservado e a tela atualiza o estado antes de uma nova tentativa. Conflitos por encerramento concorrente também são mostrados com a situação recarregada.

A lista retorna apenas a capacidade booleana `recuperavel` para execuções ativas; token de reserva não é exposto ao navegador. Após sucesso confirmado pela API, o detalhe mostra o estado `Falhou` e informa que a reserva foi invalidada. O componente não cria ou reenfileira uma coleta.

Validação:

- `npm run typecheck` e `npm run build` aprovados; Vue e 148 módulos operacionais. O aviso conhecido do script clássico de tema permanece.
- `npx vitest run test/postgres-monitoring-settings.test.ts test/postgres-monitoring-requests.test.ts test/postgres-monitoring-limits.test.ts test/postgres-monitoring-http.test.ts test/postgres-monitoring-executor.test.ts test/postgres-monitoring-reservation.test.ts test/postgres-monitoring-crash-check.test.ts test/postgres-monitoring-failure-check.test.ts test/polling.test.ts`: 33 testes aprovados. Cobrem schema estrito, RBAC/CSRF, auditoria atômica, exclusividade ocupada, invalidação de reserva por encerramento abrupto/perda de conexão e projeção segura da capacidade de recuperação.
- `node test/vue-shell.e2e.mjs`: regressão completa e cenário controlado de recuperação aprovados. Confirma justificativa mínima, confirmação, corpo/CSRF/contexto, formulário ocupado/Escape e descarte de resposta de recuperação após troca de escritório.
- `node test/postgres-https.integration.mjs`: administrador e plataforma recuperam uma execução ativa em PostgreSQL real; exclusividade mantida retorna 409 e preserva o rascunho. Após a liberação, a mesma execução recebe `falhou`, `concluida_em`, `recuperacao_administrativa` e remoção de `reserva_token`; auditoria contém ator, justificativa e confirmação. A contagem da fila do escritório não aumenta. ID externo, estado final, corpo sem confirmação e encerramento concorrente são recusados ou reconsultados. Operador e suporte não veem a ação e recebem 403.
- 148 capturas em `.cache/ui-s05-t05`: oito novas de formulário/confirmação, claro/escuro em 1440/390 px, e 140 de regressão. Formulário e confirmação móvel escura inspecionados; não há overflow horizontal.
- `git -c core.safecrlf=false diff --check` aprovado.

Limitações: a recuperação só é apropriada após confirmação operacional de que o consumidor anterior encerrou. A exclusividade é revalidada no servidor; não há recuperação otimista, repetição automática nem início de worker pelo navegador. Os cenários usam PostgreSQL/HTTPS descartáveis e consumidores controlados, sem scraper externo, IA ou SMTP. Aceite visual humano permanece separado.

Fluxo local: escritório → Monitoramento → Ver detalhe da execução ativa → Recuperar execução interrompida. Preencha a justificativa, confirme o encerramento do consumidor anterior e confirme a recuperação.

Próxima: **S06-T01 — resumo, tabela operacional e filtros da fila de envios**.
