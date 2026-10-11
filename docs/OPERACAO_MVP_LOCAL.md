# Operação do MVP local

O alvo é Docker/PostgreSQL no computador local. Domínio e nuvem serão tratados após validação e aprovação. Os comandos abaixo não importam SQLite nem autorizam envios automaticamente.

## Verificar e iniciar

```powershell
npm run db:up
npm run build
npm run local:verificar
npm run local:iniciar
```

`local:verificar` exige Docker disponível e consulta PostgreSQL em transações somente leitura: papel runtime seguro, migrações/checksums, RLS obrigatório e presença de conta administrativa ativa com credencial. Confere também Chromium, build e formato da chave de credenciais. Usa a conexão administrativa apenas para ler metadados das migrações; o restante usa runtime. Não imprime senhas/chaves nem testa a senha do usuário, a custódia da chave ou as permissões privadas do disco.

`local:iniciar` repete a verificação e, se aprovada, inicia a interface em modo PostgreSQL. O servidor escuta somente em 127.0.0.1. Esse comando não inicia workers. A origem vem de AUTH_PUBLIC_URL, limitada a localhost/127.0.0.1; padrão http://localhost:3000. Se HTTPS local estiver configurado, inicie também o proxy conforme HTTPS_LOCAL.md. Chromium padrão do Playwright é necessário; instale com `npm run playwright:install` quando ausente.

Estado atual em 11/10/2026: 15 migrações aplicadas, papel runtime restrito, conta administrativa e dados de desenvolvimento importados (30 tabelas, 225 linhas). C01–C09 do plano de consolidação concluídas tecnicamente, incluindo Docker e recuperação limpa/remapeada. Não crie conta inicial duplicada nem repita a importação. A origem SQLite permanece apenas histórica. Execute a aplicação no Windows com PostgreSQL no Docker para acessar os caminhos Windows dos documentos atuais. A imagem da aplicação foi testada com dados isolados, sem transferir esses documentos para Linux.

Migrações/runtime são preparados com `npm run db:migrate` e `npm run postgres:runtime:provision`, dentro da etapa de preparação do destino. Bootstrap de uma instalação nova usa `postgres:auth:bootstrap`, conforme POSTGRESQL_LOCAL.md. Esse procedimento é diferente de importar uma instalação existente.

## Executar trabalho explicitamente

Abra um terminal separado na raiz do projeto para cada processo. Substitua 2 pelo ID real do escritório escolhido na interface.

```powershell
# Consome uma coleta já solicitada para o escritório indicado
npm run postgres:monitorar -- --escritorio 2 --once

# Cria solicitações a partir das agendas habilitadas desse escritório
npm run postgres:agendar -- --escritorio 2

# Consome uma solicitação IA existente da plataforma
npm run postgres:ia:consumir
```

IA requer configuração habilitada e chave de provedor pela interface administrativa. Coleta real acessa o MTE. Solicitação, execução e revisão são etapas separadas; consulte os estados na interface antes de repetir um comando após falha.

### Opções do navegador e integrações

Administração da plataforma → Coleta local → Ver opções de coleta mostra somente opções públicas carregadas pelo processo da interface. O worker precisa iniciar com o mesmo ambiente. A edição continua no ambiente local; reinicie interface e consumidor após alterar valores:

| Variável | Uso no PostgreSQL |
| --- | --- |
| `HEADLESS` | `true` sem janela; `false` abre navegador durante a coleta |
| `BROWSER_CHANNEL` | Vazio usa Chromium do Playwright; outro canal deve estar instalado |
| `REQUEST_TIMEOUT_MS` | Timeout de navegação, inteiro entre 1.000 e 240.000 ms |
| `FORM_TIMEOUT_MS` | Timeout do formulário, inteiro entre 1.000 e 60.000 ms |
| `MAX_PAGES` | Máximo de páginas por consulta, inteiro entre 1 e 50 |

Limites de duração total, volume de originais e inícios por hora são configurados por escritório na área Monitoramento. A coleta PostgreSQL não usa os ajustes persistidos no SQLite. `MAX_RETRIES` não cria repetição automática das filas PostgreSQL: após erro, consulte a execução antes de solicitar outro trabalho.

Slack permanece uma integração do monitor global legado, sem transmissão no consumidor PostgreSQL. O MVP contextual usa SMTP por escritório e portal de documentos. Não use o webhook global como destino de informações de escritórios distintos. Uma integração contextual de Slack, se necessária após o piloto, deverá ter credencial, destino e autorização próprios por escritório.

Preparação e entrega de e-mails são ações distintas:

```powershell
# Prepara snapshots; confira as prévias e aprovações na interface
npm run postgres:preparar-envios -- --escritorio 2

# Processa filas existentes de todos os escritórios elegíveis
npm run postgres:worker -- --once
```

O último comando pode transmitir mensagens reais quando SMTP estiver habilitado e houver filas elegíveis, inclusive notificações de publicação. Execute somente na etapa de validação de entrega com destinatários/configuração conferidos. Ele não é necessário para consultar documentos pelo portal.

Depois do piloto de cada processo, monitoramento/agendas podem usar `--continuous` e o worker de entrega sem `--once` permanece ativo. A IA continua consumindo uma solicitação por chamada. Não execute processos duplicados para tentar acelerar filas em erro.

### Agenda por dias e horário

Na área Monitoramento, “Editar agenda” permite escolher intervalo ou dias da semana, horário e fuso IANA (por exemplo `America/Sao_Paulo`). O modo semanal requer a migração `015_weekly_monitoring_schedules.sql`, aplicada somente em bases isoladas durante a validação desta implementação; o banco operacional não foi migrado automaticamente.

Use `npm run postgres:agendar -- --escritorio ID --continuous` para consultar as agendas configuradas. A forma com `--monitoramento` e `--intervalo-minutos` é uma solicitação explícita por intervalo e não consulta a configuração semanal.

A agenda semanal cria no máximo uma solicitação por data local selecionada, a partir do horário escolhido. Se o agendador voltar mais tarde no mesmo dia, poderá enfileirar a coleta; não recupera dias anteriores. Uma execução pendente impede outra solicitação. Em horário de verão, a hora repetida usa a mesma janela diária; uma hora inexistente é atendida no primeiro tick posterior. A fila não executa a coleta por si só: o consumidor de monitoramento deve estar ativo. Pausar impede solicitações novas, sem cancelar as existentes.

## Parar e recuperar

Encerre os terminais dos workers e da interface com Ctrl+C. Os workers aguardam o encerramento cooperativo da operação; uma queda abrupta pode deixar trabalho interrompido. Depois pare o banco com `npm run db:down`, que mantém o volume. Evite parar PostgreSQL no meio de uma transmissão ou análise.

Ao retomar, execute `db:up` e `local:verificar`, consulte solicitações/tentativas na interface e use as ações de recuperação com justificativa apenas após confirmar que o consumidor anterior terminou. Envios de resultado incerto não devem ser reenviados automaticamente. Recuperação de dados e reversão estão em RECUPERACAO_POSTGRES.md e CORTE_POSTGRES_LOCAL.md.

## Conferir o roteiro sem alterar os dados atuais

`npm run test:postgres-https` valida a verificação local aprovada em PostgreSQL descartável, junto da jornada controlada de coleta, IA, revisão e publicação. Os testes não habilitam entrega externa nem fazem corte operacional.

## Conferência operacional — 11/10/2026

Ver STATUS_MVP_LOCAL_2026-10-11.md. A pré-checagem atual confirma migrações 009–015 e conta administrativa pendentes. Ensaio de dados locais validou 30 tabelas/224 linhas e recuperação isolada; a origem mudou depois do pacote, que foi recusado pela pré-checagem seguinte. Gerar novo pacote após parar escritores; não reutilizar o anterior para cortar o estado atual. Nenhum corte operacional ocorreu.

Atualização da preparação: migrações 009–015 foram aplicadas no destino operacional em 11/10/2026, com reprovisionamento e validação do runtime. As 15 migrações conferem. Identidade administrativa/importação ainda pendente; pacotes recentes foram recusados por mudança da origem após o ensaio. Ver STATUS_MVP_LOCAL_2026-10-11.md antes de tentar iniciar/cortar a instalação existente.
