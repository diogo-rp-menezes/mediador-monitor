# S04-T01 — Lista contextual de documentos do cliente

Concluída em 12/10/2026. Mudanças anteriores preservadas. Backend e permissões existentes mantidos; esta execução implementa a leitura operacional na ficha Vue.

ClientSheet substitui o aviso de implementação pendente por ClientDocuments, uma seção com lista autenticada de `/api/contexto/clientes/:id/documentos`. Exibe registro, tipo, vigência, aplicabilidade candidato/confirmado/rejeitado, motivo, origem automática/manual, responsável e justificativa quando presentes. Versão completa e data ficam em detalhes expansíveis. Estado desatualizado recebe aviso e usa o estado candidato retornado pelo servidor, sem reapresentar a decisão anterior como válida.

Busca sem distinção de caixa/acentos cobre registro, tipo, vigência, motivo, responsável e justificativa, combinada ao filtro de aplicabilidade. Contagem filtrada/total, limpeza de filtros, lista vazia e ausência de resultados são explícitas. Recarregar consulta a lista por GET; não executa a atualização de aplicabilidade por POST. Falha de leitura remove os dados antigos e oferece nova tentativa por recarga; falha de download preserva a lista com erro visível. Guardas de geração/desmontagem descartam respostas antigas. Filtros reiniciam ao reabrir a ficha ou trocar cliente.

Original usa o transporte contextual já autenticado, propagado de App por RegistryPanel e ClientSheet. Botão só aparece quando há arquivo informado; servidor confere associação ao cliente/escritório, caminho e SHA-256. Nome e extensão PDF/DOC seguem o tipo retornado. Há bloqueio contra downloads repetidos enquanto ocupado. Tabela usa rolagem horizontal interna em telas estreitas e mantém o conteúdo dentro do diálogo.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`: Vue/TypeScript e 148 módulos operacionais aprovados.
- `npx vitest run test/postgres-documentos.test.ts test/api-transport.test.ts`: sete testes de escopo, integridade, caminho permitido, decisão obsoleta e transporte/erros.
- `node test/vue-shell.e2e.mjs`: regressão completa, incluindo ficha móvel, cadastros, documentos, revisão, publicação, conta e contexto; fixture adaptada ao novo GET de documentos do cliente.
- `node test/postgres-https.integration.mjs`: novo helper `test/client-documents-integrated-checks.mjs`, integrado à jornada administrativa real. Três documentos sintéticos com estados candidato, confirmado e rejeitado; motivos/responsável/justificativa e versão retornada pela API conferidos na UI. Filtros combinados, busca sem acentos, ausência de resultados e limpeza comprovados.
- Download pela ficha confere nome e bytes originais; documento sem arquivo mostra indisponibilidade. Mudança do hash torna a decisão candidata/desatualizada e remove o responsável anterior da vista; tentativa de download recebe 409 por integridade. Restauração permite nova leitura da decisão válida. Lista e original pelo escritório B recebem 404. Snapshot das associações no banco permanece idêntico após leitura, filtro e download.
- Falha de leitura 503 injetada no transporte preserva a mensagem e remove linhas antigas; retry volta a ler PostgreSQL. Recarga e fechamento/reabertura mantêm a decisão persistida e reiniciam filtros. Jornadas anteriores e papéis administrador, operador, suporte e plataforma, além do portal, continuam aprovados. Fixtures/diretório temporário removidos com caminho verificado e banco descartável removido com ausência confirmada.
- 104 capturas em `.cache/ui-s04-t01`: oito novas de lista e decisão desatualizada, claro/escuro e 1440/390 px, mais 96 de regressão. Lista desktop clara e mobile escura inspecionadas; sem overflow da página, com rolagem interna do diálogo/tabela.
- `git diff --check` sem erros. Aviso conhecido do script clássico de tema inicial no Vite preservado.

Sem coleta, IA ou envio externo. As decisões de confirmar/rejeitar serão implementadas na S04-T02; inclusão histórica e preparação seguem S04-T03/T04. Aceite visual humano separado.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s04-t01'`; `npm run test:vue-ui`; `npm run test:postgres-https`. Interativo: `npm run dev`, escritório → Cadastros → Clientes → Ver ficha → Documentos da empresa.

Próxima: **S04-T02 — confirmar/rejeitar aplicabilidade em modal**.
