# Migração incremental para Vue

> Diretriz atualizada em 11/10/2026: [UI_FUNCTIONAL_PARITY.md](UI_FUNCTIONAL_PARITY.md) substitui as regras abaixo que exigiam manter a UI anterior ou fallback. A entrega passa a priorizar Vue na rota principal, estruturas explícitas para funcionalidades ainda pendentes e remoção do workspace legado. O histórico de cobertura e validações abaixo continua válido; o corte está implementado; `/`, `/acesso` e `/app/` servem a mesma Vue. Estado atual em [VUE_FINALIZATION_PLAN.md](VUE_FINALIZATION_PLAN.md).

**Status:** em execução — fundação concluída em 11/10/2026.

O frontend operacional original usa HTML servido pelo Node e módulos que manipulam o DOM diretamente. A migração preserva APIs PostgreSQL, sessão, CSRF, contexto, RLS e testes de navegador. Não há migração de banco nesta frente.

## Etapas

| Ordem | Entrega | Estado |
| --- | --- | --- |
| V01 | Vue 3, Vite, TypeScript, compilação e rota estática `/app/` | Concluída |
| V02 | Shell: sessão, seletor de contexto, navegação, tema, toast e componentes-base | Em andamento |
| V03 | Cadastros: clientes, contatos, sindicatos, formulários e fichas | Em andamento: CRUDs e ficha de Clientes, consulta CNPJ e vínculos implementados; documentos/aplicabilidade do cliente e conferência PostgreSQL das novas jornadas ainda pendentes |
| V04 | Documentos: catálogo, ficha, análise, revisões, publicações e auditoria | Em andamento: componentes implementados; ficha, relatório MD, consulta de publicação, auditoria/CSV e vínculos validados com PostgreSQL real; mutações de revisão/publicação pela Vue ainda pendentes de ensaio real |
| V05 | Monitoramento, envios, escritório e plataforma | Pendente |
| V06 | Troca definitiva da rota operacional e remoção dos módulos de UI legados | Pendente |

## Regras de corte

Diretriz desktop first e fronteiras para possível host desktop: [DESKTOP_READINESS.md](DESKTOP_READINESS.md). O transporte JSON/arquivos foi extraído para `services/api.ts`, mantendo autenticação, CSRF e contexto. A ficha Vue normaliza a apresentação dos metadados e mostra a análise com seções/evidências; downloads usam a API privada existente. A migração de Documentos permanece parcial; o backend real das novas jornadas ainda precisa de conferência dedicada.

`ConsolidationPanel.vue`: consulta versão, pendências, regras, aditivos e histórico; consolida pelo endpoint existente; permite manter regra, aplicar trecho literal ou revisão manual com justificativa e versão completa capturada. Consolidações desatualizadas impedem decisão e exportação; conflitos permanecem no modal. Relatórios PDF/MD exigem versão atual sem pendências e seleção de cliente. O teste de navegador com API simulada verifica essas condições, CSRF/contexto, conflito e download MD.

`PublicationsPanel.vue`: subáreas Publicações e Acessos e ciência para administrador do escritório. Publicar consulta prontidão da consolidação; revogar exige checkbox de confirmação. Listas possuem busca/situação e detalhes com versão preservada. Auditoria apresenta data, publicação, evento, ID do usuário, IP e resultado e exporta CSV pelo endpoint existente. Testes simulados verificam bloqueio por pendências, conflito, publicação, revogação, detalhes, busca por IP e CSV. Não houve envio externo nem publicação no banco real durante este teste.

Incremento da barra lateral aprovada: componente Vue `WorkspaceSidebar.vue`, recolhimento no desktop, gaveta no celular, navegação acessível por ícones e contexto na lateral. Documentos mantém seu nome e organização oficiais; acesso à ficha operacional continua disponível durante V04.

Contatos: modais de criação/edição com nome, e-mail, telefone, cargo e situação; confirmação de exclusão e erro persistente no modal; escrita disponível para administrador/operador; desmontagem fecha modais e invalida respostas anteriores. `test:vue-ui` cobre POST, PUT/inativação, cancelamento e DELETE por API simulada, conferindo cabeçalhos de contexto e CSRF. Regras de histórico e autorização continuam aplicadas pela API PostgreSQL existente.

Consultas sindicais: `UnionPanel.vue` consulta o catálogo compartilhado e as configurações privadas; permite criar/editar/inativar/excluir configuração, preservando sindicato, CNPJ, categoria, UF, título, vigência e tipos. O sindicato não pode ser trocado na edição. O fluxo não cria/exclui sindicato no catálogo e não solicita coleta automaticamente. O teste de navegador com API simulada cobre campos, filtro obrigatório, UF, tipos e operações POST/PUT/DELETE com CSRF/contexto.

Uma área somente deixa a UI legada depois de suportar seu fluxo completo, permissões, estados vazios/erro, desktop/mobile e teste Playwright equivalente. Durante a migração, `/app/` contém a versão Vue em evolução e a rota operacional atual segue como referência funcional.

## Validação da fundação

Em 11/10/2026, `npm run test:postgres-https` passou incluindo `test/vue-documents-postgres-fixture.mjs`. O ensaio usa banco descartável, runtime com RLS, HTTPS e navegador real, sem simular as APIs de documentos. Pela Vue, verifica ficha, download MD da consolidação já revisada, consulta da publicação existente, evento de ciência, CSV com IP, conflito 409 de vínculo por alteração concorrente e persistência após atualizar a lista. A revisão/publicação inicial e a ciência são realizadas pela jornada operacional existente; este resultado não valida ainda suas mutações pela Vue. A confirmação de vínculo gera uma nova revisão somente no banco descartável, removido pelo encerramento do ensaio.

Gestão de vínculos: `AmendmentLinks.vue` abre pelo catálogo de Instrumentos para administrador/operador. Permite associar aditivo de CCT à convenção ou registrar rejeição/remoção com justificativa. Envia a revisão consultada para a API existente; conflitos preservam o formulário e não são repetidos automaticamente. A confirmação usa toast e recarrega o catálogo. `test:vue-ui` verifica associação, conflito, remoção versionada, CSRF e ausência da ação para suporte, com APIs simuladas. O ensaio HTTPS real também verifica conflito e persistência do vínculo pela Vue.

Hot reload integrado ao `npm run dev`: [DEV_HOT_RELOAD.md](DEV_HOT_RELOAD.md). Clientes usa `ClientEditor.vue`, com abas Dados e envio, Contatos e Sindicatos. A edição busca o detalhe e preserva função, recebimento por e-mail, tipos, categoria, localidade, sindicato principal e enquadramento confirmado. Erros de carregamento impedem salvar dados incompletos.

`CnpjLookup.vue` consulta a API existente, apresenta os dados antes de aplicar e invalida resultados ao alterar CNPJ ou desmontar o componente. Os dados aplicados são enviados somente ao salvar. `ClientSheet.vue` mostra a ficha em bento; documentos/aplicabilidade ainda são acessados na área operacional histórica. A exclusão de Clientes tem confirmação e apresenta o bloqueio retornado pelo backend sem remover a linha localmente. `test:vue-ui` cobre estes fluxos usando API simulada; não representa validação das novas jornadas contra PostgreSQL real.

- `npm run build:frontend`
- `npm run typecheck`
- `npm run test:postgres-https`
- `npm run test:vue-ui`: seleção estável, CSRF, cabeçalhos contextuais, troca entre escritórios com/sem dados, tema e mobile.

O shell revalida o contexto salvo no servidor. A troca administrativa reutiliza a concessão auditada existente, sem exigir justificativa manual. O build Docker inclui o frontend Vue e seus artefatos compilados.

O último inclui acesso autenticado à rota Vue sob HTTPS, preservando cookie Secure/HttpOnly e as verificações do fluxo PostgreSQL.
