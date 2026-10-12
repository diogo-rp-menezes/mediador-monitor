# Baseline da integração Vue — S00-T01

Data: 11/10/2026. Inspeção estática sobre o checkout baseado em `9a045e735b0057c1af045b95e6c28bcef39b0352`, incluindo documentação ainda não commitada. Referência visual: protótipo em `sites/mediador-monitor-vue`, commit publicado `faabe4f5c8c5aaacb99c895c9e46e0d8292f3a16`.

Esta entrega identifica implementação e lacunas; não certifica comportamento em execução. Nenhuma coleta, publicação, alteração PostgreSQL ou entrega de e-mail foi realizada. Evidências históricas da matriz não foram reexecutadas nesta task.

## Fonte de verdade e responsáveis técnicos

“Responsável” abaixo designa o módulo que mantém a regra; não há atribuição de pessoas. Componentes presentes não equivalem a jornadas integralmente validadas. Os handlers PostgreSQL atuais prevalecem sobre scripts legados, textos de placeholders e dados locais do protótipo.

| Domínio | Vue atual | Contrato e responsável técnico | Permissão e próxima entrega |
| --- | --- | --- | --- |
| Sessão e contexto | `App.vue` e transporte contextual implementados | `postgres-auth-http.ts`, `postgres-autorizacao.ts`; sessão, contexto e concessão de suporte | Identidade/contexto válidos; S01 deve validar descarte de respostas antigas e encerramento da concessão |
| Navegação e aparência | `WorkspaceSidebar.vue`, `AppDialog.vue`; áreas controladas por estado | `frontend/src/App.vue`, `services/api.ts`; CSRF e credenciais na API | Cliente só vê início/documentos/perfil; plataforma restrita; S00-T02 e Sprint 01 |
| Início | Conteúdo introdutório | GET `/api/contexto/resumo`, `postgres-gestao-http.ts` | Clientes/monitoramentos/documentos internos de leitura; S09-T01 |
| Clientes e contatos | `RegistryPanel.vue`, `ClientEditor.vue`, `ClientSheet.vue` | `/api/contexto/clientes`, `/contatos`; `postgres-organizacoes.ts`, schemas em `cadastros.ts` | `clientes.ler/gerenciar`; refinamento Sprint 02 |
| Vínculos | Editor mantém IDs e atributos completos | Cliente: contatos com função/recebimento/tipos; sindicatos com categoria/localidade/principal/confirmação | Mesmas permissões de clientes; preservar dados na Sprint 02 |
| Consultas sindicais privadas | `UnionPanel.vue` implementado | `/api/contexto/monitoramentos`; `MonitoramentoSchema` em `monitoramentos-escritorio.ts` | `monitoramentos.ler/gerenciar`; catálogo contextual é somente leitura |
| Documentos do cliente | Ficha indica seção pendente | GET documentos/original, POST atualizar/decidir sob `/api/contexto/clientes/:id`; `postgres-documentos.ts` | Leitura interna/revisão; Sprint 04, lacuna D03 |
| Instrumentos e análise | `DocumentsPanel.vue`, `DocumentAnalysis.vue`, `AnalysisValue.vue` | `/api/contexto/interpretacoes`; `postgres-interpretacoes.ts` | `documentos.ler_internos`; refinamento Sprint 03 |
| Aditivos e consolidação | `AmendmentLinks.vue`, `ConsolidationPanel.vue` | `/api/contexto/vinculos`, `/revisoes`, `/interpretacoes/consolidar`; schemas versionados em `postgres-interpretacoes.ts` e `postgres-consolidacao.ts` | `documentos.revisar`; conservar justificativa/conflitos |
| Relatório interno | Botões PDF e MD presentes | GET `/api/contexto/relatorio`; handler aceita somente MD | Leitura interna; incompatibilidade D01, S03-T05 |
| Publicações e auditoria | `PublicationsPanel.vue` implementado | `/api/contexto/publicacoes`, `/:id/revogar`, `/auditoria?formato=csv` | Publicar: `documentos.publicar`; auditoria: `auditoria.ler`; S03-T05 |
| Portal | `ClientPortal.vue` implementado | `/api/portal/documentos`, `/:id`, `/:id/ciencia` | Contexto de cliente e leitura publicada; ciência `{confirmo:true}`; preservar isolamento |
| Monitoramento | `PendingPanel.vue` | `/api/contexto/execucoes`, `/agendas`, `/limites-monitoramento`; router PostgreSQL | Ler/gerenciar monitoramento; agendas/limites e recuperação exigem gestão do escritório; Sprint 05 |
| Envios | `PendingPanel.vue` | `/api/contexto/envios` e ações no router PostgreSQL | Ler internos, revisar para preparar, aprovar para demais ações; Sprint 06 |
| Gestão do escritório | `PendingPanel.vue` | `/api/contexto/escritorio`, `/usuarios`, `/smtp` | `escritorio.gerenciar`, `usuarios.gerenciar`; Sprint 07 |
| Plataforma | `PendingPanel.vue` | `/api/plataforma/escritorios`, `/sindicatos`, `/coleta`, `/ia` e subrotas | `plataforma.gerenciar`; Sprint 08 |
| Perfil | `PendingPanel.vue` | PUT `/api/auth/perfil`, schema estrito `{nome}` | Usuário autenticado; S09, sem edição de e-mail nesse contrato |

Arquivos de backend acima estão em `src/`; componentes em `frontend/src/components/`, exceto os caminhos explicitados. O servidor operacional é `src/server.ts`. `/`, `/acesso` e `/app` servem o mesmo frontend Vue.

## Papéis reais

Fonte: `src/autorizacao.ts` e resolução contextual em `src/postgres-autorizacao.ts`.

| Papel contextual | Leitura interna | Clientes/monitoramentos | Revisar | Publicar/aprovar envios | Gestão escritório/usuários/auditoria |
| --- | --- | --- | --- | --- | --- |
| Administrador | Sim | Ler e alterar | Sim | Sim | Sim |
| Operador | Sim | Ler e alterar | Sim | Não | Não |
| Suporte | Sim | Ler | Não | Não | Não |
| Cliente | Apenas publicações autorizadas no portal | Não | Não | Não | Não |

Não existe papel `leitor`. A fixture de leitura interna deve usar suporte com concessão real. Administrador da plataforma tem operações globais; acesso contextual exige concessão explícita e auditada. Suporte global não recebe gestão de plataforma. Ocultar um botão não substitui autorização no servidor.

## Contratos que condicionam as próximas telas

| Fluxo | Contrato observado | Consequência para implementação |
| --- | --- | --- |
| Cliente | CRUD preserva razão/fantasia, CNPJ, UF/município, ativo, modo de envio, contatos e sindicatos | Não reduzir vínculos a texto ou omitir atributos ao salvar; exclusão pode retornar conflito por histórico/vínculos |
| Consulta CNPJ | GET `/api/contexto/clientes/consulta-cnpj/:cnpj` com autorização de gestão | Aplicação dos dados deve continuar explícita; preservar validação alfanumérica vigente |
| Decisão documental | POST `.../documentos/decidir`: número, confirmado/rejeitado, justificativa e versão hash | Conflito exige atualizar a versão; decisão não representa aprovação do e-mail |
| Agendas | PUT `/api/contexto/agendas/:id`: ativa, intervalo de 60 a 10080 minutos, semanal opcional | ID corresponde ao monitoramento; gestão do escritório |
| Execução manual | POST `/api/contexto/execucoes` retorna solicitação, não conclusão | Polling representa estados reais; cancelamento em execução é solicitado, não instantâneo |
| Recuperação de execução | Justificativa e confirmação `consumidor_encerrado:true` | Recuperação marca execução como falha; não apresentar como reenfileiramento |
| Preparo de envios | POST `/api/contexto/envios/preparar`, cliente opcional | Revisão documental autoriza preparo; aprovação é permissão separada |
| Aprovação de envio | POST `/:id/aprovar` exige `previsualizacao_hash` | Mostrar snapshot e enviar seu hash; não aprovar visualização desatualizada |
| Recuperação de envios | POST `/envios/recuperar`: somente `mais_antigo_que_segundos` opcional, 60–86400 | Não reutilizar payload da recuperação de monitoramento; confirmação visual não cria campo na API |
| SMTP | GET e PUT/POST `/api/contexto/smtp`; senha opcional e `limparSenha` | Retorno informa `temSenha`, não senha; não inventar teste de conexão |
| Membros | POST `/usuarios`: cadastrar ou vincular; PUT membro: papel/ativo/cliente conforme schema | Cadastro usa senha; vínculo existente não é convite; preservar último administrador |
| Catálogo global | GET/POST/PUT `/api/plataforma/sindicatos` | Inativar pelo cadastro; não oferecer DELETE inexistente |
| IA | Configuração, teste de versão salva, solicitações, tentativas e recuperação no namespace `/api/plataforma/ia` | Conservar versão, confirmação de reanálise e validação de original; navegador não executa worker |

Listagens atuais têm limites: envios até 500 e execuções até 100. Filtros locais devem indicar o conjunto carregado; não prometer pesquisa completa ou paginação de servidor inexistente.

## Divergências e decisões de integração

As lacunas abaixo são trabalho pendente, não endpoints implicitamente aprovados ou implementados. Antes da task indicada, definir o contrato e dividir backend/UI em tasks derivadas quando necessário; preservar os aceites existentes e registrar qualquer redução de escopo explicitamente.

| ID | Evidência estática | Impacto e encaminhamento |
| --- | --- | --- |
| D01 | `ConsolidationPanel.vue` oferece PDF; `/api/contexto/relatorio` valida `z.enum(['md'])` | S03-T05 precisa resolver exportação PDF interna. PDF publicado/portal é outro fluxo e não comprova esse contrato |
| D02 | Papéis do backend não incluem leitor | S00-T03/S02-T01 usam suporte autorizado para cenário de leitura interna |
| D03 | GET de documentos omite `incluir_envio`; decisão o define internamente; não há atualização independente desse campo | S04-T03 requer contrato explícito para controle histórico independente, ou revisão documentada do aceite. Não enviar campo extra ao schema estrito |
| D04 | Envios expõe lista, anexos e ações; lista inclui contagem de tentativas/erro, sem endpoint de histórico detalhado | S06-T04 requer exposição HTTP do histórico antes de construir detalhe completo |
| D05 | Recuperar envios aceita idade; monitoramento exige justificativa e consumidor encerrado | S06-T05 deve respeitar diferença; não afirmar que confirmação é campo universal |
| D06 | Router de usuários oferece cadastro/vínculo/edição, sem token, validade ou resgate de convite | S07-T03 depende de novo contrato de convites. Gestão de membros existente não conclui esse item |
| D07 | SMTP tem configuração, sem endpoint de teste | S07-T04 pode integrar configuração; aceite de teste exige contrato adicional, sem simular sucesso |
| D08 | `/api/plataforma/coleta` é GET de configuração do processo; não há comando global nesse endpoint | S08-T05 deve separar leitura disponível de operação/fila ainda sem contrato |
| D09 | `/api/contexto/resumo` retorna contadores de clientes, consultas e envios | S09-T01 não pode derivar séries temporais fictícias; últimas atividades precisam de fonte própria |
| D10 | Perfil altera somente nome; catálogo global não expõe DELETE | Respeitar limites nas Sprints 08/09, sem copiar ações fictícias do protótipo |

## Validação e passagem para próxima execução

- Conferidos componentes, schemas, permissões e branches de rotas atuais por leitura estática.
- Matriz funcional reconciliada quanto a PDF, contratos ausentes e fonte operacional.
- Plano atualizado com papéis reais, registro de lacunas e conclusão desta task.
- Verificação documental: links relativos locais e `git diff --check`. Não há alteração executável; build, navegador e PostgreSQL ficam para as tasks cujo aceite os exige.
- Próxima task: **S00-T02**, especificação visual com correspondência aos componentes operacionais. S00-T03 prepara a infraestrutura de validação; nenhuma jornada pendente é considerada concluída por este levantamento.
