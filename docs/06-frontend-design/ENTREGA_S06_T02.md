# S06-T02 — Detalhe, prévia e anexos de envio

Concluída em 12/10/2026.

## Entrega

- Cada linha da fila abre um modal com empresa, destinatário, estado, versão, aplicabilidade, tentativas e motivo/erro.
- A prévia é lida somente do `snapshot` sanitizado pelo backend: destinatário, assunto, mensagem, versão, hash e metadados dos anexos.
- Prévia ausente e versão diferente da registrada são indicadas antes de qualquer aprovação futura.
- Anexos são baixados por `GET /api/contexto/envios/:id/anexos/:indice` com headers de contexto; caminhos internos não chegam ao navegador.

## Verificação

- `npm run typecheck`
- `npm run build`
- `node test/vue-shell.e2e.mjs`
- `MEDIADOR_UI_VISUAL_DIR=.cache/ui-s06-t02 node test/postgres-https.integration.mjs`

A jornada HTTPS/PostgreSQL validou a prévia e o download do arquivo real nos quatro papéis, recusou o mesmo anexo em outro contexto e confirmou recarga e isolamento. Capturas: `.cache/ui-s06-t02/envios-detalhe-{light,dark}-{1440,390}.png`.
