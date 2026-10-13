# S06-T03 — Aprovação e cancelamento de envio

Concluída em 12/10/2026.

- O administrador aprova apenas um envio em revisão com prévia, hash e versão atuais.
- O cancelamento aparece somente para estados que o backend aceita cancelar.
- As duas ações exigem confirmação explícita, bloqueiam duplicação enquanto gravam e atualizam a fila após a resposta.
- O backend mantém a decisão final de papel, estado, contexto, hash, versão, destinatário, aplicabilidade e anexos.

Verificado com `npm run typecheck`, `npm run build`, `node test/vue-shell.e2e.mjs`, `MEDIADOR_UI_VISUAL_DIR=.cache/ui-s06-t03 node test/postgres-https.integration.mjs` e `git -c core.safecrlf=false diff --check`. A jornada PostgreSQL/HTTPS confirmou contexto isolado e leitura da fila nos quatro papéis.
