# Integração do conceito visual aprovado

Referência: `docs/mockups/workspace-conceito.html`. O protótipo utiliza dados demonstrativos; a aplicação utiliza os cadastros e permissões reais.

Conferência atualizada em 10/10/2026: ver `MATRIZ_COMPLETUDE_UI.md` para o estado consolidado e lacunas em relação ao legado. Os incrementos abaixo são históricos; itens posteriormente implementados não devem ser interpretados como ainda pendentes apenas pela nota anterior.

## Incremento 1 — estrutura e cadastros

- Cabeçalho com seletor direto de escritório/empresa; sem formulário de justificativa visível. Concessões administrativas continuam autorizadas no servidor, com motivo descritivo automático e auditoria do ator real.
- Perfil e encerramento de concessão ficam no modal da conta.
- Clientes, contatos e filtros de sindicatos usam modais nativos com contenção de foco, Escape e fechamento após sucesso. Todos os campos e vínculos originais permanecem.
- Navegação, cards, cores e largura seguem a direção visual aprovada.
- Ao trocar contexto, a seleção anterior é descartada antes da chamada. O seletor permanece bloqueado durante a transição para evitar trocas concorrentes.

## Incrementos ainda necessários para completar a proposta

Incremento 2: confirmações rápidas da área de trabalho agora usam toast sem alterar o layout, com fechamento manual e automático após cinco segundos (pausa ao passar o mouse ou receber foco). Erros continuam persistentes, dentro do modal ativo quando aplicável. Clientes, contatos e consultas passam a oferecer busca local sobre os dados já carregados, normalizando acentos; a busca é limpa ao mudar de contexto. A reorganização completa dessas telas permanece pendente.

1. Visão geral: indicadores reais e próxima ação integrados em bento grid, com navegação contextual e estados de escritório vazio/revisão/atenção. Feed de atividade recente permanece pendente, pois exige uma fonte contextual própria; nenhum evento ou número do mockup foi inserido na aplicação.
2. Registros: a área de consolidação de CCTs agora possui busca por número, lista selecionável e detalhe com campos organizados em cards. Consolidação, revisão, aditivos e relatórios preservados. Esta entrega cobre as CCTs elegíveis para consolidação; a lista unificada de todos os instrumentos, filtros adicionais e integração visual de originais/publicações ainda estão pendentes.
3. Clientes: busca e apresentação dos vínculos e contatos, preservando os atributos existentes.
4. Envios: aba própria integrada, com busca/filtro, indicadores da lista, prévia, anexos, revisão obrigatória, aprovação, cancelamento, recuperação e histórico de tentativas preservados. Disponibilizações e auditoria de abertura continuam na área documental e ainda precisam da organização visual final.
5. Configurações: dados do escritório, SMTP e equipe agora aparecem em cards com edição em modais, preservando campos, papéis, vínculos e credenciais existentes. Cadastro/edição de escritórios da plataforma também utiliza modal separado. Fechar os modais limpa senhas digitadas; sucesso fecha a edição e usa a notificação existente. Configurações de IA e o mapeamento das configurações globais restantes ainda precisam do acabamento e da conferência de completude.
6. Conferência de completude: mapear os recursos do painel global para suas áreas contextuais ou administrativas; validar permissões e jornadas PostgreSQL/HTTPS e mobile.

A integração visual não efetua a migração do banco operacional nem habilita envios externos ou publicação em nuvem.

Fidelidade visual — primeiro incremento: cabeçalho compacto com marca, seletor, tema e avatar; dados do usuário, saída e acesso ao painel global ficam em Minha conta. Navegação usa ícones e nomes visuais curtos, preservando os nomes acessíveis e permissões. Camada visual workspace-conceito.css aplica cores, espaçamentos e proporções do mockup; visão geral reorganiza os cinco indicadores reais em cards e utiliza a identidade do hero aprovado. Tema inicial escuro quando não existe preferência salva. Capturas da aplicação PostgreSQL isolada em desktop escuro/claro e celular: data/ui-visao-geral-postgres.png, data/ui-visao-geral-light.png e data/ui-visao-geral-mobile.png. Conferidos visualmente, sem transbordamento horizontal; navegação no celular rola dentro da barra. Testes de resumo, autenticação e jornada PostgreSQL/HTTPS preservam as funções. Este incremento NÃO conclui a fidelidade visual de Cadastros, Documentos e demais áreas; dados recentes/atividade do mockup não foram simulados na aplicação.

Coleta local: card administrativo somente leitura apresenta canal do navegador, modo de janela, timeouts e limite de páginas carregados pelo processo, sem credenciais. Orienta uso do mesmo ambiente na interface e consumidor. Corrigido o modo HEADLESS ignorado pela coleta PostgreSQL; opção explícita interna ainda tem prioridade. Configuração é validada antes da abertura e na inicialização do CLI. Ajustes SQLite e webhook Slack global não são utilizados pelo consumidor contextual. SMTP por escritório e portal permanecem o fluxo do MVP local; integração Slack contextual e atalhos de provedor são melhorias adicionais. Testes de configuração/coleta/permissões conferem os campos públicos e as opções usadas no navegador.

Teste da conexão IA: botão administrativo usa somente a configuração salva, com versão para evitar testar dados obsoletos, sem habilitar IA ou iniciar análises. Envia um ping compatível com chat/completions, inclusive quando a configuração está inativa; a interface informa o possível consumo de créditos. Requisição exige administrador/CSRF, impede redirecionamento, limita duração a 15 segundos e leitura a 64 KiB. Mensagens de erro e auditoria não incluem chave, corpo do provedor ou exceções brutas. Sucesso usa toast, diagnóstico permanece no card e falhas ficam visíveis. Nove testes de serviço, teste sintético de interface e jornada PostgreSQL/HTTPS com provedor de loopback validaram configuração, sucesso, recusa de autenticação, versões, permissões e auditoria. Nenhuma chamada a provedor externo foi realizada.

Agenda semanal: edição permite escolher dias, horário e fuso IANA, além do intervalo anterior. Nova migração 015 adiciona configuração opcional, preservando agendas existentes por intervalo. O agendador usa o relógio do PostgreSQL e trava do escritório, revalida configuração/pausa e bloqueia solicitações duplicadas ou sobrepostas com trabalhos pendentes. Janela diária evita repetição em horário de verão; ticks atrasados atendem somente o dia corrente. Não oferece expressões cron arbitrárias. A migração não foi aplicada ao banco operacional.

Monitoramento: limites de coleta e agendas por intervalo agora usam cards com edição em modais, sem expor os formulários no render inicial. Solicitação, cancelamento, recuperação e gravações bem-sucedidas usam a notificação rápida compartilhada; erros de edição ficam persistentes no modal. Envios duplicados durante gravação e notificações tardias após troca de contexto são bloqueados. Teste de navegador confere erro de gravação/repetição, campos enviados, permissões de suporte, confirmações operacionais e troca de escritório. Jornada PostgreSQL/HTTPS continua validada. A agenda por intervalo não equivale à agenda cron/dias/horários do legado; essa lacuna permanece registrada.

Catálogo compartilhado de sindicatos: administração PostgreSQL oferece criação, edição e inativação em modal, com nome, CNPJ opcional e situação. CNPJ informado é validado e normalizado; somente administrador da plataforma pode acessar, alterações exigem CSRF e registram ator na auditoria. Jornada HTTPS isolada confere erro de CNPJ, criação, inativação, auditoria e negativas de acesso/CSRF. Corrigida a preservação do componente de notificações ao reconstruir a seção após um erro de modal, mantendo os toasts seguintes funcionais.

Originais no catálogo: APIs SQLite/PostgreSQL passam a informar um cliente relacionado dentro do escritório e a presença de caminho/hash do original, sem expor caminhos internos. O botão reutiliza a rota autorizada de documentos do cliente, que confere integridade e registra auditoria. Respostas de download são descartadas após troca de contexto. Ensaio PostgreSQL/HTTPS conferiu hash dos bytes baixados e evento ORIGINAL_INTERNO_DISPONIBILIZADO. Presença de metadados não garante existência física: a rota retorna erro caso o arquivo esteja ausente ou inconsistente.

Catálogo documental: lista de todos os instrumentos retornados pela API contextual, busca por número e filtro por tipo. CCTs possuem acesso direto à consolidação e aditivos exibem o vínculo atual quando disponível. O catálogo cobre documentos relacionados aos clientes do escritório; não representa o catálogo global. Download de originais permanece na área de documentos do cliente, com autorização existente. A integração direta desse download no catálogo e a conferência final de completude continuam pendentes.

Publicações: formulário de disponibilização em modal, lista com estado vazio e cards no portal do cliente; identificação técnica da versão recolhida em detalhes. Abertura, download, ciência, revogação e auditoria permanecem disponíveis. Confirmação de publicação corrigida para toast de sucesso; respostas de auditoria atrasadas são descartadas após troca de contexto. A jornada integrada abre/fecha o modal ao conferir a recusa de publicação pendente e a posterior liberação após revisão.

Vínculos de aditivos: edição movida para modal, com vínculo atual preenchido ao selecionar o aditivo e justificativa nova obrigatória. Ausência de aditivos apresenta estado vazio e impede envio do formulário. Jornada PostgreSQL/HTTPS utiliza o botão de abertura e preserva a sequência de vínculo, consolidação, revisão e publicação.

Configuração de IA: provedor, modelo, ativação e chave agora são editados em modal a partir de um card. Erros e conflitos de versão permanecem dentro da edição; salvar fecha o modal e emite confirmação rápida. A chave digitada é limpa ao fechar. Solicitações, tentativas e recuperação continuam disponíveis na área administrativa, com as confirmações operacionais preservadas. Teste de navegador cobre permissões, preservação/substituição/remoção de chave, conflito e descarte de resposta atrasada.
## Conferência visual — tabelas de cadastros (11/10/2026)

Clientes, contatos e consultas privadas agora usam tabelas HTML com cabeçalhos, colunas específicas, situação e ações por registro. Os três blocos ocupam a largura disponível; em telas pequenas a rolagem horizontal fica contida na tabela. Busca e criação ficam numa barra com espaçamento próprio. Os formulários completos continuam nos modais existentes e as permissões são preservadas.

Validação: build TypeScript e jornada test:auth-ui (CRUD, busca, inativação, exclusão com histórico, troca de escritório, duas abas e acesso de suporte). Capturas com dados de teste: data/ui-escritorio-desktop.png e data/ui-escritorio-mobile.png. A composição unificada de Documentos e a revisão visual das demais áreas continuam pendentes.
## Conferência visual — consulta de instrumentos (11/10/2026)

O catálogo de instrumentos passa a usar lista selecionável à esquerda e detalhe à direita. Busca por número e filtro por tipo são preservados; seleção inicial e filtragem usam somente instrumentos visíveis ao escritório. O detalhe tem navegação entre informações principais e análise, com download autorizado do original e acesso à consolidação para CCTs. Ao filtrar sem resultados, o detalhe anterior é descartado; respostas antigas não sobrescrevem uma seleção mais recente.

Validação: build e jornada PostgreSQL/HTTPS/Chromium, incluindo detalhes e análise, filtro sem resultado, download íntegro/auditado, vínculo de aditivo, consolidação, bloqueio de publicação pendente, revisão, publicação e ciência. Capturas: data/ui-documentos-postgres.png e data/ui-documentos-mobile.png. Consolidações/revisões e publicações ainda mantêm blocos separados abaixo do catálogo; a integração completa dessas ações na composição final e a revisão das demais áreas permanecem pendentes.
## Conferência visual — navegação de Documentos e publicações (11/10/2026)

Documentos tem três áreas: Instrumentos, Consolidações e revisões, Publicações e acessos. O seletor duplicado de CCT foi retirado da visualização; a lista continua selecionando a base utilizada pelas ações. Consultar consolidação abre diretamente a área correspondente. Regras completas ficam em details nativo expansível com nomes legíveis, sem remover campos, revisões ou relatórios. Publicações e auditoria usam tabelas com cabeçalhos e rolagem contida.

Validação: build, test:auth-ui e test:postgres-https, com revisão, bloqueio de publicação pendente, publicação válida, download íntegro, ciência e auditoria. Capturas: data/ui-consolidacoes-postgres.png e data/ui-publicacoes-postgres.png. Demais áreas ainda precisam de conferência visual.
## Conferência visual — Monitoramento e Envios (11/10/2026)

Monitoramento prioriza indicadores da lista carregada, solicitação de coleta e histórico. Limites e agendas ficam em uma grade abaixo; os formulários completos permanecem em modais. Datas das execuções usam apresentação pt-BR. Falha no carregamento é apresentada como alerta persistente. Cancelamento, recuperação com confirmação e permissões existentes foram preservados.

Envios apresenta empresa e situação no cabeçalho de cada cartão, seguido de registro/destinatário. Prévia, anexos, histórico, aprovação, repreparação e cancelamento continuam disponíveis no bloco expansível. Botões de operação têm espaçamento e prioridade próprios. Captura ui-envios-sinteticos.png usa dados HTTP sintéticos para conferência; não representa mensagens reais enviadas. ui-monitoramento-postgres.png usa a aplicação com PostgreSQL de teste isolado.

Conferência responsiva a 390px sem transbordamento do documento. Testes: monitoramento-ui, envios-ui.e2e.mjs e postgres-https. Escritório e Plataforma ainda precisam de revisão visual.
## Conferência visual — Escritório e Plataforma (11/10/2026)

Escritório reúne quatro cartões em grade: dados, SMTP, equipe e histórico. Edição e histórico ficam em modais; o modal de equipe usa tabela nativa para pessoa, vínculo, situação e permissões/ações. Contas, representantes, mudanças de papel, revogação e reativação foram preservados.

Plataforma separa Cadastros e operação local de IA e extrações. Escritórios e sindicatos usam tabelas, com criação e edição nos modais originais. A solicitação de análise fica em modal próprio, com erro junto ao formulário. Chaves de IA e senha SMTP continuam preservadas quando omitidas e limpas dos campos ao fechar.

Validação: envios-ui.e2e.mjs, ia-plataforma-ui, auth-ui e postgres-https. Conferência desktop e 390px, incluindo tabela do modal de equipe sem transbordamento do documento. Capturas em data/ui-gestao-postgres.png, data/ui-gestao-mobile.png, data/ui-plataforma-postgres.png e data/ui-plataforma-mobile.png. As áreas principais receberam conferência visual; isso não equivale à conclusão de todo o plano operacional nem à importação/cutover dos dados reais para PostgreSQL.
## Visão geral — execuções recentes (11/10/2026)

O painel mostra até cinco execuções mais recentes do escritório, ordenadas por identificador, com situação, data local e acesso ao histórico de Monitoramento. Usa a API contextual existente, sem consultar logs administrativos ou expor eventos de outros escritórios. Ausência e falha de carregamento têm mensagens próprias; falha dessa lista não remove os indicadores. Resposta atrasada é descartada após troca/limpeza de contexto. Representantes de empresa não solicitam esses dados.

Validação: resumo-ui cobre isolamento, resposta atrasada da atividade, estado vazio, ordenação e navegação; postgres-https cobre a aplicação real no banco isolado. Não houve alteração do banco operacional nem importação dos dados reais.

## Cadastros v2 — implementação da proposta aprovada (11/10/2026)

A área de Cadastros agora tem subnavegação Clientes, Contatos e Sindicatos, com somente um cadastro visível por vez, indicadores calculados das listas carregadas, busca, situação e ordenação. Não são inventados indicadores de vínculos que a listagem não retorna. A ficha do cliente consulta o detalhe contextual PostgreSQL, mostra contatos/sindicatos e mantém acesso aos documentos; edição aparece somente com permissão. Limpeza/troca de contexto fecha a ficha e descarta seu conteúdo; respostas de detalhe obsoletas são ignoradas.

Formulário de cliente dividido em Dados da empresa, Contatos e envio, Sindicatos. Consulta CNPJ e dados completos anteriores preservados. Vínculos agora usam checkboxes pesquisáveis, preferências expansíveis, tipos por checkbox e radio de principal, com opção de limpar o principal. Todos os tipos de instrumento existentes permanecem disponíveis. IDs/contratos de persistência são preservados; selects internos são espelhos de estado, não controles visíveis. Consulta privada de sindicato separa dados e filtros. Formulários mantêm os campos necessários e revelam a seção de um campo inválido.

Excluir fica em Mais ações com alertdialog nativo; Escape cancela, troca de contexto cancela e resposta tardia não executa exclusão em outro contexto. Histórico/restrições continuam determinados pelo backend. Salvar/recarregar cadastros mantém a área ativa; troca de contexto continua limpando a navegação. Assets HTTP e Dockerfile incluem cadastros-ui.js, sem API legada reativada.

Validação: build operacional, workspace-navigation, cadastros-ui, cliente-vinculos-ui, cliente-cnpj-ui e jornada PostgreSQL HTTPS/Chromium. Capturas ui-cadastros-postgres-v2-desktop.png e ui-cadastros-postgres-v2-mobile.png usam dados isolados de teste; não são prints dos cadastros operacionais. Aceite visual do resultado implementado permanece humano. A imagem Docker precisa ser reconstruída para conter os assets novos.
