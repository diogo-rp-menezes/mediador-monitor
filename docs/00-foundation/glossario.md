# Glossário & Ubiquitous Language — 3

> Documento gerado automaticamente pelo pipeline determinístico de análise de código
> (server/glossary-pipeline.ts). Termos extraídos via AST + schema real (server/db.ts) + rotas
> reais (server/express-app.ts); definições geradas por IA a partir de uso real no código —
> revise as linhas marcadas com ⚠️.

## 1. Termos de Domínio
| Termo | Definição | Contexto/Bounded Context | Sinônimos observados |
| :--- | :--- | :--- | :--- |
| arquivoPermitido | Verifica se um arquivo atende aos critérios de permissão para ser processado no sistema. | dist-historico | validação de arquivo, arquivo autorizado, verificação de permissão |
| auditarCadastro | Processo de registrar e verificar alterações em dados cadastrais para garantir rastreabilidade e conformidade. | dist-historico | registrarAuditoriaCadastro, validarIntegridadeCadastro, rastrearMudancaCadastro |
| auditarSeguranca | Processo de verificação e registro de eventos relacionados à segurança do sistema, garantindo rastreabilidade de acessos e tentativas de autenticação. | dist-historico | auditoria de segurança, monitoramento de acesso, registro de segurança, verificação de autenticação |
| bootstrapAdministrador | Processo de inicialização das permissões e contexto de acesso para um usuário com perfil de administrador no sistema. | dist-historico | inicializarAdministrador, configurarAcessoAdmin, carregarPermissoesAdmin |
| cnpjValido | Função que verifica se um número de CNPJ possui dígitos verificadores corretos e estrutura válida conforme regras da Receita Federal. | dist-historico | validarCNPJ, verificarCNPJ, cnpjEhValido |
| comEscritorArquivosPostgres | Capacidade de gravar arquivos de backup do banco de dados PostgreSQL em armazenamento persistente. | dist-historico | Gravador de Backup Postgres, Exportação de Arquivos Postgres, Escrita de Dump Postgres |
| contextoDocumentoCliente | Função responsável por reunir e estruturar as informações necessárias para compor o cenário ou ambiente de um documento específico do cliente dentro do histórico de distribuição. | dist-historico | contexto de documento do cliente, dados de contexto do cliente, ambiente do documento do cliente |
| criarAutenticacao | Processo responsável por gerar as credenciais ou tokens necessários para validar a identidade de um usuário no sistema. | dist-historico | gerarAutenticacao, iniciarSessao, criarTokenAcesso, estabelecerAutenticacao |
| criarPoolPostgres | Função responsável por inicializar e configurar o pool de conexões com o banco de dados PostgreSQL utilizado pelo módulo de histórico distribuído. | dist-historico | inicializarPoolPostgres, configurarPoolConexao, criarConexaoBanco |
| criarPoolPostgresRuntime | Função responsável por inicializar e configurar o conjunto de conexões (pool) com o banco de dados PostgreSQL durante a execução da aplicação. | dist-historico | inicializarPoolPostgres, configurarPoolConexao, criarPoolBancoDados |
| decidirDocumentoCliente | Define o tipo de documento aplicável ao cliente com base em suas características cadastrais. | dist-historico | determinarDocumentoCliente, definirTipoDocumentoCliente, selecionarDocumentoCliente |
| definirCredencial | Processo interno de estabelecimento ou atualização das credenciais de acesso do usuário, executado após validação de token no fluxo de recuperação. | dist-historico | estabelecerCredencial, configurarCredencial, atualizarCredencial, definirAcesso |
| definirVinculo | Estabelece manualmente a associação entre registros históricos, garantindo que essa vinculação prevaleça sobre qualquer correspondência automática. | dist-historico | associarManualmente, criarVinculoManual, definirAssociacao, vincularRegistros |
| descobrirDocumentosClientes | Processo que identifica potenciais documentos de clientes através de correspondência de consulta, gerando candidatos que necessitam validação com evidências originais. | dist-historico | localizarDocumentosClientes, identificarDocumentosClientes, buscarDocumentosClientes, encontrarDocumentosClientes |
| detalheCliente | Processo de exibição ou recuperação dos detalhes de um cliente para consulta ou edição. | dist-historico | consultarCliente, visualizarCliente, obterDetalhesCliente, fichaCliente |
| detectarFormato | Identifica automaticamente o padrão ou estrutura de um documento histórico para viabilizar seu processamento correto. | dist-historico | identificarLayout, reconhecerEstrutura, classificarFormatoDocumento |
| ehAditivoCct | Verifica se um vínculo empregatício representa um termo aditivo à Convenção Coletiva de Trabalho (CCT). | dist-historico | isAditivoCct, verificaAditivoConvençãoColetiva, ehTermoAditivoCct |
| ehCct | Verifica se um vínculo empregatício está enquadrado sob uma Convenção Coletiva de Trabalho (CCT). | dist-historico | isCct, possuiConvençãoColetiva, enquadradoEmCCT |
| escaparHtml | Função que converte caracteres especiais em entidades HTML seguras para exibição em relatórios, evitando execução de scripts ou quebra de layout. | dist-historico | Sanitizar HTML, Codificar Entidades HTML, Tratamento de Caracteres Especiais |
| excluirCadastro | Processo de remoção definitiva de um registro de cadastro do histórico do sistema. | dist-historico | removerCadastro, apagarRegistro, deletarCadastro, excluirRegistro |
| exigirCadastroEscritorio | Regra de negócio que condiciona a execução de determinadas operações ao prévio cadastro do escritório no sistema. | dist-historico | exigir registro de escritório, validar cadastro de escritório, obrigar cadastro de escritório |
| extrairCabecalho | Função responsável por obter o cabeçalho padronizado de um documento para identificar e confirmar se o arquivo corresponde ao registro esperado. | dist-historico | Obter cabeçalho do documento, Ler cabeçalho de validação, Extrair identificador do registro |
| gerarPdfRelatorio | Gera um relatório em formato PDF contendo o histórico de distribuição para fins de auditoria e análise. | dist-historico | emitirRelatorioPdf, criarRelatorioPdf, exportarRelatorioPdf |
| hashBytes | Processo que gera um identificador único e irreversível a partir de um conjunto de bytes, utilizado para garantir a integridade e a rastreabilidade de documentos ou registros. | dist-historico | calcularHash, gerarDigest, criarIdentificadorÚnico |
| hashToken | Representação criptográfica segura de um token de autenticação, armazenada para validação de identidade sem expor o valor original. | dist-historico | Token Hash, Hashed Token, Credencial Hash, Token Criptografado |
| indexarArquivosExistentes | Processo de migração de documentos já armazenados no sistema, preservando as associações revisadas manualmente pelos usuários. | dist-historico | migrar documentos existentes, importar arquivos baixados, indexar documentos legados |
| indexarMetaDocumento | Processo de indexar os metadados de um documento para facilitar sua busca e recuperação. | dist-historico | indexar metadados do documento, registrar metadados do documento, catalogar metadados do documento |
| indexarVinculo | Processo de registrar e organizar um vínculo ou relacionamento para que possa ser consultado e recuperado eficientemente no histórico de distribuição. | dist-historico | registrar vínculo, catalogar conexão, indexar relacionamento, arquivar vínculo |
| invalidarConsolidacao | Tornar inválida uma consolidação anterior de vínculos ou cálculos, exigindo que o período seja reprocessado. | dist-historico | Anular Consolidação, Desfazer Consolidação, Reabrir Período para Reprocessamento |
| lerDocumento | Função responsável por recuperar e interpretar o conteúdo de um documento armazenado, tornando seus dados disponíveis para o processo de histórico. | dist-historico | carregarDocumento, obterDocumento, recuperarDocumento |
| lerDocumentoBytes | Lê e interpreta o conteúdo exato de um documento já verificado por hash, garantindo que os bytes não tenham sido alterados desde a validação. | dist-historico | lerConteudoValidado, processarBytesVerificados, obterDocumentoIntegridade |
| listarClientes | Recupera a relação de clientes cadastrados para consulta ou exibição. | dist-historico | listar clientes, consultar clientes, obter lista de clientes, exibir clientes |
| listarContatos | Processo que recupera e apresenta a lista de contatos cadastrados. | dist-historico | listar contatos, exibir contatos, consultar contatos |
| loadWatchConfig | Processo responsável por carregar as configurações de monitoramento de arquivos ou diretórios, definindo quais caminhos devem ser observados e quais eventos acionam o processamento histórico. | dist-historico | carregarConfigMonitoramento, inicializarWatchConfig, obterConfiguracaoObservacao |
| login | Processo pelo qual um usuário fornece credenciais para obter acesso autorizado ao sistema. | dist-historico | autenticação, acesso, sign in, logon |
| logout | Encerramento da sessão do usuário no sistema, invalidando suas credenciais de acesso temporárias. | dist-historico | deslogar, sair, encerrar sessão, sign out |
| migrarAutenticacao | Processo de transferência de credenciais e configurações de acesso de um sistema legado para o novo ambiente. | dist-historico | Migrar Login, Transferir Acesso, Migração de Credenciais |
| migrarCadastros | Processo de migração de dados cadastrais que mantém íntegros todos os registros históricos, análises, configurações e relacionamentos existentes. | dist-historico | migrarRegistros, migraçãoDeCadastros, transferirCadastros, atualizarBaseCadastros |
| normalizarCnpj | Processo de padronização do número de CNPJ para um formato único e consistente, removendo máscaras e caracteres não numéricos. | dist-historico | padronizarCnpj, formatarCnpj, limparCnpj |
| normalizarTexto | Função que padroniza o formato de textos removendo acentos, diferenças de maiúsculas/minúsculas e espaços extras para garantir consistência em buscas e comparações. | dist-historico | padronizarTexto, limparTexto, formatarTexto, sanitizarTexto |
| possuiAdministrador | Verifica se uma entidade ou contexto possui um administrador designado. | dist-historico | temAdministrador, existeAdministrador, administradorPresente |
| postgresConfigFromEnv | Fábrica que cria configurações de conexão com o banco PostgreSQL a partir de variáveis de ambiente. | dist-historico | Gerador de configuração PostgreSQL, Construtor de conexão por ambiente, Factory de configuração de banco |
| postgresRuntimeConfigFromEnv | Recupera as configurações de conexão do banco de dados a partir de variáveis de ambiente, aplicando o princípio de menor privilégio para garantir que a aplicação use uma conta dedicada e restrita. | dist-historico | configuração de banco por ambiente, configuração segura de conexão, runtime config do postgres |
| recuperar | Processo de restaurar o acesso ou obter novamente informações de autenticação, como credenciais ou tokens, permitindo ao usuário voltar a utilizar o sistema. | dist-historico | restaurar, reaver, obter novamente, recuperar acesso |
| referenciasExplicitas | Regra que determina a associação automática entre aditivo e CCT original apenas quando há referência formal explícita no documento. | dist-historico | referência formal, vínculo explícito, associação condicionada |
| registrarSindicatoDocumento | Processo de cadastrar ou gravar um documento relacionado a um sindicato no sistema. | dist-historico | cadastrar documento sindical, registrar documento do sindicato, incluir documento sindical |
| rejeitarVinculo | Ação de recusar a criação ou confirmação de um vínculo entre partes, impedindo que a associação seja estabelecida. | dist-historico | recusarVinculo, negarAssociacao, cancelarSolicitacaoVinculo |
| renderizarCctMarkdown | Gera a representação visual do layout contratado do CCT para exportação, mantendo as evidências no JSON e no painel. | dist-historico | exportarLayoutCCT, gerarMarkdownCCT, renderizarContratoCCT |
| renderizarRelatorioHtml | Gera a visualização em HTML do relatório histórico a partir dos dados já armazenados, sem acionar inteligência artificial. | dist-historico | gerarRelatorioHtml, formatarRelatorioHistorico, exportarRelatorioHtml |
| resolverReferenciasPendentes | Processo que finaliza a vinculação de registros históricos cujas referências estavam aguardando resolução, garantindo a integridade dos vínculos no histórico de distribuição. | dist-historico | resolver referências pendentes, processar referências pendentes, finalizar vinculações pendentes |
| salvarCliente | Processo de persistir ou atualizar as informações de um cliente no sistema, garantindo que seus dados cadastrais estejam armazenados para futuras consultas e transações. | dist-historico | cadastrarCliente, registrarCliente, gravarCliente, atualizarCliente |
| salvarContato | Processo de persistir ou atualizar as informações de um contato no sistema, garantindo que os dados estejam disponíveis para consultas e interações futuras. | dist-historico | gravarContato, registrarContato, cadastrarContato, atualizarContato |
| setup | Fase de inicialização onde a lógica do componente é configurada e preparada para execução. | web | inicialização, configuração, preparação, bootstrap |
| solicitarRecuperacao | Inicia o processo de recuperação de acesso do usuário, permitindo a redefinição de credenciais de autenticação. | dist-historico | recuperarSenha, resetarSenha, solicitarResetSenha, iniciarRecuperacaoAcesso |
| tratar | Processo de validar credenciais e gerenciar a resposta de autenticação para permitir ou negar acesso ao sistema. | dist-historico | processar, validar, autenticar, gerenciar |
| validarExtracaoCct | Regra de validação que impede o preenchimento automático de lacunas na extração de Convenções Coletivas de Trabalho, exigindo que informações ausentes sejam tratadas explicitamente em vez de ignoradas. | dist-historico | validar extração CCT, verificação integridade extração CCT, validação convenção coletiva |
| validarPapelRuntimePostgres | Valida que papéis de execução no banco de dados PostgreSQL são configurados como independentes para impedir elevação não autorizada de privilégios. | dist-historico | verificarIsolamentoPapelRuntime, validarSegurancaPapelPostgres, checarPrevencaoSetRole |
| withPostgresGlobalTransaction | Processo que garante consistência transacional em operações de autenticação ou plataforma que precisam acessar dados de múltiplos inquilinos simultaneamente. | dist-historico | Transação global PostgreSQL, Wrapper de transação multi-inquilino, Contexto transacional global |
| withPostgresOfficeTransaction | Função que define o escopo de escritório confiável exclusivamente para a transação atual, garantindo que o PostgreSQL remova automaticamente esse escopo ao confirmar ou reverter a transação. | dist-historico | transação com escopo de escritório, transação contextualizada por escritório, gerenciamento de escopo de escritório em transação |
| withPostgresTransaction | Garante a execução confiável e consistente de uma unidade de trabalho no banco de dados, assegurando que todas as operações sejam concluídas com sucesso ou revertidas em caso de falha. | dist-historico | gerenciador de transação, executor transacional, controle de transação PostgreSQL |

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
| validação de arquivo, arquivo autorizado, verificação de permissão | arquivoPermitido | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| registrarAuditoriaCadastro, validarIntegridadeCadastro, rastrearMudancaCadastro | auditarCadastro | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| auditoria de segurança, monitoramento de acesso, registro de segurança, verificação de autenticação | auditarSeguranca | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| inicializarAdministrador, configurarAcessoAdmin, carregarPermissoesAdmin | bootstrapAdministrador | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validarCNPJ, verificarCNPJ, cnpjEhValido | cnpjValido | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Gravador de Backup Postgres, Exportação de Arquivos Postgres, Escrita de Dump Postgres | comEscritorArquivosPostgres | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| contexto de documento do cliente, dados de contexto do cliente, ambiente do documento do cliente | contextoDocumentoCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerarAutenticacao, iniciarSessao, criarTokenAcesso, estabelecerAutenticacao | criarAutenticacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| inicializarPoolPostgres, configurarPoolConexao, criarConexaoBanco | criarPoolPostgres | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| inicializarPoolPostgres, configurarPoolConexao, criarPoolBancoDados | criarPoolPostgresRuntime | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| determinarDocumentoCliente, definirTipoDocumentoCliente, selecionarDocumentoCliente | decidirDocumentoCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| estabelecerCredencial, configurarCredencial, atualizarCredencial, definirAcesso | definirCredencial | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| associarManualmente, criarVinculoManual, definirAssociacao, vincularRegistros | definirVinculo | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| localizarDocumentosClientes, identificarDocumentosClientes, buscarDocumentosClientes, encontrarDocumentosClientes | descobrirDocumentosClientes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consultarCliente, visualizarCliente, obterDetalhesCliente, fichaCliente | detalheCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| identificarLayout, reconhecerEstrutura, classificarFormatoDocumento | detectarFormato | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| isAditivoCct, verificaAditivoConvençãoColetiva, ehTermoAditivoCct | ehAditivoCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| isCct, possuiConvençãoColetiva, enquadradoEmCCT | ehCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Sanitizar HTML, Codificar Entidades HTML, Tratamento de Caracteres Especiais | escaparHtml | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| removerCadastro, apagarRegistro, deletarCadastro, excluirRegistro | excluirCadastro | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| exigir registro de escritório, validar cadastro de escritório, obrigar cadastro de escritório | exigirCadastroEscritorio | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Obter cabeçalho do documento, Ler cabeçalho de validação, Extrair identificador do registro | extrairCabecalho | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| emitirRelatorioPdf, criarRelatorioPdf, exportarRelatorioPdf | gerarPdfRelatorio | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| calcularHash, gerarDigest, criarIdentificadorÚnico | hashBytes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Token Hash, Hashed Token, Credencial Hash, Token Criptografado | hashToken | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| migrar documentos existentes, importar arquivos baixados, indexar documentos legados | indexarArquivosExistentes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| indexar metadados do documento, registrar metadados do documento, catalogar metadados do documento | indexarMetaDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| registrar vínculo, catalogar conexão, indexar relacionamento, arquivar vínculo | indexarVinculo | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Anular Consolidação, Desfazer Consolidação, Reabrir Período para Reprocessamento | invalidarConsolidacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| carregarDocumento, obterDocumento, recuperarDocumento | lerDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| lerConteudoValidado, processarBytesVerificados, obterDocumentoIntegridade | lerDocumentoBytes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| listar clientes, consultar clientes, obter lista de clientes, exibir clientes | listarClientes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| listar contatos, exibir contatos, consultar contatos | listarContatos | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| carregarConfigMonitoramento, inicializarWatchConfig, obterConfiguracaoObservacao | loadWatchConfig | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| autenticação, acesso, sign in, logon | login | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| deslogar, sair, encerrar sessão, sign out | logout | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Migrar Login, Transferir Acesso, Migração de Credenciais | migrarAutenticacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| migrarRegistros, migraçãoDeCadastros, transferirCadastros, atualizarBaseCadastros | migrarCadastros | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| padronizarCnpj, formatarCnpj, limparCnpj | normalizarCnpj | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| padronizarTexto, limparTexto, formatarTexto, sanitizarTexto | normalizarTexto | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| temAdministrador, existeAdministrador, administradorPresente | possuiAdministrador | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Gerador de configuração PostgreSQL, Construtor de conexão por ambiente, Factory de configuração de banco | postgresConfigFromEnv | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| configuração de banco por ambiente, configuração segura de conexão, runtime config do postgres | postgresRuntimeConfigFromEnv | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| restaurar, reaver, obter novamente, recuperar acesso | recuperar | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| referência formal, vínculo explícito, associação condicionada | referenciasExplicitas | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cadastrar documento sindical, registrar documento do sindicato, incluir documento sindical | registrarSindicatoDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| recusarVinculo, negarAssociacao, cancelarSolicitacaoVinculo | rejeitarVinculo | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| exportarLayoutCCT, gerarMarkdownCCT, renderizarContratoCCT | renderizarCctMarkdown | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerarRelatorioHtml, formatarRelatorioHistorico, exportarRelatorioHtml | renderizarRelatorioHtml | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| resolver referências pendentes, processar referências pendentes, finalizar vinculações pendentes | resolverReferenciasPendentes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cadastrarCliente, registrarCliente, gravarCliente, atualizarCliente | salvarCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gravarContato, registrarContato, cadastrarContato, atualizarContato | salvarContato | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| inicialização, configuração, preparação, bootstrap | setup | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| recuperarSenha, resetarSenha, solicitarResetSenha, iniciarRecuperacaoAcesso | solicitarRecuperacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| processar, validar, autenticar, gerenciar | tratar | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validar extração CCT, verificação integridade extração CCT, validação convenção coletiva | validarExtracaoCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| verificarIsolamentoPapelRuntime, validarSegurancaPapelPostgres, checarPrevencaoSetRole | validarPapelRuntimePostgres | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Transação global PostgreSQL, Wrapper de transação multi-inquilino, Contexto transacional global | withPostgresGlobalTransaction | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| transação com escopo de escritório, transação contextualizada por escritório, gerenciamento de escopo de escritório em transação | withPostgresOfficeTransaction | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerenciador de transação, executor transacional, controle de transação PostgreSQL | withPostgresTransaction | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |

## 8. Referências Externas
* [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] Listar aqui glossários de indústria, normas regulatórias ou fontes externas que definem os termos usados neste projeto.
