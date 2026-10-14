# Entrega S07-T02 — equipe, papéis e vínculos

Execução: 13/10/2026. A área **Escritório** agora oferece a gestão de membros no Vue por meio de TeamPanel.vue, integrado ao OfficePanel.vue.

## Implementação

- Consulta GET /api/contexto/usuarios com normalização das duas formas retornadas pelo contrato: funcionarios e representantes, ou lista plana.
- Tabela contextual com nome, e-mail, papel, empresa representada, situação e ações de alteração de papel, revogação e reativação.
- Cadastro de nova conta ou vínculo de conta existente via POST /api/contexto/usuarios, respeitando modo, senha inicial e cliente_id do schema vigente.
- Alterações de papel e ativo via PUT /api/contexto/usuarios/:id, com preservação do rascunho em falhas e atualização somente após resposta.
- Erros do servidor, inclusive proteção do último administrador, permanecem visíveis no modal e não são convertidos em sucesso local.
- O texto da interface explicita que a conta é pessoal e que revogar remove somente o vínculo do escritório. Não foi criado fluxo de convite, token ou validade: essa capacidade não existe no contrato vigente.

## Arquivos

- frontend/src/components/TeamPanel.vue
- frontend/src/components/OfficePanel.vue
- test/vue-shell.e2e.mjs
- frontend/src/pending.ts

## Verificações

- npm run typecheck
- npm run build
- node test/vue-shell.e2e.mjs
- npm run test:postgres-https

O E2E controlado valida isolamento de escritório, CSRF, lista de funcionários e representante, alteração de papel, revogação, cadastro de conta e retorno ao fluxo de Envios. O backend já mantém a autorização contextual, auditoria e a regra de não remover o último administrador; a UI apenas apresenta a resposta autoritativa.
