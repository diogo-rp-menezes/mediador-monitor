# Pacote cifrado com inventário explícito

## Copiar pacote cifrado para outro destino

```powershell
npm run backup:pacote -- copiar --input "pasta-pacote" --output "E:\Backups\nova-copia"
```

O diretório pai do destino deve existir e a pasta final deve ser nova. O comando usa `BACKUP_ENCRYPTION_KEY` e copia somente o manifesto e os blobs cifrados, preservando seus bytes e a origem. Recusa destino existente, destino dentro da origem, arquivos adicionais/irregulares e alterações detectadas durante a cópia. A cópia completa é autenticada e conferida por recuperação temporária antes de informar sucesso; chave incorreta ou adulteração remove somente a pasta de destino criada pela chamada.

A validação recupera conteúdo em claro em diretório temporário privado, que é removido ao terminar ou em falha tratada; exige espaço para o pacote recuperado. A pasta de destino permanece cifrada. Queda abrupta pode deixar cópia incompleta e temporários privados; uma falha na remoção dos temporários pode deixar uma cópia já validada sem que o comando informe sucesso. Não há promessa de publicação atômica da pasta nem de persistência física após falha elétrica.

O comando funciona com caminhos locais e unidades montadas pelo sistema. Escolher uma unidade fisicamente separada e verificar suas permissões continua necessário; copiar para outra pasta no mesmo disco não demonstra redundância. Chaves e sua custódia seguem o procedimento separado. Esta implementação não configura mídia operacional, agenda, política de retenção ou exclusão de cópias antigas.

## Referências para inventário de retenção

### Conferir cobertura nas pastas de backup

O inventário aceita `--backup-root pasta-dedicada` repetível. Cada raiz deve conter somente diretórios de pacotes diretamente abaixo dela, sem arquivos avulsos, links ou pastas de agrupamento. Todos os diretórios encontrados devem estar informados por `--backup-package` ou pelo catálogo; omissão ou manifesto ausente/irregular impede gerar o relatório. A autenticação integral dos pacotes continua obrigatória e ocorre separadamente da descoberta.

O relatório declara `cobertura_backups` com quantidade de raízes e pacotes encontrados. Sem raízes, `conferida` é falso. Raízes duplicadas e pacotes repetidos não duplicam contagens. A lista de pacotes e os hashes dos manifestos são conferidos novamente após o inventário; divergência recusa o resultado. O relatório deve ficar fora das raízes dedicadas.

Esta conferência cobre apenas as raízes informadas, de modo não recursivo. Não prova ausência de backups em outros discos/pastas, não detecta toda alteração concorrente de blobs após autenticação e não substitui pausa/revalidação antes de uma futura limpeza. Nenhum arquivo é excluído.

### Configurar idade mínima do inventário

`postgres:originais:inventariar -- --output inventario.json --min-age-days 30` seleciona somente originais sem referências e modificados há pelo menos 30 dias, além dos demais critérios de integridade já aplicados. A opção aceita inteiros de 1 a 3.650; ausência mantém o padrão técnico anterior de sete dias. Esse padrão e o valor escolhido são filtros para candidatos, não uma política aprovada de exclusão ou prazo legal de guarda.

Com `--revalidate-report`, a idade mínima é herdada do inventário anterior. Informar a mesma idade é permitido; informar idade diferente é recusado, inclusive um prazo maior, para manter comparabilidade. Para avaliar outra janela, gere um inventário novo. A saída registra `min_age_days`; não há agendamento, movimentação ou exclusão de arquivos.

### Revalidar candidatos anteriores

Novos relatórios incluem `evidencia_fontes.postgres`, hash da combinação de host/porta configurados e nome/OID/endereço/porta do banco observados na mesma transação somente de leitura que consulta referências. A revalidação recusa identidade ausente ou diferente. Recriação do banco com outro OID ou mudança de conexão pode exigir um inventário novo. Relatórios anteriores sem esse campo continuam compatíveis, mas não oferecem essa proteção.

Essa identidade é uma proteção contra troca acidental de destino, não uma identidade criptográfica global do cluster: uma instalação clonada com atributos coincidentes pode produzir a mesma evidência. Não registra usuário, senha ou valores de referências no hash exposto e não autentica o relatório anterior. Pausa e revisão da instalação continuam necessárias antes de eventual limpeza.

Novos inventários registram `evidencia_fontes`: hashes das identidades formadas pelo tipo de fonte e seu caminho real, sem caminhos ou chaves em claro nessa evidência. A revalidação exige preservar cada pacote cifrado, raiz de backups, manifesto de migração e origem SQLite registrados anteriormente; ampliar fontes é permitido, omitir ou substituir uma delas é recusado, mesmo com contagens iguais. Duplicatas não duplicam identidades. Mudança legítima de localização exige produzir um inventário novo e revisar a cobertura novamente.

Relatórios antigos sem essa evidência continuam aceitos, mas a saída declara `fontes_anteriores_conferidas: false`. A identidade por caminho não autentica o relatório anterior nem demonstra conteúdo imutável; a autenticação dos pacotes e a consulta ao banco atual continuam separadas. A identidade PostgreSQL é conferida quando registrada, conforme descrito acima. A revalidação permanece somente de leitura e não autoriza limpeza.

`postgres:originais:inventariar -- --output nova-conferencia.json --revalidate-report inventario-anterior.json --backup-catalog catalogo.json` consulta novamente PostgreSQL e todas as fontes adicionais informadas. Repita também as opções SQLite/manifestos usadas no inventário anterior. As fontes são declaradas no novo relatório; não são recuperadas automaticamente do relatório antigo, e quantidades iguais não provam que os mesmos pacotes foram informados.

A revalidação mantém a idade mínima registrada no inventário anterior e exige a mesma pasta real de originais. Um candidato só permanece em `mantidos` se ainda for elegível e tiver mesmo hash, tamanho e data de modificação. Itens ausentes, alterados ou protegidos pelas referências atuais entram em `invalidados`; arquivos elegíveis que surgiram depois aparecem em `novos_candidatos`. Relatórios de outra pasta, candidatos fora dela e nomes duplicados são recusados. O arquivo anterior é preservado e o novo destino deve ser inexistente.

A saída `revalidacao-inventario-originais-v1` é uma conferência somente de leitura, sem autorização para exclusão. Ela não substitui a política de retenção, a cobertura de todas as fontes, nem uma futura conferência sob pausa imediatamente antes de uma operação de limpeza. Não há exclusão ou movimentação de arquivos nesse comando.

O inventário também aceita `--backup-catalog catalogo.json` para agregar pacotes com chaves diferentes em uma única conferência. Exemplo de catálogo sem segredos:

```json
{
  "formato": "catalogo-backups-retencao-v1",
  "pacotes": [
    {"pasta": "geracao-anterior", "chave_env": "BACKUP_ENCRYPTION_KEY_ANTERIOR"},
    {"pasta": "geracao-atual", "chave_env": "BACKUP_ENCRYPTION_KEY_ATUAL"}
  ]
}
```

As pastas relativas são resolvidas a partir do diretório do catálogo. As variáveis indicadas devem estar disponíveis no ambiente; os valores das chaves não entram no JSON, nos argumentos ou no relatório. O catálogo aceita até 1.000 entradas, tamanho máximo de 1 MiB e somente nomes de variáveis dedicados a `BACKUP_ENCRYPTION_KEY`. Pacotes repetidos são conferidos uma vez; nomes de chave conflitantes para o mesmo caminho real recusam a execução. Uma chave ausente ou qualquer pacote inválido impede a geração do relatório inteiro. `--backup-package` continua disponível e pode ser combinado com o catálogo, usando a chave padrão. Só os pacotes listados são cobertos; o catálogo não atesta que todos os backups existentes foram incluídos.

`postgres:originais:inventariar -- --output novo-inventario.json --backup-package pasta-pacote-v2` aceita a opção repetida, junto às fontes PostgreSQL, SQLite e manifestos de migração já disponíveis. Para essa opção, a chave dos pacotes informados deve ser a chave canônica de 32 bytes em `BACKUP_ENCRYPTION_KEY`; use o catálogo acima para reunir chaves diferentes. O relatório registra a quantidade de pacotes únicos em `fontes.backups_cifrados`, sem listar referências privadas dos pacotes.

Antes de proteger referências, o serviço recupera e autentica integralmente cada pacote em diretório temporário exclusivo, confere seu inventário e calcula hashes dos arquivos mapeados. Caminhos originais e cópias renomeadas com o mesmo hash ficam protegidos mesmo que as origens já tenham sido removidas. Pacote v1 sem mapa, chave incorreta, conteúdo adulterado e referência lógica desconhecida recusam a operação. Falha em qualquer fonte impede gerar o relatório; não há resultado parcial.

O dump é apenas decifrado, nunca importado. Esta operação requer espaço temporário para o pacote completo e remove sua pasta temporária ao terminar ou em falha tratada. Encerramento abrupto pode deixar conteúdo privado temporário: as mesmas precauções de armazenamento/ACL da recuperação se aplicam. O destino do relatório deve ficar fora de todos os pacotes informados. Apenas os pacotes explicitamente fornecidos são cobertos; inventário não autoriza exclusão nem define política de retenção.

## Criação coordenada em ensaio

Transações PostgreSQL agora observam eventos de perda/encerramento da conexão enquanto aguardam trabalho externo. Se a conexão se perder, o callback termina antes da liberação, o resultado é recusado e a conexão é descartada. Falha no rollback também descarta a conexão, preservando o erro original. A criação coordenada continua removendo o pacote pertencente à chamada quando a transação falha; esse tratamento não recupera uma pausa perdida nem autoriza continuar um backup após a queda.

A criação coordenada sempre gera manifesto v2, mesmo quando a instalação ainda não possui documentos ou envios. Nesse caso, o pacote contém apenas `database/main.dump` e um mapa autenticado vazio; recuperação e inventário de referências aceitam esse estado. Antes dessa correção, o pacote sem documentos era criado como v1 e recusado pelo ensaio de recuperação PostgreSQL. Um backup v1 antigo continua legível para extração de arquivos, mas não ganha mapa automaticamente.

O relatório do comando de recuperação também deve ficar fora da pasta do pacote de entrada. A validação ocorre antes da extração para evitar que uma recuperação bem-sucedida acrescente um arquivo fora do manifesto e invalide futuras conferências do mesmo pacote.

Validação adicional: o ensaio integrado agora executa o CLI compilado de criação e depois o CLI de recuperação, em contêiner/volume novos. Confirmou recusa de nome operacional sem gerar pacote/relatório, repetição sem sobrescrever os destinos e ausência da chave na saída conferida. O relatório deve ficar fora da pasta do pacote; o comando rejeita caminhos internos antes de criar arquivos, evitando adicionar conteúdo fora do inventário autenticado. Build e seis testes específicos passaram após essa proteção; o ensaio Docker passou com o fluxo de CLI.

Atualização de 09/10/2026: `postgres:backup:criar-pacote-isolado -- --root pasta-permitida --output nova-pasta --report novo-relatorio.json` integra pausa, dump e inventário no mesmo snapshot, conferência dos arquivos e cifragem v2. Exige chave canônica de 32 bytes em `BACKUP_ENCRYPTION_KEY` e banco configurado com nome `mediador_backup_test_<32 hex>`; recusa banco operacional. O pool usa o mesmo banco configurado para o dump, e o serviço confirma a identidade no PostgreSQL.

O sucesso só retorna após COMMIT; falha na transação remove o pacote criado por esta chamada. O dump temporário é removido ao terminar, inclusive em falha tratada. Destinos existentes são preservados. Encerramento abrupto do processo pode deixar arquivos temporários privados; permissões de diretório no Windows continuam responsabilidade operacional. Falha ao gravar o relatório pode deixar um pacote já concluído, sem sobrescrever o relatório existente.

Build e 14 testes específicos passaram. Ensaio integrado em contêiner/volume novos restaurou o pacote produzido pelo serviço após remover origens, validando remapeamento, HTTP, IA, monitoramento e SMTP TLS. A criação operacional e sua coordenação com processos externos permanecem pendentes.

## Importação antes dos efeitos na origem

Atualização de 09/10/2026: a importação adquire participação compartilhada transacional na própria conexão do destino, sem criar conexão extra que violaria sua exigência de destino sem outros processos. A validação do pacote e do banco continua obrigatória. Na importação operacional, pausa ativa recusa antes da verificação de outros processos e antes de gravar bloqueios SQLite. O CLI solicita explicitamente o bloqueio de corte; esse bloqueio saiu do CLI e passou para dentro da sequência protegida, após confirmar destino e ausência de outros processos.

Importações isoladas também participam da pausa, mas não podem solicitar bloqueio da origem sem pacote operacional validado. Chamadas de ensaio ao serviço mantêm o padrão sem bloquear a origem. Depois que o corte começa, falhas posteriores preservam os bloqueios SQLite, como antes: não há liberação ou reativação de filas automática. A transação PostgreSQL não reverte arquivos de bloqueio.

Build e nove testes específicos passaram. Os testes usam SQLite temporário real e contrato de manifesto controlado para conferir recusa sem mudar bytes/bloqueio e preservação de bloqueio após falha posterior. A validação integrada real da importação existente passou em PostgreSQL descartável: 30 tabelas/178 linhas e arquivo privado 14 tabelas/97 linhas, incluindo remapeamento. Relatório `data/validacao-importacao-pausa-20261009.json`. Nenhum corte ou bloqueio na origem operacional foi executado. Procedimento de parada/verificação de processos externos, criação operacional coordenada do pacote, retenção e ativação/reversão continuam pendentes.

## Migrações, bootstrap e provisionamento

Atualização de 09/10/2026: `migratePostgres` adquire participação compartilhada antes do bloqueio de migrações ou de criar a tabela de versões. Mantém a participação na mesma conexão até encerrar todas as migrações; durante pausa retorna 409 antes de executar DDL. Em falhas SQL, reverte a migração corrente e libera os bloqueios; liberação incerta descarta a conexão e impede sucesso. Não exige conexão extra para participação.

O bootstrap administrativo adquire participação compartilhada transacional antes de inserir identidade/credencial/papel/auditoria; pausa retorna 409 e rollback. O CLI de provisionamento runtime mantém participação durante seu procedimento e recusa antes de alterar papel/privilégios. Esse CLI precisa de pool >=2. A participação é por banco; alterações de papéis são globais ao cluster, portanto provisionamento executado por outro banco, scripts externos e SQL manual ainda exigem coordenação operacional.

Build, dez testes específicos e ensaio remapeado em Docker novo passaram. O ensaio recusou migrações e bootstrap durante a pausa, sem criar usuário. A recusa real do CLI runtime foi testada apenas no Docker novo com nome de papel sintético: o papel não foi criado. Migrações/provisionamento normais do Docker novo e recuperação completa permaneceram funcionais. Importação/corte ainda precisam de proteção antes dos efeitos na origem SQLite; nenhuma migração, papel ou pausa operacional foi alterado.

## Participação HTTP no modo PostgreSQL

Atualização de 09/10/2026: o servidor em `APP_POSTGRES_CONTEXT=1` mantém participação compartilhada durante o atendimento das APIs de autenticação, contexto, portal e plataforma. Inclui GETs que renovam sessão ou registram auditoria, login e solicitação de recuperação de senha com SMTP. As páginas `/` e `/acesso` protegem sua consulta de identidade. Durante pausa exclusiva essas operações retornam 409 antes de acessar seus serviços; `/login` e arquivos estáticos continuam disponíveis. Validação de Host/origem/conteúdo permanece anterior ao atendimento protegido.

Uma preparação disparada pelo mesmo HTTP reutiliza a participação do mesmo pool/contexto assíncrono, sem segurar uma segunda conexão para backup. A participação termina após o callback do handler; não é liberada por mero fechamento da conexão HTTP enquanto o trabalho ainda está sendo aguardado. Todos os trabalhos filhos devem continuar sendo aguardados. Se ocorrer erro após iniciar a resposta, o servidor não tenta escrever outra resposta e registra somente mensagem genérica. Erro de aquisição/liberação de participação descarta conexão incerta.

Build, 11 testes específicos e ensaio completo em Docker novo passaram. O teste HTTP real, com SMTP de recuperação habilitado, recusou login/recuperação, sessão e portal durante pausa e preservou contagens de sessões/auditoria, sem mensagem SMTP adicional. A página de login permaneceu disponível; após liberar, login, sessão, portal e download funcionaram. A preparação e o envio após recuperação também passaram. A coordenação continua exclusiva ao modo PostgreSQL atualizado; SQLite legado, scripts administrativos/migrações, processos antigos/externos e perdas de conexão ainda exigem procedimento operacional. A ferramenta de pausa continua restrita ao ensaio; não foi ativado backup operacional.

## IA e entregas participantes

Atualização de 09/10/2026: exclusividade IA, processamento de envios e notificações participam da pausa cooperativa. A fila IA mantém participação até concluir ou encerrar a solicitação; o executor direto também participa. A fila e a análise aninhada compartilham participação por contexto assíncrono do mesmo pool, sem exigir uma quarta conexão. Todos os callbacks devem continuar aguardando suas tarefas filhas. Durante pausa, IA retorna ocupada/sem reserva antes de consultar/reservar trabalho.

Os processadores de envios/notificações mantêm uma conexão de participação durante reserva, validação, chamada SMTP e persistência de resultados. Exigem pool >=2; se o backup exclusivo estiver ativo, retornam 409 antes de reservar mensagens. O ciclo de filas registra esse conflito como falha transitória do ciclo, sem mudar mensagens; a próxima execução poderá tentar novamente após a pausa. Não há nova tentativa automática de mensagens incertas. A perda da conexão de participação sinaliza interrupção; chamadas SMTP em andamento são aguardadas e os resultados incertos continuam exigindo conciliação.

Build, testes específicos e ensaio completo em Docker novo passaram. O teste real durante a pausa conferiu ausência de mudanças nos estados, reservas e contadores de IA/envios/notificações. Após recuperação, execução IA, nova aprovação e envio de anexos/notificações SMTP local permaneceram funcionais. Estes bloqueios não cobrem HTTP em geral, serviços de recuperação de senha, versões antigas ou processos externos. Perda de conexão/morte de processo não comprova que trabalhos externos terminaram; ainda exige verificação operacional antes de backup/ativação. Não foi ativada pausa operacional.

## Preparação de anexos participante

Atualização de 09/10/2026: `prepararEnviosPostgres` mantém uma participação compartilhada na pausa desde a consulta dos destinatários até terminar a geração/cópia dos arquivos e a persistência do snapshot. Usa uma conexão dedicada; o pool precisa de pelo menos duas conexões. Se o backup exclusivo estiver ativo, retorna conflito 409 antes de consultar/reservar preparações. A função não aprova ou transmite anexos automaticamente.

A participação só termina depois do callback, também em falhas tratadas. Perda da conexão cancela o sinal e descarta a conexão; a preparação verifica o sinal antes de cada destinatário, após gerar o PDF e antes de salvar o snapshot. A liberação incerta impede sucesso e destrói a conexão. A geração de PDF em andamento é aguardada, não encerrada à força. Isso não garante drenagem de um processo que perdeu a conexão ou morreu: verificar processos interrompidos permanece necessário antes de ativação operacional.

Build, 30 testes específicos e recuperação remapeada completa em Docker novo passaram. A tentativa real de preparação durante a pausa foi recusada com 409; após recuperação, preparação/revisão/aprovação e envio SMTP local permaneceram funcionais. Outros escritores e serviços, processos antigos/externos e ativação operacional da pausa continuam pendentes. Nenhuma preparação ou pausa operacional executada.

## Participação da coleta na pausa de backup

Atualização de 09/10/2026: o bloqueio de exclusividade do worker de monitoramento mantém também um advisory lock compartilhado de participação no backup, na mesma conexão já usada pelo worker. Ele cobre o callback completo, inclusive downloads e persistência. Cancelar não libera participação até o trabalho encerrar; perda de conexão interrompe o sinal e descarta a conexão incerta. Se houver pausa exclusiva de backup, a coleta retorna ocupada sem reservar/iniciar o callback.

O snapshot de ensaio obtém primeiro o advisory lock exclusivo transacional, antes dos bloqueios SHARE de tabelas. Assim aguarda coletas participantes terminarem, sem segurar bloqueios de tabelas necessários para elas encerrarem. A espera é limitada pelo lock timeout de cinco segundos; exceder aborta o ensaio. O bloqueio exclusivo termina no commit/rollback. A coordenação é local ao banco e vale apenas para código participante atualizado; versões antigas, escrita direta em arquivos e outros escritores não estão cobertos.

Build, 54 testes de monitoramento, três testes de snapshot e recuperação remapeada completa em Docker novo passaram. O ensaio PostgreSQL real mantém uma coleta aberta, confirma que a pausa ainda não entrou, encerra a coleta, recusa nova coleta durante a pausa e permite trabalho após liberá-la. O callback dessa coleta de concorrência é controlado e não consulta o MTE. Preparação de anexos, demais escritores/serviços e ativação operacional da pausa continuam pendentes. Nenhum worker/bloqueio operacional foi iniciado.

## Snapshot compartilhado e integridade da cópia

Atualização de 09/10/2026: o ensaio agora exporta um snapshot PostgreSQL e o compartilha entre `pg_dump --snapshot` e a consulta de referências do inventário. `comSnapshotBackupIsolado` aceita apenas bancos `mediador_backup_test_UUID`, confere a conexão e mantém bloqueio SHARE das tabelas públicas existentes até concluir a criação do pacote. O teste real confirma recusa de uma escrita concorrente por timeout e liberação da escrita após terminar. Erros tratados revertem a transação e liberam a conexão; o serviço possui limites de espera por bloqueios e de ociosidade da transação. Identificadores de snapshot são validados antes de entrar no SQL/argumentos do dump.

O inventário passa hash/tamanho esperados de cada arquivo à criação do pacote. Depois de cifrar, a ferramenta decifra a cópia para `verify.private`, confere esses bytes contra o inventário e remove a verificação antes de concluir. Assim, uma alteração entre inventário e cifragem não produz sucesso com bytes divergentes do banco. Erros tratados removem a pasta criada. O arquivo temporário contém texto claro: use pasta/volume privados com ACLs apropriadas; encerramento abrupto pode deixar resíduos. A conferência acrescenta leitura, decifragem e espaço temporário para um arquivo por vez.

Build, testes específicos e recuperação remapeada em Docker novo passaram. O snapshot comum e a barreira de escrita estão integrados ao ensaio descartável, não a um comando operacional de criação. Workers de arquivos já estão encerrados nesse cenário; bloqueios SQL não impedem escrita direta no filesystem, DDL em novos objetos ou alterações de sequências fora das tabelas. Ainda é necessário coordenar parada/drenagem de escritores, migrações e processos externos antes de oferecer backup operacional consistente. Este avanço não conclui S6-10/S7-03.

## Comando integrado de ensaio

Atualização de 09/10/2026: com `BACKUP_ENCRYPTION_KEY` no ambiente e conexão administrativa PostgreSQL/Docker configurada, execute:

```powershell
npm run postgres:backup:ensaiar-pacote -- --input C:/backups/pacote-v2 --output C:/recuperacao/nova-pasta-privada --report C:/recuperacao/novo-relatorio.json
```

O pacote deve ser v2, com mapa autenticado e `database/main.dump`. Os diretórios pais devem existir; pasta de saída e relatório devem ser inexistentes. Use relatório fora da pasta extraída. A conexão e o contêiner seguem a configuração PostgreSQL existente (`.env`/`.env.docker`, sem sobrescrever variáveis já definidas). Não há escolha de banco de destino: a ferramenta cria `mediador_import_test_UUID`, restaura sem proprietários/privilégios, confere migrações, remapeia referências e verifica os arquivos contra hashes/tamanhos do banco. Ao concluir, remove o banco temporário e só então grava relatório privado com contagens e indicação de validação, sem chaves, caminhos antigos ou conteúdo de documentos.

O comando é um ensaio de recuperação, não uma ativação operacional. Não provisiona papel runtime, inicia serviços/workers, altera credenciais ou substitui banco existente. O banco temporário é removido também após falhas tratadas; falha do Docker durante a limpeza pode exigir remoção manual do banco temporário identificado pelo prefixo. Os arquivos privados extraídos permanecem para conferência, inclusive se uma etapa SQL posterior falhar. Interrupção abrupta pode deixar banco/pasta parciais. Não remova diretórios operacionais ao limpar esse ensaio.

Build, 14 testes específicos e execução do CLI real dentro do ensaio remapeado em Docker novo passaram. A jornada HTTP/workers/nova aprovação continua validada separadamente pelo ensaio integrado; o comando por si só valida dump, migrações, referências e bytes, não entregas ou qualidade de análises. Snapshot coordenado de origem, política de retenção e procedimento de ativação/reversão permanecem pendentes. Nenhum dado operacional foi alterado.

## Mapa de origem autenticado — formato v2

Atualização de 09/10/2026: o inventário PostgreSQL inclui `references`, com as strings exatas armazenadas nos campos de caminhos do banco. A criação de pacote com essas referências grava manifesto `mediador-package-v2`; pacote sem referências mantém v1. Ambos são legíveis. O mapa fica dentro do manifesto cifrado e autenticado, não em arquivo público separado. Referências duplicadas são recusadas. A recuperação pela API retorna `references` com pares `{origin,path}`; o serviço de remapeamento exige esse mapa e confere os bytes dos destinos contra hashes/tamanhos do banco antes de alterar caminhos.

As strings de origem são identificadores opacos: a recuperação não usa `resolve` nelas nem recalcula seu hash a partir do ambiente atual. Assim, caminhos Windows, Unix e relativos podem identificar a mesma entrada recuperada sem depender da pasta de execução da origem. Caminhos de destino continuam relativos, validados e contidos na raiz recuperada. Uma referência do banco ausente no mapa impede todo o remapeamento. Pacotes v1 continuam recuperando arquivos, mas não autorizam esse remapeamento automaticamente.

Build, 12 testes específicos e ensaio remapeado em Docker/volume novos passaram. Os testes incluem referências Windows/Unix/relativas, mapa incompleto/duplicado/inseguro, bytes divergentes, preservação do conteúdo do snapshot e rollback. A execução completa ainda ocorreu em Windows: não equivale a homologação do runtime em Linux. O CLI de recuperação apenas extrai arquivos; a API entrega o mapa em memória ao ensaio. Exportação privada do mapa/comando operacional integrado, snapshot coordenado e retenção permanecem pendentes.

As seções seguintes descrevem a evolução anterior; a limitação de recalcular referências no destino foi substituída pelo mapa v2 acima.

## Inventário de referências PostgreSQL

Em 09/10/2026 foi adicionado `postgres:backup:inventariar`. Ele lê `registros.arquivo_path/arquivo_hash` e `envios_clientes.snapshot_json.anexos` em transação global somente leitura, com snapshot consistente das consultas. Não interpreta outras strings dos snapshots como arquivos. Confere existência, SHA-256 e tamanho dos anexos, deduplica referências e recusa divergências, arquivos fora das raízes permitidas e links/redirecionamentos de caminho.

```powershell
npm run postgres:backup:inventariar -- --dump C:/copia-congelada/main.dump --root C:/mediador/downloads --root C:/mediador/data/envios --output C:/copia-congelada/inventario.json
npm run backup:pacote -- criar --input C:/copia-congelada/inventario.json --output C:/backups/pacote-novo
```

Use apenas raízes necessárias e existentes. O inventário é privado e contém caminhos de origem, sem chaves. O CLI usa o papel runtime validado e nunca sobrescreve o inventário. Caminhos lógicos são identificadores estáveis derivados do caminho de origem; ainda não preservam a árvore original nem remapeiam referências no banco. O dump precisa ter sido criado com todos os escritores interrompidos, permanecendo interrompidos até concluir o pacote: a transação de inventário não compartilha o snapshot do dump nem congela arquivos.

O ensaio descartável confere o conjunto completo esperado de originais/anexos sintéticos, monta o pacote, remove a origem, recupera os arquivos em outra raiz e confere seus hashes. A restauração PostgreSQL usa o dump recuperado do pacote. Os serviços ainda usam arquivos recuperados em seus caminhos originais pelo mecanismo anterior; isso não comprova remapeamento do banco para a nova raiz. Publicações em bytea e demais configurações persistidas são cobertas pelo dump, sem exportação separada. Arquivos sem referência, configurações externas e chaves não fazem parte desse inventário.

## Mecanismo de pacote

### Remapeamento no ensaio isolado

Atualização de 09/10/2026: a nova preparação e aprovação após remapeamento foi validada com os serviços reais e o papel runtime em Docker novo. Preparar cria uma nova versão em revisão, cancela a versão anterior superada e preserva seu snapshot. Repetir a preparação não duplica versões. O envio permanece sem transmissão antes da aprovação; prévias antigas são recusadas. Após aprovação explícita da nova prévia, SMTP TLS local recebe os anexos com hashes conferidos, com uma única tentativa e sem repetição no ciclo seguinte. Escritório alheio não prepara os dados do cliente. O relatório agora usa assinatura PDF como alternativa quando o arquivo recuperado tem extensão `.bin`, seguindo a convenção existente PDF/DOC; não constitui validação semântica de formato.

Em 09/10/2026 foi adicionado o serviço `remapearArquivosBackupIsolado` e o comando de teste `npm run test:postgres-recuperacao-remapeada`. O serviço recusa bancos fora de `mediador_import_test_UUID`, confere o nome da conexão, bloqueia as tabelas envolvidas e verifica todos os arquivos recuperados antes da primeira escrita. Em uma transação, altera somente os caminhos dos originais e anexos conhecidos e retira envios `na_fila` para `revisao`, removendo sua aprovação ativa. Falha de integridade reverte a operação. Snapshots, hashes, conteúdo, versões e históricos são preservados; estados enviado/incerto/enviando não são retomados por esse serviço.

A mudança de caminho altera a versão calculada do relatório atual. Por isso uma aprovação anterior não autoriza envio após o remapeamento; exige nova preparação/revisão, validada na atualização acima. O ensaio remapeado confirma ausência dos arquivos nos caminhos antigos, recuperação íntegra na pasta nova, recusa de destino incorreto/arquivo ausente, execução IA e monitoramento, HTTP/portal e notificações por SMTP local. Confirma também que o envio afetado não cria tentativa nem transmissão antes da nova aprovação. O ensaio anterior permanece cobrindo transmissão com anexos e caminhos preservados.

Build e ambos os ensaios passaram. Este serviço ainda não é um comando operacional de recuperação: não autoriza alterar banco atual, não compartilha snapshot com dump e não cobre migração entre sistemas operacionais ou diretórios de execução diferentes para referências relativas. A derivação dos caminhos lógicos usa a resolução de caminhos do ambiente de origem; a recuperação entre ambientes exige mapa de origem explícito em etapa futura. Extensões dos blobs recuperados são `.bin`, e a preparação de novos relatórios/anexos precisa preservar os nomes/tipos originais. Repetir o remapeamento sobre banco já remapeado falha fechado, sem uma segunda alteração automática.

Incremento de S6-10/S7-03 em 09/10/2026. `backup:pacote` reúne arquivos declarados, inclusive um dump previamente criado, em uma pasta nova. Cada arquivo e o manifesto são cifrados com o envelope AES-GCM existente. O manifesto autenticado contém caminhos lógicos relativos, tamanhos e SHA-256 dos arquivos cifrados. Nomes privados não aparecem nos nomes dos blobs.

Prepare um inventário JSON privado, usando caminhos absolutos em `source`:

```json
[
  {"source":"C:/copia-congelada/main.dump","path":"database/main.dump"},
  {"source":"C:/copia-congelada/documento.pdf","path":"files/originais/documento.pdf"}
]
```

Com `BACKUP_ENCRYPTION_KEY` definida no ambiente, execute:

```powershell
npm run backup:pacote -- criar --input C:/copia-congelada/inventario.json --output C:/backups/pacote-novo
npm run backup:pacote -- recuperar --input C:/backups/pacote-novo --output C:/recuperacao/pasta-nova
```

Os diretórios pais devem existir; o destino deve ser inexistente. Arquivos com caminhos relativos em `source` são resolvidos a partir do diretório de execução. Nenhum comando importa SQL, altera configurações ou ativa serviços. A recuperação confere o inventário completo, recusa arquivos adicionais/ausentes e valida todos os hashes antes de recuperar os conteúdos. Cada decifragem também exige autenticação GCM. Travessia, caminhos absolutos no manifesto, colisões de maiúsculas/minúsculas, nomes reservados Windows e conflitos entre arquivos/diretórios são recusados.

A pasta criada é visível durante o processamento: só considere o comando concluído com código de saída zero. Erros tratados removem exclusivamente a pasta criada pela operação; destinos preexistentes são preservados. Encerramento abrupto pode deixar uma pasta parcial, inclusive conteúdo recuperado em texto claro. Use armazenamento privado e ACLs apropriadas; modos POSIX não configuram ACLs Windows. A origem deve permanecer estável e inacessível a alterações durante a operação. O mecanismo não garante snapshot consistente entre arquivos: interrompa escritores e use uma cópia congelada consistente com o dump.

O mecanismo recebe inventário explícito, que pode ser preparado manualmente ou pelo comando PostgreSQL descrito acima. Isso não demonstra cobertura integral dos arquivos da aplicação. Recuperar em outra pasta preserva caminhos lógicos, mas não remapeia caminhos absolutos persistidos no banco. Chaves devem continuar em cópia separada, conforme [Custódia das chaves](CUSTODIA_CHAVES_BACKUP.md); não inclua segredos em texto claro no inventário/pacote.

Validação atual: build e 17 testes específicos passaram, incluindo cinco de pacote/CLI e quatro de inventário. O ensaio integrado também passou em Docker/volume novos, com restauração SQL a partir do dump recuperado do pacote e fluxos HTTP/workers. Cobrem bytes recuperados em outra raiz, chave incorreta, adulteração, arquivo adicional, caminhos inseguros, preservação de destinos e limpeza após falha. Não houve geração de pacote com dados operacionais. Dump coordenado, restauração SQL pelo CLI de pacote, remapeamento de caminhos e retenção continuam pendentes; S6-10/S7-03 permanecem parciais.
