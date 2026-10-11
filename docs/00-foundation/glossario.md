# Glossário & Ubiquitous Language — 2

> Documento gerado automaticamente pelo pipeline determinístico de análise de código
> (server/glossary-pipeline.ts). Termos extraídos via AST + schema real (server/db.ts) + rotas
> reais (server/express-app.ts); definições geradas por IA a partir de uso real no código —
> revise as linhas marcadas com ⚠️.

## 1. Termos de Domínio
| Termo | Definição | Contexto/Bounded Context | Sinônimos observados |
| :--- | :--- | :--- | :--- |
| aplicarAlteracoes | Processo que consolida informações extraídas de instrumentos, registrando a origem de cada campo consolidado, sem modificar os dados originais da extração. | src | consolidar alterações, consolidação com proveniência, aplicar consolidação |
| auditarCadastro | Processo de revisão e verificação dos dados de um cadastro, garantindo que as informações registradas estejam corretas, completas e em conformidade com as regras da organização. | src | auditoria de cadastro, revisão de cadastro, verificação de cadastro, conferência de cadastro |
| auditarSeguranca | Verificação das condições de segurança do sistema, garantindo que acessos e dados estejam protegidos contra uso indevido. | src | auditoria de segurança, verificação de segurança, revisão de segurança |
| bootstrapAdministrador | Processo de inicialização do sistema que cria ou configura automaticamente a conta de administrador principal, garantindo que exista um responsável com acesso total desde a primeira execução. | src | inicialização do administrador, configuração inicial do administrador, criação automática do administrador |
| cnpjValido | Verificação que confirma se o número de CNPJ informado é válido, ou seja, se está correto conforme as regras oficiais de formação do cadastro nacional de pessoas jurídicas. | src | CNPJ válido, validação de CNPJ, verificação de CNPJ |
| consolidarCct | Processo de reunir e consolidar as informações de uma Convenção Coletiva de Trabalho (CCT), combinando cláusulas e dados de diferentes fontes em uma versão única e atualizada. | src | consolidação de CCT, consolidar convenção coletiva, unificar CCT |
| contextoDocumentoCliente | Informações de contexto associadas ao documento de identificação do cliente, reunidas durante o cadastro para apoiar o atendimento e a análise. | src | contexto do documento do cliente, dados contextuais do documento, informações do documento do cliente |
| controlarDownloadsChromium | Funcionalidade que acompanha e limita o volume de dados baixados pelo navegador Chromium, evitando que os downloads ultrapassem o orçamento de rede previsto. O controle é aproximado, pois reage a atualizações de progresso em lotes. | src | limite de download do Chromium, orçamento de download, controle de consumo de rede do navegador |
| cookieSessao | Informação temporária que identifica a sessão de um usuário autenticado no sistema, permitindo que ele permaneça conectado sem precisar informar suas credenciais novamente a cada acesso. | src | cookie de sessão, identificador de sessão, token de sessão |
| copiarDownloadLimitado | Processo de cópia local de um arquivo baixado, limitado a um tamanho máximo para evitar uso excessivo de recursos, aproveitando o conteúdo já recebido pelo navegador automatizado. | src | cópia de download limitada, cópia local com limite de tamanho, download com limite |
| criarAcessoHttp | Rotina responsável por estabelecer o acesso autenticado do usuário ao sistema, validando credenciais e liberando a comunicação com os serviços internos. | src | autenticar acesso, estabelecer conexão autenticada, login HTTP |
| criarAutenticacao | Processo responsável por criar o registro de autenticação de um usuário, permitindo que ele acesse o sistema de forma segura com suas credenciais. | src | criar autenticação, registrar credenciais, cadastrar acesso, configurar login |
| criarConsultaCnpj | Consulta de dados cadastrais de uma empresa a partir do seu CNPJ, realizada de forma pontual e controlada para evitar chamadas repetidas ou simultâneas ao mesmo CNPJ. | src | consulta de CNPJ, consulta cadastral de empresa, busca de dados por CNPJ |
| criarHashSenha | Processo responsável por transformar a senha do usuário em um formato protegido e irreversível antes de seu armazenamento, garantindo a segurança das credenciais de acesso. | src | gerar hash da senha, criptografar senha, proteger senha |
| decidirDocumentoCliente | Regra que determina qual documento de identificação (como CPF ou CNPJ) deve ser utilizado para o cliente, com base nas informações disponíveis no cadastro. | src | definir documento do cliente, selecionar documento do cliente, escolher identificação do cliente |
| definirCredencial | Ação de registrar ou atualizar a credencial de acesso de um usuário no sistema, utilizada internamente ou por linha de comando, sempre após a validação de um token de recuperação. | src | cadastrar credencial, definir senha, registrar credencial de acesso |
| descobrirDocumentosClientes | Processo que identifica e localiza os documentos associados aos clientes, criando candidatos a partir de coincidências de consulta. A confirmação só ocorre quando há evidências que comprovam a correspondência com o documento original. | src | localizar documentos de clientes, identificar documentos do cliente, buscar documentos de clientes |
| detalheCliente | Ação que exibe as informações detalhadas de um cliente cadastrado, permitindo consultar seus dados completos. | src | detalhar cliente, visualizar cliente, consultar dados do cliente, ficha do cliente |
| documentosCliente | Conjunto de documentos associados a um cliente, como contratos, comprovantes e identificações, geralmente obtidos para consulta ou verificação cadastral. | src | documentos do cliente, documentação do cliente, arquivos do cliente |
| encerrarContextoSuporte | Ato de finalizar o contexto de atendimento de suporte, indicando que o atendimento foi concluído e o atendente pode atender outro chamado. | src | finalizar atendimento, Encerrar suporte |
| ErroCadastro | ErroCadastro representa uma falha no processo de cadastro, indicando que ocorreu um problema ao registrar um novo item ou pessoa. | src | Erro de Cadastro, Falha no Cadastro |
| excluirCadastro | Ação de remover permanentemente um cadastro existente do sistema, eliminando os dados do registro selecionado. | src | remover cadastro, apagar cadastro, deletar registro, exclusão de cadastro |
| exigirCadastroEscritorio | Regra que obriga o usuário a ter um escritório cadastrado no sistema antes de prosseguir com determinada operação. Serve para garantir que as ações sejam realizadas apenas por quem possui vínculo formal com um escritório. | src | exigência de cadastro de escritório, obrigatoriedade de escritório cadastrado, validação de escritório |
| exigirCsrf | Mecanismo de segurança que valida se as requisições feitas ao sistema são legítimas e originadas pelo próprio usuário autenticado, impedindo que terceiros mal-intencionados executem ações em nome dele sem seu consentimento. | src | proteção contra falsificação de requisição, validação de token de segurança, verificação anti-CSRF |
| exigirPermissao | Verificação que garante que um usuário só pode realizar uma ação se possuir a permissão adequada, bloqueando acessos não autorizados. | src | verificar permissão, validar autorização, checar acesso |
| extrairAlteracoesAditivo | Extração das modificações introduzidas por um aditivo contratual, identificando o que foi acrescentado, alterado ou removido em relação ao contrato original. | src | alterações do aditivo, mudanças contratuais do aditivo, extração de modificações do aditivo |
| fingerprintDocumentos | Geração de uma identificação única (impressão digital) para cada documento, permitindo reconhecer documentos iguais e evitar duplicidades durante a consolidação das informações. | src | identificação única de documentos, hash de documentos, assinatura digital de documentos, deduplicação de documentos |
| hashToken | Processo de transformar um token de acesso em um código criptografado irreversível, garantindo que credenciais de autenticação não sejam armazenadas ou transmitidas em formato legível. | src | criptografar token, gerar hash do token, proteger token de acesso |
| indexarMetaDocumento | Processo de catalogar as informações descritivas (metadados) de um documento para facilitar sua localização e organização no sistema. | src | indexação de metadados do documento, catalogar metadados de documento, registrar metadados do documento |
| iniciarContextoSuporte | Ação de preparar o ambiente de atendimento ao cliente, reunindo as informações necessárias para que a equipe de suporte possa iniciar o acompanhamento de uma solicitação. | src | iniciar contexto de suporte, abrir atendimento, preparar atendimento ao cliente |
| lerConsolidacao | Leitura dos dados consolidados, ou seja, a recuperação das informações já agrupadas e resumidas de um processo de consolidação (como totais ou resultados combinados de várias fontes). | src | consultar consolidação, obter dados consolidados, carregar consolidação |
| lerCookieSessao | Rotina responsável por recuperar as informações de sessão do usuário armazenadas no navegador, permitindo identificar se ele está autenticado no sistema. | src | obter cookie de sessão, recuperar sessão do usuário, consultar sessão autenticada |
| listarClientes | Consulta que apresenta a relação de clientes cadastrados na empresa, permitindo visualizar as informações registradas de cada um. | src | consultar clientes, exibir clientes, relacionar clientes, listagem de clientes |
| listarContatos | Funcionalidade que apresenta a relação de contatos cadastrados no sistema, permitindo ao usuário visualizar as informações registradas. | src | exibir contatos, consultar contatos, mostrar lista de contatos |
| loadWatchConfig | Carregamento das configurações de monitoramento que definem como o sistema acompanha e observa alterações em arquivos ou dados. Representa a preparação dos parâmetros necessários para iniciar uma vigilância automatizada. | src | carregar configuração de monitoramento, inicializar parâmetros de observação, configuração de vigilância |
| login | Ação pela qual um usuário se identifica no sistema informando suas credenciais para obter acesso às funcionalidades disponíveis. | src | autenticação, acesso, entrar no sistema, sign in |
| logout | Ação de encerrar a sessão de um usuário no sistema, finalizando seu acesso autenticado e exigindo nova autenticação para uso posterior. | src | sair, encerrar sessão, desconectar, sign out |
| migrarAutenticacao | Processo de transferir ou atualizar a forma como os usuários comprovam sua identidade no sistema, movendo as credenciais e o acesso para um novo método ou plataforma de autenticação. | src | migração de autenticação, transferência de credenciais, atualização do método de login |
| migrarCadastros | Processo de migração de cadastros que transfere dados para uma nova versão do sistema de forma aditiva, preservando todos os registros, análises, configurações e vínculos já existentes. | src | migração de cadastros, atualização de cadastros, transferência de registros |
| normalizarCnpj | Padronização do número de CNPJ de uma empresa, removendo formatações como pontos, barras e traços para garantir consistência no cadastro e facilitar comparações e validações. | src | padronizar CNPJ, limpar CNPJ, formatar CNPJ |
| normalizarTexto | Padronização de textos informados no cadastro, removendo diferenças de formatação (como acentos, maiúsculas e espaços extras) para garantir consistência e facilitar buscas e comparações. | src | padronizar texto, limpar texto, uniformizar texto |
| possuiAdministrador | Verificação que indica se existe pelo menos um usuário com perfil de administrador cadastrado no sistema, garantindo que haja alguém responsável pela gestão de acessos e configurações. | src | existe administrador, há administrador cadastrado, tem administrador |
| protegerLegado | Ação de garantir que sistemas ou funcionalidades antigas continuem funcionando com segurança, protegendo o acesso a recursos herdados que ainda são utilizados pela organização. | src | proteção de legado, segurança de sistemas antigos, preservar acesso legado |
| recuperar | Ação pela qual um usuário restabelece o acesso à sua conta, normalmente por meio da recuperação ou redefinição de senha quando a esquece ou perde. | src | recuperar senha, recuperação de acesso, redefinir senha, restaurar acesso |
| registrarSindicatoDocumento | Ato de cadastrar um documento vinculado a um sindicato no sistema, permitindo anexar e organizar a documentação oficial da entidade sindical. | src | cadastrar documento do sindicato, anexar documento sindical, registro de documento sindical |
| renderizarCctMarkdown | Geração da versão final formatada da Convenção Coletiva de Trabalho (CCT), contendo apenas o layout contratado com o cliente, enquanto as evidências e justificativas ficam registradas separadamente para consulta. | src | gerar CCT, exportar convenção coletiva, montar documento da CCT |
| renderizarConsolidadoMarkdown | Processo que gera a versão consolidada de informações em formato de texto estruturado (Markdown), reunindo dados de múltiplas fontes em um único documento para leitura e compartilhamento. | src | gerar consolidado, montar relatório consolidado, consolidação em Markdown |
| reservarConsolidacao | Ação de garantir ou bloquear antecipadamente uma consolidação, ou seja, o agrupamento de cargas, pedidos ou volumes para envio conjunto, assegurando que a capacidade fique reservada antes da confirmação final. | src | reserva de consolidação, bloqueio de consolidação, reservar agrupamento de cargas |
| resolverContexto | Processo que identifica e monta as informações de contexto necessárias para decidir se uma ação pode ser autorizada, como quem está solicitando e em qual situação. | src | resolver contexto, determinar contexto de autorização, montar contexto |
| salvarCliente | Ação de registrar ou atualizar as informações de um cliente no sistema, garantindo que seus dados fiquem armazenados para consultas e operações futuras. | src | cadastrar cliente, gravar cliente, registrar cliente, persistir cliente |
| salvarContato | Ação de registrar ou atualizar as informações de um contato no sistema, garantindo que os dados fiquem disponíveis para consultas futuras. | src | gravar contato, cadastrar contato, persistir contato, registrar contato |
| solicitarRecuperacao | Processo pelo qual um usuário que esqueceu sua senha solicita a recuperação do acesso à sua conta, geralmente recebendo instruções ou um link por e-mail para redefinir suas credenciais. | src | recuperação de senha, solicitação de recuperação de conta, esqueci minha senha, redefinição de senha |
| tokenCsrf | Código de segurança gerado para validar que as requisições feitas ao sistema são legítimas e não foram forjadas por terceiros mal-intencionados. Protege as operações do usuário contra ataques de falsificação de solicitações. | src | token de segurança, token anti-CSRF, código de proteção contra falsificação de requisição |
| tratar | Ação de processar e responder adequadamente a uma situação durante a autenticação, como lidar com erros ou requisições recebidas, garantindo que o usuário receba um retorno apropriado. | src | processar, manipular, lidar com, gerenciar |
| tratarCadastrosContexto | Processo responsável por gerenciar os cadastros vinculados a um contexto específico, garantindo que as informações sejam tratadas apenas dentro desse contexto e nunca direcionadas às rotas globais do sistema. | src | gestão de cadastros por contexto, tratamento de cadastros contextuais, cadastros com contexto obrigatório |
| tratarClientes | Rotina responsável por processar e organizar as informações dos clientes, preparando-as para uso nas demais operações do sistema. | src | processar clientes, tratamento de clientes, gerenciar clientes |
| validarAlteracoes | Processo responsável por verificar e confirmar se as alterações realizadas estão corretas e em conformidade antes de serem efetivadas na consolidação. | src | validação de alterações, verificar alterações, conferir modificações |
| validarExtracaoCct | Processo de verificação que confere se as informações extraídas de uma Convenção Coletiva de Trabalho (CCT) estão completas e corretas, sem omitir dados presentes no documento original. | src | validação de extração de CCT, conferência de dados extraídos da convenção coletiva, verificação de extração de convenção coletiva |
| validarProntidao | Verificação que confirma se todas as condições necessárias estão atendidas para que uma consolidação possa ser concluída ou avançar para a próxima etapa. | src | verificar prontidão, checar disponibilidade, validação de prontidão |
| verificarSenha | Processo responsável por conferir se a senha informada pelo usuário corresponde à senha cadastrada, garantindo que apenas pessoas autorizadas acessem o sistema. | src | validar senha, conferir senha, checar credenciais, autenticar senha |

## 2. Acrônimos & Siglas
| Sigla | Significado | Definição |
| :--- | :--- | :--- |
| — | — | Nenhum acrônimo/sigla identificado deterministicamente nos termos extraídos. |

## 3. Entidades de Domínio (Core Entities)
| Entidade | Descrição | Atributos-chave | Relacionamentos |
| :--- | :--- | :--- | :--- |
| documentosCliente | Conjunto de documentos associados a um cliente, como contratos, comprovantes e identificações, geralmente obtidos para consulta ou verificação cadastral. | (ver atributos no código-fonte) | (ver relacionamentos no código-fonte) |

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
| consolidar alterações, consolidação com proveniência, aplicar consolidação | aplicarAlteracoes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| auditoria de cadastro, revisão de cadastro, verificação de cadastro, conferência de cadastro | auditarCadastro | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| auditoria de segurança, verificação de segurança, revisão de segurança | auditarSeguranca | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| inicialização do administrador, configuração inicial do administrador, criação automática do administrador | bootstrapAdministrador | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| CNPJ válido, validação de CNPJ, verificação de CNPJ | cnpjValido | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consolidação de CCT, consolidar convenção coletiva, unificar CCT | consolidarCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| contexto do documento do cliente, dados contextuais do documento, informações do documento do cliente | contextoDocumentoCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| limite de download do Chromium, orçamento de download, controle de consumo de rede do navegador | controlarDownloadsChromium | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cookie de sessão, identificador de sessão, token de sessão | cookieSessao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cópia de download limitada, cópia local com limite de tamanho, download com limite | copiarDownloadLimitado | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| autenticar acesso, estabelecer conexão autenticada, login HTTP | criarAcessoHttp | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| criar autenticação, registrar credenciais, cadastrar acesso, configurar login | criarAutenticacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consulta de CNPJ, consulta cadastral de empresa, busca de dados por CNPJ | criarConsultaCnpj | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerar hash da senha, criptografar senha, proteger senha | criarHashSenha | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| definir documento do cliente, selecionar documento do cliente, escolher identificação do cliente | decidirDocumentoCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cadastrar credencial, definir senha, registrar credencial de acesso | definirCredencial | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| localizar documentos de clientes, identificar documentos do cliente, buscar documentos de clientes | descobrirDocumentosClientes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| detalhar cliente, visualizar cliente, consultar dados do cliente, ficha do cliente | detalheCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| documentos do cliente, documentação do cliente, arquivos do cliente | documentosCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| finalizar atendimento, Encerrar suporte | encerrarContextoSuporte | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| Erro de Cadastro, Falha no Cadastro | ErroCadastro | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| remover cadastro, apagar cadastro, deletar registro, exclusão de cadastro | excluirCadastro | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| exigência de cadastro de escritório, obrigatoriedade de escritório cadastrado, validação de escritório | exigirCadastroEscritorio | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| proteção contra falsificação de requisição, validação de token de segurança, verificação anti-CSRF | exigirCsrf | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| verificar permissão, validar autorização, checar acesso | exigirPermissao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| alterações do aditivo, mudanças contratuais do aditivo, extração de modificações do aditivo | extrairAlteracoesAditivo | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| identificação única de documentos, hash de documentos, assinatura digital de documentos, deduplicação de documentos | fingerprintDocumentos | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| criptografar token, gerar hash do token, proteger token de acesso | hashToken | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| indexação de metadados do documento, catalogar metadados de documento, registrar metadados do documento | indexarMetaDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| iniciar contexto de suporte, abrir atendimento, preparar atendimento ao cliente | iniciarContextoSuporte | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consultar consolidação, obter dados consolidados, carregar consolidação | lerConsolidacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| obter cookie de sessão, recuperar sessão do usuário, consultar sessão autenticada | lerCookieSessao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| consultar clientes, exibir clientes, relacionar clientes, listagem de clientes | listarClientes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| exibir contatos, consultar contatos, mostrar lista de contatos | listarContatos | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| carregar configuração de monitoramento, inicializar parâmetros de observação, configuração de vigilância | loadWatchConfig | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| autenticação, acesso, entrar no sistema, sign in | login | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| sair, encerrar sessão, desconectar, sign out | logout | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| migração de autenticação, transferência de credenciais, atualização do método de login | migrarAutenticacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| migração de cadastros, atualização de cadastros, transferência de registros | migrarCadastros | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| padronizar CNPJ, limpar CNPJ, formatar CNPJ | normalizarCnpj | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| padronizar texto, limpar texto, uniformizar texto | normalizarTexto | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| existe administrador, há administrador cadastrado, tem administrador | possuiAdministrador | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| proteção de legado, segurança de sistemas antigos, preservar acesso legado | protegerLegado | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| recuperar senha, recuperação de acesso, redefinir senha, restaurar acesso | recuperar | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cadastrar documento do sindicato, anexar documento sindical, registro de documento sindical | registrarSindicatoDocumento | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerar CCT, exportar convenção coletiva, montar documento da CCT | renderizarCctMarkdown | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gerar consolidado, montar relatório consolidado, consolidação em Markdown | renderizarConsolidadoMarkdown | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| reserva de consolidação, bloqueio de consolidação, reservar agrupamento de cargas | reservarConsolidacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| resolver contexto, determinar contexto de autorização, montar contexto | resolverContexto | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| cadastrar cliente, gravar cliente, registrar cliente, persistir cliente | salvarCliente | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gravar contato, cadastrar contato, persistir contato, registrar contato | salvarContato | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| recuperação de senha, solicitação de recuperação de conta, esqueci minha senha, redefinição de senha | solicitarRecuperacao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| token de segurança, token anti-CSRF, código de proteção contra falsificação de requisição | tokenCsrf | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| processar, manipular, lidar com, gerenciar | tratar | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| gestão de cadastros por contexto, tratamento de cadastros contextuais, cadastros com contexto obrigatório | tratarCadastrosContexto | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| processar clientes, tratamento de clientes, gerenciar clientes | tratarClientes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validação de alterações, verificar alterações, conferir modificações | validarAlteracoes | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validação de extração de CCT, conferência de dados extraídos da convenção coletiva, verificação de extração de convenção coletiva | validarExtracaoCct | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| verificar prontidão, checar disponibilidade, validação de prontidão | validarProntidao | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |
| validar senha, conferir senha, checar credenciais, autenticar senha | verificarSenha | Variante(s) consolidada(s) sob a forma canônica durante a dedup do pipeline. | (data da regeneração) |

## 8. Referências Externas
* [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] Listar aqui glossários de indústria, normas regulatórias ou fontes externas que definem os termos usados neste projeto.
