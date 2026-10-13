# S03-T05 — Relatórios finais, publicações e auditoria

Concluída em 12/10/2026. Sprint 03 encerrada tecnicamente; próxima execução S04-T01. Mudanças preexistentes preservadas.

D01 resolvida: GET `/api/contexto/relatorio` aceita `formato=pdf|md`. PDF interno usa o gerador Chromium existente e o relatório restrito ao escritório/cliente. Ambos exigem consolidação atual sem pendências e acesso do cliente aos documentos envolvidos. Após gerar, o servidor revalida autorização, versão/conteúdo Markdown e, para PDF, fingerprint dos dados e originais antes de auditar e servir. Download interno não cria publicação. Respostas têm tipo correto, attachment, no-store e nosniff; auditoria registra formato, versão da interpretação, versão do relatório e hash dos bytes servidos.

PublicationsPanel envia `versao_interpretacao` consultada. Backend compara antes da geração e mantém a revalidação do fingerprint após gerar, recusando mudanças com 409. Campo opcional mantém compatibilidade com consumidores anteriores; a interface Vue sempre envia a versão conferida. Identificação da interpretação é distinta do fingerprint da publicação por cliente. Seletores e confirmação ficam bloqueados durante a operação, assim como abertura de nova publicação. Revogação mantém confirmação explícita e cancela notificações pendentes conforme contrato existente.

Markdown identifica o aditivo das decisões PostgreSQL usando o campo `aditivo` quando `instrumento` não está presente, mantendo compatibilidade com o formato anterior.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`: frontend e 148 módulos operacionais compilados.
- `npx vitest run test/postgres-publicacoes.test.ts test/postgres-consolidacao.test.ts test/api-transport.test.ts`: oito testes, incluindo versão conferida antiga recusada antes de gerar PDF ou persistir, mudança durante geração, fila/auditoria transacional e revogação.
- `node test/vue-shell.e2e.mjs`: regressão completa, prontidão, conflito, payload com versão, detalhes, confirmação de revogação, CSV e restrições de suporte.
- `node test/postgres-https.integration.mjs`: jornada real com novo helper de relatórios/publicações, integrado à fixture de consolidação. Pendências bloqueiam PDF/MD e publicação com 409. UI baixa os dois arquivos; Markdown contém versão, regra manual e aditivo identificado; PDF extraído por pdf-parse contém regra manual, justificativa, decisões e CNPJ. Tipos, nomes, bytes PDF e escopo entre escritórios conferidos.
- Criação real pela Vue retorna 201 e persiste relatório, PDF e versão. Versão conferida antiga retorna 409. Mudança posterior do vínculo bloqueia nova publicação e ambos os relatórios, sem alterar nenhum campo do snapshot publicado. Revogação pela UI exige checkbox, persiste estado e preserva versão/PDF. Escritório B não lista nem revoga a publicação de A e não lê seus eventos. Auditoria registra publicação/revogação; CSV baixado pela UI e conteúdo conferido pela API. Jornada existente do portal mantém download íntegro, ciência, CSRF, revogação e isolamento.
- 96 capturas em `.cache/ui-s03-t05`: 12 novas de criar, revogar e auditoria, claro/escuro, 1440/390 px, mais 84 de regressão. Modal desktop claro e confirmação mobile escuro inspecionados; página sem overflow horizontal.
- `git diff --check` sem erros. Aviso conhecido do script clássico de tema no Vite preservado.

Fixtures usam somente dados sintéticos, banco descartável e SMTP desabilitado, sem consumidor externo de notificações. Auditoria imutável e publicação ficam até o descarte do banco; limpeza preserva o registro referenciado pelo snapshot e remove originais temporários no diretório verificado. Banco descartado com ausência confirmada. Sem IA, coleta ou notificações externas. Aceite visual humano separado.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s03-t05'`; `npm run test:vue-ui`; `npm run test:postgres-https`. Interativo: `npm run dev`, escritório → Documentos → Revisões/Publicações/Acessos e ciência.

Próxima: **S04-T01 — lista contextual de documentos do cliente com filtros de aplicabilidade**.
