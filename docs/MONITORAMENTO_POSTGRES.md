# Execuções de monitoramento PostgreSQL

## Ensaio de encerramento abrupto do consumidor

`postgres:validar-monitoramento` inicia um subprocesso próprio, conectado exclusivamente ao banco descartável do ensaio. A fixture valida papel runtime, persiste um registro público simulado e sua evidência usando o mesmo adaptador transacional, informa prontidão por IPC e permanece executando. O ensaio encerra somente esse subprocesso com `SIGKILL` e aguarda sua saída. Não executa scraper, IA, downloads ou mensagens.

Após a saída, a reserva continua `executando`: outro consumidor não retoma o trabalho e nova solicitação do mesmo filtro é recusada. Um segundo escritório executa normalmente. Recuperação em contexto alheio é recusada; falha da auditoria reverte a recuperação. Recuperação autorizada, após saída efetivamente observada, marca `falhou`, preserva o registro e as evidências, invalida o token antigo e grava um evento. Nova solicitação pode então ser consumida.

Build e ensaio PostgreSQL real passaram. Banco operacional e pools divergentes são recusados antes de criar o subprocesso. O ensaio valida a falha abrupta local; coleta externa e jornada completa com dados importados pertencem à validação operacional da Sprint 6.

## Ensaio de perda da conexão de exclusividade

`postgres:validar-monitoramento` agora também encerra, no banco descartável, exatamente o backend que detém o advisory lock de um escritório de teste. A identificação usa banco atual, namespace, escritório e tipo de lock; a rotina recusa banco com nome operacional ou pools divergentes antes de qualquer encerramento.

O trabalho simulado permanece aguardando após o sinal de interrupção. O ensaio confirma que a execução ainda está `executando`, um segundo consumidor não inicia trabalho duplicado e nova solicitação do mesmo filtro é recusada. Outro escritório conclui normalmente com seu próprio pool. Só após liberar o trabalho, a execução afetada passa a `falhou`, a conexão perdida é descartada, o token antigo deixa de valer e um novo ciclo funciona.

Build e ensaio PostgreSQL real passaram. Isso valida perda de conexão com encerramento cooperativo do trabalho, sem coleta ao MTE ou envio de mensagens. O encerramento abrupto também foi validado no ensaio acima; jornada operacional com dados importados permanece para o piloto. Reservas sem processo confirmado devem seguir a recuperação administrativa já documentada.

## Limites persistentes e interface

A migração `010_monitoring_office_limits.sql` cria `limites_monitoramento_escritorio`, com RLS habilitada e forçada. O contexto de outro escritório ou ausente não dá acesso à configuração. Ausência de configuração usa os padrões e substituições por escritório do ambiente; valores salvos nunca excedem esses tetos. Se a plataforma reduzir um teto depois, o valor efetivo também é reduzido.

No modo PostgreSQL, Minha conta mostra limites efetivos de inícios por hora, duração em segundos e volume em MiB. Administrador do escritório pode reduzir os valores ou deixar campos vazios para restaurar padrões. Operador e suporte consultam. `GET/PUT /api/contexto/limites-monitoramento` exige sessão e contexto; edição exige `escritorio.gerenciar`, CSRF, revalidação e auditoria atômica. Os intervalos aceitos são 1–1000 inícios/hora, 10–3600 segundos e 1–1024 MiB, respeitando o teto configurado pela plataforma.

A reserva lê a configuração sob bloqueio do escritório e grava `limites_aplicados` na evidência da execução. O executor, download e associação usam esse snapshot. Editar pela tela afeta novas reservas; não amplia uma execução em andamento. A quota mantém seu contador persistente de inícios na última hora. Concorrência continua limitada a uma execução por escritório.

Build, testes HTTP/navegador e ensaio PostgreSQL descartável validaram edição, tetos, restauração, isolamento, quota e snapshot. A migração não foi aplicada no banco operacional; após sua aplicação planejada, o provisionamento runtime precisa incluir a nova tabela. Retenção e cobertura dos demais backups no inventário de originais permanecem pendentes.

## Conciliação de referências da origem SQLite

```powershell
npm run postgres:originais:inventariar -- --output data/inventario-originais-conciliado.json --sqlite-source data/mediador.db
```

A opção `--sqlite-source` une referências dos registros e snapshots de envios da origem às do PostgreSQL. Usa leitor de manutenção `readonly`, `fileMustExist`, `query_only`, snapshot de leitura e `quick_check`; não chama `openDb`, não migra, não processa filas nem altera bloqueio de corte. Origem ausente/inválida ou snapshot malformado impede emissão do relatório. O driver SQLite é carregado somente quando essa opção é usada.

O relatório declara quais fontes foram consultadas; sem essa opção, não declara conciliação SQLite. Arquivos referenciados por qualquer fonte consultada são protegidos conservadoramente. Pacotes assinados, backups e referências históricas adicionais ainda não são conciliados. Não há expurgo: o relatório continua sem autorização de exclusão. Testes com SQLite sintético confirmaram proteção de originais/anexos, preservação byte a byte da origem e recusa de arquivo ausente sem criação de banco.

## Inventário de originais sem referência

```powershell
npm run postgres:originais:inventariar -- --output data/inventario-originais.json
```

Comando somente de leitura, usando runtime validado e transação PostgreSQL `REPEATABLE READ, READ ONLY`. Consulta referências dos registros públicos e snapshots de envios de todos os escritórios; não publica conteúdo dos snapshots. Gera relatório novo com criação exclusiva, sem sobrescrever destino existente. Não exclui nem move originais. O relatório declara `autoriza_exclusao:false`.

Examina somente arquivos diretamente em `DOWNLOAD_DIR`, com nome no padrão de original coletado e prefixo de hash conferido. Ignora diretórios, links, nomes desconhecidos, arquivos recentes, referenciados ou alterados durante leitura. Usa sete dias apenas como janela inicial de identificação de candidatos, não como autorização/política de exclusão. Referência por mesmo nome também protege conservadoramente contra caminhos antigos/alternativos. O relatório contém caminhos locais, tamanhos e hashes; mantenha-o em área de manutenção.

Referências SQLite, backups e pacotes assinados de migração não são conciliadas por este comando. Portanto, durante a transição, nenhum candidato pode ser excluído apenas com base nele. Recuperação, política de retenção e revalidação imediatamente antes de eventual expurgo permanecem pendentes. A ausência de referências é observada num snapshot, e o aplicativo pode criar novas referências após o inventário.

## Interrupção durante transferência Chromium

O caminho PostgreSQL com downloads habilitados acompanha `Browser.downloadWillBegin`/`Browser.downloadProgress` e usa `Browser.cancelDownload` no contexto isolado do navegador criado pela execução. Tamanho anunciado que excede o saldo/teto individual interrompe o download; tamanho desconhecido é acompanhado pelos bytes recebidos acumulados entre arquivos/tipos. O excesso fecha também a sessão de coleta e resulta no motivo de volume, sem iniciar a consulta seguinte. Se a configuração do controle falhar, o navegador é encerrado e a coleta falha, sem fallback sem limite.

Progresso é notificado em intervalos: bytes adicionais podem chegar antes da detecção/cancelamento. É uma interrupção reativa, não um teto exato de tráfego. Os controles de cópia local e associação no banco permanecem independentes. Artefatos de transferência usam pasta temporária exclusiva por execução, removida após encerramento do navegador com verificação do caminho; originais já salvos na pasta de documentos não são apagados nessa limpeza.

`npm run test:download-budget` usa Chromium real e servidor HTTP local sintético: arquivo grande com tamanho anunciado, arquivo grande sem tamanho anunciado e arquivo pequeno dentro do orçamento. Os dois excessos são interrompidos antes de o servidor terminar; o arquivo pequeno mantém o stream Playwright funcional. Não acessa MTE ou banco atual. Contrato CDP: [Browser](https://chromedevtools.github.io/devtools-protocol/tot/Browser/).

## Cópia local dos downloads

O caminho PostgreSQL compartilha um orçamento de cópia entre tipos da execução, derivado de `PGMONITOR_MAX_MIB`. O scraper copia o stream para temporário exclusivo, respeitando saldo e teto individual de 50 MiB antes de carregar o arquivo para validação. Excesso de volume interrompe a rodada, em vez de iniciar os downloads seguintes. Temporário parcial da cópia é removido; artefato do download Playwright é eliminado após a cópia/falha. Arquivos já validados e salvos continuam sujeitos à retenção ainda pendente.

O stream de download do Playwright pode ser disponibilizado após o navegador receber o arquivo completo. Portanto, esta camada limita cópia local/memória de validação, não garante um teto de tráfego remoto ou do cache temporário do navegador. O controle reativo de transferência Chromium está descrito acima; um teto exato de tráfego não é garantido. O timeout cooperativo continua interrompendo o contexto. O fluxo SQLite não passa a usar o orçamento PostgreSQL.

## Volume de originais por execução

`PGMONITOR_MAX_MIB` define volume máximo de originais associados nas consultas de uma execução (padrão 200 MiB). `PGMONITOR_MAX_MIB_OFFICE_3` substitui apenas o escritório 3. Valores aceitos: inteiros entre 1 e 1024 MiB. Cada arquivo continua sujeito ao teto individual de 50 MiB e às conferências de integridade/identidade.

A soma usa tamanhos conferidos dos originais e evidências das consultas anteriores, sob bloqueio da execução. Arquivos reutilizados também contam por consulta; repetição idempotente do mesmo lote não soma novamente. Lote que ultrapassa o limite não grava registros, associações ou evidência; consultas anteriores já confirmadas permanecem. O executor registra falha com `limite_volume_excedido=true`, exibido na UI. Não há reagendamento automático.

Essa proteção limita associação de originais no banco, não bytes transferidos pela rede nem ocupação total de disco. A conferência ocorre depois de o scraper baixar o lote; arquivos recusados podem ficar sem referência. Controle reativo durante transferência foi implementado; retenção/expurgo e configuração visual permanecem pendentes. Não representa quota permanente de armazenamento do escritório.

Ensaio PostgreSQL descartável com dois tipos confirmou soma acumulada, preservação da primeira consulta, ausência do registro do segundo lote recusado e motivo final de volume. Testes unitários cobrem fronteira exata, configuração por escritório e evidência inválida.

## Duração máxima

`PGMONITOR_MAX_SECONDS` define duração máxima cooperativa após reserva (padrão 900 segundos/15 minutos). `PGMONITOR_MAX_SECONDS_OFFICE_3` substitui apenas o escritório 3. Valores aceitos: inteiros entre 10 e 3600 segundos. Configuração inválida impede início. O temporizador inclui a validação inicial e o trabalho; espera por reserva/conexão antes de reservar não está incluída.

Ao atingir o limite, o executor envia `AbortSignal`, aguarda o trabalho encerrar e só então conclui. O scraper fecha seu navegador ao receber o sinal. A reserva e a exclusividade não são liberadas antecipadamente. Se a função ignorar interrupção ou uma operação de banco permanecer pendente, não há garantia de encerramento dentro do prazo: é um limite cooperativo, não uma finalização forçada. Perda da validação no banco ainda preserva reserva para recuperação explícita.

Após encerramento, a execução registra `falhou` e `limite_duracao_excedido=true`, exibido em Minha conta. Pedido de cancelamento presente no banco mantém a precedência do estado `cancelada`. Resultados de consultas anteriores já confirmadas permanecem preservados; não há reagendamento automático. Limite de volume total continua pendente.

## Limite por escritório

`PGMONITOR_LIMIT_HOUR` define o máximo de execuções iniciadas na última hora por escritório (padrão 20). `PGMONITOR_LIMIT_HOUR_OFFICE_3`, por exemplo, substitui o limite apenas para escritório 3. Valores devem ser inteiros entre 1 e 1000; configuração inválida impede reserva. Alterações de ambiente exigem reiniciar os consumidores com configuração consistente.

O contador usa `worker_iniciado_em` persistido no PostgreSQL e uma janela móvel de uma hora pelo relógio do banco. Reserva verifica quota sob o mesmo bloqueio do escritório utilizado na criação/início: consumidores concorrentes não ultrapassam o limite. Execuções concluídas, falhas, canceladas após início ou recuperadas consomem quota até saírem da janela. Solicitações ainda não iniciadas e canceladas antes do início não consomem quota. Contador não é zerado ao reiniciar o processo. Dados temporais inválidos impedem reserva em vez de liberar trabalho sem controle.

Quota esgotada não cancela nem inicia a solicitação; ela permanece `solicitada`. Ciclo único pode retornar `reservada:false` por quota, ausência de trabalho ou exclusividade ocupada; ainda não há distinção visual desses motivos. Consumidor contínuo volta a verificar no intervalo configurado. Concorrência permanece fixa em uma execução ativa por escritório. Limites de duração/bytes totais, configurações por UI e agendamento continuam pendentes; essa quota inicial não conclui S4-07.

Ensaio descartável confirmou quota consumida por falha, preservação da pendência, independência de outro escritório e liberação após deslocar a execução anterior para fora da janela. A manipulação de timestamp ocorre exclusivamente na montagem do cenário de teste.

## Interface contextual

Em `/acesso` (Minha conta), selecionar um escritório em modo PostgreSQL exibe “Execuções deste escritório”. Administrador e operador podem solicitar coleta de monitoramento ativo e pedir cancelamento. Suporte tem somente leitura. Recuperação aparece somente para administrador, com justificativa e checkbox obrigatório de consumidor encerrado/verificado. Estados e pedidos de cancelamento são exibidos; atualização é manual. Solicitar coloca na fila e não inicia automaticamente um consumidor.

A sessão PostgreSQL anuncia `capacidades.monitoramento_execucoes`; a interface permanece oculta no modo SQLite e para contexto de empresa cliente. Requisições usam contexto capturado, CSRF e credenciais de sessão. Limpeza/troca de contexto invalida respostas anteriores; dados atrasados de outro escritório não reaparecem. Nenhum token de reserva é exposto. A autorização efetiva permanece no backend.

`npm run test:monitoramento-ui` abre Chromium com HTTP e dados sintéticos, sem banco/MTE/e-mail. Confere solicitação, cancelamento, recuperação com confirmação exigida, suporte somente leitura e troca de escritório durante resposta pendente. Essa verificação visual não substitui a jornada completa com sessão PostgreSQL e dados importados.

## Recuperação administrativa

`POST /api/contexto/execucoes/:id/recuperar` recebe corpo estrito:

```json
{"justificativa":"Consumidor anterior encerrado e processo verificado","consumidor_encerrado":true}
```

Exige `escritorio.gerenciar`, contexto de escritório, CSRF e revalidação de identidade/contexto após leitura do corpo. Antes de chamar, o administrador deve encerrar e verificar o consumidor anterior; a declaração não é uma detecção automática de processo. A ausência de bloqueio não prova encerramento quando houve perda de conexão. A interface está disponível na seção contextual descrita acima.

A recuperação adquire o mesmo bloqueio exclusivo do consumidor e recusa bloqueio ocupado. Só altera execução `executando` do formato novo no escritório escolhido; marca `falhou`, remove o token e preserva evidências/arquivos. Estado e evento `MONITORAMENTO_EXECUCAO_RECUPERADA`, com ator, IP e justificativa, são gravados na mesma transação. Não reenvia mensagens, não desfaz coleta e não reagenda automaticamente. Uma nova coleta exige nova solicitação. Token antigo e recuperação repetida são recusados.

Ensaio PostgreSQL descartável cobre bloqueio ocupado, escritório alheio, falha de auditoria com rollback, recuperação única e invalidade do token anterior. Testes HTTP simulados cobrem permissão administrativa, corpo estrito, confirmação exigida e atomicidade da auditoria. Nenhuma execução foi recuperada no banco atual.

## Consumidor explícito por escritório

```powershell
npm run postgres:monitorar -- --escritorio 1 --once
npm run postgres:monitorar -- --escritorio 1 --continuous
```

O comando usa exclusivamente credenciais runtime validadas. Consome uma solicitação existente por ciclo no escritório explicitamente escolhido; não cria agendamentos nem procura outros escritórios. O padrão é ciclo único. O modo contínuo aguarda `PGMONITOR_INTERVAL_SECONDS` (30 segundos por padrão, entre 5 e 3600). É separado do worker SMTP e não envia mensagens nem inicia IA. Uma execução reservada consulta o MTE e baixa originais; os comandos acima são operacionais, não ensaios.

O consumidor mantém um advisory lock de sessão por escritório enquanto reserva, coleta, encerra o navegador e conclui. Outro consumidor encontra bloqueio ocupado e não reserva; outro escritório usa chave distinta. `PGPOOL_MAX` deve ser pelo menos 2: uma conexão mantém o bloqueio e as restantes executam transações/polling. A conexão é descartada se o desbloqueio ficar incerto, evitando devolver bloqueio de sessão ao pool. Perda de conexão sinaliza interrupção e aguarda o trabalho. O bloqueio protege os consumidores deste caminho; chamadas diretas ao executor não adquirem essa proteção.

Essa camada também protege a recuperação administrativa descrita acima. Ausência de bloqueio no banco não comprova que um processo antigo terminou: uma conexão pode cair antes do navegador encerrar. Não há liberação automática de reserva por timeout ou por perda de conexão. Recuperação deve verificar encerramento do consumidor anterior e auditar a ação antes de permitir nova coleta.

SIGINT/SIGTERM sinalizam interrupção, aguardam encerramento do trabalho/navegador e só depois encerram o pool. Falha de trabalho encerra o consumidor contínuo, evitando insistência automática quando o MTE exige intervenção humana. Perda da validação da reserva preserva a execução para recuperação administrativa; não há recuperação automática de processo morto ou encerramento forçado. O CLI não concede permissões nem usa o papel administrativo como fallback.

Build, testes de argumentos/encaminhamento e ciclo com trabalho simulado em PostgreSQL descartável foram validados. Não foi executada coleta real ao MTE nem iniciado consumidor contra o banco atual. Agendamento, quotas configuráveis e jornada completa com dados importados continuam pendentes; as notas de etapas anteriores abaixo registram a evolução das camadas.

Etapa atual: solicitação manual, histórico, reserva/conclusão e executor com cancelamento cooperativo. As rotas exigem `APP_POSTGRES_CONTEXT=1`, sessão autenticada e contexto de escritório; não iniciam consultas ao MTE. Consumidor explícito e UI estão implementados; agendamento e validação externa permanecem pendentes.

Camada de reserva implementada em `postgres-monitoring-reservation.ts`: assume uma solicitação por escritório, mantendo no máximo uma execução ativa do formato novo por escritório. Usa transação contextual, bloqueio do escritório e seleção da solicitação com `FOR UPDATE SKIP LOCKED`. Revalida escritório/filtro ativos; filtro indisponível cancela a solicitação antes da execução. Retorna token UUID exclusivo e os filtros consultados para o futuro worker. Ainda não existe processo de coleta ligado a essa camada.

A conclusão exige ID, escritório e token da reserva ativa, com resultado `concluida` ou `falhou`; remove o token ao terminar. Repetição, token incorreto ou escritório alheio são recusados. `worker_iniciado_em` registra o início real separadamente da data de solicitação. Execuções interrompidas permanecem `executando` e bloqueiam novas reservas até recuperação explícita; não há expiração/reagendamento automático. Heartbeat, quotas configuráveis e validação da coleta real permanecem pendentes; a recuperação administrativa está disponível na rota descrita acima. O limite serial atual é uma proteção inicial, não conclui S4-07.

O executor `postgres-monitoring-executor.ts` recebe uma função de trabalho e um `AbortSignal`. Consulta o cancelamento antes de iniciar e periodicamente durante o trabalho, sem sobrepor consultas. Ao observar cancelamento, sinaliza interrupção e aguarda a função terminar antes de concluir e liberar a reserva. A função deve respeitar o sinal e aguardar suas tarefas filhas; uma função que não terminar mantém a reserva. Falha do trabalho registra `falhou`; perda da validação no banco interrompe o trabalho e preserva a reserva para recuperação administrativa. A função de trabalho já pode usar o adaptador do scraper; ainda não há processo consumidor operacional ativado.

O adaptador `postgres-monitoring-collection.ts` conecta a função de trabalho ao scraper existente, sem executar o runner SQLite. Usa somente os filtros da reserva e o endereço público fixo do MTE, com consultas separadas por tipo. Valida filtros antes de abrir o navegador; cancelamento fecha a sessão e aguarda seu encerramento, inclusive quando chega durante a abertura. Resultados incompletos ou recebidos após cancelamento não são entregues à persistência. A função de persistência é obrigatória e aguardada antes da consulta seguinte; falha nela impede sucesso. `criarTrabalhoColetaComPersistenciaPostgres` liga o adaptador à persistência PostgreSQL dos metadados. O caminho com persistência habilita downloads; o adaptador ainda não está ativado em um worker operacional. Seis testes simulam o navegador, incluindo fechamento pendente; não houve consulta real ao MTE nesta validação.

`postgres-monitoring-persistence.ts` grava cada consulta em transação contextual: valida escritório ativo, execução reservada/token, ausência de cancelamento e filtros ainda iguais à reserva. Bloqueios serializam a gravação com cancelamento e alterações de filtros. O catálogo compartilhado recebe somente os campos públicos do MTE com rótulo fixo `MTE`; nomes e filtros privados não são copiados para ele. Metadados já existentes não são sobrescritos; originais só são associados quando não há referência anterior, preservando análises. O sindicato associado vem do monitoramento consultado no banco, não do resultado recebido.

Em `detalhes_json.coletas`, cada tipo consultado recebe hash do lote, números encontrados e contagens. Essa evidência pertence à execução do escritório e fica protegida por RLS. `novos_catalogo` conta inserções no catálogo público compartilhado, não documentos novos para um escritório ou cliente. Repetir o mesmo lote na mesma execução retorna a evidência existente; resultado divergente é recusado. Falha ou interrupção antes do commit desfaz registros, associações e evidência daquela consulta. Consultas anteriores já confirmadas permanecem gravadas se um tipo posterior falhar; não há alegação de rollback de toda a execução. Metadados não confirmam aplicabilidade nem geram publicação, análise ou envio.

| Método e rota | Corpo | Resultado |
|---|---|---|
| `GET /api/contexto/execucoes` | — | Até 100 solicitações recentes do escritório, somente no formato novo |
| `POST /api/contexto/execucoes` | `{"monitoramento_id": 2}` | 202 com ID e estado `solicitada` |
| `POST /api/contexto/execucoes/1/cancelar` | `{}` | Cancela solicitação pendente ou pede cancelamento da execução reservada; retorna 200 |

Leitura usa `monitoramentos.ler`; criação/cancelamento usam `monitoramentos.gerenciar`. Administrador e operador do escritório podem solicitar; suporte tem somente leitura. Mutação exige CSRF e revalida identidade/contexto após ler o corpo. Escritório e ator são derivados da sessão, não aceitos no JSON.

A criação verifica escritório e monitoramento ativos; serializa solicitações pelo bloqueio da linha do escritório e recusa outro trabalho solicitado/executando do mesmo filtro. Usa a tabela existente `execucoes_escritorio` com `detalhes_json.formato=monitoramento-execucao-v1`; linhas históricas importadas com outros formatos não são tratadas como novos trabalhos.

Cancelamento pendente é uma atualização condicional. Para execução iniciada com reserva, a ação marca `cancelamento_solicitado=true`, sem remover o token ou liberar a execução. Registro inexistente, alheio, terminal ou iniciado sem reserva é recusado. O histórico expõe o pedido de cancelamento sem expor o token. O futuro worker consulta o pedido com seu token, interrompe e aguarda seus trabalhos antes de concluir; a conclusão de reserva com pedido pendente produz estado `cancelada`, mesmo que o resultado informado seja `concluida`. Isso não desfaz efeitos de coleta já persistidos. Até integrar o scraper, não há interrupção automática de atividade externa.

Solicitação e pedido de cancelamento gravam auditoria de segurança com ator, escritório, ID e dados da requisição na mesma transação; falha de auditoria provoca rollback. O evento de cancelamento registra o pedido, sem prometer encerramento imediato. O campo existente `iniciada_em` representa a data de criação; `worker_iniciado_em` registra o início real da reserva.

Testes unitários cobrem a camada de banco com consultas simuladas e handlers HTTP com sessão simulada. O ensaio real abaixo cobre concorrência e RLS. Ainda falta jornada HTTP completa com sessão PostgreSQL real; a interface foi validada com dados sintéticos. A criação de uma solicitação não significa que o documento foi coletado ou analisado.

## Ensaio local PostgreSQL

### Originais coletados

O caminho com persistência PostgreSQL habilita downloads por padrão; pode receber `baixarOriginais:false` para coleta somente de metadados. O adaptador genérico mantém downloads desabilitados por padrão. Ainda não há processo consumidor operacional ativado.

Antes da transação, cada arquivo deve pertencer a um registro do lote, estar em pasta permitida, ter tamanho positivo até 50 MiB, formato reconhecido e SHA-256/tamanho iguais ao descritor. O número do registro deve ser confirmado no conteúdo lido. Arquivo sem identificação legível é recusado. Uma segunda conferência detecta alterações durante a leitura e outra ocorre antes da associação.

Na transação, o registro é bloqueado e o original é associado apenas quando caminho/hash ainda estão vazios. Original existente com o mesmo hash é preservado e sua integridade conferida; caminho ausente, arquivo corrompido ou hash divergente exige revisão administrativa. Não se substitui automaticamente um original ou sua análise. Repetição do lote inclui hashes dos originais e revalida as referências persistidas. A evidência registra `originais_associados` e hashes/tamanhos, sem caminhos internos.

Rollback desfaz referências no banco, não arquivos já baixados pelo scraper. Esses arquivos podem permanecer sem referência; expurgo/retentiva ainda precisam ser implementados. A coleta não inicia IA, confirma aplicabilidade, publica ou envia documentos. O ensaio usa HTML local com extensão `.doc`, no formato suportado pelo leitor, e não faz consultas externas.

```powershell
npm run build
npm run postgres:validar-monitoramento
```

Exige PostgreSQL Docker disponível, credenciais administrativas e runtime em `.env.docker`. Cria um banco `mediador_monitor_test_*`, aplica migrações, concede permissões apenas nele e cria cadastros temporários. Usa o papel runtime validado sem superusuário, BYPASSRLS, herança ou associação a outros papéis. Dois pedidos concorrentes para o mesmo filtro resultam em uma solicitação e uma recusa; filtros e históricos ficam isolados por escritório. Confere leitura sem contexto após reutilização do pool, cancelamento alheio, cancelamento repetido e recusa de cancelamento de execução já iniciada.

Encerra pools e remove o banco temporário sem forçar conexões. Não altera cadastros no banco atual, não inicia scraper/IA e não envia mensagens. A validação direta da camada de dados não substitui o worker ou testes HTTP completos. Não depende de nova migração: usa a tabela de execuções e políticas RLS já existentes.

O ensaio também confirma reserva única em dois consumidores, bloqueio por execução ativa, conclusão somente pelo token correto, recusa de conclusão repetida/alheia e cancelamento de solicitação cujo filtro foi desativado. A alteração direta de estado no teste serve exclusivamente para montar o cenário de execução iniciada no banco descartável.

O executor é exercitado no mesmo banco descartável com trabalhos de teste: sucesso, falha e cancelamento em andamento. Mesmo após o sinal de interrupção, outra reserva permanece bloqueada até o trabalho terminar; só então o estado muda para `cancelada`. Esses trabalhos não executam coleta externa.

O ensaio também persiste metadados simulados usando o papel runtime: concorrência entre escritórios para o mesmo registro, repetição idempotente, RLS da evidência, token/contexto incorretos, cancelamento, filtro alterado, preservação de original/análise e falha na segunda inserção com rollback integral do lote. As permissões adicionais são concedidas somente no banco de teste descartável. Não houve alteração de permissões ou dados no banco atual.




# Inventário e pacotes preservados

## Agendamento persistente no PostgreSQL

A migração `009_monitoring_schedules.sql` acrescenta uma agenda por monitoramento, inicialmente pausada e com intervalo de 60 minutos. No modo `APP_POSTGRES_CONTEXT=1`, Minha conta mostra as agendas no escritório selecionado. Administrador pode ativar, pausar e editar intervalo; operador e suporte leem. `GET /api/contexto/agendas` e `PUT /api/contexto/agendas/:monitoramento_id` exigem sessão/contexto; edição exige `escritorio.gerenciar`, CSRF e auditoria atômica. Filtro inativo não pode ser ativado para agendamento.

`npm run postgres:agendar -- --escritorio ID --continuous` usa as agendas persistentes desse escritório. Sem `--continuous`, executa uma conferência. Cada configuração é revalidada sob bloqueio antes da criação; pausa ou intervalo alterado durante a leitura não usa a configuração antiga. Pausar não cancela solicitações existentes. Reativar não recria uma janela já solicitada. O comando com filtro e intervalo explícitos abaixo continua disponível como operação direta, independente da agenda salva.

`npm run postgres:agendar -- --escritorio ID --monitoramento ID --intervalo-minutos 60` registra uma solicitação na janela atual de uma hora. Acrescente `--continuous` para conferir a agenda a cada 30 segundos. O intervalo aceito vai de 60 minutos a sete dias. As janelas usam o relógio do banco, alinhadas ao epoch UTC; a primeira conferência pode criar imediatamente uma solicitação. Não repõe janelas perdidas. Mantenha o intervalo consistente entre instâncias do mesmo agendamento.

O comando exige runtime validado, escritório e filtro ativos. O bloqueio do escritório impede duplicação concorrente; trabalho pendente para o filtro também impede uma nova solicitação. Após conclusão, falha ou cancelamento, a mesma janela não é recriada. Solicitações automáticas usam `solicitada_por=NULL`, `origem=agendada` e `ator_tipo=sistema`, com auditoria na mesma transação. Não há usuário humano fictício ou IP de requisição inventado.

O agendador somente cria solicitações; o consumidor `postgres:monitorar` continua separado e aplica limites e cancelamento existentes. Nenhum dos comandos foi iniciado contra os dados atuais. A migração foi aplicada somente em banco descartável. S4-06 permanece parcial até validação da coleta real e jornada com dados importados. Build, 380 testes, jornada Chromium sintética e ensaio PostgreSQL descartável passaram, incluindo isolamento, edição/pausa, concorrência e rollback de auditoria.

## Referências de pacotes no inventário

O comando aceita `--manifest caminho/manifesto.json`, repetível para cada pacote de migração preservado, junto de `--output` e da opção `--sqlite-source`. Todos os pacotes informados precisam passar pela assinatura com `CREDENTIALS_MASTER_KEY` e pelos hashes do snapshot, dump e originais copiados; qualquer divergência impede a geração do relatório.

As referências protegem o nome original e o conteúdo por SHA-256, incluindo cópias renomeadas. A conferência de retenção permite que a origem viva tenha evoluído depois do ensaio: isso não valida um pacote para importação ou corte, cujas verificações continuam separadas e mais restritas. O relatório registra a quantidade de pacotes explicitamente fornecidos, sem descobrir automaticamente outros backups. Não exclui arquivos nem autoriza exclusão. A política de retenção e a cobertura dos demais backups continuam pendentes.

Validação: build e cinco testes específicos passaram, incluindo chave incorreta, manifesto/cópia/dump adulterados, proteção por hash e preservação dos bytes da origem.
