# Entrega S07-T04 — SMTP e canais do escritório

Data: 14/10/2026  
Estado: **CONCLUÍDA — configuração SMTP disponível; teste de conexão permanece indisponível por D07**

## Resultado

A área **Escritório** agora exibe a configuração contextual de e-mail SMTP em um componente Vue próprio. O formulário consulta e salva `/api/contexto/smtp` com os campos do contrato vigente: ativo, servidor, porta, TLS, usuário e remetente.

O segredo nunca é retornado nem preenchido na interface. Ao salvar uma alteração sem informar nova senha, o payload omite `senha` e preserva a credencial existente no servidor. A opção explícita de remoção usa `limparSenha` conforme o contrato.

O contrato atual não oferece endpoint de teste de conexão separado. A interface informa essa limitação e deixa claro que salvar a configuração não dispara envio. Slack e outros canais globais permanecem fora do namespace contextual disponível.

## Arquivos

- `frontend/src/components/SmtpPanel.vue`: leitura, edição, validação, estados de carregamento/erro, segredo preservado e modal acessível.
- `frontend/src/components/OfficePanel.vue`: composição do painel SMTP na gestão contextual.
- `frontend/src/pending.ts`: remove a pendência de canais já substituída pelo componente real.
- `test/vue-shell.e2e.mjs`: cenário de senha, CSRF, preservação e troca de contexto.

## Validação

- `npm run typecheck` — passou.
- `npm run build` — passou; permanece o aviso preexistente de `/app/theme.js` sem `type="module"`.
- `node test/vue-shell.e2e.mjs` — passou, incluindo SMTP contextual, segredo não reexibido, preservação da senha omitida e ausência de teste fictício.
- Testes PostgreSQL existentes de SMTP permanecem cobrindo cifra, vista sem segredo, preservação e autorização no backend.

## Limitação registrada

D07 permanece aberta para um contrato de teste de conexão autorizado, com resultado distinto de envio e serviço local controlado. A UI não simula esse teste nem apresenta sucesso antes de existir endpoint.
