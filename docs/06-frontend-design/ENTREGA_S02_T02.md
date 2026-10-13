# S02-T02 — Editor de cliente e consulta CNPJ

Entrega de 12/10/2026. Inspecionados ClientEditor, CnpjLookup, ClienteSchema, validação numérica/alfanumérica e contratos PostgreSQL. Alterações preexistentes preservadas.

Editor recebeu introdução, campos cadastrais em duas colunas no desktop e uma no mobile, mantendo razão social/fantasia, CNPJ, UF, município, situação, modo de envio e abas de vínculos. Durante salvamento, o grupo de campos e a consulta ficam desabilitados; fechamento e repetição continuam bloqueados. Consulta recebeu orientação de conferência e estado ocupado acessível. Aplicação exige botão explícito e CNPJ ainda correspondente; resultados antigos continuam invalidados por geração e desmontagem. Nova chamada durante consulta ocupada é recusada.

Nenhum contrato/backend foi alterado. Dados completos consultados (endereço, CNAEs, natureza, porte, datas, fonte) continuam disponíveis para conferência; os metadados são enviados em `dados_cnpj` somente conforme o estado existente do editor. Consulta não grava cliente; salvar é a operação persistente. Consulta externa fica no servidor.

Evidências:

- **T**: `npm run typecheck` aprovado.
- **U**: `npx vitest run test/consulta-cnpj.test.ts test/clientes.test.ts`: 44 testes aprovados, incluindo dígitos numéricos/alfanuméricos, normalização, dados da consulta e erros.
- **E**: `npm run test:vue-ui` aprovado. Novo cenário controlado segura resposta, muda CNPJ, libera resposta antiga e recebe resultado divergente em nova consulta; nenhum dado antigo aplicado. Regressões de payload, vínculos, CSRF e formulário aprovadas.
- **B/P**: build e `npm run test:postgres-https` aprovados com consulta externa controlada por fixture. Criação com CNPJ numérico e alfanumérico, aplicação explícita, erro de consulta/validação preservando rascunho, campos e modo de envio após recarga. Nova conferência via `node test/postgres-https.integration.mjs` verifica também fonte, endereço e CNAE persistidos no detalhe da API. Um seletor exato de UF no teste adicional foi corrigido antes do resultado final.
- **V**: 32 capturas em `.cache/ui-s02-t02`, incluindo quatro da consulta completa e as capturas do editor claro/escuro em 1440/390 px. Consulta desktop clara e editor móvel escuro inspecionados; sem overflow horizontal da página nos cenários capturados. Modal extenso mantém rolagem interna.
- `git diff --check` sem erros. Avisos conhecidos de CRLF e do script clássico de tema inicial permanecem.

Arquivos: `frontend/src/components/ClientEditor.vue`, `frontend/src/components/CnpjLookup.vue`, `test/cnpj-lookup-checks.mjs`, `test/registry-integrated-checks.mjs`, runners Vue/fixture e artefato Vue gerado.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s02-t02'`; `npm run test:postgres-https`. Banco e identidades sintéticos são descartados pelo runner, sem consulta remota real. Validação interativa: `npm run dev`, origem impressa, `/#/cadastros`, Novo cliente/Editar. Aceite visual humano separado da conclusão técnica.

Próxima: **S02-T03 — vínculos de contatos e sindicatos no cliente**.
