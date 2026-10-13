# S04-T02 — Confirmar e rejeitar aplicabilidade

Concluída em 12/10/2026. Mudanças anteriores preservadas. Contratos PostgreSQL e suas permissões mantidos.

ClientDocuments oferece “Decidir aplicabilidade” aos papéis de escrita recebidos pela ficha (administrador/operador). Modal mostra registro, tipo/vigência, situação/motivo consultados e versão completa expansível. Decisão confirmado/rejeitado exige justificativa não vazia, limitada a 2000 caracteres e enviada sem espaços externos. Nome/identidade do responsável vêm da sessão no servidor; não há campo editável nem envio de responsável no payload estrito. Cancelamento não grava.

Confirmação sem original informado fica bloqueada na UI; o servidor continua exigindo caminho permitido e hash íntegro. Rejeição admite ausência de original conforme contrato existente. Documento já desatualizado abre com gravação bloqueada e exige atualização. Durante gravação/atualização, campos, fechamento e envio ficam bloqueados. Resultado só altera lista e mostra sucesso após resposta persistida; respostas de geração/desmontagem antigas são descartadas.

POST `/api/contexto/clientes/:id/documentos/decidir` envia somente numero/status/justificativa/versao. No 409, rascunho permanece visível, sem novo envio. “Atualizar e conferir novamente” explica que fecha o rascunho e consulta o estado recalculado via POST `/documentos/atualizar`; a decisão exige reabertura e nova justificativa. Atualização com erro mantém modal/rascunho e admite retry. Nenhuma decisão é reenviada automaticamente.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`: Vue/TypeScript e build operacional aprovados.
- `npx vitest run test/postgres-documentos.test.ts test/api-transport.test.ts`: sete testes de isolamento, integridade, caminho, desatualização e transporte de erros/status.
- `node test/vue-shell.e2e.mjs`: regressão completa de cadastros, ficha, documentos, revisões, publicações, conta e contexto.
- `node test/postgres-https.integration.mjs`: helper real de documentos ampliado para decidir pela Vue. Justificativa vazia/espaços bloqueia gravação; cancelar deixa a associação idêntica. Confirmação persiste estado/manual/justificativa normalizada e nome autenticado; rejeição sem original persiste justificativa. Confirmação sem original e decisão desatualizada ficam bloqueadas.
- Decisão concorrente real pela API modifica versão enquanto o modal está aberto. Gravação antiga recebe 409; rascunho permanece e linha no banco fica idêntica à concorrente. Atualização 503 injetada preserva rascunho; retry lê o servidor, fecha modal e mostra rejeição concorrente. Reabrir inicia justificativa vazia; nova confirmação persiste na versão atual. Responsável e ator conferidos na auditoria; consulta/decisão fora do escritório recusadas. Decisões e justificativas persistem após recarga/reabertura. Registros originais permanecem integralmente idênticos.
- Suporte autenticado lê ficha/tabela sem botão de decisão; papéis/contexto e demais jornadas reais continuam aprovados. Dados sintéticos, diretório temporário com caminho verificado e banco descartável removidos; ausência do banco confirmada.
- 112 capturas em `.cache/ui-s04-t02`: oito novas de confirmação e conflito em claro/escuro, 1440/390 px, mais 104 de regressão. Modal de confirmação desktop claro e conflito mobile escuro inspecionados; sem overflow da página e rolagem interna do modal.
- `git diff --check` sem erros. Aviso conhecido do script clássico de tema do Vite preservado.

Sem IA, coleta, preparação ou envio externo. O efeito existente da decisão sobre `incluir_envio` permanece no serviço; esta tarefa não cria controle independente desse campo. D03 deve ser resolvida na S04-T03 antes de concluir inclusão histórica/participação no envio. Aceite visual humano separado.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s04-t02'`; `npm run test:vue-ui`; `npm run test:postgres-https`. Interativo: `npm run dev`, escritório → Cadastros → Clientes → Ver ficha → Documentos da empresa → Decidir aplicabilidade.

Próxima: **S04-T03 — inclusão histórica e controle de participação no envio, incluindo contrato D03**.
