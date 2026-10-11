# Estado do MVP local — 11/10/2026

## Resultado desta conferência

A interface contextual recebeu os incrementos visuais e foi validada em bancos isolados. O destino operacional PostgreSQL ainda não está pronto para iniciar a aplicação: local:verificar identificou migrações 009–015 pendentes e ausência de conta administrativa com credencial. Runtime, RLS das seis tabelas conferidas, Chromium, build e formato da chave passaram. Isso não verifica custódia da chave.

## Ensaio com dados locais

Pacote criado em data/migration-rehearsal-0cfcb748-eac9-4ee2-8f46-49dae9b4aa7a/manifesto.json. Ensaio validou 30 tabelas / 224 linhas, preservação dos bancos atuais, retomada e reversão por restauração em destino descartável.

postgres:validar-operacional também passou: assinatura/pacote, destino incorreto, conexão concorrente, preservação, retomada, troca/adulteração do manifesto e comparação de seis registros de recuperação, incluindo cenário de entrega incerta. O banco temporário foi removido.

A pré-checagem posterior recusou o pacote porque a origem SQLite divergiu do snapshot. A mudança foi detectada, mas não foi atribuída a um processo específico. O pacote documenta o ensaio; não é válido para executar o corte do estado atual. Nenhuma importação ou substituição do banco operacional foi executada.

## Próxima sequência

1. Identificar e parar os processos que escrevem no SQLite ou alteram os originais, conforme CORTE_POSTGRES_LOCAL.md.
2. Preparar as migrações do destino e conferir o tratamento das identidades importadas; não criar uma conta administrativa duplicada para contornar a importação.
3. Gerar e verificar novo pacote com os bancos e originais estáveis.
4. Concluir os requisitos documentados de reversão/conciliação, executar os ensaios restantes e só então fazer o corte local controlado.
5. Validar coleta/análise externa com amostra e realizar o piloto local. Remoção do SQLite depende da estabilização e recuperação previstas na Sprint 7.

Nuvem e domínio continuam fora desta etapa.

## Atualização — preparação do destino

Migrações 009–015 aplicadas no PostgreSQL operacional e runtime reprovisionado. local:verificar passou a conferir todas as 15 migrações; runtime seguro, RLS, chave, Chromium e build passaram. A identidade administrativa ainda não foi importada/criada. A mensagem de pré-checagem agora distingue importação de instalação existente de bootstrap de instalação nova.

Novo ensaio em data/migration-rehearsal-61822410-847c-4a36-b6fc-05156c018d58/manifesto.json validou 30 tabelas/225 linhas e reversão isolada. A validação operacional seguinte recusou o pacote em conferirArquivosPacoteMigracao, por divergência da origem. Assim, também não usar este segundo pacote para o corte atual. O servidor Node PID 11132 foi observado escutando na porta 3000; não foi encerrado nem comprovado como responsável pelas alterações.

A única alteração operacional nesta etapa foi a preparação do schema/privilégios PostgreSQL. Não houve importação da origem, criação de conta duplicada ou ativação de workers. Próxima etapa: parar/verificar escritores da origem e gerar um pacote que permaneça correspondente durante toda a conferência.

## Atualização — origem estabilizada e navegador validado

A instância Node PID 8744 na porta 3000 foi confirmada pela correspondência SHA-256 do arquivo workspace-ui.js servido com o arquivo deste projeto. Consulta SQLite somente leitura não encontrou envios ativos (quatro enviados e dois cancelados) nem execuções contextuais. A instância foi encerrada e a interface operacional permanece parada para preservar a origem. Nenhum worker foi iniciado.

Pacote atual: data/migration-rehearsal-5fe64f46-95df-4a54-a535-3f22b0932072/manifesto.json. Ensaio passou com 30 tabelas/225 linhas. A validação operacional isolada passou, incluindo recuperação/conciliação de seis registros. Pré-checagem verificou pacote/runtime e zero outras conexões PostgreSQL; corte_habilitado permanece false pelos requisitos de reversão/equivalência do roteiro.

O validador de navegador foi atualizado para seletor automático, tabelas de clientes e logout no modal Minha conta. A jornada da cópia atual passou em servidor PostgreSQL/Chromium descartáveis: dois escritórios, escritório vazio, retorno de contexto, resumo, documentos, revogação e logout. Arquivo privado conferido: 14 tabelas/123 linhas. Evidência: data/validacao-navegador-estavel-20261011.json.

Após a jornada, verificarPacoteMigracao conferiu novamente origem, destino, assinatura e arquivos sem divergência. Esta evidência substitui os dois pacotes anteriores para a preparação atual; ainda não autoriza importação operacional. Não iniciar o legado durante essa preparação: escritores podem invalidar o pacote novamente. Próximo trabalho: concluir requisitos de reversão/conciliação para o corte controlado. Conta administrativa PostgreSQL ainda depende da importação de identidades.

## Atualização — importação operacional e servidor PostgreSQL obrigatório

O pacote estável foi verificado e importado no PostgreSQL operacional: 30 tabelas e 225 linhas, incluindo identidades administrativas. A origem SQLite permanece preservada e bloqueada para operação. local:verificar passou com as 15 migrações, runtime/RLS, credencial administrativa, chave, Chromium e build.

src/server.ts agora contém apenas a entrada HTTP PostgreSQL e os assets da área de trabalho aprovada. Não seleciona SQLite por APP_POSTGRES_CONTEXT, não inicializa cron global e não serve a UI global antiga ou clientes-ui legados. Valida o papel runtime antes de abrir a porta. O servidor anterior foi separado em src/server-sqlite-dev.ts exclusivamente como adaptação temporária dos testes históricos; ainda há dependências SQLite indiretas a eliminar.

Validação: build; cinco testes de isolamento/bloqueio SQLite; integração PostgreSQL HTTPS e Chromium com coleta, IA, consolidação, revisão, publicação, download, ciência/auditoria, CSRF e revogação. A instância operacional não foi reiniciada nem workers externos ativados nesta etapa.

O escopo aprovado é desenvolvimento local com dados descartáveis. Os requisitos antigos de piloto em produção e reversão para SQLite não são gates desta consolidação. Backups PostgreSQL, isolamento e integridade continuam necessários.

## Atualização — comandos e dependências operacionais consolidados

C04 e C05 concluídos no plano de consolidação. Servidor e workers não carregam o driver SQLite pelo grafo transitivo de imports. Autenticação, PDF/relatórios, SMTP e consolidação usam núcleos independentes da persistência antiga. Dez scripts npm SQLite foram retirados, exemplo Docker atualizado e README operacional substituído (cópia histórica preservada). Testes de autenticação/papéis (29), SMTP/grafo (5), build e jornada HTTPS/Chromium passaram. A dependência better-sqlite3 permanece instalada para ferramentas/testes históricos até C06; não confundir ausência no runtime com retirada completa do pacote.

## Atualização — build operacional separado do histórico

C06 concluída. npm run build gera 147 módulos PostgreSQL/compartilhados e exclui 40 módulos históricos por grafo transitivo de dependências executáveis. Artefatos antigos de dist são removidos no build. npm run build:historico grava a adaptação anterior em dist-historico para testes/manutenção. better-sqlite3 e node-cron constam somente em devDependencies; npm ls --omit=dev não os encontrou no conjunto operacional. PostgreSQL HTTPS/Chromium, preflight, grafo de imports e onze testes históricos de consolidação passaram. Não foi feita ainda instalação Docker limpa sem devDependencies; essa prova pertence à C08. Aplicação operacional continua parada, sem workers externos ativados nesta etapa.

## Atualização — navegação da UI e lacuna cadastral

Link ao painel global substituído por acesso à Administração da plataforma atual no modal Minha conta. Navegação e atalhos respeitam áreas ocultas; limpeza de contexto retorna à visão geral. Plataforma não aparece antes de carregar identidade. Teste novo de navegação/modal/toast, resumo, monitoramento, IA e jornada PostgreSQL HTTPS/Chromium aprovados. C07 segue parcial: preferências por contato e enquadramento por sindicato são preservados pelo cadastro, mas faltam controles de edição. Consulta cadastral CNPJ também precisa de conferência de completude. A matriz de UI contém o detalhamento; não houve aceite visual humano nesta etapa.

## Atualização — vínculos editáveis e persistidos pela UI PostgreSQL

O modal de clientes passou a editar os atributos necessários de contatos e sindicatos, preservando valores anteriores e impondo um principal por cliente. O estado do editor é limpo ao mudar de cliente/contexto. Novos testes específicos de navegador e ampliação da jornada HTTPS conferiram salvar/reabrir as preferências no PostgreSQL. Build operacional e jornada completa HTTPS/Chromium passaram. C07 ainda não concluída: consulta de CNPJ e conferência final permanecem pendentes. Nenhum worker externo ou servidor operacional foi iniciado nesta etapa.

## Atualização — consulta CNPJ contextual e C07 técnica

Consulta CNPJ disponível no modal do cliente, com aceite explícito para preencher, dados completos expansíveis, persistência/reabertura PostgreSQL e descarte de respostas obsoletas. Permissão de gestão revalidada após consulta; suporte/cliente recusados. Build, jornada HTTPS/Chromium, testes específicos de UI, serviço e autorização passaram. Teste usa provedor controlado, sem requisição externa real. C07 concluída na conferência técnica do escopo MVP; aceite visual humano não presumido. C08 (Docker limpo/reinício) e C09 (recuperação/documentação) continuam pendentes. Instância operacional e workers não iniciados nesta etapa.

## Atualização — C08 e C09 concluídas (11/10/2026)

Imagem Docker de produção aprovada sem driver SQLite, cron ou UI global antiga, incluindo Chromium/PDF, login, isolamento entre dois escritórios e preservação de sessão/contexto após reinício. Recuperação limpa e recuperação com caminhos remapeados aprovadas em ambientes isolados: banco, arquivos, identidade, auditoria, RLS, chaves e retomada controlada dos fluxos. Preflight atual: 15 migrações e 6/6 tabelas privadas verificadas; grafo operacional aprovado. C01–C09 concluídas tecnicamente. Aceite visual humano e uso real local ainda devem ser realizados. Servidor operacional não iniciado; workers externos não ativados. Aplicação atual deve rodar no Windows com PostgreSQL Docker para acessar os caminhos Windows existentes.
