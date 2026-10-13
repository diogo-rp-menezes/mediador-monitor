# Entrega S06-T05 — recuperação e processamento da fila

Data: 13/10/2026

## Resultado

A fila Vue agora expõe, para administradores do escritório, as operações autorizadas de processamento e recuperação de envios presos. Cada operação abre o modal **Operações da fila**, exige confirmação explícita, bloqueia repetição enquanto aguarda a resposta e atualiza a fila somente após o servidor confirmar a mutação.

O processamento chama `POST /api/contexto/envios/processar` com corpo `{}` e apresenta enviados e falhas. O servidor reserva somente itens aprovados e aptos; uma segunda execução não retransmite itens já enviados. A recuperação chama `POST /api/contexto/envios/recuperar` com `{mais_antigo_que_segundos}`; a janela padrão é de 15 minutos e a UI valida 1–1440 minutos. O servidor marca envios `enviando` antigos como `incerto`, registra a tentativa e não reenvia automaticamente.

O contrato de recuperação de envios foi mantido separado do contrato de recuperação de monitoramento: a UI não envia justificativa nem confirmação de consumidor encerrado para esta rota. O modal orienta a conferência do provedor e do destinatário antes de repreparar um envio incerto. As rotas continuam protegidas por `envios.aprovar`, CSRF e contexto do escritório; operador, suporte e plataforma permanecem em leitura.

## Arquivos

- `frontend/src/components/DeliveriesPanel.vue`: controles, modal de confirmação, validação da janela, feedback de resultado e atualização da fila.
- `test/deliveries-checks.mjs`: jornada controlada de recuperação, aprovação, processamento, histórico, repreparação e cancelamento.

## Verificação

- `npm run typecheck` — aprovado.
- `npm run build` — aprovado; artefato Vue e bundle operacional gerados.
- `node test/vue-shell.e2e.mjs` — aprovado; operações da fila, ciclo único sem reenvio, histórico e filtros.
- `npx vitest run test/postgres-fila-envios.test.ts -t "recupera job preso"` — aprovado; recuperação registra `incerto` sem reenvio automático.
- `npm run test:postgres-https` — aprovado; PostgreSQL descartável, HTTPS, Chromium, quatro papéis e isolamento/regressões do domínio. O adaptador SMTP permanece coberto por fixtures/unitários com destinatários locais e bytes de anexo controlados.

O aviso do Vite sobre `/app/theme.js` sem `type="module"` permanece preexistente e não impediu o build. A suíte Vitest completa ainda contém os dois testes conhecidos de mock de versão do worker registrados na entrega S06-T04; eles não foram alterados por esta task.
