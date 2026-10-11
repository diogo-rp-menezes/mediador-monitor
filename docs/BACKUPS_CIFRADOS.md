# Cópias cifradas de backup

`backup:cifrar` cifra ou recupera um arquivo existente sem alterar a origem nem sobrescrever o destino. Serve para dumps PostgreSQL ou arquivos de evidência previamente preparados. Não monta um pacote de diretórios nem substitui a conferência de consistência e restauração do backup.

O formato `MEDIADOR-BACKUP-1` usa AES-256-GCM, salt aleatório de 32 bytes, derivação HKDF-SHA-256 e IV aleatório de 12 bytes. Cabeçalho/versionamento são autenticados. A chave mestra deve ter 32 bytes aleatórios em base64 e ficar separada da aplicação e das cópias cifradas. A perda dessa chave impede recuperar os arquivos; alterar a variável não recifra backups anteriores. Não use senha memorizável ou `CREDENTIALS_MASTER_KEY` como chave de backup.

Forneça `BACKUP_ENCRYPTION_KEY` pelo ambiente privado da ferramenta. O comando não gera, salva ou imprime a chave. Com a variável já configurada:

```powershell
npm run backup:cifrar -- cifrar --input data/backups/copia.dump --output data/backups/copia.dump.enc
npm run backup:cifrar -- decifrar --input data/backups/copia.dump.enc --output data/backups/copia-recuperada.dump
```

O processamento usa streams com memória limitada. Escreve em arquivo temporário exclusivo no diretório de destino e publica por hard link sem sobrescrita apenas após terminar e, na recuperação, autenticar o conteúdo. Chave incorreta, adulteração e truncamento impedem a criação do destino. Origem deve ser arquivo regular, sem link simbólico; mudança de tamanho/data durante a leitura aborta a operação. O diretório de destino precisa existir e aceitar hard links (como NTFS local).

Escolha uma pasta privada por permissões do sistema: no Windows, `mode 0600` não substitui ACLs. Durante a recuperação, o temporário contém bytes em claro antes da autenticação e não deve ficar em pasta compartilhada. Erros tratados removem o temporário; encerramento abrupto/queda de energia pode deixá-lo para inspeção e limpeza administrativa. A exclusão normal não promete apagamento seguro. Interrompa gravações no arquivo de origem antes de cifrá-lo.

Quatro testes passaram com recuperação byte a byte, aleatoriedade, conteúdo vazio, chave errada, adulteração de cabeçalho/conteúdo/tag, truncamento e preservação de origem/destino. Build e suíte geral de 417 testes em 86 arquivos passaram em 09/10/2026. Nenhuma chave ou cópia operacional foi criada. S6-10 permanece parcial: pacote completo banco/originais/segredos, custódia separada da chave, retenção, destino privado e restauração isolada completa ainda precisam de integração/validação.

## Ensaio PostgreSQL integrado

```powershell
npm run test:postgres-backup-cifrado
```

Em 09/10/2026 o ensaio passou com dump PostgreSQL real de banco descartável, cifragem, recuperação e `pg_restore` em outro banco temporário. Após cifrar, remove o dump em claro, o original e o banco de origem exclusivamente sintéticos; a recuperação não depende de consultá-los. Confere hash do dump/original, PDF publicado, migrações, escritórios, identidade/sequência, login, isolamento RLS e ausência de contexto residual. A credencial SMTP restaurada funciona com a chave de aplicação compatível e recusa chave incorreta. O ensaio também usa SMTP TLS local para a validação controlada descrita abaixo; não envia mensagens externas.

O dump omite proprietários e permissões por projeto; o teste reaplica permissões ao papel runtime existente somente no banco restaurado e valida que ele é NOSUPERUSER/NOBYPASSRLS/NOINHERIT sem associações. Esse procedimento não simula provisionamento de papéis em Docker vazio. As duas chaves do ensaio são aleatórias e ficam apenas na memória; sua custódia e recuperação a partir de armazenamento separado ainda não foram validadas.

O ensaio revelou a ausência de trigger de imutabilidade na auditoria de segurança. A migração `014_security_audit_immutable.sql` impede UPDATE, DELETE e TRUNCATE; as três recusas e a preservação dos eventos foram conferidas após restauração. A FK existente já restringe exclusão física de um usuário referenciado; prefira inativação preservando o histórico. Política de expurgo e mecanismos administrativos de manutenção continuam pendentes. A migração foi exercitada apenas em bancos descartáveis; não foi aplicada ao banco operacional.

Importação real em destino descartável com remapeamento também passou: 30 tabelas/178 linhas e arquivo privado de 14 tabelas/97 linhas, com relatório `data/validacao-backup-auditoria-20261009.json`. O ensaio integrado não conclui S6-10 ou S7-03: faltam pacote completo de todos os arquivos/segredos, retenção, custódia, restauração em Docker limpo e operação HTTP/workers após essa restauração.

## Recuperação em PostgreSQL Docker novo

```powershell
npm run test:postgres-recuperacao-limpa
```

Validado em 09/10/2026: cria um contêiner `mediador-clean-recovery-UUID` da imagem PostgreSQL usada no projeto, com porta aleatória restrita a loopback, armazenamento novo e credenciais aleatórias. Não monta o volume atual nem reutiliza seu papel runtime. Aplica migrações e executa o CLI real de provisionamento do papel. Em seguida repete o ensaio cifrado acima e reaplica os privilégios pelo mesmo CLI no banco restaurado, sem depender de grants copiados no dump.

Além das conferências de dados/RLS/chaves, inicia o servidor real contra o banco restaurado e verifica login HTTP, sessão, listagem privada do portal e bytes do PDF. Navegador e HTTPS da aplicação não fazem parte desse ensaio; HTTPS possui teste separado. Entregas controladas do worker de notificações usam SMTP TLS local. O driver SQLite ainda está instalado no projeto, embora o servidor use o modo PostgreSQL.

Ao terminar normalmente ou com erro tratado, encerra servidor e bancos de teste, remove os arquivos temporários e o contêiner criado com `--rm`, incluindo seu armazenamento anônimo. Não toca no serviço `mediador-postgres` nem nas credenciais operacionais. Falha abrupta do processo/host pode exigir inspeção dos recursos com rótulo `mediador.test=clean-recovery` antes da limpeza manual. O teste requer Docker disponível e a imagem PostgreSQL do projeto, além das dependências Node instaladas.

S6-10/S7-03 continuam parciais: o volume PostgreSQL novo e o acesso HTTP restaurado estão validados, mas ainda faltam custódia/recuperação de chaves a partir de cópia separada, pacote integral dos arquivos, demais workers/filas após restauração e conciliação de envios externos. Não foi realizado corte operacional.

## Worker de notificações após restauração

O mesmo ensaio passou em 09/10/2026 com avisos de publicação persistidos antes do dump nos estados pendente, enviado, incerto e enviando. Depois da restauração, o worker real entregou somente o pendente por SMTP TLS local com certificado temporário confiado pelo subprocesso. O aviso contém link de acesso e não possui anexos. Um segundo ciclo não reenviou a mensagem nem os estados históricos.

A recuperação explícita transformou o aviso antigo em transmissão em incerto; nenhuma entrega foi iniciada por essa recuperação. Uma nova entrega com conexão encerrada pelo SMTP após DATA foi marcada incerta e não foi repetida no ciclo seguinte. Recuperar por outro escritório não alterou o aviso. Esse teste demonstra as transições locais; não determina se um provedor externo entregou uma mensagem.

O ensaio com Docker novo usa o CLI real para reconstituir privilégios. O ensaio no contêiner existente concede apenas os privilégios necessários ao banco descartável. Ambos passaram, preservando credenciais, banco e SMTP operacionais. É necessário OpenSSL (PATH/Git para Windows ou OPENSSL_BIN) para o certificado temporário; nenhum certificado é instalado no Windows. Conexões SMTP, certificados e demais recursos de teste são removidos ao terminar.

A cobertura ainda não inclui workers de coleta/IA, custódia das chaves ou conciliação com um provedor externo. S6-10 e S7-03 permanecem parciais.

## Envio com anexos após restauração

Em 09/10/2026 o ensaio foi ampliado para preparar e aprovar um envio sintético antes do dump, usando os serviços reais de aplicabilidade, prévia e aprovação. Além do banco/original, cifra os arquivos do snapshot de envio: cópia do original e PDF gerado da análise. Remove esses arquivos antes da recuperação e restaura cada um em seu caminho original exclusivo do teste.

No destino restaurado, confere o JSON completo do snapshot e o SHA-256 de cada anexo recuperado. O worker real envia a mensagem por SMTP TLS local; o teste decodifica os anexos MIME recebidos e compara seus hashes aos do snapshot. O escritório alheio não processa a fila. O envio fica concluído com uma única tentativa, e um segundo processamento não o repete.

Essa ampliação passou tanto no contêiner existente com bancos descartáveis quanto no contêiner/volume novos. Os diretórios de snapshot criados exclusivamente pelo teste são conferidos contra `data/envios/UUID` antes da remoção; arquivos operacionais não são selecionados para limpeza. O exemplo de original é sintético e valida preservação/transferência dos bytes, sem prometer validação semântica do conteúdo do PDF original. O PDF da análise é gerado pelo fluxo real.

Isso não equivale a um pacote operacional integral: ainda não há empacotamento automático de todos os arquivos/segredos, remapeamento de caminhos para outra máquina, custódia das chaves, recuperação de coleta/IA ou conciliação com SMTP externo. O ensaio mantém os avisos incertos sem repetição automática; não decide a situação de mensagens que já tenham saído por um provedor real.

## Fila de IA após restauração

Em 09/10/2026 a validação foi ampliada com quatro documentos sintéticos e configuração IA cifrada: uma análise concluída, uma solicitação pendente, uma tentativa interrompida e uma solicitação órfã em execução. O provedor é um servidor HTTP de loopback que reproduz o protocolo usado pela aplicação e retorna campos sintéticos; não há chamada a um modelo externo. Os originais desse cenário também são cifrados, removidos e recuperados.

Após restauração, os resultados/histórico da tentativa concluída permanecem iguais. O worker real consome somente a solicitação pendente, faz a chamada HTTP com modelo/chave restaurados e conclui a análise. Um segundo ciclo não gera chamadas adicionais. A configuração pública não retorna a chave; uma chave mestra de aplicação incompatível impede decifrar a configuração.

A tentativa interrompida continua em análise até a recuperação explícita, e a solicitação órfã não é retomada automaticamente. A recuperação administrativa registra dois eventos auditados, encerra os estados interrompidos, remove os tokens de reserva e restaura o estado anterior do documento. O token antigo é recusado e não há nova chamada ao provedor após recuperar. Os consumidores originais são encerrados antes do dump, e nenhum processo de IA permanece em execução durante a recuperação.

Build e ensaios no contêiner existente e em Docker novo passaram. O runtime restaurado usa pool de três conexões para comportar os bloqueios da fila e do documento e suas transações. A cobertura confirma persistência/execução/recuperação do fluxo; não avalia qualidade de extração por modelo real. Coleta, pacote integral/caminhos, custódia das chaves e conciliação operacional continuam pendentes. Esta validação não conclui S6-10 ou S7-03.

## Monitoramento após restauração

Em 09/10/2026 a validação passou com filtros e agenda persistentes, histórico concluído, execução interrompida e solicitações pendentes em dois escritórios. O worker, adaptador de coleta e persistência são reais; a fronteira do scraper é substituída por funções controladas que retornam metadados sintéticos. Nenhum navegador de coleta é aberto e não há consulta ao MTE ou download remoto nesse cenário.

Antes do dump, uma coleta conclui e persiste metadados/evidência. Após restauração, o teste confere as linhas completas de filtros/agendas e execuções, incluindo evidências. A execução interrompida bloqueia novas coletas do mesmo escritório, sem bloquear o outro. A agenda não cria solicitação duplicada. O runtime não lê a execução do escritório alheio.

A recuperação exige declaração de consumidor encerrado e justificativa, recusa escritório incorreto, registra auditoria e invalida o token anterior. Depois, as pendências manual/agendada são processadas e persistidas, com fechamento de cada sessão controlada. Ciclos adicionais não repetem trabalhos concluídos. Quatro registros públicos sintéticos e o evento de recuperação são conferidos no banco restaurado.

Os ensaios no contêiner existente e em Docker novo passaram. Ainda não foi feita coleta MTE após restauração nem validado todo o ciclo de download remoto nesse cenário. Custódia/recuperação de chaves a partir de cópia separada, pacote integral, adaptação de caminhos entre máquinas e conciliação de entregas permanecem pendentes; S6-10/S7-03 continuam parciais.

## Recuperação das chaves por cópia separada

O mecanismo de pacote com inventário explícito está documentado em [Pacote de backup](PACOTE_BACKUP.md). Ele ainda não representa o inventário integral automático da aplicação.

Em 09/10/2026 foi adicionada uma cópia cifrada das chaves da aplicação e do backup, protegida por uma terceira chave de recuperação. O ensaio elimina as duas primeiras chaves da memória e as recupera dessa cópia antes de restaurar o banco e os arquivos. A validação passou em Docker novo; a cópia fica em diretório temporário separado dos arquivos cifrados do cenário. A suíte geral passou com 421 testes em 87 arquivos, e o build passou.

Os comandos e os cuidados com o arquivo recuperado em texto claro estão em [Custódia das chaves de backup](CUSTODIA_CHAVES_BACKUP.md). Essa implementação atualiza a pendência de recuperação das chaves descrita nas etapas anteriores; a guarda física da terceira chave, o pacote integral, a adaptação de caminhos e a conciliação operacional continuam pendentes. S6-10/S7-03 permanecem parciais.
