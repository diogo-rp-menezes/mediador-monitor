# Mediador Monitor — MVP local PostgreSQL

Aplicação local para escritórios contábeis, com clientes e contatos privados, monitoramento de instrumentos coletivos, análise assistida por IA, revisão, publicação de documentos, envios SMTP e auditoria. O servidor usa exclusivamente PostgreSQL. A interface operacional é a área de trabalho baseada no mockup aprovado, com troca de escritório, modais e toasts.

## Iniciar na máquina local

Com as dependências instaladas e .env.docker configurado:

```powershell
npm run db:up
npm run build
npm run local:verificar
npm run local:iniciar
```

Acesse http://localhost:3000. No ambiente atual as contas e dados de desenvolvimento já foram importados. Não execute bootstrap para criar outra conta inicial. Em uma instalação nova, prepare as migrações e o papel runtime conforme o [roteiro local](docs/OPERACAO_MVP_LOCAL.md), e então use `npm run postgres:auth:bootstrap -- --nome "Nome" --email "email@exemplo.com"`.

O servidor não inicia workers automaticamente. Use comandos separados depois de configurar e solicitar as operações pela UI:

| Operação | Comando |
| --- | --- |
| Coleta de solicitações existentes | `npm run postgres:monitorar -- --escritorio ID --once` |
| Agendamento | `npm run postgres:agendar -- --escritorio ID` (executa agendas existentes) |
| Consumir fila de IA | `npm run postgres:ia:consumir` (uma solicitação existente) |
| Preparar e processar envios | `npm run postgres:preparar-envios -- --escritorio ID` e `npm run postgres:worker -- --once` |
| Validar ambiente | `npm run local:verificar` |
| Jornada isolada HTTPS/Chromium | `npm run test:postgres-https` |

Os antigos comandos npm check, seed, list, reanalisar e auth:* SQLite foram retirados. APP_POSTGRES_CONTEXT não seleciona mais banco ou UI. A origem SQLite foi preservada para histórico e está bloqueada para operação. Ferramentas SQLite e testes históricos estão separados do build operacional.

## Estado da consolidação

Consulte o [plano atual](docs/CONSOLIDACAO_POSTGRES_UI_DEV.md) e as [evidências locais](docs/STATUS_MVP_LOCAL_2026-10-11.md). O [README histórico](docs/README_LEGADO_HISTORICO.md) é apenas referência da versão anterior; seus comandos e instruções de operação não se aplicam ao servidor atual.

A aplicação continua somente local. Publicação em nuvem e domínio ficam para depois da validação do produto.


## Build operacional e manutenção histórica

`npm run build` verifica os tipos de todo o código, mas grava em dist somente módulos cujo grafo de imports executáveis não depende de SQLite ou node-cron. O diretório dist é reconstruído para remover artefatos antigos. O servidor PostgreSQL e as entradas de workers são obrigatórios: o build falha se uma delas voltar a depender do legado.

`npm run build:historico` gera dist-historico separadamente, para manutenção e testes da versão anterior. Nunca use esse diretório para iniciar a aplicação operacional. Os comandos de migração/inspeção SQLite são ferramentas de desenvolvimento e exigem instalação com devDependencies.

better-sqlite3 e node-cron são dependências de desenvolvimento. Uma instalação com `npm ci --omit=dev` executa o build previamente preparado com `npm start`, sem esses pacotes; a compilação exige as ferramentas de desenvolvimento. A imagem Docker de produção passou na validação sem esses pacotes e sem a UI legada.

## Validar Docker e recuperação

Com PostgreSQL local configurado e o papel runtime provisionado:

```powershell
docker build --tag mediador-monitor:local .
node test/docker-app.integration.mjs
npm run test:postgres-recuperacao-limpa
npm run test:postgres-recuperacao-remapeada
```

Esses testes usam bancos e containers isolados. O teste da aplicação confere Chromium/PDF, login, isolamento entre escritórios e sessão após reinício. Os ensaios de recuperação conferem banco, arquivos e retomada controlada dos fluxos.

Para os dados atuais, mantenha a aplicação no Windows com PostgreSQL no Docker usando os comandos de início acima: os documentos importados ainda têm caminhos Windows. A imagem da aplicação foi validada com dados isolados; a transferência desses arquivos para caminhos Linux não foi realizada. C01–C09 estão concluídas tecnicamente; aceite visual e uso real local continuam sendo a próxima validação do produto.
