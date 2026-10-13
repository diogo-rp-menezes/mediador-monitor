# S02-T03 — Vínculos de contatos e sindicatos

Entrega em 12/10/2026. Inspecionados ClientEditor, schemas, persistência PostgreSQL e índice único `cliente_sindicato_principal_uq`. Mudanças anteriores preservadas; nenhum contrato/backend alterado.

Abas receberam orientação, contagem de vínculos, e-mail para identificar o contato e cartões com hierarquia de campos. Campos textuais/selects ficam empilhados, enquanto checkboxes e seleção do principal mantêm tamanho adequado também no celular. Função, recebimento, tipos, categoria, UF, município, principal e confirmação continuam associados por ID. Campos de pessoas/sindicatos não vinculados não são enviados. A seleção do principal desmarca os demais; o backend mantém sua validação e restrição única.

Verificações:

- `npm run typecheck` aprovado.
- `npx vitest run test/clientes.test.ts test/postgres-organizacoes.test.ts`: 50 testes aprovados.
- `node test/vue-shell.e2e.mjs`: regressão Vue controlada aprovada, incluindo payload de vínculos, CSRF e isolamento.
- `npm run test:postgres-https`: build completo e navegador/API/PostgreSQL reais aprovados. Nova jornada em `test/client-links-integrated.mjs` cria duas pessoas e dois sindicatos/consultas sintéticos no banco descartável. Salva função, recebimento desativado e tipo de documento; salva categoria/localidade/confirmação de ambos os sindicatos e troca o principal. Reabre após recarga e confere valores da UI e do banco, incluindo IDs e somente um principal.
- Salvar outro campo preserva integralmente as preferências dos vínculos e não adiciona o contato desmarcado. Desvinculação de contato, remoção do principal e desvinculação dos sindicatos persistem após recarga. Regressões de suporte somente leitura, contexto, portal e logout aprovadas; banco removido com ausência confirmada.
- 40 capturas em `.cache/ui-s02-t03`: oito novas das abas de vínculos em claro/escuro e 1440/390 px, mais 32 de regressão. Contatos desktop claro e sindicatos mobile escuro inspecionados. Seleção do principal ajustada após inspeção visual e capturada novamente; sem overflow horizontal da página. Modal extenso rola internamente.
- `git diff --check` sem erros. Avisos conhecidos de CRLF e do script clássico de tema inicial permanecem.

Arquivos: `frontend/src/components/ClientEditor.vue`, `test/client-links-integrated.mjs`, `test/ui-integrated-fixture.mjs` e artefato Vue gerado.

Reproduzir: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s02-t03'`; `npm run test:postgres-https`. Ambiente local interativo: `npm run dev`, autenticar na origem impressa, `/#/cadastros`, editar cliente e abrir Contatos/Sindicatos. Nenhum envio externo foi executado. Aceite visual humano permanece separado.

Próxima: **S02-T04 — consultas sindicais privadas e distinção do catálogo compartilhado**.
