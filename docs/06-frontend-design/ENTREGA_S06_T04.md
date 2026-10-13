# S06-T04 — Histórico de tentativas e repreparação

Concluída em 13/10/2026.

- O detalhe do envio consulta o histórico imutável em `GET /api/contexto/envios/:id/tentativas` e exibe resultado, data e erro de cada tentativa, além do contador e das datas do envio.
- A repreparação é exclusiva do administrador, chama o endpoint contextual e atualiza a fila somente depois da resposta do servidor. O backend remove snapshot, aprovação, erro e próxima tentativa antes de preparar uma nova prévia.
- Entregas incertas mostram a orientação para conferir o provedor e exigem confirmação explícita do risco de duplicidade; falha, cancelamento e estados em andamento mantêm as transições previstas pelo backend.
- A autorização e o isolamento permanecem no handler PostgreSQL: leitura de tentativas usa a permissão de documentos internos e a repreparação exige `envios.aprovar`.

Verificado com:

- `npm run typecheck`
- `npm run build`
- `npx vitest run test/postgres-fila-envios.test.ts -t "lista apenas o histórico|repreparação devolve"` (2 testes)
- `node test/vue-shell.e2e.mjs` (jornada controlada, incluindo histórico, risco de duplicidade, repreparação, aprovação, cancelamento e filtros)
- `npm run test:postgres-https` (jornada PostgreSQL/HTTPS real e regressões nos quatro papéis)
- `git -c core.safecrlf=false diff --check`

A suíte Vitest ampla ainda possui duas falhas preexistentes no cenário mockado do worker (`worker confere versão atual v1/v2`); elas não atravessam o histórico/repreparação e ficam registradas para correção própria antes da validação final do ciclo de entrega. Nenhum SMTP externo foi usado; o aceite visual humano continua separado.

Próxima: **S06-T05 — recuperação/processamento autorizados e validação do ciclo de entrega**.
