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

Baseline de ensaio S00-T03: [ambiente descartável e evidências](AMBIENTE_VALIDACAO_UI_INTEGRADA.md). Login, navegação contextual, troca/recarga, isolamento e permissões dos papéis reais passaram em PostgreSQL/HTTPS/Chromium. Essa evidência não encerra as telas funcionais ainda pendentes.

| Domínio | Comportamentos a preservar ou substituir explicitamente | Vue atual / trabalho restante |
| --- | --- | --- |
| Acesso | Login, recuperação e redefinição de senha, logout, sessão expirada, perfil/nome | Login externo ao Vue funcional; perfil ainda precisa de painel. Preservar autenticação existente; remover apenas navegação ao workspace antigo |
| Contexto | Escritórios/empresas disponíveis, troca automática, concessão administrativa auditada, isolamento, término da concessão | Dropdown e troca implementados; conferir encerramento explícito, navegação por papel e invalidação das telas |
| Visão geral | Indicadores, últimos documentos, atividade, pendências e atalhos | Conteúdo Vue ainda introdutório; consumir APIs contextuais, sem restaurar indicadores globais indevidos |
| Clientes | Razão social/fantasia, CNPJ, localidade/UF, situação, modo de envio, consulta cadastral explícita, detalhe, exclusão | Implementados; documentação/aplicabilidade e histórico de envios da empresa faltam |
| Vínculos do cliente | Contatos com função, recebimento e tipos; sindicatos com categoria, UF, município, principal e confirmação | Formulários e ficha implementados; ampliar ensaio real de persistência |
| Contatos | Nome, e-mail, telefone, cargo, situação, CRUD e restrições de exclusão | Implementados; preservar validações da API |
| Sindicatos | Catálogo compartilhado e consultas privadas, nome, CNPJ, categoria, UF, título, vigência, tipos, situação | Consultas privadas implementadas; administração do catálogo compartilhado falta na Plataforma |
| Documentos da empresa | Candidatos, confirmados/rejeitados, motivo, responsável/justificativa, inclusão de anteriores e preparação de e-mails | Pendente. Componente próprio na ficha; usar APIs contextuais de documentos/envios, decisões em modal e atualização após persistência; controle independente de inclusão histórica exige contrato (D03) |
| Instrumentos | Busca, filtros, ordenação, ficha, original, análise, evidências, clientes relacionados | Implementados; comparar filtros históricos úteis, formatar campos e validar análises de formatos distintos |
| Análise | Template Markdown canônico, resumo bento, campos ausentes, referências, original e reanálise autorizada | Leitura estruturada implementada; reanálise será ação da Plataforma com fila real; não disparar processamento diretamente no browser |
| Aditivos | Vínculo/rejeição, justificativa, revisão concorrente, relação CCT/aditivo | Implementados; conflito e persistência conferidos no PostgreSQL real |
| Consolidação | Gerar/atualizar, versão, pendências, histórico, regras finais, revisar manter/aplicar/manual, justificativa, conflito | Implementados; mutações Vue ainda precisam de jornada PostgreSQL dedicada |
| Relatórios | PDF/Markdown por cliente, bloquear versão desatualizada/pendências, download autenticado | Parcial: MD disponível; botão PDF interno não corresponde ao contrato, que aceita somente MD (D01). PDF de publicação/portal é fluxo distinto |
| Publicações | Prontidão, cliente/CCT, versão imutável, detalhes, revogação confirmada | Implementados; leitura real validada, criação/revogação pela Vue ainda exigem ensaio real |
| Auditoria | Eventos, ator, IP, resultado, data, filtros, CSV | Implementados e leitura/CSV real validados; avaliar nomes amigáveis sem perder identidade auditável |
| Portal da empresa | Lista publicada, abrir PDF, download, ciência confirmada, revogação e isolamento | Implementado em Vue e validado com PostgreSQL/HTTPS real. Lista via `/api/portal/documentos`; abrir/baixar por ID; ciência com confirmação, identidade/IP registrados no servidor |
| Monitoramento | Coleta manual, execuções, estados, agenda por intervalo/semanal/fuso, limites, cancelamento e recuperação com justificativa | Pendente. Separar consultas/agendas/execuções; contratos vigentes em `src/postgres-gestao-http.ts`; polling cancelável, modais para configuração/recuperação |
| Envios | Fila por destinatário/documento, filtros/resumo, preparo, aprovação/revisão, tentativas, falhas/recuperação e preferências | Pendente. Inventariar contratos em `gestao-ui.js` e handlers; lista operacional e ações conforme estado/papel; histórico detalhado de tentativas exige endpoint adicional (D04) |
| Escritório | Dados cadastrais, membros/papéis, convites/acessos, canais/configurações de e-mail e limites | Pendente. Convites não possuem contrato vigente (D06); SMTP não possui teste de conexão (D07). Formular com schemas atuais; segredos nunca retornados em texto; modais por responsabilidade e testar conexão quando API oferecer |
| Plataforma | Escritórios CRUD, catálogo sindical, coleta global/fila, IA/configuração/teste/solicitações/tentativas/recuperação | Pendente. Coleta global expõe somente leitura de configuração (D08). API global apenas para administrador da plataforma; separar subáreas, configurações em modal e auditoria preservada |
| Configurações históricas | Scheduler, canais Slack/e-mail, IA/modelo/provedor, filtros e opções globais | Classificar por endpoint atual: escritório ou plataforma. Não copiar configurações obsoletas nem expor credenciais globais ao escritório; registrar cada decisão na matriz antes de encerrar migração |
| Shell | Tema, recolhimento, mobile de apoio, largura disponível, teclado/foco, toast, modais | Implementados parcialmente; completar perfil, rotas diretas/estado de navegação e painel explícito de pendências |

## Sequência de corte e implementação

1. Inventário e contratos: este documento e inventário gerado. A matriz é inicial; revisar campos/operações de cada domínio ao implementá-lo, registrando toda divergência encontrada.
2. Tornar Vue principal em `/` e `/acesso`, manter `/app/` somente como alias da mesma UI. Remover links/fallbacks para páginas antigas. Login/recuperação podem continuar independentes como telas ativas, sem duplicar workspace.
3. Criar estruturas navegáveis dos domínios pendentes com descrição técnica rastreável. Não transformar stubs em ações falsas.
4. Completar documentos/aplicabilidade do cliente e portal da empresa.
5. Monitoramento e Envios com APIs reais.
6. Escritório, Plataforma, perfil, configurações e visão geral contextual.
7. Atualizar testes reais para a única interface, retirar referências de execução dos módulos antigos e remover arquivos sem uso. Código anterior serve apenas para inventário até sua remoção, sem precisar mantê-lo funcional.

O corte de rota foi aplicado: `/`, `/acesso` e `/app/` servem Vue; scripts do workspace anterior não são mais servidos. Portal da empresa implementado. Progresso detalhado em [VUE_FINALIZATION_PLAN.md](VUE_FINALIZATION_PLAN.md). Não considerar os domínios pendentes funcionais até a entrega correspondente. A matriz deve ser atualizada junto com cada incremento, sem encerrar itens por haver somente estrutura visual.
