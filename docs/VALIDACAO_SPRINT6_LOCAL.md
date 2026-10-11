# Validação local da Sprint 6

## Revisão, publicação e auditoria pela interface real

`npm run test:postgres-https` inclui a jornada de MVP-03 com PostgreSQL descartável, servidor real, proxy HTTPS local e Chromium. Contas/documentos/análises são sintéticos. O responsável vincula aditivo e consolida pela interface; uma alteração ambígua impede publicação (409 e zero publicações). Depois de registrar revisão, publica o PDF. O representante da empresa baixa bytes idênticos aos persistidos e confirma ciência; usuário e IP são conferidos na auditoria.

A mesma jornada recusa consulta de auditoria pelo contexto de empresa, volta à conta do responsável e consulta os eventos/baixa CSV pela interface. A listagem contém somente eventos da publicação do escritório de ensaio. A API PostgreSQL `/api/contexto/publicacoes/auditoria` exige contexto de escritório e permissão `auditoria.ler`, entrega os 200 eventos mais recentes e aceita `?formato=csv`. O CSV preserva aspas/quebras de linha e neutraliza células que possam ser interpretadas como fórmula por planilhas.

O início dessa mesma jornada agora solicita coleta pela interface e consome com o worker real de monitoramento e persistência PostgreSQL. Apenas a fronteira do scraper é controlada, retornando dois originais sintéticos com número MTE, hash e tamanho conferidos. O runtime é verificado sem privilégios de superusuário/bypass RLS. Antes da IA, os originais existem e ainda não estão analisados; nenhuma publicação existe.

Uma conta administrativa temporária solicita análise pela API autenticada e o consumidor IA real valida/conclui cada original com resposta de modelo controlada. Ciclos adicionais não repetem coleta/análise. A associação confirmada dos dois documentos à empresa é preparada pelo fixture, sem validar nessa jornada o cadastro/aplicabilidade automáticos. Depois disso, vínculo, revisão, publicação, acesso e auditoria seguem pela interface.

Nenhum envio externo, acesso remoto ao MTE ou modelo externo é acionado. Documentos temporários e banco de teste são removidos. Coleta remota, qualidade de análise externa e piloto humano permanecem em MVP-05/07.

## Jornada de navegador com os cadastros atuais

```powershell
npm run build
$relatorioMvp = 'data/validacao-navegador-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'
npm run postgres:validar-importacao -- --source data/mediador.db --report $relatorioMvp --browser
```

Requer PostgreSQL Docker iniciado, `.env.docker` com usuário administrativo/runtime configurados e Chromium instalado. A opção `--browser` importa em banco descartável, cria uma conta de operador exclusivamente nele e inicia o servidor PostgreSQL real em porta local temporária. Confere os clientes de cada escritório contra os IDs importados, a quantidade renderizada, clientes ativos no resumo e a consulta de documentos. Volta ao primeiro contexto, revoga um vínculo e exige 403, encerra a sessão e verifica ausência de erros de script. O relatório registra `navegador_validado`; um destino já existente é recusado. O servidor/navegador e banco temporário são encerrados ao final.

Ensaio de 09/10/2026 passou com 30 tabelas/178 linhas e arquivo privado de 14 tabelas/97 linhas. Evidência: `data/validacao-navegador-isolamento-mvp-20261009.json`. As credenciais importadas não são alteradas, não se executam workers ou envios externos e não se realiza o corte operacional. Essa jornada não substitui o piloto humano nem valida coleta remota/qualidade de IA.

A concorrência de requisições da interface revelou esgotamento do pool por participações de backup. A admissão mantém uma conexão livre para o trabalho, com espera limitada e resposta 503 em saturação. O limite vale por processo/pool; operações externas continuam exigindo coordenação própria.

## Resumo do escritório no MVP local

Na execução PostgreSQL, a página inicial/Minha conta apresenta o resumo após selecionar um escritório: clientes ativos, monitoramentos ativos e envios em revisão, na fila ou precisando de atenção (bloqueados, falhos e incertos). Sem contexto de escritório, o resumo fica oculto. O botão Atualizar resumo consulta novamente os indicadores; não há atualização automática por eventos dos workers.

`npm run test:resumo-ui` verifica troca de escritório, descarte de resposta atrasada, limpeza e ausência de indicadores internos no contexto de empresa. `npx vitest run test/postgres-gestao-http.test.ts` verifica autorização HTTP. `npm run test:postgres-recuperacao-remapeada` compara os contadores do serviço com os dados de dois escritórios no PostgreSQL descartável usando runtime com RLS. Esse ensaio de recuperação usa dados sintéticos; a jornada adicional com cópia dos cadastros atuais passou conforme descrito acima.

## Concorrência e revogação contextual

O ensaio imprime métricas JSON com duração da fase concorrente, rodadas por segundo, latências mínima/p50/p95/máxima e contagens de rodadas, rollbacks e recusas. A latência mede uma rodada completa (autorização, eventual rollback e consultas), incluindo fila do pool; a duração exclui preparação de dados e as validações finais de logout. Percentis usam ordenação por posto mais próximo. São dados sintéticos, sem limiar de desempenho ou promessa de capacidade de produção.

Para guardar a medição em destino novo, com pasta pai existente:

```powershell
$env:MEDIADOR_PILOT_REPORT_PATH = 'data/piloto-concorrencia.json'
npm run test:postgres-recuperacao-remapeada
Remove-Item Env:MEDIADOR_PILOT_REPORT_PATH
```

A gravação ocorre após o ensaio de restauração/serviços terminar e o banco restaurado ser removido. Relatório existente causa falha sem sobrescrita; uma falha posterior na limpeza dos demais recursos ainda pode fazer o teste terminar com erro. O JSON contém apenas contagens/tempos/configuração do cenário, sem nomes de clientes, tokens ou segredos. Compare execuções no mesmo ambiente; Docker, hardware e outras cargas afetam os números.

O cenário usa também uma segunda sessão do mesmo usuário. Após logout pelo serviço PostgreSQL, 12 resoluções concorrentes alternadas entre os dois escritórios reutilizam a identidade capturada antes do logout e devem retornar 401. Consultar a sessão encerrada e repetir logout também são recusados; a auditoria registra somente um logout e a outra sessão permanece válida. Isso cobre revogação de sessão nas novas autorizações, sem afirmar cancelamento retroativo de operações já iniciadas.

O mesmo cenário também provoca 60 falhas após UPDATE autorizado do próprio escritório, alternando erro SQL (divisão por zero) e erro do callback. A leitura seguinte exige os cadastros originais, confirmando rollback. Após todas as rotinas, o teste ocupa simultaneamente cada conexão do pool e exige configurações de contexto vazias e zero clientes visíveis sem contexto. Assim, a verificação não depende de consultar apenas uma conexão reutilizada. Trata-se de dados e falhas sintéticos em banco descartável.

`npm run test:postgres-recuperacao-remapeada` inclui o início da validação adversarial de S6-11 em PostgreSQL restaurado descartável. Um usuário sintético possui vínculo de operador nos dois escritórios; 12 rotinas concorrentes executam 120 transações, alternando contexto em pool runtime de três conexões. O teste confere conjunto exato de clientes, recusa leitura e UPDATE de cliente alheio, ausência de contexto residual e integridade dos cadastros. Ao revogar um vínculo, a próxima resolução de contexto é recusada e o outro permanece funcional.

Todas as rotinas terminam antes da limpeza, inclusive quando alguma falha. Vínculos sintéticos são removidos e o banco descartável é eliminado pelo ensaio. Isso valida concorrência e autorização no serviço/RLS, sem métricas de desempenho, navegador concorrente ou piloto com usuários reais. Uma revogação não cancela automaticamente transações já autorizadas/em andamento; nenhuma promessa nesse sentido é feita por este teste.

Este roteiro registra apenas verificações que podem ser feitas no ambiente Docker local. Execute os comandos a partir da raiz do projeto e mantenha `.env.docker` fora de versionamento.

## HTTPS e portal com servidor real

```powershell
npm run test:postgres-https
```

Ensaio isolado validado em 09/10/2026: PostgreSQL descartável com migrações/runtime RLS, servidor real, proxy TLS local e Chromium nas telas existentes. Verifica login/cookie seguro, empresa autorizada, download íntegro, ciência/auditoria e recusa de acesso cruzado, CSRF/origem, IP forjado e acessos revogados. Usa PDF e identidades sintéticos e remove recursos temporários; não importa a origem nem configura certificados/serviços operacionais. Requer Docker PostgreSQL disponível, papel runtime provisionado, Chromium instalado e OpenSSL no PATH/Git para Windows ou `OPENSSL_BIN`. Detalhes em [HTTPS_LOCAL.md](HTTPS_LOCAL.md).

## Preparar o banco

`npm run test:postgres-recuperacao-limpa` cria um segundo contêiner PostgreSQL descartável com volume/credenciais próprios, provisiona o runtime pelo CLI real e valida a restauração cifrada seguida de login/portal/download HTTP no servidor real. Não monta nem altera o volume operacional. Detalhes e limites em [BACKUPS_CIFRADOS.md](BACKUPS_CIFRADOS.md).

O ensaio `npm run test:postgres-backup-cifrado` valida dump/cifragem/recuperação/restauração com bancos e arquivos sintéticos descartáveis, sem modificar a origem operacional. Requer Docker PostgreSQL e papel runtime já provisionados. O fluxo e seus limites estão em [BACKUPS_CIFRADOS.md](BACKUPS_CIFRADOS.md).

```powershell
npm run db:up
npm run db:migrate
npm run postgres:runtime:provision
npm run postgres:runtime:check
npm run postgres:validar-rls
```

O último comando cria dados de teste dentro de uma transação e os reverte. Ele confirma que uma conexão sem contexto não lê clientes, que cada escritório vê somente seus próprios dados e que o escopo global usado pelo serviço foi configurado de forma explícita.

## Criar acesso para o fluxo PostgreSQL

```powershell
npm run postgres:auth:bootstrap -- --nome "Administrador local" --email "admin@example.com"
$env:APP_POSTGRES_CONTEXT = '1'
npm run build
npm run start
```

Abra `http://localhost:3000`, entre com a conta criada e use a tela Minha conta para cadastrar um escritório, usuários, clientes, contatos e monitoramentos. Essa etapa grava no PostgreSQL com `mediador_runtime`; o painel global e o monitor legado continuam fora deste ensaio.

## Fila e publicação

Configure SMTP no contexto de um escritório antes de processar uma fila. `GET /api/contexto/envios` lista itens do escritório; as chamadas abaixo são administrativas e exigem a permissão `envios.aprovar`:

```text
POST /api/contexto/envios/recuperar
POST /api/contexto/envios/processar
```

O processamento só aceita snapshots já aprovados. Verifique o provedor antes de recuperar um item marcado como `incerto`, pois a entrega SMTP pode ter ocorrido.

## Backup e restauração

```powershell
npm run postgres:backup
$arquivo = Get-ChildItem data/backups/*.dump | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1 -ExpandProperty FullName
npm run postgres:backup:validar -- --backup $arquivo
```

A validação restaura em um banco temporário no container e o remove. Copie o dump resultante e os segredos necessários, inclusive `CREDENTIALS_MASTER_KEY`, para armazenamento externo cifrado antes de depender deste processo para recuperação.

## Auditoria da migração SQLite

### Conversão isolada do núcleo

```powershell
npm run postgres:validar-importacao -- --source data/mediador.db --report data/import-core-validation.json
```

O comando cria um banco `mediador_import_test_<uuid>`, aplica as migrações, importa e confere os dados em transação, ajusta sequências e remove o banco ao terminar. O conversor recusa nomes fora desse namespace e recusa destinos com dados além do seed intacto. Não altera o SQLite nem o PostgreSQL operacional. A conexão administrativa é necessária para criar/remover o banco temporário.

Validação local: 25 tabelas e 150 linhas, abrangendo identidades/credenciais, escritórios, cadastros, vínculos, documentos, monitoramentos, execuções, interpretações, publicações e auditoria de segurança. Booleanos, JSON, datas UTC e timestamps bigint são convertidos por tipo; escritório de relações e decisões é derivado do cliente. Contagem e hash canônico de todos os campos importados são conferidos por tabela antes do commit. IDs originais são preservados no banco vazio.

O relatório marca `completo: false` e enumera tabelas pendentes. Configurações legadas, auditoria de cadastros com eventos globais, históricos globais, sessões/concessões/recuperação e filas ainda precisam de conversão ou preservação específica. As credenciais são copiadas apenas para o banco temporário; seus valores não aparecem no relatório. Esta validação não comprova login, portal e migração integral, nem concilia a auditoria já existente no destino operacional.

### Validação HTTP após importação

`postgres:validar-importacao` também inicia um servidor HTTP temporário em loopback, usando os handlers PostgreSQL reais e o papel runtime. Cria uma conta de teste no banco isolado, preservando os hashes das contas importadas, e verifica login, listagem dos clientes/envios importados, bloqueio de escritório sem vínculo, inclusão de segundo contexto, revogação imediata, CSRF e logout. Requer pelo menos dois escritórios ativos na origem. Nenhum usuário de teste é criado no destino operacional. O relatório registra os cenários em `http_validado`.

O teste revelou e permitiu corrigir a distinção entre Pool e PoolClient nas consultas de organizações. As rotas de leitura/ciência/revogação de publicação também passaram a reconhecer IDs positivos de um único dígito. Esta validação HTTP não substitui a conferência visual em navegador nem comprova a senha das contas importadas, que não é conhecida pelo teste.

### Auditoria legada de cadastros

Eventos de cadastros só entram em `auditoria_clientes` quando há escritório identificável e sem evidências contraditórias. A identificação usa a entidade, o ID composto do vínculo, o cadastro relacionado e os snapshots antes/depois. Eventos globais de usuário/migração, entidades desconhecidas, associações ausentes e conflitos ficam exclusivamente no arquivo privado. Toda a tabela original é preservada, incluindo os eventos convertidos.

No ensaio local, 7 dos 11 eventos entraram na auditoria por escritório; 4 permaneceram globais no arquivo. Conteúdo, IDs, datas e sequências foram conferidos. O total convertido passou a 30 tabelas e 171 linhas. O relatório detalha `auditoria_cadastros.somente_arquivo`. A validação runtime agora verifica isolamento de clientes, contatos, decisões documentais, auditoria, envios e tentativas, além de ausência de contexto herdado no pool de uma conexão. O PostgreSQL operacional continua intacto; ainda falta conciliar sua auditoria com a origem.

### Conversão das configurações

`ajustes` é convertido para `ajustes_plataforma`. Os quatro ajustes conhecidos (`agendamento`, `navegador`, `llm`, `notificacoes`) têm o valor integral cifrado com AES-256-GCM e o nome da configuração autenticado como AAD. Ajustes desconhecidos ou inválidos bloqueiam a conversão. Agendamento, IA, e-mail e Slack ficam desativados; o envelope exige revisão. A decifragem do que foi gravado é comparada ao valor convertido antes do commit. Originais permanecem no arquivo privado.

O validador usa `CREDENTIALS_MASTER_KEY` se configurada; no ensaio temporário, quando ausente, gera uma chave apenas em memória, descartada ao encerrar. Essa alternativa não pode ser usada em uma importação permanente. Os relatórios não contêm valores, ciphertexts ou chaves. Ainda falta integrar leitura/edição desses envelopes ao painel PostgreSQL; copiar a configuração não ativa o agendador legado SQLite.

### Conversão dos históricos de entrega

A etapa de entregas inclui `envios_clientes`, `tentativas_envio` e `notificacoes_publicacoes`. As origens dessas três tabelas também permanecem no arquivo privado, preservando os valores anteriores à transformação. Portanto, tabelas convertidas e arquivadas se sobrepõem; não some essas contagens para obter o total de tabelas da origem.

Envios em revisão ou na fila passam a bloqueados, sem prévia ou aprovação reutilizável. Preparações e transmissões interrompidas ficam incertas. Estados finais e tentativas são preservados; tentativas recebem o escritório do envio de origem. Notificações pendentes são canceladas; transmissões interrompidas ficam incertas. O validador confirma que não há mensagens automaticamente processáveis nem sessões/concessões ativas.

O papel runtime foi exercitado contra os clientes importados, com pool de uma conexão: sem contexto não vê clientes; em cada escritório vê a contagem esperada; após commit não herda o contexto anterior. O relatório registra `isolamento_runtime_validado: true`. Ainda faltam cenários de login/HTTP e conversão operacional das demais tabelas arquivadas.

### Preservação privada do legado

O comando preserva 14 tabelas (93 linhas locais) no schema `importacao_privada` do banco temporário, incluindo origens das filas já convertidas. Guarda DDL, colunas e valores com tipos explícitos, incluindo inteiros de 64 bits e BLOBs Base64. Cada linha, esquema e conjunto de linhas é conferido por SHA-256 após a gravação. O schema não concede acesso a PUBLIC nem ao papel runtime, e o validador verifica essa restrição. Sessões, recuperação e concessões permanecem vazias nas tabelas operacionais; filas são convertidas nos estados descritos acima.

O núcleo também lê inteiros SQLite sem perda de precisão e reconfere os hashes dos documentos durante a conversão. A validação local preserva todas as 39 tabelas: 25 convertidas e 14 arquivadas. `preservacao_completa: true` significa cobertura do conteúdo da origem no ensaio; `completo: false` continua indicando que a migração operacional não terminou. O arquivo é removido junto com o banco temporário, não constitui backup permanente e não substitui a conversão de configurações/filas/históricos nem a conciliação retomável.

Para gerar o inventário de conversão por tabela/coluna, sem copiar valores:

```powershell
npm run postgres:auditar-importacao -- --plan --source data/mediador.db --report data/import-plan.json
```

O inventário compara os esquemas, aponta colunas obrigatórias ausentes e classifica cópia convertida, derivação de escritório, histórico, dados operacionais sem reativação, configurações e conciliação de auditoria. Tabelas desconhecidas bloqueiam o planejamento. Uma classificação atribuída não significa conversão implementada: o relatório lista diferenças que o importador precisa tratar. No inventário completo atual foram encontradas 39 tabelas (corrigindo a contagem anterior de 38).

```powershell
npm run postgres:auditar-importacao -- --source data/mediador.db --report data/import-audit.json
```

O relatório é somente leitura. No estado local de 9 de outubro de 2026, os documentos e hashes foram validados, mas a importação foi bloqueada porque o destino já contém eventos de auditoria. Não limpe ou sobrescreva esse histórico; defina a conciliação antes de executar um importador.

A auditoria inventaria todas as tabelas de usuário do SQLite, em uma transação de leitura consistente, e calcula a identificação da origem a partir do esquema e conteúdo ordenado de cada tabela. Alterações sem mudança nas contagens também mudam essa identificação. Verifica ainda as violações de chaves estrangeiras declaradas no SQLite. Um escritório único só é considerado o seed da migração quando ID, nome, CNPJ, contatos e situação correspondem ao cadastro inicial esperado; escritórios reais nunca são tratados como destino vazio.

O inventário atualizado encontrou 38 tabelas de origem, incluindo configurações, revisões e históricos legados. O destino local contém escritório inicial, auditoria de segurança e limites de autenticação. A etapa seguinte deve importar primeiro em banco isolado, definir o mapeamento de todas as tabelas e validar equivalência antes de conciliar o destino existente. Este relatório não executa essa importação nem autoriza sobrescrita.

## Conciliação de identidades e referências

```powershell
npm run postgres:auditar-importacao -- --reconcile --source data/mediador.db --report data/import-reconciliation-novo.json
npm run postgres:validar-importacao -- --source data/mediador.db --report data/import-remap-validation.json --exercise-remap
```

O primeiro comando gera um arquivo novo, sem sobrescrever relatórios existentes. A conciliação cobre as 16 tabelas convertidas com ID numérico e suas referências declaradas por chaves estrangeiras, incluindo constraints compostas. No levantamento local de 9 de outubro de 2026, foram identificadas 210 referências em 47 colunas de 26 tabelas; 53 referências mudariam com o remapeamento proposto. Foram planejados quatro novos IDs por colisão, incluindo auditoria de segurança, sem revisão de identidade pendente. O inventário inclui tabelas operacionais que serão apenas arquivadas, sem reativar sessões ou concessões. Os hashes de identidade não representam o conteúdo integral dos bancos.

O segundo comando força novos IDs nas 16 tabelas: escritórios, usuários, clientes, contatos, sindicatos, monitoramentos, execuções globais e por escritório, versões, publicações, acessos, auditoria de segurança, envios, tentativas, notificações e auditoria de cadastros. A importação aplica os novos IDs às referências declaradas e aos escritórios derivados de clientes/envios. A auditoria de cadastros recebe novo ID de evento e escritório para controle de acesso, preservando o identificador textual da entidade histórica e os detalhes originais. Eventos globais de cadastros que são apenas arquivados não recebem correspondência para um registro operacional inexistente. IDs ausentes, ambíguos, inválidos ou dependentes de revisão bloqueiam o remapeamento; duas identidades de origem não podem ser fundidas. Chaves naturais duplicadas na origem bloqueiam todas as ocorrências. Contatos são comparados por e-mail normalizado dentro do escritório remapeado; e-mails iguais em escritórios diferentes não representam o mesmo cadastro.

O exercício passou com 30 tabelas/171 linhas convertidas, 14 tabelas/93 linhas arquivadas, hashes de equivalência, isolamento RLS e fluxo HTTP de login, seleção de escritório, revogação e logout. O banco temporário foi removido. A importação continua restrita ao namespace isolado do validador.

O plano permanece não executável no destino atual. Referências dentro de JSON, snapshots e identificadores textuais de históricos permanecem IDs da origem: o importador preserva o evento original e grava a correspondência dos IDs numéricos convertidos em `importacao_privada.identidades`. Esse mapa é exclusivo da administração da migração, sem acesso pelo papel runtime. A conciliação aditiva já foi exercitada contra um destino de teste ocupado; ainda falta habilitar e executar a migração no destino atual, com seus procedimentos operacionais. Nenhuma auditoria do destino atual foi apagada ou reutilizada.

### Chaves textuais, compostas e restrições únicas

O relatório de conciliação verifica 19 regras, incluindo número do documento, vínculos cliente/contato e cliente/sindicato, sindicato principal, monitoramentos, versões, publicações, envios, avisos e configurações. As chaves são comparadas após remapear as referências numéricas. O índice parcial de sindicato principal considera somente os vínculos marcados como principais. Documentos existentes sempre exigem revisão: hash original divergente gera conflito e hash ausente gera revisão específica. Mesmo hashes iguais não autorizam sobrescrever atributos ou análises.

Chaves textuais são preservadas exatamente, incluindo zeros à esquerda e diferenças de maiúsculas. Componentes são serializados separadamente, para evitar colisões por concatenação. Duplicatas na origem ou destino e dependências de identidade não resolvidas bloqueiam o item. O relatório contém ordinal e SHA-256 da chave, sem incluir e-mails, credenciais ou conteúdo documental.

No levantamento local de 9 de outubro de 2026, 32 chaves de origem foram conferidas pelas 19 regras, sem revisão de chave pendente. O catálogo PostgreSQL identificou 47 restrições/índices únicos: todos têm cobertura por IDs numéricos, identidades naturais, regras textuais/compostas ou tabelas operacionais que não serão reativadas. Índices desconhecidos, inválidos ou com semântica não contemplada bloqueiam a importação isolada antes de qualquer alteração. O teste integrado cria um índice único desconhecido em um banco descartável e confirma essa recusa. A cobertura não habilita importação no banco atual nem resolve automaticamente cadastros existentes.

Com `--exercise-remap`, o validador também cria uma segunda cópia descartável com cinco registros sintéticos: publicação, aviso pendente, acesso ao documento, versão e execução por escritório. Isso permite conferir no PostgreSQL as cadeias que estavam vazias nos dados locais: IDs próprios e referências são remapeados, PDF e ator são preservados, o aviso pendente é cancelado e o checkpoint pode ser reutilizado. A cópia SQLite e o segundo banco PostgreSQL são removidos. Esse cenário não envia mensagens e não substitui o teste do portal HTTP de publicação/download.

### Checkpoint atômico da etapa isolada

O importador grava dados convertidos, arquivo legado, mapa de identidades e recibo em uma única transação PostgreSQL. Se houver falha antes do commit, os dados são desfeitos e a etapa pode ser repetida desde o início. Se o commit já ocorreu, a repetição reutiliza o recibo em `importacao_privada.lotes`, sem inserir novamente. O checkpoint é da etapa inteira; ainda não há retomada por tabela ou por páginas de registros.

A retomada exige equivalência do esquema e conteúdo de todas as tabelas SQLite, inclusive os valores de 64 bits/BLOBs e os hashes dos arquivos originais. Exige também os mesmos mapeamentos, conversor e chave de criptografia. O destino é conferido por esquema de colunas e conteúdo das tabelas públicas e do arquivo privado, incluindo o mapa de identidades. A tabela de recibos é excluída desse hash para evitar autorreferência. Isso não substitui uma verificação de permissões, políticas RLS ou backup completo de infraestrutura.

Um advisory lock serializa importadores e locks de tabela impedem alterações de linhas durante a conferência do destino. Alterações posteriores de aplicação, inclusive as feitas pelo teste HTTP, fazem a repetição do estágio ser recusada. A retomada não reconcilia essas alterações automaticamente.

O validador exercita repetição sem duplicação, duas retomadas concorrentes, chave divergente, alteração da origem mantendo contagens, alteração do destino e corrupção do hash no arquivo privado. Também provoca uma configuração inválida em uma cópia descartável do SQLite, depois da inserção das tabelas principais, e confere o rollback dos dados e a restauração do escritório inicial antes de executar a importação válida. A origem real não é modificada. Os relatórios são criados como arquivos novos, sem sobrescrever arquivos existentes.

### Conciliação em destino de teste ocupado

```powershell
npm run postgres:validar-importacao -- --source data/mediador.db --report data/import-occupied-novo.json --exercise-remap --exercise-occupied
```

O cenário adicional cria um PostgreSQL descartável com escritório, usuário, cliente, contato, sindicato, monitoramento, documento, envio, tentativa, configurações, limites de autenticação e eventos de auditoria preexistentes. A importação aditiva calcula os mapas contra esse destino e preserva o escritório inicial. Não aceita mapas manuais, fusões de identidades nem colisões de documentos ou vínculos que exijam revisão. O modo padrão continua recusando destinos ocupados.

O teste confere a preservação das linhas preexistentes de todas as tabelas públicas por hash e multiplicidade; verifica as linhas novas contra a conversão da origem. Também confirma conflitos de e-mail/documento, rollback dos dados após falha tardia, retomadas concorrentes sem duplicação, preservação das configurações e auditorias e isolamento RLS entre escritórios antigos e importados. Os mapas iniciais são persistidos junto ao recibo, para que a retomada não recalcule IDs sobre os dados recém-importados. O modo de importação faz parte da assinatura do checkpoint.

As sequências nunca retrocedem: a próxima posição considera tanto o maior ID armazenado quanto reservas anteriores da sequência. O teste preserva uma sequência reservada em 9000, mesmo com poucos usuários cadastrados. Operações de sequência do PostgreSQL podem avançar após rollback; a conferência de rollback cobre dados transacionais, não desfaz esses avanços. Lacunas de IDs são esperadas e não causam reutilização de um contador anterior.

Essa execução permanece restrita a bancos com nome gerado pelo validador. O destino atual não é alterado. A conciliação implementada adiciona cadastros novos; reutilização de identidades/documentos já existentes exige uma política posterior de revisão e continua bloqueada.

## Pacote operacional e ensaio de reversão

A sequência e os bloqueios restantes do corte estão em [CORTE_POSTGRES_LOCAL.md](CORTE_POSTGRES_LOCAL.md). No modo `APP_POSTGRES_CONTEXT=1`, o HTTP não abre SQLite nem inicia seus processos legados; APIs globais antigas ficam indisponíveis. A fila PostgreSQL exige seu worker separado.

O comando `postgres:validar-operacional -- --manifest <manifesto.json>` exercita a ferramenta de importação operacional em uma restauração descartável, com pacote assinado específico para aquele banco. O comando de execução no destino configurado e seus pré-requisitos estão no roteiro de corte; ele não deve ser confundido com esse ensaio.

Com Docker ativo e uma `CREDENTIALS_MASTER_KEY` persistente de 32 bytes em base64 configurada em `.env.docker`, execute:

```powershell
npm run postgres:ensaiar-migracao -- --source data/mediador.db
npm run postgres:ensaiar-migracao -- --verify <caminho-do-manifesto.json>
npm run postgres:corte:verificar -- --manifest <caminho-do-manifesto.json>
```

O primeiro comando cria uma pasta nova em `data`, contendo snapshot consistente do SQLite, cópias dos originais referenciados, dump customizado do PostgreSQL atual e manifesto assinado por HMAC. Não sobrescreve pacotes anteriores. Restaura o dump em banco temporário, ensaia a importação aditiva e a retomada e restaura novamente o estado anterior em outro banco temporário para conferir a reversão. Os bancos atuais são preservados. O ensaio local conferiu 30 tabelas/171 linhas e cinco originais.

O segundo comando verifica a assinatura, os arquivos e a correspondência com a origem e o destino atuais, sem importar dados. Alterações nos bancos após o ensaio exigem novo pacote; manifestos antigos sem assinatura são rejeitados. A conferência de banco abrange colunas e linhas, não substitui validação de permissões, políticas RLS, funções ou sequências.

O importador também recebe os hashes revisados do ensaio e os confere dentro da transação, após obter os bloqueios das tabelas do destino. O checkpoint vincula a retomada ao mesmo estado anterior e confere separadamente o estado posterior importado. O ensaio provoca divergências de origem/destino antes de importar, confere que o destino não mudou e rejeita a troca do hash anterior na retomada. Antes de concluir a importação, os bytes dos originais são reconferidos. Esses bloqueios protegem dados PostgreSQL; não bloqueiam escritores externos nos arquivos, que devem permanecer parados durante o corte.

O pacote não contém a chave de credenciais nem `.env.docker`; preserve-os separadamente em local seguro. A restauração do dump omite proprietários e permissões, portanto exige reprovisionamento do papel runtime. Os originais precisam ser repostos nos caminhos registrados no manifesto. Este ensaio não muda o banco usado pelo servidor nem executa o corte operacional. Checklist de corte, migração real e reversão da aplicação permanecem pendentes.

## Critérios ainda externos ao ambiente local

### Worker de filas PostgreSQL

Em um terminal separado, execute um ciclo ou mantenha o worker ativo:

```powershell
npm run postgres:worker -- --once
npm run postgres:worker
```

O worker usa exclusivamente o papel runtime, recusa superusuário/BYPASSRLS e seleciona escritórios ativos com trabalho pendente. Processa até dez envios já aprovados e dez notificações por escritório em cada ciclo, sem aprovar nem preparar documentos automaticamente. O intervalo entre ciclos é de 30 segundos; `PGWORKER_INTERVAL_SECONDS` aceita de 5 a 3600. Os ciclos são sequenciais e as reservas de banco permitem múltiplos processos. Ctrl+C encerra após o trabalho em andamento, antes de iniciar outra fila/escritório. Falhas de uma fila são isoladas das demais. `--once` retorna código de erro se houver falhas.

Esta implementação é separada do servidor HTTP. Iniciar `npm run start` não inicia este worker PostgreSQL. A recuperação de reservas interrompidas permanece uma ação administrativa explícita; envios incertos não são reenviados automaticamente. O monitoramento/coleta e a importação ainda não foram automatizados nesta etapa. O teste integrado cobre o ciclo real de envios e a exclusão de escritórios inativos.

O teste integrado também cria publicações e vínculos temporários para validar notificações: preparação idempotente, isolamento, link autenticado sem anexos por SMTP TLS, ausência de reenvio, cancelamento após revogação da publicação, alteração do e-mail ou desativação do vínculo, e resultado incerto quando o SMTP recebe a mensagem sem confirmar. Antes da transmissão, o worker revalida publicação, vínculo, usuário, cliente e escritório ativos. Apenas destinatário explicitamente aceito pelo SMTP resulta em notificação enviada. A criação das publicações neste teste é feita como fixture SQL; não substitui o teste do fluxo HTTP de publicação e portal.

### Validações da fila PostgreSQL

Preparação, aprovação e processamento respeitam os tipos de instrumento definidos no vínculo do contato. Uma lista vazia ou `Todos os tipos` permite todos os instrumentos, preservando a regra do SQLite. Preferências inválidas bloqueiam a operação.

A aprovação verifica versão atual do relatório, aplicabilidade, destinatário, hash da prévia e integridade de cada anexo antes de colocar o envio na fila. O worker repete as verificações de versão e integridade antes de chamar SMTP. A preparação reconfere conteúdo e destinatário após gerar o PDF; a repreparação é restrita ao cliente, contato e documento selecionados. Os nomes dos originais preservam a extensão.

Essas verificações são cobertas por testes automatizados com banco/transporte simulados. O ciclo de preparação/PDF, aprovação, envio com anexos por SMTP TLS, registro de tentativa, isolamento entre escritórios e ausência de reenvio também foi validado contra PostgreSQL real em Docker, com papel runtime sem BYPASSRLS e pool de uma conexão:

```powershell
npm run test:postgres-envios
```

O teste cria e remove um banco temporário, arquivos e certificado próprio. Usa OpenSSL (ou `OPENSSL_BIN`) e confia no certificado apenas no processo de teste, sem desativar a validação TLS. Requer Docker/PostgreSQL ativo e as credenciais administrativa e runtime em `.env.docker`. Não envia mensagens externas. Importação, execução automática e cenários adicionais de concorrência continuam pendentes. Leituras de versão e transmissão SMTP são operações separadas: estas verificações não garantem atomicidade entre uma alteração concorrente e a entrega externa.

O mesmo teste também altera e-mail, preferência e arquivo após aprovação e confirma que nenhuma mensagem chega ao SMTP. Dois pools runtime processam concorrentemente uma única mensagem, sem duplicação. O servidor SMTP de teste recebe o conteúdo e fecha a conexão antes da confirmação: o envio fica `incerto`. Uma reserva abandonada também é recuperada como `incerto`, exclusivamente no escritório correto. Ambos os casos permanecem fora do processamento automático. Falhas `ECONNECTION` são conservadoramente incertas nos workers de envios e notificações; exigem conferência, mesmo quando a conexão pode ter falhado antes da entrega.

HTTPS público, domínio, proxy confiável, armazenamento privado, destino externo para backups, política de retenção, usuários de piloto e plano de reversão de implantação exigem decisões operacionais. Eles não são confirmados por este roteiro.
