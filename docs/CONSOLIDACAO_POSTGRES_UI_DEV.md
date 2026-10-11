# Consolidação PostgreSQL e UI — desenvolvimento local

Escopo aprovado: PostgreSQL como único banco operacional e área de trabalho do mockup como única UI. Dados de desenvolvimento; sem produção, nuvem ou domínio. Executar na ordem abaixo, preservando a cópia histórica da origem. Cada item deve passar sua validação antes do dependente.

| Task | Entrega e critério | Estado |
| --- | --- | --- |
| C01 | Schema operacional completo, runtime restrito e pacote estável verificado | Concluída |
| C02 | Importar dados, identidades e arquivo privado; preflight local aprovado | Concluída: 30 tabelas, 225 linhas |
| C03 | Entrada HTTP exclusiva PostgreSQL, sem seleção/fallback SQLite ou UI global antiga; jornada HTTPS aprovada | Concluída |
| C04 | Substituir/remover comandos operacionais SQLite e referências de configuração; documentar comandos únicos | Concluída: scripts retirados, README atual e exemplo sem opt-in |
| C05 | Separar dependências compartilhadas puras das dependências SQLite; runtime e workers sem driver legado | Concluída: grafo transitivo validado |
| C06 | Isolar ferramentas históricas e retirar servidor/adaptação de testes antigos do build operacional | Concluída: dist operacional filtrado; dist-historico explícito; driver somente dev |
| C07 | Conferir completude e consistência de cada seção da UI aprovada, CRUDs, configurações, modais e toasts | Concluída na conferência técnica: navegação, vínculos e CNPJ validados; aceite visual humano separado |
| C08 | Validar build/Docker limpo sem SQLite, reinício e jornada completa com dois escritórios | Concluída: imagem, Chromium/PDF, isolamento e reinício aprovados |
| C09 | Validar backup/recuperação PostgreSQL e atualizar documentação de execução e pendências finais | Concluída: recuperação limpa e remapeada aprovadas; comandos atualizados |

C03: npm run test:postgres-https aprovado. Teste de isolamento inicia com APP_POSTGRES_CONTEXT=0 e DB_PATH apontando para diretório: nenhuma inicialização SQLite, rotas globais recusadas. O servidor histórico temporário atende apenas testes antigos até C06. Isso ainda não significa que o driver SQLite foi removido do grafo de dependências.


C04–C05: removidos dez atalhos npm para operação SQLite. README antigo preservado como histórico; README atual descreve somente PostgreSQL e .env.docker.example não contém seleção de banco. Primitivas de autenticação, transporte SMTP, geração de relatórios e consolidação determinística foram separadas em módulos sem persistência SQLite; módulos antigos reexportam as mesmas funções para os testes históricos. O teste postgres-runtime-dependencies percorre imports transitivos emitidos pelo TypeScript, incluindo imports dinâmicos literais, de servidor e seis entradas operacionais e recusa better-sqlite3. Ainda falta C06: dependência instalada e arquivos antigos no build precisam ser isolados. Build, 29 testes de autenticação/papéis, cinco testes de SMTP/grafo e jornada PostgreSQL HTTPS/Chromium aprovados.


C06: build operacional reconstrói dist após compilação e exclui qualquer módulo com dependência transitiva executável de better-sqlite3, node:sqlite ou node-cron. Resultado atual: 147 módulos operacionais, 40 históricos excluídos, incluindo servidor SQLite, CLI antigo e importadores SQLite. Build histórico explícito gera dist-historico; testes históricos selecionados foram apontados para ele. Driver SQLite e cron foram movidos para devDependencies com lockfile atualizado. npm ls --omit=dev confirmou ausência dos dois. Jornada HTTPS/Chromium completa e preflight operacional passaram com o build reduzido. Os onze testes históricos de vínculos/consolidação passaram com dist-historico. As fontes históricas permanecem disponíveis para manutenção; não fazem parte de dist. Validação Docker de instalação limpa ainda pendente em C08.




## Fechamento C08–C09 — 11/10/2026

Imagem mediador-monitor:local construída com dependências de produção, usuário sem privilégios e Chromium. test/docker-app.integration.mjs aprovou ausência de SQLite, cron e UI legados, geração de PDF, login, isolamento de dois escritórios e sessão/contexto após reinício. O build contém 148 módulos operacionais e exclui 40 históricos. O inventário operacional de originais também foi separado da versão histórica que lê SQLite.

Os ensaios test:postgres-recuperacao-limpa e test:postgres-recuperacao-remapeada passaram: banco isolado restaurado, originais e PDFs íntegros, identidades/auditoria/RLS, custódia de chaves, SMTP TLS, IA e monitoramento com provedores controlados. O segundo ensaio remapeia caminhos após retirar os arquivos originais do ensaio; envios incertos não são repetidos automaticamente. Nenhum worker externo foi ativado.

C01–C09 concluídas no escopo técnico aprovado. Resta validar visualmente o produto e realizar o uso local real com as integrações configuradas. Para os dados atuais com caminhos Windows, execute a aplicação no Windows e PostgreSQL no Docker. A imagem da aplicação foi validada com dados isolados; os arquivos operacionais atuais não foram transferidos para caminhos Linux.
