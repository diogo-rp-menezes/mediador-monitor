# Corte local para PostgreSQL — preparação

Estado: procedimento em preparação; não executar o corte enquanto os itens pendentes abaixo não estiverem resolvidos. O modo PostgreSQL oferece autenticação, contexto, cadastros, documentos, revisões, publicações, portal e filas próprias. Coleta/monitoramento automático e geração de extrações ainda não têm equivalência completa.

O destino definitivo é PostgreSQL como único banco operacional. O modo SQLite existe durante a transição; não haverá sincronização permanente entre os bancos. Após estabilização e validação da recuperação pelo PostgreSQL, a Sprint 7 do [plano](PLANO_SPRINTS.md) arquiva a origem e remove o runtime SQLite. A recuperação por SQLite descrita neste roteiro vale somente para essa fase temporária.

## Separação dos processos

Com `APP_POSTGRES_CONTEXT=1`, o servidor não abre nem migra SQLite, não recupera filas SQLite, não importa dados legados, não indexa arquivos em segundo plano e não inicia os timers SMTP/notificações ou o cron legados. Rotas globais SQLite ficam indisponíveis. O worker PostgreSQL continua separado, iniciado por `npm run postgres:worker`; iniciar o HTTP não envia mensagens automaticamente.

Com a variável desativada, o servidor conserva a operação SQLite anterior, incluindo os processos automáticos configurados. Não iniciar essa operação após um corte sem avaliar filas antigas: elas podem conter trabalho que já foi processado no PostgreSQL.

## Sequência de corte a concluir

Antes de avaliar o corte, execute a pré-checagem somente de leitura:

```powershell
npm run postgres:corte:verificar -- --manifest <caminho-do-manifesto.json>
```

O comando verifica assinatura, arquivos e hashes atuais dos bancos, valida a conexão runtime e conta todas as outras conexões PostgreSQL ao destino, inclusive ociosas. Não identifica processos SQLite ou alterações de arquivos em andamento, não mantém exclusividade após a consulta e não autoriza/importa dados. A saída mantém `corte_habilitado: false` enquanto as pendências de equivalência e reversão não estiverem concluídas, mesmo com a ferramenta de importação disponível. Um pacote divergente ou papel runtime inadequado encerra a pré-checagem com erro.

O worker e `postgres:runtime:check` exigem um papel independente: NOSUPERUSER, NOBYPASSRLS, NOINHERIT e sem associação a outros papéis. NOINHERIT sozinho não impede assumir outro papel com `SET ROLE`. Essa validação não substitui a revisão das permissões e políticas RLS das tabelas.

1. Concluir equivalência dos fluxos necessários ao uso local e testar HTTP contra os dados importados, com dois escritórios e revogação de permissões.
2. Parar servidor, CLI de coleta e todos os workers que possam escrever nos bancos ou alterar originais. Não manter a aplicação antiga em paralelo.
3. Preservar configuração e chave de credenciais separadamente. Gerar um pacote novo com `npm run postgres:ensaiar-migracao -- --source data/mediador.db` e conferir o manifesto usando `--verify`.
4. Após resolver as pendências do corte, executar a ferramenta de importação operacional descrita abaixo, vinculada ao manifesto e ao estado conferido dos bancos.
5. Conferir recibo, contagens, vínculos, documentos, identidades, RLS e ausência de filas antigas reativadas. A importação não transfere sessões ou concessões administrativas ativas.
6. Ativar o servidor PostgreSQL, efetuar login e conferir cadastros/portal entre escritórios antes de iniciar qualquer worker SMTP. Testar os primeiros envios em destinatários controlados.
7. Registrar versão, manifesto utilizado, resultado e horário do corte. Manter SQLite e o pacote preservados para recuperação.

## Ferramenta de importação de dados

O comando de execução está implementado, mas o corte completo ainda depende dos itens anteriores e da proteção de filas na reversão:

```powershell
npm run postgres:validar-operacional -- --manifest <caminho-do-manifesto.json>
# Importa no destino configurado; usar somente durante a janela de corte preparada:
npm run postgres:importar-pacote -- --manifest <caminho-do-manifesto.json> --execute
```

O validador restaura o backup em um banco `mediador_cutover_test_*` descartável e cria um manifesto de teste assinado para esse banco. Confere recusa sem pacote, banco errado, outra conexão, troca/adulteração de manifesto, preservação e retomada. Remove seu manifesto de teste e banco ao finalizar. Não modifica o destino atual.

A execução operacional valida o papel runtime, importa exclusivamente o snapshot do pacote e recusa qualquer outra sessão PostgreSQL conectada ao destino. Confere assinatura, hashes dos arquivos e origem, nome do banco e estado anterior sob bloqueios transacionais. Preserva linhas anteriores e grava o checkpoint junto aos dados; a retomada exige o mesmo manifesto, opções, origem e estado posterior. Configurações globais importadas permanecem desativadas; filas legadas não são reativadas. Não ativa o servidor PostgreSQL nem inicia workers. Não há fusão automática de identidades que exijam revisão.

Antes de importar, o CLI grava um bloqueio persistente `<sqlite>.cutover-lock.json` junto à origem e ao snapshot. `openDb` recusa reabrir esse banco no runtime legado; o servidor já aberto retorna 503 nas próximas requisições, e filas/coleta verificam o bloqueio antes de transmitir. O bloqueio não altera o conteúdo SQLite nem libera filas automaticamente. Se a importação falhar, permanece bloqueado: primeiro investigar e retomar com o mesmo pacote ou seguir o procedimento de recuperação. Um bloqueio de outro manifesto ou arquivo parcial é recusado, sem sobrescrita. O ensaio descartável usa a função interna sem criar bloqueios na origem real.

Esse mecanismo exige a versão atualizada em todos os processos. Binários antigos, cópias do SQLite sem o arquivo de bloqueio ou operações já em transmissão não são protegidos por ele. Parar processos continua obrigatório. Não remover o bloqueio para retomar filas antigas; restauração e conciliação de entregas/dados precisam vir primeiro. A ferramenta de liberação controlada ainda está pendente.

### Consulta da origem bloqueada

```powershell
npm run sqlite:recuperacao:inspecionar -- --source <sqlite-bloqueado>
```

Essa ferramenta de manutenção exige o bloqueio presente, abre SQLite com `readonly` e `query_only` e usa uma transação de leitura. Executa `quick_check` e retorna contagens de cadastros e estados das filas, sem nomes, endereços de e-mail, segredos ou conteúdo de documentos. Contagens são strings decimais para preservar inteiros grandes; tabela ausente aparece como `null`, e estados desconhecidos são agrupados em `outros`.

Não usa `openDb`, não aplica migrações e não inicia autenticação, coleta, IA ou SMTP. Não altera filas nem remove o bloqueio. A inspeção também funciona com um bloqueio parcial, pois sua presença continua impedindo operação. Ela não conclui conciliação nem determina se uma mensagem foi entregue; é um inventário da origem para apoiar a recuperação. Se houver outros escritores, o resultado representa a transação de leitura, não uma garantia de que o arquivo permaneceu estável após a consulta.

### Comparação de filas com o destino importado

```powershell
npm run postgres:recuperacao:comparar-filas -- --manifest <manifesto-utilizado-na-importacao>
npm run postgres:recuperacao:comparar-filas -- --manifest <manifesto-utilizado-na-importacao> --output <novo-relatorio.json>
npm run postgres:recuperacao:comparar-filas -- --verify <relatorio.json>
```

Usa a conexão administrativa para ler o recibo e os mapas privados de identidades. Exige assinatura válida, origem íntegra, banco correto e correspondência entre manifesto e opções do recibo operacional. Lê PostgreSQL em transação `REPEATABLE READ READ ONLY` e o snapshot SQLite em transação somente leitura; não exige que o destino continue igual ao instante do corte, pois o objetivo é identificar alterações posteriores.

O relatório retorna somente tabela, IDs de origem/destino e classificação. Confere os vínculos mapeados de escritório, cliente, contato, usuário e publicação, além de documento/versão dos envios. Distingue estado importado preservado, histórico enviado, entrega posterior registrada, resultado que exige conferência, registro ausente e divergência de identidade/documento. Linhas do destino fora do lote são contadas separadamente e podem ser anteriores ou posteriores ao corte. Estados não comprovam entrega SMTP; consultar provedor e tentativas antes de decidir qualquer reenvio.

O comando não altera cadastros/filas, não libera bloqueios e não conclui a conciliação. A origem atual precisa continuar correspondente ao pacote; divergência interrompe o relatório. A comparação é um passo da recuperação, não um autorizador para reativar SQLite. O ensaio `postgres:validar-operacional` também confere que a comparação preserva o destino e, quando há envio na origem, testa sua classificação como incerto após alteração no banco descartável.

Para envios, `evidencias` resume tentativas importadas/adicionais, aceitações SMTP registradas, falhas e resultados incertos. `alertas` sinaliza tentativa importada ausente/alterada, escritório divergente, resultado desconhecido, estado enviado sem aceitação e `message-id` sem correspondência. A comparação usa os mapas também para as tentativas importadas e confere seu envio, escritório, resultado e identificador original; não imprime erros ou identificadores SMTP. Notificações possuem apenas contador de tentativas nessa tabela, portanto o relatório não promete histórico individual de transmissão para elas. Aceitação SMTP registrada não comprova leitura nem entrega final.

O ensaio descartável também altera uma versão de envio com privilégio administrativo para conferir detecção de divergência e insere uma tentativa incerta adicional. A exceção ao trigger de imutabilidade existe apenas nesse cenário de corrupção do banco de teste; a execução operacional não desativa triggers.

`--output` grava um relatório novo, sem sobrescrever arquivo existente, contendo data, referência ao manifesto, comparação e assinatura HMAC. O resumo inclui um hash HMAC das colunas consultadas de filas, tentativas e mapas, sem expor seus valores sensíveis. A ordenação por ID torna a conferência reproduzível. `--verify` valida a assinatura e repete a leitura para exigir as mesmas evidências e o mesmo resumo. Detecta mudanças nas colunas consultadas mesmo quando as contagens/classificações permanecem iguais; alterações em outros campos ou tabelas não são cobertas por esse hash.

Uma conferência bem-sucedida significa que as evidências lidas continuam correspondentes ao relatório, não que as entregas foram conciliadas ou que filas podem ser liberadas. Não mantém bloqueio de escritores após terminar. O relatório preserva `conciliacao_concluida: false` e `filas_liberadas: false`; nenhum desses comandos remove o bloqueio SQLite. A chave fica na configuração e não é exportada no relatório.

O campo `resumo` conta classificações, alertas e registros que exigem revisão, sem contar um mesmo registro duas vezes por possuir vários alertas. Entregas posteriores registradas exigem revisão para evitar repetição na origem; estados importados preservados e históricos enviados sem alertas não entram nessa contagem. Linhas fora do lote são somadas separadamente. Contagens usam strings decimais e preservam precisão. Mesmo quando não há divergências detectadas, `autorizacao_reativacao` permanece `false`: conferir entregas externas, alterações de cadastros e o procedimento de recuperação continua obrigatório.

Após uma importação, a pré-checagem do estado anterior passa a rejeitar aquele destino, pois ele mudou. Para retomar a mesma importação use o comando de execução com o mesmo manifesto; ele confere o checkpoint posterior. Alterações operacionais posteriores também bloqueiam essa retomada estrita.

## Reversão a concluir

Interromper HTTP e workers PostgreSQL antes de qualquer restauração. Preservar os dados produzidos após o corte para conciliação: restaurar o backup anterior elimina esses dados no destino restaurado. Mensagens já entregues por SMTP não são desfeitas pela restauração e não devem ser reenviadas a partir de filas antigas.

O ensaio restaura o dump anterior em bancos temporários e confere colunas/linhas; não substitui uma reversão do aplicativo em operação. Uma recuperação do destino requer reprovisionar permissões do papel runtime, preservar a chave original e repor originais nos caminhos registrados. A retomada pelo SQLite deve manter suas filas bloqueadas até reconciliar entregas e alterações posteriores ao corte. O comando operacional de restauração/substituição e a proteção dessas filas ainda precisam ser implementados e testados.

Não há comando de corte ou restauração destrutiva neste documento enquanto essas proteções estiverem pendentes.
