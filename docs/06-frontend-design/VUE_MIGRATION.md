# Migração incremental para Vue

**Status:** em execução — fundação concluída em 11/10/2026.

O frontend operacional original usa HTML servido pelo Node e módulos que manipulam o DOM diretamente. A migração preserva APIs PostgreSQL, sessão, CSRF, contexto, RLS e testes de navegador. Não há migração de banco nesta frente.

## Etapas

| Ordem | Entrega | Estado |
| --- | --- | --- |
| V01 | Vue 3, Vite, TypeScript, compilação e rota estática `/app/` | Concluída |
| V02 | Shell: sessão, seletor de contexto, navegação, tema, toast e componentes-base | Em andamento |
| V03 | Cadastros: clientes, contatos, sindicatos, formulários e fichas | Pendente |
| V04 | Documentos: catálogo, ficha, análise, revisões, publicações e auditoria | Pendente |
| V05 | Monitoramento, envios, escritório e plataforma | Pendente |
| V06 | Troca definitiva da rota operacional e remoção dos módulos de UI legados | Pendente |

## Regras de corte

Uma área somente deixa a UI legada depois de suportar seu fluxo completo, permissões, estados vazios/erro, desktop/mobile e teste Playwright equivalente. Durante a migração, `/app/` contém a versão Vue em evolução e a rota operacional atual segue como referência funcional.

## Validação da fundação

- `npm run build:frontend`
- `npm run typecheck`
- `npm run test:postgres-https`

O último inclui acesso autenticado à rota Vue sob HTTPS, preservando cookie Secure/HttpOnly e as verificações do fluxo PostgreSQL.
