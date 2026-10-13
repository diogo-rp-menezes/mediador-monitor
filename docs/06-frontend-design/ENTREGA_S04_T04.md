# S04-T04 — Preparar envios pela ficha do cliente

Concluída em 12/10/2026. Sprint 04 encerrada tecnicamente. Mudanças preexistentes preservadas.

ClientSheet incorpora ClientPreparation: modo do cliente, explicação das regras, confirmação explícita por checkbox e POST `/api/contexto/envios/preparar` com somente `cliente_id`. Administrador/operador podem preparar cliente ativo; suporte não recebe a ação. Enquanto ocupado, confirmação/fechamento/novo envio bloqueiam. Falha mantém confirmação e mensagem para retry; sucesso exibe contadores reais `preparados`/`bloqueados`, incluindo zero, sem prometer uma quantidade previamente calculada no navegador.

“Abrir fila do cliente” consulta GET `/api/contexto/envios` e mostra os itens desse cliente em modal: ID, instrumento, destinatário/e-mail, situação, erro/motivo e versão expansível. Recarregar busca novamente e falha remove as linhas antigas. Guardas de desmontagem/geração descartam respostas antigas. Este encaminhamento é uma consulta real à fila dentro da ficha; operação completa, anexos, aprovação/cancelamento e gestão geral da área Envios seguem a Sprint 06. O preparo não executa processar/aprovar nem SMTP.

Backend do preparo passa a recusar cliente solicitado fora do escritório com 404. Serviço confere aplicabilidade atual/participação antes de gerar/reservar e revalida sua versão após PDF, antes de persistir. Documentos desatualizados, rejeitados ou excluídos bloqueiam mesmo se a seleção inicial tiver lido dados anteriores. Regras existentes de contatos/tipos, integridade, unicidade e auditoria de origem autenticada permanecem. Modo automático não dispensa revisão nesta operação: serviço grava `revisao`, sem aprovação implícita.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`, frontend e 148 módulos operacionais aprovados.
- `npx vitest run test/postgres-preparation-applicability.test.ts test/postgres-preparation-http.test.ts test/postgres-preparation-origin.test.ts test/postgres-documentos.test.ts test/api-transport.test.ts`: 13 testes. Três novos cenários impedem relatório/reserva quando a vista atual está desatualizada, rejeitada ou fora da participação. Contrato HTTP estrito, origem/ator da sessão, transporte e documentos preservados.
- `node test/vue-shell.e2e.mjs`: regressão Vue completa.
- `node test/postgres-https.integration.mjs`: novo helper `test/client-preparation-integrated-checks.mjs`, com documento/extração válidos e três contatos sintéticos. Checkbox obrigatório e cancelamento sem gravação. Candidato e exclusão retornam zero. Falha 503 injetada mantém confirmação e retry. Elegível produz um preparado; tipo incompatível produz um bloqueado; contato sem recebimento não participa.
- Banco confirma um item em `revisao`, aprovação nula, PDF/originais preparados e ator autenticado no snapshot. Modo do cliente configurado como automático durante o ensaio permanece sujeito a revisão. Repetição retorna zero novos preparados e mantém a linha integralmente idêntica. Outro escritório recebe 404 no preparo por cliente e não vê o item. Modal da fila mostra somente o contato permitido; estado persiste após recarga/reabertura. Suporte sem botão de preparar; demais papéis/portal preservados. Diretórios de cópias/originais temporários são removidos com caminhos verificados, fixtures limpas e banco descartado com ausência confirmada.
- `node test/postgres-envios.integration.mjs`: PDF/aprovação, SMTP TLS local, RLS, alterações bloqueadas, concorrência sem duplicação, SMTP ambíguo, recuperação e auditoria de preparo/rollback aprovados.
- 128 capturas em `.cache/ui-s04-t04`: oito novas de resultado/fila, claro/escuro, 1440/390 px, mais 120 de regressão. Resultado desktop claro e fila mobile escura inspecionados; sem overflow da página, com rolagem interna.
- `git diff --check` sem erros; aviso conhecido do script clássico de tema do Vite preservado.

Limites existentes mantidos: preparo seleciona até 20 pares por chamada e consulta geral da fila retorna até 500 itens, filtrados por cliente na ficha. Paginação e operação ampla da fila pertencem à Sprint 06; esta entrega não declara esses recursos concluídos.

Dados/bancos sintéticos isolados, SMTP somente no servidor local do ensaio de regressão. Nenhuma mensagem externa, coleta ou IA. Aceite visual humano separado.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s04-t04'`; `npm run test:vue-ui`; `npm run test:postgres-https`; `node test/postgres-envios.integration.mjs` após build. Interativo: `npm run dev`, escritório → Cadastros → Clientes → Ver ficha → Preparação de envios → Preparar/Abrir fila do cliente.

Próxima: **S05-T01 — lista de execuções, detalhe e atualização cancelável de monitoramento**.
