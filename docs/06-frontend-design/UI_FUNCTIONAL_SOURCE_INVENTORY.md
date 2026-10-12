# Inventário de referências funcionais

Gerado por `node scripts/inventory-ui.mjs`. Extrai referências literais de rotas das interfaces históricas, Vue e handlers HTTP atuais. Expressões dinâmicas são preservadas; esta lista é rastreabilidade de código, não prova de cobertura nem lista exaustiva de comportamentos. Complementa a matriz funcional revisada manualmente.

## web/auth-client.js

- `/api/auth/logout`
- `/api/auth/sessao`

## web/auth-ui.js

- `/api/auth/contexto`
- `/api/auth/estado`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/perfil`
- `/api/auth/recuperacao`
- `/api/auth/recuperar`
- `/api/auth/sessao`
- `/api/auth/suporte/encerrar`
- `/api/auth/suporte/iniciar`
- `/api/contexto/${tipo}/${item.id}`
- `/api/contexto/clientes`
- `/api/contexto/clientes/${cliente.id}/documentos`
- `/api/contexto/clientes/${cliente.id}/documentos/original?numero=${encodeURIComponent(documento.numero_registro)}`
- `/api/contexto/clientes/${clienteDocumentos.id}/documentos/atualizar`
- `/api/contexto/clientes/${clienteDocumentos.id}/documentos/decidir`
- `/api/contexto/clientes/${item.id}`
- `/api/contexto/contatos`
- `/api/contexto/monitoramentos`
- `/api/contexto/sindicatos`

## web/cliente-cnpj-ui.js

- `/api/contexto/clientes/consulta-cnpj/`

## web/clientes-ui.js

- `/api/${a===`
- `/api/arquivo/${encodeURIComponent(d.numero_registro)}`
- `/api/arquivo/${encodeURIComponent(numero)}`
- `/api/clientes`
- `/api/clientes/${U.selecionado}`
- `/api/clientes/${U.selecionado}/documentos`
- `/api/clientes/${U.selecionado}/documentos/atualizar`
- `/api/clientes/${U.selecionado}/documentos/decidir`
- `/api/clientes/${U.selecionado}/envios`
- `/api/clientes/${U.selecionado}/preparar`
- `/api/clientes/${c.id}`
- `/api/clientes/${clienteId}`
- `/api/clientes/${id}`
- `/api/clientes/consulta-cnpj/${encodeURIComponent(valor`
- `/api/contatos`
- `/api/envios`
- `/api/envios/${id}`
- `/api/envios/${id}/aprovar`
- `/api/envios/${id}/cancelar`
- `/api/envios/${id}/repreparar`
- `/api/envios/preparar`
- `/api/envios/processar`
- `/api/envios/resumo`
- `/api/relatorio-pdf/${encodeURIComponent(b.dataset.id)}`
- `/api/sindicatos`
- `/api/sindicatos/${id}/clientes`

## web/gestao-ui.js

- `/api/contexto/clientes`
- `/api/contexto/clientes/${encodeURIComponent(item.cliente_original_id)}/documentos/original?numero=${encodeURIComponent(item.numero_registro)}`
- `/api/contexto/envios`
- `/api/contexto/envios/${envio.id}/anexos/${i}`
- `/api/contexto/envios/${envio.id}/aprovar`
- `/api/contexto/envios/${envio.id}/cancelar`
- `/api/contexto/envios/${envio.id}/repreparar`
- `/api/contexto/envios/preparar`
- `/api/contexto/envios/processar`
- `/api/contexto/envios/recuperar`
- `/api/contexto/escritorio`
- `/api/contexto/interpretacoes`
- `/api/contexto/interpretacoes/consolidar`
- `/api/contexto/interpretacoes/legado`
- `/api/contexto/interpretacoes?base=`
- `/api/contexto/interpretacoes?numero=`
- `/api/contexto/logs`
- `/api/contexto/relatorio?base=${encodeURIComponent(numero)}&cliente=${cliente.value}&formato=${formato}`
- `/api/contexto/revisoes`
- `/api/contexto/smtp`
- `/api/contexto/usuarios`
- `/api/contexto/usuarios/`
- `/api/contexto/vinculos`
- `/api/plataforma/coleta`
- `/api/plataforma/escritorios`
- `/api/plataforma/escritorios/`
- `/api/plataforma/sindicatos`

## web/ia-plataforma-ui.js

- `/api/plataforma/ia`
- `/api/plataforma/ia/solicitacoes`
- `/api/plataforma/ia/solicitacoes/${job.id}/recuperar`
- `/api/plataforma/ia/tentativas`
- `/api/plataforma/ia/tentativas/${item.id}/recuperar`
- `/api/plataforma/ia/testar`

## web/index.html

- `/api/agendamento`
- `/api/arquivo/${encodeURIComponent(r.numero_registro)}`
- `/api/consolidado/${encodeURIComponent(r.numero_registro)}`
- `/api/consolidar`
- `/api/consultas`
- `/api/execucoes`
- `/api/executar`
- `/api/interromper`
- `/api/llm`
- `/api/llm/testar`
- `/api/navegador`
- `/api/notificacoes`
- `/api/notificacoes/testar`
- `/api/pendencias/decidir`
- `/api/pendencias/historico?`
- `/api/pendencias/sugerir`
- `/api/provedores/gmail`
- `/api/reanalisar`
- `/api/registros`
- `/api/relatorio/${encodeURIComponent(r.numero_registro)}`
- `/api/resumo`
- `/api/sindicatos`
- `/api/sindicatos/`
- `/api/status`
- `/api/v1`
- `/api/vinculos`
- `/api/vinculos/rejeitar`

## web/monitoramento-ui.js

- `/api/contexto/agendas`
- `/api/contexto/agendas/${agenda.monitoramento_id}`
- `/api/contexto/execucoes`
- `/api/contexto/execucoes/${execution.id}/cancelar`
- `/api/contexto/execucoes/${execution.id}/recuperar`
- `/api/contexto/limites-monitoramento`
- `/api/contexto/monitoramentos`

## web/publicacoes-ui.js

- `/api/contexto/clientes`
- `/api/contexto/interpretacoes`
- `/api/contexto/interpretacoes?base=`
- `/api/contexto/publicacoes`
- `/api/contexto/publicacoes/${r.id}/revogar`
- `/api/contexto/publicacoes/auditoria`
- `/api/contexto/publicacoes/auditoria?formato=csv`
- `/api/portal/documentos`
- `/api/portal/documentos/${x.id}`
- `/api/portal/documentos/${x.id}/ciencia`
- `/api/portal/documentos/${x.id}?download=1`

## web/resumo-ui.js

- `/api/contexto/execucoes`
- `/api/contexto/resumo`

## frontend/src/components/AmendmentLinks.vue

- `/api/contexto/vinculos`

## frontend/src/components/ClientEditor.vue

- `/api/contexto/clientes`
- `/api/contexto/clientes/`
- `/api/contexto/contatos`
- `/api/contexto/monitoramentos`

## frontend/src/components/ClientPortal.vue

- `/api/portal/documentos`
- `/api/portal/documentos/${item.id}${download?`
- `/api/portal/documentos/${target.id}/ciencia`

## frontend/src/components/ClientSheet.vue

- `/api/contexto/clientes/`

## frontend/src/components/CnpjLookup.vue

- `/api/contexto/clientes/consulta-cnpj/`

## frontend/src/components/ConsolidationPanel.vue

- `/api/contexto/interpretacoes/consolidar`
- `/api/contexto/interpretacoes?base=`
- `/api/contexto/relatorio?base=${encodeURIComponent(base)}&cliente=${encodeURIComponent(clientId.value)}&formato=${format}`
- `/api/contexto/revisoes`

## frontend/src/components/DocumentsPanel.vue

- `/api/contexto/clientes`
- `/api/contexto/clientes/${item.cliente_original_id}/documentos/original?numero=${encodeURIComponent(item.numero_registro)}`
- `/api/contexto/interpretacoes`
- `/api/contexto/interpretacoes?numero=`

## frontend/src/components/PublicationsPanel.vue

- `/api/contexto/interpretacoes?base=`
- `/api/contexto/publicacoes`
- `/api/contexto/publicacoes/`
- `/api/contexto/publicacoes/auditoria`
- `/api/contexto/publicacoes/auditoria?formato=csv`

## frontend/src/components/RegistryPanel.vue

- `/api/contexto/`
- `/api/contexto/clientes/`
- `/api/contexto/contatos`
- `/api/contexto/contatos/`

## frontend/src/components/UnionPanel.vue

- `/api/contexto/monitoramentos`
- `/api/contexto/monitoramentos/`
- `/api/contexto/sindicatos`

## src/auth-http.ts

- `/api/auth/`
- `/api/auth/contexto`
- `/api/auth/estado`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/perfil`
- `/api/auth/recuperacao`
- `/api/auth/recuperar`
- `/api/auth/sessao`
- `/api/auth/suporte/encerrar`
- `/api/auth/suporte/iniciar`

## src/postgres-auth-http.ts

- `/api/auth/`
- `/api/auth/contexto`
- `/api/auth/estado`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/papel-plataforma`
- `/api/auth/perfil`
- `/api/auth/recuperacao`
- `/api/auth/recuperar`
- `/api/auth/sessao`
- `/api/auth/suporte/encerrar`
- `/api/auth/suporte/iniciar`

## src/postgres-gestao-http.ts

- `/api/contexto/limites-monitoramento`
- `/api/contexto/publicacoes`
- `/api/contexto/publicacoes/auditoria`
- `/api/contexto/relatorio`
- `/api/contexto/resumo`
- `/api/contexto/smtp`
- `/api/plataforma/coleta`
- `/api/plataforma/ia`
- `/api/plataforma/ia/testar`

## src/postgres-import-http-check.ts

- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/sessao`
- `/api/contexto/clientes`
- `/api/contexto/envios`

## src/server.ts

- `/api/auth/`
- `/api/contexto/`
- `/api/plataforma/`
- `/api/portal/`
