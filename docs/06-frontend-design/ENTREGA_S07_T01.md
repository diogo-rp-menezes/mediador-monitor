# Entrega S07-T01 — dados cadastrais do escritório

Data: 13/10/2026

## Resultado

A área **Escritório** deixou de ser um painel pendente para administradores do escritório. O novo componente Vue consulta GET /api/contexto/escritorio, exibe nome, CNPJ, e-mail, telefone, situação e última atualização, e abre um formulário próprio para editar nome público, e-mail e telefone.

O formulário envia somente os campos aceitos pelo contrato contextual em PUT /api/contexto/escritorio, com CSRF e cabeçalhos de contexto fornecidos pelo transporte existente. A resposta persistida substitui o estado local e atualiza o seletor de espaços e a identificação do escritório no shell. Erros de consulta têm retry; erros de validação ou persistência preservam o rascunho; o botão fica ocupado durante a mutação.

O acesso à área continua restrito ao papel administrador no frontend e por escritorio.gerenciar no servidor. O CNPJ permanece somente leitura porque a rota contextual vigente não aceita sua alteração. Não foram adicionados campos fictícios nem alterações ao contrato de SMTP/equipe.

## Arquivos

- frontend/src/components/OfficePanel.vue: leitura, formulário, validação, loading/erro/retry e feedback de persistência.
- frontend/src/App.vue: integração da área e atualização do seletor/identificação após salvar.
- test/vue-shell.e2e.mjs: jornada controlada com CSRF, troca de contexto, recarga e papel sem permissão.
- frontend/src/pending.ts: área cadastral deixou de ser o item pendente do escritório.

## Verificação

- npm run typecheck — aprovado.
- npm run build — aprovado; bundle Vue e artefato operacional gerados.
- node test/vue-shell.e2e.mjs — aprovado; leitura/edição contextual, seletor atualizado, recarga preservada e área restrita ao administrador.
- npx vitest run test/sprint3-contexto.test.ts -t "CRUD de escritório" — aprovado; contrato de CRUD e autorização contextual.
- npm run test:postgres-https — aprovado; PostgreSQL descartável, HTTPS, Chromium, papéis e isolamento regressivos.

O aviso do Vite sobre /app/theme.js sem type="module" permanece preexistente e não impede o build.
