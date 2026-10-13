# S03-T04 — Consolidação e revisão por campo

Concluída em 12/10/2026. Base inspecionada: ConsolidationPanel, contratos PostgreSQL de consolidação/revisão, fingerprint dos insumos, histórico por campo e gates de relatório/publicação. Mudanças preexistentes preservadas.

Painel distingue alterações pendentes das revisadas e exibe a regra extraída, cláusula, citação, decisão, justificativa e responsável quando disponível. Decisões registradas recebem seção própria com valor decidido. Versão completa pode ser consultada; resumo informa quando a versão atual está sem pendências.

Modal compara a regra anterior à alteração com a regra consolidada atual e a proposta do aditivo. A opção de aplicar identifica corretamente a regra extraída, pois o backend usa o valor analisado, não o texto da citação. Manter preserva o valor anterior; manual exige texto não vazio. Justificativa exige ao menos oito caracteres sem espaços externos. Campos ficam bloqueados durante salvamento.

No 409, a versão local fica desatualizada, bloqueando revisão/exportação. O rascunho permanece visível, mas não pode ser reenviado. “Consultar versão atual” avisa que fecha esse rascunho, busca a situação atual e permite reabrir o campo para nova decisão explícita. Respostas/finalizações antigas só alteram estado quando pertencem à geração atual; troca de base limpa seleção de cliente e modal.

Verificações aprovadas:

- `npm run typecheck`, build operacional e build frontend final.
- `npx vitest run test/postgres-consolidacao.test.ts test/api-transport.test.ts`: quatro testes de isolamento e propagação de status/CSRF/expiração.
- `node test/vue-shell.e2e.mjs`: regressões completas, consolidação desatualizada, conflito bloqueia reenvio até nova leitura, revisão libera relatório somente sem pendências e suporte sem ações de consolidar/revisar.
- `node test/postgres-https.integration.mjs`: jornada completa real com novo helper `test/consolidation-integrated-checks.mjs`. Usa CCT/aditivo sintéticos com originais HTML .doc íntegros e extrações estruturadas válidas. Consolidação determinística pela API produz três pendências; manter pela UI resolve só a primeira, aplicar por cliente concorrente resolve só a terceira e manual pela UI resolve a segunda. Evolução 3→2→1→0 confirmada no banco, com valores, justificativas, ator e quatro versões históricas. A tentativa manual aberta na versão antiga recebe 409 e deixa a linha persistida idêntica à decisão concorrente; nova leitura/reabertura permite salvar. Estado final persiste após recarga.
- Alteração posterior da revisão do vínculo invalida a consolidação: UI remove ações de revisão/relatório e API recusa revisão antiga com 409. Consulta por outro escritório retorna 404. Registros originais permanecem integralmente idênticos. Fixtures e diretório temporário verificado removidos; banco descartável removido com ausência confirmada.
- 84 capturas em `.cache/ui-s03-t04`: 12 novas reais de pendências, conflito e decisões, em claro/escuro e 1440/390 px, mais 72 de regressão. Estados desktop claro e conflito mobile escuro inspecionados; página sem overflow horizontal, modal com rolagem interna.
- `git diff --check` sem erros; avisos conhecidos CRLF e script clássico de tema inicial permanecem.

Arquivos: ConsolidationPanel, helper de consolidação, runners Vue/fixture integrada, documentação e artefato Vue. Backend e regras de consolidação/revisão preservados. Nenhuma chamada a IA ou coleta externa.

**O contrato do PDF interno continua pendente em S03-T05/D01**, conforme baseline; esta entrega valida a consolidação e os bloqueios de acesso aos relatórios, sem declarar o PDF interno operacional. Publicação/revogação e relatórios finais terão sua jornada dedicada na próxima tarefa.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s03-t04'`; `npm run test:vue-ui`; `npm run test:postgres-https`. Interativo: `npm run dev`, selecionar escritório, Documentos → Revisões → CCT para revisão. Aceite visual humano separado.

Próxima: **S03-T05 — relatórios finais, publicações e auditoria**.
