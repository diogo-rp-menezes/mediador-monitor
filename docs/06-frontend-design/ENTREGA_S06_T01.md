# S06-T01 — Fila operacional de envios

Concluída em 12/10/2026.

## Entrega

- A área **Envios** agora apresenta uma fila contextual real, substituindo o painel pendente.
- O painel consulta `GET /api/contexto/envios`, resume revisão, fila/em processamento, atenção e enviados, e mantém o estado individual de cada linha.
- Todos os estados do contrato são exibidos: bloqueado, preparando, revisão, na fila, enviando, enviado, falhou, cancelado e incerto.
- Filtros por texto, situação, empresa e destinatário são aplicados somente aos até 500 itens retornados pelo backend; a tela informa a contagem filtrada.
- O polling é cancelado ao sair ou trocar de contexto. Falhas preservam a última resposta válida e oferecem nova tentativa.

Esta entrega é somente de consulta. Prévia, anexos, aprovação, cancelamento e repreparação permanecem nas próximas tasks da Sprint 06.

## Verificação

- `npm run typecheck`
- `npm run build`
- `node test/vue-shell.e2e.mjs`
- `MEDIADOR_UI_VISUAL_DIR=.cache/ui-s06-t01 node test/postgres-https.integration.mjs`
- `git -c core.safecrlf=false diff --check`

A jornada PostgreSQL/HTTPS/Chromium comprovou os nove estados, totais, filtros, indisponibilidade com preservação da tabela, retry, recarga e isolamento entre escritórios para administrador, operador, suporte e administrador da plataforma. As quatro capturas ficam em `.cache/ui-s06-t01/envios-filtros-{light,dark}-{1440,390}.png`.
