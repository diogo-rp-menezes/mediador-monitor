# Glossário & Ubiquitous Language — 3

> Documento gerado automaticamente pelo pipeline determinístico de análise de código
> (server/glossary-pipeline.ts). Termos extraídos via AST + schema real (server/db.ts) + rotas
> reais (server/express-app.ts); definições geradas por IA a partir de uso real no código —
> revise as linhas marcadas com ⚠️.

## 1. Termos de Domínio
| Termo | Definição | Contexto/Bounded Context | Sinônimos observados |
| :--- | :--- | :--- | :--- |
| arquivoPermitido | Regra que verifica se um arquivo é aceito para inclusão no relatório ou histórico, validando seu tipo ou nome conforme os critérios definidos pela empresa. | dist-historico | arquivo aceito, validação de arquivo, arquivo elegível |
| auditarCadastro | Ação de revisar e verificar as informações de um cadastro para garantir que estejam corretas, completas e em conformidade com as regras da empresa. | dist-historico | auditoria de cadastro, revisão de cadastro, verificação cadastral |
| auditarSeguranca | Verificação e registro das ações relacionadas à segurança do sistema, como tentativas de acesso e autenticações, permitindo rastrear quem fez o quê e quando. | dist-historico | auditoria de segurança, registro de segurança, rastreamento de acessos |
| bootstrapAdministrador | Rotina de inicialização que cria ou prepara automaticamente a conta de administrador do sistema, garantindo que exista um usuário com permissões máximas disponível desde a primeira execução. | dist-historico | inicialização do administrador, criação inicial do administrador, provisionamento do administrador |
| cnpjValido | Verificação que confirma se o número de CNPJ informado é válido, garantindo que apenas empresas com identificação fiscal correta sejam cadastradas ou utilizadas nos processos. | dist-historico | validação de CNPJ, CNPJ válido, verificação de CNPJ |
| comEscritorArquivosPostgres | Rotina responsável por gravar os arquivos de histórico no banco de dados PostgreSQL, garantindo que as informações sejam registradas de forma segura e controlada. | dist-historico | escritor de arquivos Postgres, gravação de histórico no PostgreSQL, persistência de arquivos no banco |
| contextoDocumentoCliente | Informação que identifica o documento do cliente (como CPF ou CNPJ) utilizado como referência para localizar ou contextualizar o histórico de cadastro da pessoa no sistema. | dist-historico | documento do cliente, identificação do cliente, CPF/CNPJ do cliente |
| criarAutenticacao | Processo responsável por registrar e validar as credenciais de acesso de um usuário ao sistema, garantindo que apenas pessoas autorizadas possam entrar. | dist-historico | criação de autenticação, registro de credenciais, autenticação de usuário, login |
| criarPoolPostgres | Rotina responsável por estabelecer e disponibilizar o acesso ao banco de dados PostgreSQL, permitindo que o sistema consulte e registre informações de forma organizada e reutilizável. | dist-historico | conexão com banco de dados, pool de conexões Postgres, acesso ao banco PostgreSQL |
| criarPoolPostgresRuntime | Rotina responsável por estabelecer e disponibilizar as conexões com o banco de dados PostgreSQL usado pelo sistema, permitindo que as demais funcionalidades consultem e registrem informações de forma compartilhada e eficiente. | dist-historico | inicializar conexão com banco de dados, configurar pool de conexões PostgreSQL, preparar acesso ao banco de dados |
| decidirDocumentoCliente | Regra que determina qual documento de identificação (como CPF ou CNPJ) deve ser utilizado para o cliente, com base nas informações disponíveis no cadastro. | dist-historico | escolher documento do cliente, definir documento do cliente, selecionar identificação do cliente |
| definirCredencial | Ação de registrar ou atualizar a credencial de acesso de um usuário no sistema, como senha. Utilizada em processos internos, como a recuperação de conta, após a validação da identidade do solicitante. | dist-historico | definir senha, cadastrar credencial, atualizar credencial de acesso |
| definirVinculo | Ação de associar manualmente dois registros do histórico, criando um vínculo que prevalece sobre qualquer associação feita automaticamente pelo sistema. | dist-historico | associar vínculo, vincular manualmente, definir associação |
| descobrirDocumentosClientes | Processo que identifica e localiza os documentos (como CPF ou CNPJ) associados aos clientes, criando candidatos quando há coincidência na consulta e confirmando automaticamente apenas quando há evidências suficientes. | dist-historico | identificar documentos de clientes, localizar documentos dos clientes, detecção de documentos de clientes |
| detalheCliente | Ação de consultar e exibir as informações detalhadas de um cliente cadastrado, permitindo visualizar seus dados completos. | dist-historico | detalhes do cliente, visualizar cliente, consulta de cliente, ficha do cliente |
| detectarFormato | Identificação automática do tipo ou formato de um documento recebido, permitindo que o sistema saiba como tratá-lo corretamente. | dist-historico | identificar formato, reconhecer tipo de documento, classificação de formato |
| ehAditivoCct | Indica se um vínculo ou registro corresponde a um aditivo de Convenção Coletiva de Trabalho (CCT), ou seja, um complemento que altera ou amplia uma convenção existente. | dist-historico | aditivo de convenção coletiva, aditivo CCT, é aditivo de CCT |
| ehCct | Verifica se o vínculo está associado a uma Convenção Coletiva de Trabalho (CCT), ou seja, se o empregado está vinculado a um acordo coletivo de trabalho. | dist-historico | é CCT, possui convenção coletiva, vinculado a CCT |
| escaparHtml | Rotina de apoio que protege textos exibidos em relatórios, convertendo caracteres especiais para que sejam mostrados como texto comum e não interpretados como comandos de página, evitando quebra de layout e riscos de segurança. | dist-historico | sanitizar HTML, escapar caracteres HTML, proteger texto para exibição |
| excluirCadastro | Ação de remover permanentemente um registro cadastral do sistema, eliminando as informações previamente registradas de um item, pessoa ou entidade. | dist-historico | remover cadastro, apagar registro, deletar cadastro, eliminar registro |
| exigirCadastroEscritorio | Regra de negócio que obriga o escritório a estar devidamente cadastrado no sistema antes de prosseguir com determinada operação. Funciona como uma validação prévia que bloqueia o andamento caso o cadastro do escritório não exista ou esteja incompleto. | dist-historico | exigência de cadastro do escritório, validação de escritório cadastrado, obrigatoriedade de cadastro de escritório |
| extrairCabecalho | Extração automática das informações de identificação do cabeçalho de um documento, sem uso de inteligência artificial. Serve também para confirmar que o arquivo obtido corresponde ao registro esperado. | dist-historico | extração de cabeçalho, leitura do cabeçalho do documento, identificação do documento |
| gerarPdfRelatorio | Ação de gerar um documento em formato PDF contendo o relatório solicitado, permitindo sua visualização, impressão ou compartilhamento. | dist-historico | gerar relatório em PDF, exportar relatório para PDF, emitir relatório PDF |
| hashBytes | Rotina que gera um código de identificação único (impressão digital) a partir do conteúdo de um arquivo ou relatório, permitindo verificar sua integridade e detectar duplicidades ou alterações. | dist-historico | gerar hash, calcular impressão digital, checksum de conteúdo, gerar código de verificação |
| hashToken | Procedimento de segurança que transforma um código de acesso (token) em uma versão criptografada irreversível, impedindo que o valor original seja exposto ou reutilizado indevidamente. | dist-historico | criptografar token, gerar hash do token, proteger token de acesso |
| indexarArquivosExistentes | Processo de migração que registra no sistema os documentos que já foram baixados anteriormente, vinculando-os aos respectivos registros sem sobrescrever vínculos que foram revisados manualmente. | dist-historico | migração de documentos existentes, indexação de arquivos baixados, vinculação retroativa de documentos |
| indexarMetaDocumento | Processo de registrar as informações descritivas (metadados) de um documento no histórico do sistema, permitindo que ele seja localizado e consultado posteriormente. | dist-historico | indexação de metadados do documento, registro de metadados no histórico, catalogação de documento |
| indexarVinculo | Processo de registrar um vínculo (associação entre pessoas, empresas ou registros) em um índice histórico, permitindo sua consulta e rastreabilidade posterior. | dist-historico | registrar vínculo, indexar associação, catalogar vínculo |
| invalidarConsolidacao | Ação de desfazer ou anular uma consolidação previamente realizada sobre vínculos históricos, fazendo com que os registros consolidados voltem ao estado anterior ou sejam marcados como não válidos. | dist-historico | desfazer consolidação, anular consolidação, reverter consolidação de vínculos |
| lerDocumento | Ação de consultar e obter as informações de um documento registrado no sistema, permitindo visualizar seu conteúdo e dados associados. | dist-historico | consultar documento, obter documento, visualizar documento, recuperar documento |
| lerDocumentoBytes | Leitura do conteúdo exato de um documento já verificado, garantindo que o que é processado corresponde fielmente ao que foi conferido, sem risco de o arquivo ter sido alterado entre a verificação e o uso. | dist-historico | ler bytes do documento, carregar conteúdo do documento, obter documento verificado |
| listarClientes | Funcionalidade que apresenta a relação de clientes cadastrados no sistema, permitindo sua consulta e visualização. | dist-historico | consultar clientes, exibir clientes, relacionar clientes, listagem de clientes |
| listarContatos | Consulta que apresenta a relação de contatos cadastrados, permitindo ao usuário visualizar as pessoas ou empresas com as quais a organização se relaciona. | dist-historico | consultar contatos, exibir contatos, listagem de contatos |
| loadWatchConfig | Carregamento das configurações que definem o que deve ser monitorado ou acompanhado pelo sistema, como parâmetros de observação de dados ou arquivos. | dist-historico | carregar configuração de monitoramento, leitura de configuração de observação, carga de parâmetros de watch |
| login | Ato de um usuário se identificar no sistema informando suas credenciais para obter acesso às funcionalidades. É a porta de entrada que garante que apenas pessoas autorizadas utilizem a aplicação. | dist-historico | autenticação, acesso, entrar no sistema, sign in |
| logout | Ação de encerrar a sessão de um usuário no sistema, finalizando seu acesso autenticado e exigindo nova autenticação para uso posterior. | dist-historico | sair, encerrar sessão, desconectar, logoff |
| migrarAutenticacao | Processo de atualização ou transferência do mecanismo de autenticação dos usuários para uma nova versão ou estrutura, garantindo que o acesso ao sistema continue funcionando de forma segura. | dist-historico | migração de autenticação, atualização de autenticação, migrar autenticação |
| migrarCadastros | Processo de atualização dos cadastros do sistema para uma nova versão, garantindo que todos os registros, análises, configurações e vínculos anteriores sejam preservados sem perda de dados. | dist-historico | migração de cadastros, atualização de registros, conversão de cadastros |
| normalizarCnpj | Padronização do número de CNPJ de uma empresa para um formato único e consistente, removendo variações de pontuação ou preenchimento, garantindo que o mesmo CNPJ seja reconhecido de forma idêntica em todo o sistema. | dist-historico | padronizar CNPJ, formatar CNPJ, limpar CNPJ |
| normalizarTexto | Padronização de textos de cadastro (como nomes e descrições) para um formato uniforme, removendo variações como acentos, maiúsculas/minúsculas e espaços extras, facilitando buscas e comparações. | dist-historico | padronização de texto, uniformização de texto, limpeza de texto |
| possuiAdministrador | Verificação que indica se existe pelo menos um usuário com perfil de administrador cadastrado no sistema ou na organização. | dist-historico | tem administrador, existe administrador, há administrador cadastrado |
| postgresConfigFromEnv | Configuração de conexão com o banco de dados central PostgreSQL, obtida a partir de variáveis de ambiente. Define como o sistema se conecta ao armazenamento de dados operacional. | dist-historico | configuração do PostgreSQL, conexão com banco central, parâmetros de conexão PostgreSQL |
| postgresRuntimeConfigFromEnv | Configuração de acesso ao banco de dados da aplicação, obtida a partir de variáveis do ambiente, garantindo que o sistema opere com uma conta de permissões mínimas e nunca utilize a conta de administrador ou de migração. | dist-historico | configuração de conexão com o banco de dados, credenciais de acesso ao banco, configuração do pool de conexões |
| recuperar | Ação pela qual um usuário restabelece o acesso à sua conta, tipicamente por meio da recuperação ou redefinição de senha quando a credencial original foi esquecida ou perdida. | dist-historico | recuperar senha, recuperação de acesso, redefinir senha, restaurar acesso |
| referenciasExplicitas | Verificação de que um aditivo menciona formalmente o registro da CCT original, condição necessária para que a associação entre os documentos seja feita automaticamente. | dist-historico | referência formal à CCT, vínculo explícito ao registro original |
| registrarSindicatoDocumento | Ato de cadastrar ou anexar um documento vinculado a um sindicato no sistema, mantendo o registro formal dessa documentação para consulta e controle. | dist-historico | cadastrar documento do sindicato, anexar documento sindical, registro de documento de sindicato |
| rejeitarVinculo | Ação de recusar uma solicitação de vínculo entre duas partes (por exemplo, entre um usuário e uma organização), impedindo que a associação seja efetivada. | dist-historico | recusar vínculo, negar associação, rejeitar solicitação de vínculo |
| renderizarCctMarkdown | Geração do documento formal da Convenção Coletiva de Trabalho (CCT) em formato de texto estruturado, contendo apenas o layout contratual acordado, enquanto as evidências e justificativas ficam registradas separadamente no sistema. | dist-historico | exportação da CCT, geração do documento da convenção coletiva, emissão do layout contratual da CCT |
| renderizarRelatorioHtml | Geração da versão visual (em formato de página web) do relatório de histórico, a partir de informações já registradas, sem consultar novamente a inteligência artificial. | dist-historico | gerar relatório HTML, montar relatório do histórico, formatar relatório para visualização |
| resolverReferenciasPendentes | Processo que identifica e resolve vínculos que ficaram pendentes por falta de referência, conectando-os aos registros correspondentes assim que as informações necessárias se tornam disponíveis. | dist-historico | resolver pendências de referência, regularizar vínculos pendentes, tratar referências não resolvidas |
| salvarCliente | Ação de gravar ou atualizar as informações de um cliente no sistema, garantindo que os dados cadastrais fiquem registrados e disponíveis para uso futuro. | dist-historico | gravar cliente, cadastrar cliente, persistir cliente, registrar cliente |
| salvarContato | Ação de registrar ou atualizar as informações de um contato (como telefone, e-mail ou pessoa de referência) no cadastro do sistema. | dist-historico | gravar contato, cadastrar contato, registrar contato, atualizar contato |
| setup | Etapa inicial de preparação e configuração de uma tela ou funcionalidade do sistema, na qual são definidos os dados e comportamentos que estarão disponíveis para o usuário antes da exibição. | web | configuração inicial, inicialização, preparação |
| solicitarRecuperacao | Ação pela qual um usuário solicita a recuperação de acesso à sua conta, geralmente ao esquecer a senha, iniciando o processo de redefinição de credenciais. | dist-historico | recuperar senha, solicitar recuperação de senha, esqueci minha senha, redefinição de senha |
| tratar | Ação de processar e dar encaminhamento a uma situação, como uma requisição de autenticação ou um erro, garantindo que ela receba a resposta adequada. | dist-historico | processar, manipular, resolver, lidar com |
| validarExtracaoCct | Verificação da qualidade e completude dos dados extraídos de uma Convenção Coletiva de Trabalho (CCT), garantindo que as informações identificadas no documento sejam fielmente registradas sem omitir conteúdos presentes. | dist-historico | validação de extração de CCT, conferência de dados extraídos de convenção coletiva, checagem de extração de CCT |
| validarPapelRuntimePostgres | Verificação de segurança que garante que as contas de acesso ao banco de dados usadas em operação sejam independentes e não possam assumir permissões de outras contas, evitando escalonamento indevido de privilégios. | dist-historico | validação de papel de execução, verificação de conta de runtime do banco, checagem de isolamento de permissões |
| withPostgresGlobalTransaction | Operação especial da plataforma que permite consultar ou atualizar informações de múltiplos clientes (tenants) ao mesmo tempo, usada exclusivamente em tarefas de autenticação e administração central do sistema. | dist-historico | transação global multi-tenant, operação de plataforma entre clientes, transação administrativa global |
| withPostgresOfficeTransaction | Processo que executa operações no banco de dados garantindo que o escritório responsável seja identificado e registrado apenas durante aquela operação, sendo removido automaticamente ao final. | dist-historico | transação com escopo de escritório, operação vinculada ao escritório, transação PostgreSQL com contexto de escritório |
| withPostgresTransaction | Rotina que garante que um conjunto de operações no banco de dados seja executado de forma completa e segura: ou tudo é confirmado, ou nada é aplicado, evitando registros inconsistentes. | dist-historico | transação de banco de dados, execução transacional, unidade de trabalho PostgreSQL |

## 2. Acrônimos & Siglas
| Sigla | Significado | Definição |
| :--- | :--- | :--- |
| — | — | Nenhum acrônimo/sigla identificado deterministicamente nos termos extraídos. |

## 3. Entidades de Domínio (Core Entities)
| Entidade | Descrição | Atributos-chave | Relacionamentos |
| :--- | :--- | :--- | :--- |
| — | — | Nenhuma entidade classificada nos termos extraídos. |

## 4. Estados & Ciclos de Vida
| Entidade | Estados possíveis | Observação |
| :--- | :--- | :--- |
| — | — | Estados/ciclos de vida NÃO são extraídos deterministicamente pelo pipeline — preencher manualmente ou consultar o artefato state-machines.md. |

## 5. Papéis & Atores
| Papel | Descrição | Permissões típicas |
| :--- | :--- | :--- |
| — | — | Nenhum papel/ator classificado nos termos extraídos. |

## 6. Regras de Nomenclatura
* Nomes de variáveis, funções e tabelas em inglês no código; comentários e documentação em português.
* Evitar termos genéricos como "dados", "item" ou "info" — sempre nomear a entidade específica do domínio.
* Quando um termo possuir sinônimos (ver Seção 1), usar sempre a forma canônica (coluna "Termo") em código e documentação.

## 7. Termos Depreciados
| Termo Antigo | Substituído por | Motivo | Data da mudança |
| :--- | :--- | :--- | :--- |
| arquivo aceito, validação de arquivo, arquivo elegível | arquivoPermitido | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| auditoria de cadastro, revisão de cadastro, verificação cadastral | auditarCadastro | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| auditoria de segurança, registro de segurança, rastreamento de acessos | auditarSeguranca | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| inicialização do administrador, criação inicial do administrador, provisionamento do administrador | bootstrapAdministrador | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validação de CNPJ, CNPJ válido, verificação de CNPJ | cnpjValido | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| escritor de arquivos Postgres, gravação de histórico no PostgreSQL, persistência de arquivos no banco | comEscritorArquivosPostgres | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| documento do cliente, identificação do cliente, CPF/CNPJ do cliente | contextoDocumentoCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| criação de autenticação, registro de credenciais, autenticação de usuário, login | criarAutenticacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| conexão com banco de dados, pool de conexões Postgres, acesso ao banco PostgreSQL | criarPoolPostgres | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| inicializar conexão com banco de dados, configurar pool de conexões PostgreSQL, preparar acesso ao banco de dados | criarPoolPostgresRuntime | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| escolher documento do cliente, definir documento do cliente, selecionar identificação do cliente | decidirDocumentoCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| definir senha, cadastrar credencial, atualizar credencial de acesso | definirCredencial | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| associar vínculo, vincular manualmente, definir associação | definirVinculo | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| identificar documentos de clientes, localizar documentos dos clientes, detecção de documentos de clientes | descobrirDocumentosClientes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| detalhes do cliente, visualizar cliente, consulta de cliente, ficha do cliente | detalheCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| identificar formato, reconhecer tipo de documento, classificação de formato | detectarFormato | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| aditivo de convenção coletiva, aditivo CCT, é aditivo de CCT | ehAditivoCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| é CCT, possui convenção coletiva, vinculado a CCT | ehCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| sanitizar HTML, escapar caracteres HTML, proteger texto para exibição | escaparHtml | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| remover cadastro, apagar registro, deletar cadastro, eliminar registro | excluirCadastro | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| exigência de cadastro do escritório, validação de escritório cadastrado, obrigatoriedade de cadastro de escritório | exigirCadastroEscritorio | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| extração de cabeçalho, leitura do cabeçalho do documento, identificação do documento | extrairCabecalho | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerar relatório em PDF, exportar relatório para PDF, emitir relatório PDF | gerarPdfRelatorio | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerar hash, calcular impressão digital, checksum de conteúdo, gerar código de verificação | hashBytes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| criptografar token, gerar hash do token, proteger token de acesso | hashToken | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| migração de documentos existentes, indexação de arquivos baixados, vinculação retroativa de documentos | indexarArquivosExistentes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| indexação de metadados do documento, registro de metadados no histórico, catalogação de documento | indexarMetaDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| registrar vínculo, indexar associação, catalogar vínculo | indexarVinculo | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| desfazer consolidação, anular consolidação, reverter consolidação de vínculos | invalidarConsolidacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consultar documento, obter documento, visualizar documento, recuperar documento | lerDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| ler bytes do documento, carregar conteúdo do documento, obter documento verificado | lerDocumentoBytes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consultar clientes, exibir clientes, relacionar clientes, listagem de clientes | listarClientes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consultar contatos, exibir contatos, listagem de contatos | listarContatos | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| carregar configuração de monitoramento, leitura de configuração de observação, carga de parâmetros de watch | loadWatchConfig | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| autenticação, acesso, entrar no sistema, sign in | login | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| sair, encerrar sessão, desconectar, logoff | logout | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| migração de autenticação, atualização de autenticação, migrar autenticação | migrarAutenticacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| migração de cadastros, atualização de registros, conversão de cadastros | migrarCadastros | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| padronizar CNPJ, formatar CNPJ, limpar CNPJ | normalizarCnpj | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| padronização de texto, uniformização de texto, limpeza de texto | normalizarTexto | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| tem administrador, existe administrador, há administrador cadastrado | possuiAdministrador | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| configuração do PostgreSQL, conexão com banco central, parâmetros de conexão PostgreSQL | postgresConfigFromEnv | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| configuração de conexão com o banco de dados, credenciais de acesso ao banco, configuração do pool de conexões | postgresRuntimeConfigFromEnv | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| recuperar senha, recuperação de acesso, redefinir senha, restaurar acesso | recuperar | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| referência formal à CCT, vínculo explícito ao registro original | referenciasExplicitas | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cadastrar documento do sindicato, anexar documento sindical, registro de documento de sindicato | registrarSindicatoDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| recusar vínculo, negar associação, rejeitar solicitação de vínculo | rejeitarVinculo | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| exportação da CCT, geração do documento da convenção coletiva, emissão do layout contratual da CCT | renderizarCctMarkdown | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerar relatório HTML, montar relatório do histórico, formatar relatório para visualização | renderizarRelatorioHtml | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| resolver pendências de referência, regularizar vínculos pendentes, tratar referências não resolvidas | resolverReferenciasPendentes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gravar cliente, cadastrar cliente, persistir cliente, registrar cliente | salvarCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gravar contato, cadastrar contato, registrar contato, atualizar contato | salvarContato | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| configuração inicial, inicialização, preparação | setup | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| recuperar senha, solicitar recuperação de senha, esqueci minha senha, redefinição de senha | solicitarRecuperacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| processar, manipular, resolver, lidar com | tratar | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validação de extração de CCT, conferência de dados extraídos de convenção coletiva, checagem de extração de CCT | validarExtracaoCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validação de papel de execução, verificação de conta de runtime do banco, checagem de isolamento de permissões | validarPapelRuntimePostgres | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| transação global multi-tenant, operação de plataforma entre clientes, transação administrativa global | withPostgresGlobalTransaction | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| transação com escopo de escritório, operação vinculada ao escritório, transação PostgreSQL com contexto de escritório | withPostgresOfficeTransaction | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| transação de banco de dados, execução transacional, unidade de trabalho PostgreSQL | withPostgresTransaction | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |

## 8. Referências Externas
* [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] Listar aqui glossários de indústria, normas regulatórias ou fontes externas que definem os termos usados neste projeto.
