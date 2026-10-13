# S04-T03 — Inclusão histórica e participação no envio

Concluída em 12/10/2026. Mudanças preexistentes preservadas. Lacuna D03 resolvida sem migração de banco: o campo já existia, mas faltavam exposição HTTP e edição independente.

GET `/api/contexto/clientes/:id/documentos` passa a expor `incluir_envio` booleano, `primeira_vez` e `historico` (documento conhecido antes do cadastro do cliente). A ficha mostra participação nas próximas preparações e identifica documentos anteriores. Modal “Participação no envio”, disponível a administrador/operador, permite incluir/excluir com justificativa obrigatória e versão conferida. Confirmar/rejeitar aplicabilidade preserva a participação. Recálculo preserva tanto true quanto false de associações existentes; documentos históricos descobertos continuam iniciando sem participação, enquanto a regra inicial de documentos novos permanece vigente. Flags já gravadas são preservadas.

Contrato novo: POST `/api/contexto/clientes/:id/documentos/participacao`, corpo estrito `{numero, incluir_envio: boolean, justificativa, versao}`. Justificativa normalizada de 1–2000 caracteres; versão SHA-256. Usa `documentos.revisar`, autorização/CSRF/contexto existentes e identidade autenticada. Serviço trava o cliente, valida associação/escopo, versão e contexto atuais; inclusão exige cliente ativo. Altera somente flag/data, mantendo situação/motivo/origem/responsável/justificativa de aplicabilidade. Auditoria transacional registra ator, versão conferida, justificativa e antes/depois. Retorna lista atualizada. Payload inválido retorna 400, fora do escopo 404 e versão/contexto/inatividade incompatíveis 409.

Incluir um histórico exige ação explícita de participação, independente da decisão de aplicabilidade. Participação não torna candidato/rejeitado apto: a preparação continua exigindo confirmado, cliente/contato ativos, preferências, documentos íntegros e revisão/aprovação. Esta ação não prepara/aprova e-mails nem muda envios já preparados. A UI explica que a fila gerencia esses envios.

Modal reaproveita tratamento de gravação e conflito: bloqueia campos/envio enquanto ocupado, cancela sem gravar, conserva rascunho no 409 e exige atualizar/reabrir para nova conferência. Sucesso ocorre somente após resposta persistida. Atualização é explícita; não repete a decisão automaticamente.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`, frontend e 148 módulos operacionais.
- `npx vitest run test/postgres-documentos.test.ts test/api-transport.test.ts`: sete testes, incluindo flag exposta com decisão desatualizada e escopo/integridade/transporte preservados.
- `node test/vue-shell.e2e.mjs`: regressão Vue completa.
- `node test/postgres-https.integration.mjs`: novo helper `test/client-participation-integrated-checks.mjs`, integrado à fixture de documentos. Documento sintético anterior ao cadastro permanece fora da preparação mesmo após confirmação de aplicabilidade. Cancelar não altera linha; incluir/excluir pela Vue persiste sem modificar campos de aplicabilidade. Recarga/reabertura confirma estado. Justificativa vazia/espaços bloqueia envio.
- Mudança concorrente real provoca 409 sem sobrescrever a linha; rascunho permanece, envio bloqueia, atualização/reabertura permite exclusão na versão atual. API recusa escopo estrangeiro, justificativa vazia e booleano em texto. Auditoria confere ator e justificativa/estado final. Reconfirmação não reativa participação; recálculo de documento recente correspondente ao CNPJ preserva exclusão. Snapshot completo da fila permanece idêntico. Suporte lê sem ações de decisão/participação; demais papéis e portal permanecem aprovados. Banco descartável removido com ausência confirmada.
- `node test/postgres-envios.integration.mjs`: PDF/aprovação, SMTP TLS local, RLS, alterações bloqueadas, concorrência sem duplicação, SMTP ambíguo, recuperação e auditoria de preparo/rollback aprovados. Primeira tentativa revelou fixture antiga com pool de uma conexão incompatível com o gate atual de backup, que exige duas. Apenas a configuração dos pools desse teste foi ajustada para duas conexões; proteção operacional preservada.
- 120 capturas em `.cache/ui-s04-t03`: oito novas de inclusão/conflito, claro/escuro, 1440/390 px, mais 112 de regressão. Modal desktop claro e conflito mobile escuro inspecionados; sem overflow da página, rolagem interna preservada.
- `git diff --check` sem erros. Aviso conhecido do script clássico de tema do Vite preservado.

Dados sintéticos e bancos isolados. SMTP apenas no servidor local do ensaio de regressão; nenhuma mensagem externa, coleta ou IA. Participação não gera preparação/aprovação. Aceite visual humano separado.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s04-t03'`; `npm run test:vue-ui`; `npm run test:postgres-https`; `node test/postgres-envios.integration.mjs` após build. Interativo: `npm run dev`, escritório → Cadastros → Clientes → Ver ficha → Documentos da empresa → Alterar participação.

Próxima: **S04-T04 — preparar envios a partir da ficha do cliente**.
