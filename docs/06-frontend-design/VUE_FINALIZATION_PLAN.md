# Plano de finalização — UI única para MVP local

Atualizado em 11/10/2026. Cada tarefa entrega uma tela ou comportamento verificável; estruturas incompletas são sinalizadas. Referência funcional: [UI_FUNCTIONAL_PARITY.md](UI_FUNCTIONAL_PARITY.md).

| Ordem | Tarefa atômica / aceite | Estado |
| --- | --- | --- |
| F01 | `/`, `/acesso` e `/app/` servem a mesma Vue autenticada | Implementada; alias /acesso e login na raiz validados com PostgreSQL/HTTPS |
| F02 | Remover navegação/fallback para workspace antigo e parar de servir seus scripts | Implementada; script antigo retorna 404 no teste real |
| F03 | Painéis pendentes explicam comportamento e implementação | Implementada para Monitoramento, Envios, Escritório, Plataforma e Perfil; ficha do cliente identifica documentos pendentes |
| F04 | Portal: listar, abrir PDF, baixar e ciência explícita, com contexto da empresa | Implementada; jornada PostgreSQL/HTTPS cobre PDF íntegro, ciência, IP, isolamento e revogações |
| F05 | Documentos por cliente: lista e filtros de aplicabilidade | Pendente |
| F06 | Decisão de aplicabilidade com motivo e confirmação | Pendente |
| F07 | Inclusão histórica e preparação de envios do cliente | Pendente |
| F08 | Monitoramento: listagem e solicitação de coleta real | Pendente |
| F09 | Agendas: intervalo/semanal, dias, horário/fuso | Pendente |
| F10 | Limites, cancelamento e recuperação de execução | Pendente |
| F11 | Envios: resumo, tabela e filtros | Pendente |
| F12 | Envios: ações por estado, tentativas e recuperação | Pendente |
| F13 | Escritório: cadastro e equipe/papéis | Pendente |
| F14 | Escritório: convites e configurações de canais | Pendente |
| F15 | Plataforma: escritórios e catálogo sindical | Pendente |
| F16 | Plataforma: configuração/teste IA e filas/recuperação | Pendente |
| F17 | Perfil e visão geral com dados reais contextuais | Pendente |
| F18 | Ensaios Vue reais das mutações de revisão, publicação e cadastros | Pendente; testes simulados existentes preservados |
| F19 | Remover arquivos antigos sem uso e atualizar inventário/testes/documentação | Pendente; arquivos antigos já não são servidos como workspace |

## Validação e dívida de testes após o corte

`test:postgres-https` foi atualizado para a interface única Vue e valida o portal real, sessão, CSRF/origem, isolamento, revogação, logout e acesso privado. A chamada da jornada antiga `mvp-review-publication-fixture.mjs` foi retirada: ela dependia do DOM removido. Essa suíte já não comprova coleta/IA/revisão/publicação via navegador nesta versão; migrar essas jornadas em F08–F18. Não restabelecer a UI anterior para fazê-las passar.

`test:vue-ui` continua cobrindo cadastros e documentos com APIs simuladas. `test:dev-hmr` cobre edição Vue em desenvolvimento. Os testes históricos que referenciam IDs da UI anterior precisam ser substituídos ou retirados em F19; não interpretar falhas deles como motivo para criar fallback.

## Validação visual

Executar `npm run dev` e acessar `http://localhost:3000/` (ou a URL HTTPS local configurada). Selecionar escritório para Cadastros/Documentos; selecionar empresa para o portal. Para build estático: `npm run build` seguido de `npm run start`, reiniciando eventual servidor anterior. Nenhuma alteração de banco de desenvolvimento é necessária para o corte da UI.
