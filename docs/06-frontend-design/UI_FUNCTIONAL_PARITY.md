# Matriz de funcionalidades e entrega da UI final

Diretriz aprovada em 11/10/2026: Vue será a única interface operacional. Não manter fallback nem implementar compatibilidade com a UI anterior. Dados locais são de desenvolvimento. Cada incremento precisa aparecer na aplicação para validação visual. Não há autorização para distribuir ou publicar em nuvem.

Baseline estático atualizado pela S00-T01: [contratos, permissões e divergências](BASELINE_UI_INTEGRADA.md). Evidências históricas abaixo não foram reexecutadas nesse levantamento. O backend vigente em `src/postgres-gestao-http.ts` e `src/postgres-auth-http.ts` prevalece sobre scripts históricos e placeholders.

## Critérios de entrega

- Funcional: tela conectada à API real, campos necessários preservados, permissões, estados vazio/carregando/erro e confirmação das operações.
- Estrutura: tela navegável com indicação explícita de implementação pendente. Não inventar dados nem apresentar sucesso de operação inexistente. Explicar comportamento, contrato e trabalho restante; ações indisponíveis devem ficar identificadas.
- Concluído: conferir interação no navegador e persistência quando aplicável. Compilação isolada não comprova funcionalidade.
- Cada entrega informa endereço para validação, funcionalidades prontas, estruturas pendentes e verificações executadas.

## Fontes e versões

1. UI global histórica: `web/index.html`, `clientes-ui.js`, `resumo-ui.js`. Fonte de descoberta de recursos; suas rotas antigas não devem ser restauradas.
2. Workspace PostgreSQL: `web/acesso.html`, `auth-ui.js`, `gestao-ui.js`, `monitoramento-ui.js`, `publicacoes-ui.js`, `ia-plataforma-ui.js`. Fonte de contratos e permissões operacionais.
3. Vue atual: `frontend/src/App.vue` e componentes. Destino único; preservar a identidade oficial, lateral recolhível, desktop first, modais e toast.
4. Mockups aprovados: organização visual; não demonstram cobertura funcional.

Referências literais de endpoints estão em [UI_FUNCTIONAL_SOURCE_INVENTORY.md](UI_FUNCTIONAL_SOURCE_INVENTORY.md), regeneráveis pelo script. Rotas presentes apenas na versão global exigem classificação: migrar comportamento necessário usando API PostgreSQL, ou documentar substituição/remoção. Não recriar dependências SQLite.

## Matriz por domínio

S01-T01: [aparência compartilhada aplicada e validada](ENTREGA_S01_T01.md), com temas claro/escuro, tokens únicos, estados e capturas reais desktop/mobile. Essa entrega preserva os fluxos existentes e não conclui os painéis pendentes.

Baseline de ensaio S00-T03: [ambiente descartável e evidências](AMBIENTE_VALIDACAO_UI_INTEGRADA.md). Login, navegação contextual, troca/recarga, isolamento e permissões dos papéis reais passaram em PostgreSQL/HTTPS/Chromium. Essa evidência não encerra as telas funcionais ainda pendentes.

| Domínio | Comportamentos a preservar ou substituir explicitamente | Vue atual / trabalho restante |
| --- | --- | --- |
| Acesso | Login, recuperação e redefinição de senha, logout, sessão expirada, perfil/nome | Login e recuperação existentes preservados; S01-T04 entrega Minha conta com nome persistido, e-mail somente leitura, identidade sincronizada e expiração pelo transporte comum. [Evidências](ENTREGA_S01_T04.md) |
| Contexto | Escritórios/empresas disponíveis, troca automática, concessão administrativa auditada, isolamento, término da concessão | S01-T02: seletor no topo, papel/contexto explícitos, troca/recarga isoladas e encerramento por limpeza/botão validados no PostgreSQL; falha de encerramento preserva contexto para retry |
| Visão geral | Indicadores, últimos documentos, atividade, pendências e atalhos | Conteúdo Vue ainda introdutório; consumir APIs contextuais, sem restaurar indicadores globais indevidos |
| Clientes | Razão social/fantasia, CNPJ, localidade/UF, situação, modo de envio, consulta cadastral explícita, detalhe, exclusão | S02-T01 refina lista/filtros/ficha; S02-T02 refina editor/consulta, valida aplicação explícita, erros/concorrência e persistência de campos/metadados e CNPJ numérico/alfanumérico. S04-T01 conclui lista de documentos por cliente, filtros, motivos/versões, leitura de decisões e originais autenticados. S04-T02 conclui confirmar/rejeitar em modal com justificativa, responsável autenticado, conflito 409 com atualização/reabertura e decisões persistentes/auditadas. S04-T03 conclui inclusão histórica e participação independente, com versão/justificativa/auditoria, exclusão preservada após decidir/recalcular e fila inalterada. D03 resolvida. S04-T04 conclui preparo com confirmação, resultado real e consulta à fila do cliente; candidato/exclusão/tipos, revisão e repetição sem duplicação comprovados. Operação completa da fila segue Sprint 06. [Listas](ENTREGA_S02_T01.md), [editor](ENTREGA_S02_T02.md) |
| Vínculos do cliente | Contatos com função, recebimento e tipos; sindicatos com categoria, UF, município, principal e confirmação | S02-T03 refina as abas e comprova persistência real por ID, preferências, principal único, edição independente e desvinculação após recarga. [Evidências](ENTREGA_S02_T03.md) |
| Contatos | Nome, e-mail, telefone, cargo, situação, CRUD e restrições de exclusão | Implementados; S02-T01 refina lista/filtros/ação principal e comprova criação, edição/inativação, cancelamento e exclusão com recargas PostgreSQL; validações da API preservadas. [Evidências](ENTREGA_S02_T01.md) |
| Sindicatos | Catálogo compartilhado e consultas privadas, nome, CNPJ, categoria, UF, título, vigência, tipos, situação | S02-T04 refina consultas privadas e valida filtros/tipos/inativação, exclusão sujeita a vínculo, isolamento A/B e catálogo inalterado no PostgreSQL. Administração do catálogo compartilhado falta na Plataforma. [Evidências](ENTREGA_S02_T04.md) |
| Documentos da empresa | Candidatos, confirmados/rejeitados, motivo, responsável/justificativa, inclusão de anteriores e preparação de e-mails | S04-T01–T04 concluídas: componente próprio na ficha, decisões/versionamento, participação histórica e preparo idempotente por contatos/tipos. A consulta operacional global dos envios segue a Sprint 06. |
| Instrumentos | Busca, filtros, ordenação, ficha, original, análise, evidências, clientes relacionados | S03-T01–T02 concluídas: catálogo/original e leitura de template, tópicos antigos, aditivo, formato alternativo e ausência; campos vazios, zero/falso, referências parciais e citações conferidos. Encaminhamento à Plataforma só para administrador global; operação de reanálise segue em S08-T04 |
| Análise | Template Markdown canônico, resumo bento, campos ausentes, referências, original e reanálise autorizada | Leitura estruturada implementada; reanálise será ação da Plataforma com fila real; não disparar processamento diretamente no browser |
| Aditivos | Vínculo/rejeição, justificativa, revisão concorrente, relação CCT/aditivo | S03-T03 concluída: decisão registrada/proposta, revisão visível, 409 bloqueia novo envio até atualização; rascunho preservado. Vínculo/remoção/reabertura, tipos, escopo e papéis conferidos na jornada Vue/API/PostgreSQL real |
| Consolidação | Gerar/atualizar, versão, pendências, histórico, regras finais, revisar manter/aplicar/manual, justificativa, conflito | S03-T04 concluída: decisões/pendências distintas, comparação de regras e versão completa; manter/manual via UI e aplicar em cliente concorrente real, justificativas/ator/versões persistidos, recarga e conflito sem sobrescrita. Mudança de vínculo bloqueia revisão/relatório; PDF interno concluído na S03-T05/D01 |
| Relatórios | PDF/Markdown por cliente, bloquear versão desatualizada/pendências, download autenticado | S03-T05 concluída: PDF/MD internos por cliente, arquivos reais conferidos, versão/pendências e isolamento aplicados no servidor; D01 resolvida. PDF de publicação/portal preservado |
| Publicações | Prontidão, cliente/CCT, versão imutável, detalhes, revogação confirmada | S03-T05 concluída: criação/revogação reais pela Vue, versão conferida enviada e validada, pendências/desatualização bloqueadas, snapshot PDF/versão preservado após mudança dos insumos e revogação |
| Auditoria | Eventos, ator, IP, resultado, data, filtros, CSV | S03-T05 concluída: eventos de publicação/revogação, ator/IP, leitura e download CSV reais, isolamento entre escritórios preservado |
| Portal da empresa | Lista publicada, abrir PDF, download, ciência confirmada, revogação e isolamento | Implementado em Vue e validado com PostgreSQL/HTTPS real. Lista via `/api/portal/documentos`; abrir/baixar por ID; ciência com confirmação, identidade/IP registrados no servidor |
| Monitoramento | Coleta manual, execuções, estados, agenda por intervalo/semanal/fuso, limites, cancelamento e recuperação com justificativa | S05 concluída: últimas 100 execuções, cinco estados, filtro/detalhe e polling cancelável; solicitação auditada e worker controlado sem novos instrumentos; agendas persistentes por intervalo/semanal/fuso sem duplicação; limites administrativos com herança/tetos/efetivos; cancelamento em fila ou execução reservada sem antecipar encerramento. Recuperação administrativa exige justificativa e confirmação de consumidor encerrado, somente para administrador; o servidor obtém exclusividade, invalida a reserva/token, registra auditoria e marca a mesma execução como falhou sem reenfileirar coleta. Vue/HTTPS/PostgreSQL, recarga e isolamento comprovados |
| Envios | Fila por destinatário/documento, filtros/resumo, preparo, aprovação/revisão, tentativas, falhas/recuperação e preferências | S06-T01–T03 concluídas: lista e detalhe contextual, snapshot sanitizado e anexos autenticados. Administrador vê aprovação somente para prévia atual em revisão e cancelamento somente nos estados aceitos; ambas as ações exigem confirmação e sempre enviam o hash/CSRF ao servidor, que revalida estado, versão, destinatário e aplicabilidade. Histórico/repreparação e processamento seguem S06-T04–T05. [Fila](ENTREGA_S06_T01.md), [detalhe](ENTREGA_S06_T02.md), [ações](ENTREGA_S06_T03.md) |
| Escritório | Dados cadastrais, membros/papéis, convites/acessos, canais/configurações de e-mail e limites | Pendente. Convites não possuem contrato vigente (D06); SMTP não possui teste de conexão (D07). Formular com schemas atuais; segredos nunca retornados em texto; modais por responsabilidade e testar conexão quando API oferecer |
| Plataforma | Escritórios CRUD, catálogo sindical, coleta global/fila, IA/configuração/teste/solicitações/tentativas/recuperação | Pendente. Coleta global expõe somente leitura de configuração (D08). API global apenas para administrador da plataforma; separar subáreas, configurações em modal e auditoria preservada |
| Configurações históricas | Scheduler, canais Slack/e-mail, IA/modelo/provedor, filtros e opções globais | Classificar por endpoint atual: escritório ou plataforma. Não copiar configurações obsoletas nem expor credenciais globais ao escritório; registrar cada decisão na matriz antes de encerrar migração |
| Shell | Tema, recolhimento, mobile de apoio, largura disponível, teclado/foco, toast, modais | S01-T01–T04: tokens/temas, recolhimento persistido, topo/conta, menu móvel, hash com recarga/histórico/fallback autorizado e perfil validados. [Shell](ENTREGA_S01_T02.md), [navegação](ENTREGA_S01_T03.md), [conta](ENTREGA_S01_T04.md) |

## Sequência de corte e implementação

1. Inventário e contratos: este documento e inventário gerado. A matriz é inicial; revisar campos/operações de cada domínio ao implementá-lo, registrando toda divergência encontrada.
2. Tornar Vue principal em `/` e `/acesso`, manter `/app/` somente como alias da mesma UI. Remover links/fallbacks para páginas antigas. Login/recuperação podem continuar independentes como telas ativas, sem duplicar workspace.
3. Criar estruturas navegáveis dos domínios pendentes com descrição técnica rastreável. Não transformar stubs em ações falsas.
4. Completar documentos/aplicabilidade do cliente e portal da empresa.
5. Monitoramento e Envios com APIs reais.
6. Escritório, Plataforma, perfil, configurações e visão geral contextual.
7. Atualizar testes reais para a única interface, retirar referências de execução dos módulos antigos e remover arquivos sem uso. Código anterior serve apenas para inventário até sua remoção, sem precisar mantê-lo funcional.

O corte de rota foi aplicado: `/`, `/acesso` e `/app/` servem Vue; scripts do workspace anterior não são mais servidos. Portal da empresa implementado. Progresso detalhado em [VUE_FINALIZATION_PLAN.md](VUE_FINALIZATION_PLAN.md). Não considerar os domínios pendentes funcionais até a entrega correspondente. A matriz deve ser atualizada junto com cada incremento, sem encerrar itens por haver somente estrutura visual.
