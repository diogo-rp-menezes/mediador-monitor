# MTE Mediador Monitor — v0.4.1

Para o MVP PostgreSQL local, consulte [Operação local](docs/OPERACAO_MVP_LOCAL.md): `npm run local:verificar` confere o ambiente e `npm run local:iniciar` inicia a interface após aprovação das verificações. Workers, preparação do destino e importação são etapas explícitas do roteiro.

## Evolução para escritórios contábeis — Sprints 1 a 3

O [plano de sprints e tarefas](docs/PLANO_SPRINTS.md) organiza a evolução de escritórios, identidade, RBAC, isolamento e portal de documentos. A [decisão de arquitetura](docs/architecture/adr-001-organizacoes.md) documenta os escopos e a transição.

A fundação adiciona migrações versionadas, autenticação, sessões, recuperação de senha, RBAC, seleção de contexto e auditoria. Faça backup de `data/` e `downloads/` antes de abrir uma versão atualizada: as migrações são aplicadas na abertura do banco.

A Sprint 3 completa cadastros e gestão de escritórios/usuários e o isolamento por escritório de clientes, documentos, decisões, vínculos de aditivos, revisões, consolidações e relatórios. Suporte tem acesso temporário justificado e somente para consulta. Jobs, SMTP por escritório, portal de cliente e PostgreSQL seguem nas Sprints 4 a 6. Continue usando localmente, sem habilitar acesso externo.

Crie explicitamente o primeiro administrador; o comando solicita uma senha oculta com pelo menos 15 caracteres:

```powershell
npm run auth:bootstrap -- --nome "Seu nome" --email "seu@email.com"
```

Consulte [autenticação e recuperação de acesso](docs/AUTENTICACAO.md) para configuração, limites e comandos. Nenhuma conta foi criada no banco real durante a implementação.

Sprint 3 concluída. [Clientes e contatos](docs/CADASTROS_POR_ESCRITORIO.md), [monitoramentos privados](docs/SINDICATOS_POR_ESCRITORIO.md), [documentos e aplicabilidade](docs/DOCUMENTOS_POR_ESCRITORIO.md), [revisões e relatórios](docs/INTERPRETACOES_POR_ESCRITORIO.md) e [gestão de escritórios e usuários](docs/GESTAO_ESCRITORIOS_E_USUARIOS.md) têm escopo e interface contextualizados, auditoria e testes entre dois escritórios.

[Sindicatos e filtros privados](docs/SINDICATOS_POR_ESCRITORIO.md) também estão disponíveis em Minha conta. Cada escritório configura suas consultas e vínculos de clientes independentemente. A execução contextual e as quotas da Sprint 4 ainda estão pendentes; jobs globais continuam usando os filtros legados.

Documentos e aplicabilidade podem ser consultados e decididos por cliente dentro do escritório, com original autorizado, ator autenticado e verificação de versão. Relatórios PDF/Markdown e anexos internos também validam escritório/empresa e hash. A decisão não inclui documento na fila de e-mail. Até a fila por escritório estar implementada, o SMTP global atende somente o escritório inicial.

Aplicação local para monitorar CCTs, acordos coletivos e termos aditivos no **Mediador/MTE**, baixar documentos originais `.doc`/`.pdf`, persistir tudo no **SQLite** e analisar instrumentos com API de IA compatível com OpenAI. Inclui vínculo e consolidação de aditivos, notificações por Slack/SMTP e interface web em `http://localhost:3000`.

A aplicação está em transição para **PostgreSQL local em Docker**, que será o único banco operacional após o corte e a estabilização. SQLite permanece ativo no modo legado durante essa transição e depois será apenas arquivo histórico. A retirada do runtime SQLite está detalhada na Sprint 7 do [plano de implementação](docs/PLANO_SPRINTS.md); os ensaios atuais não significam que a migração real já ocorreu.

## Escritórios contábeis (Sprint 3)

A autenticação e gestão permitem cadastrar escritórios, clientes, contatos, usuários e seus vínculos com papéis separados. Documentos e extrações continuam compartilhados; decisões de aplicabilidade, vínculos de aditivos, revisões e consolidações são privados por escritório. PDFs, Markdown, originais e anexos internos verificam o escopo antes de servir arquivos. A gestão e os limites de transição estão descritos em [Plano de sprints](docs/PLANO_SPRINTS.md), [Gestão de escritórios e usuários](docs/GESTAO_ESCRITORIOS_E_USUARIOS.md), [Interpretações por escritório](docs/INTERPRETACOES_POR_ESCRITORIO.md) e [Autenticação](docs/AUTENTICACAO.md).

A entrega continua local: jobs e SMTP por escritório, portal do cliente, eventos de acesso e PostgreSQL ainda pertencem às Sprints 4 a 6.

## Consulta por CNPJ (v0.4.1)

Em **Clientes → Novo cliente** ou **Editar cadastro**, informe o CNPJ e clique em **Consultar CNPJ**. Confira o resultado e use **Usar dados no cadastro** para preencher razão social, nome fantasia, município e UF. Os campos continuam editáveis. Nada é gravado até **Salvar**.

O resultado cadastral também mostra endereço, CNAE principal e secundários, situação cadastral, natureza jurídica e porte. Após salvar, essa consulta fica na ficha **Dados**, com fonte e data, e nas alterações auditadas. A situação cadastral é informativa; não muda automaticamente a ativação do cliente ou o envio de notificações.

- Fonte gratuita: [BrasilAPI / Minha Receita](https://brasilapi.com.br/docs), baseada em dados públicos do CNPJ. Não é acesso em tempo real diretamente à Receita Federal; a base pode ter defasagem. A data registrada é a da consulta, não a de atualização da Receita.
- O acesso oficial direto via Serpro exige contratação e credenciais e não está incluído nesta versão. [Informações do serviço oficial](https://www.gov.br/pt-br/servicos/obter-solucao-de-consulta-de-dados-do-cadastro-nacional-de-pessoas-juridicas-cnpj).
- Valida os dígitos verificadores, inclusive CNPJ alfanumérico. A disponibilidade de cada inscrição depende da base consultada.
- Consulta feita pelo servidor, com timeout de 12 segundos, cache de 15 minutos limitado a 100 CNPJs e mensagens para CNPJ inválido, não encontrado, limite de consultas ou indisponibilidade. O preenchimento manual continua disponível.
- Não importa sócios, não cria contatos nem escolhe sindicato automaticamente. CNAE é referência para conferência; o enquadramento e os destinatários continuam definidos nos vínculos existentes.
- Trocar o CNPJ remove a consulta anterior; editar contatos ou sindicatos preserva os dados consultados. A migração é aditiva e preserva os cadastros da 0.4.0.

Validação da consulta: testes de mapeamento, falhas HTTP/rede/timeout, cache, migração e preenchimento pela UI usam respostas simuladas. A consulta externa real não foi concluída no ambiente de desenvolvimento; confirme o acesso à BrasilAPI na máquina em que o aplicativo será executado.

## Clientes, contatos e envios (v0.4.0)

- **Clientes:** CRUD por CNPJ, dados da empresa, situação e modo de envio. A ficha reúne Dados, Sindicatos, Contatos, Documentos e Envios. O cadastro permite selecionar um sindicato principal e um primeiro contato; os vínculos adicionais ficam na ficha.
- **Sindicatos:** cadastro existente preservado, com contador e consulta das empresas vinculadas. Cada cliente pode ter vários sindicatos, com categoria, município/UF e confirmação do enquadramento por vínculo.
- **Contatos:** CRUD central, com nome, e-mail, telefone, cargo e situação. Um contato pode atender várias empresas. Recebimento de e-mails, função e tipos de documento são definidos em cada vínculo com o cliente.
- **Envios:** prévias com destinatário, assunto, mensagem e anexos; aprovação, cancelamento, repreparação, tentativas e resultado por cliente/contato/documento/versão. Os indicadores consideram todo o histórico; a listagem mostra os 500 envios mais recentes.
- **PDF:** exportação na análise do registro e anexo nas notificações. Reutiliza a análise salva, com as 60 informações do template, referências de cláusulas, citações disponíveis, fontes, originais e decisões de revisão. Não chama a IA novamente para formatar o relatório.

### Começar a usar

1. Cadastre os contatos na nova aba **Contatos**.
2. Cadastre a empresa em **Clientes** e escolha o sindicato principal e o contato. O modo inicial é **Revisar antes de enviar**.
3. Na ficha da empresa, ajuste os demais sindicatos e as preferências de cada contato.
4. Execute uma verificação. Na ficha, **Documentos** mostra os candidatos relacionados. Confira o original e registre a aplicabilidade com responsável e justificativa quando necessário.
5. Use **Preparar e-mails** ou **Preparar pendentes**. Se houver falha de análise, arquivo ausente, vínculo de aditivo indefinido ou consolidação com pendências, o sistema exibe um bloqueio.
6. Abra **Envios → Ver prévia**, confira os anexos, informe o responsável e aprove. Com SMTP ativo, a fila é processada a cada 30 segundos enquanto o servidor está aberto; há também processamento manual da fila aprovada.

Em **Configurações → E-mail**, o servidor e o remetente são comuns. Os destinatários dos clientes vêm dos contatos vinculados. O campo **Alertas internos** é opcional e continua destinado ao aviso global existente, separado dos e-mails por empresa. Para testar o SMTP pelo formulário de configuração, informe um destinatário interno de teste.

### Aplicabilidade e modo automático

Uma coincidência de consulta sindical cria um **candidato**, sem determinar enquadramento jurídico. A confirmação manual exige responsável e justificativa. Alterar o documento ou os vínculos invalida a decisão anterior e exige nova conferência.

No modo automático, a confirmação por regra é deliberadamente conservadora: o CNPJ deve constar entre as partes do cabeçalho, a vigência precisa estar explícita e incluir a data corrente. Para CCTs, também é exigido vínculo sindical conferido, categoria literal coincidente e município/UF explícitos; ressalvas e exclusões levam à revisão. ACTs exigem o CNPJ da empresa entre as partes. Documentos futuros, expirados ou com escopo não reconhecido ficam para confirmação manual. Uma confirmação manual também pode liberar o envio automático, desde que os demais requisitos estejam atendidos.

Documentos anteriores ao cadastro ficam disponíveis para consulta, mas não entram automaticamente na fila. A inclusão é explícita em **Incluir documentos anteriores na fila** ou na confirmação de aplicabilidade. Novas análises com conteúdo alterado geram versões distintas; repetir o preparo ou o processamento não repete um envio já aceito para o mesmo destinatário e versão.

### Anexos, falhas e histórico

Esta versão local envia o original DOC/PDF e o relatório PDF como **anexos**. Para uma consolidação, também inclui os originais da CCT e dos aditivos utilizados. Links externos e acompanhamento de visualização ficam para uma implementação futura: os endereços atuais são locais e não servem para downloads fora da máquina.

As prévias usam cópias dos anexos em `data/envios/`. O envio confere seus hashes e a versão da análise antes de chamar o SMTP. Preserve toda a pasta `data/` nos backups, além de `downloads/` e `.env`. O limite estimado da mensagem é de 20 MB, considerando a expansão MIME; ajuste `MAIL_MAX_ATTACHMENT_MB` ao limite do provedor.

**Aceito pelo SMTP** significa que o servidor aceitou o destinatário; não confirma caixa de entrada ou leitura. Rejeições temporárias comprovadas têm até três tentativas, com intervalo de cinco minutos. Falhas permanentes exigem intervenção. Timeouts, perda de conexão ou reinício durante o envio ficam com **Resultado incerto** e não são repetidos automaticamente. Confira o provedor antes de repreparar e confirmar o risco de duplicidade.

Cadastros sem dependências podem ser excluídos; cadastros com vínculos ou histórico devem ser inativados. Nenhum original, análise individual, decisão de revisão ou envio concluído é apagado pela migração.

### Validação desta entrega

Validado com Node 22, banco antigo e novo, testes de cadastros/aplicabilidade/fila, testes anteriores, interface no navegador, geração de PDF real e SMTP TLS simulado localmente. Não utiliza credenciais reais de e-mail, MTE ou LLM para esses testes. A navegação real no Mediador, o provedor SMTP do usuário e a execução no Windows ainda dependem do ambiente local.

```powershell
npm test
npm run typecheck
npm run build
node --test test/*.smoke.mjs
npm run test:clientes-ui
```

O último teste requer Chromium instalado e OpenSSL para criar um certificado de teste local. Busca no PATH e nas instalações usuais do Git para Windows e OpenSSL-Win64; outros caminhos podem ser informados em `OPENSSL_BIN`. Produção não precisa de OpenSSL. Node 22 é a versão recomendada para esta entrega.

## Novo painel de Registros (v0.3.11)

A interface **Registros** foi remodelada como uma área de trabalho em duas colunas: lista pesquisável à esquerda e detalhes do instrumento selecionado à direita. Os indicadores de registros carregados, documentos que precisam de atenção, análises e consolidações são calculados a partir dos dados reais do SQLite, sem números fictícios. A API atual limita a listagem a 500 registros recentes; por isso o indicador informa **Total carregado** em vez de total absoluto no banco.

- Filtros combináveis de **consulta, tipo, status, período de detecção**, busca textual e ordenação.
- Abas de detalhes: **Visão geral**, **Documento original**, **Análise por IA**, **CCT e termos aditivos** e, nas CCTs, **Pendências de revisão**.
- Ações reais preservadas: baixar documento, analisar/reanalisar, vincular aditivos, consolidar, exportar Markdown, revisar e auditar decisões.
- A tela diferencia **Sem análise**, **Analisando**, **Analisado**, **Falhou**, **Revisão pendente**, **Consolidado** e arquivo ainda não baixado; bloqueia análise enquanto já executa ou quando falta documento.
- Layout responsivo, rótulos acessíveis, navegação por teclado nas abas e atualização periódica dos estados; o backend e as tabelas SQLite não foram modificados.

**Testes específicos da UI:** `node --test test/registros-ui.smoke.mjs` (incluídos em `node --test test/*.smoke.mjs`).

## Atualizar no Windows

1. **Feche o servidor anterior** e faça backup das pastas `data/` e `downloads/` (inclusive arquivos `.db-wal`/`.db-shm` existentes quando aplicável).
2. Extraia o ZIP **sobre os arquivos de código**, preservando seu banco de dados, documentos, `.env` e qualquer configuração pessoal.
3. Abra um PowerShell na pasta `mediador-monitor` e execute:

```powershell
npm install
npx playwright install chromium
npm run dev
```

Para instalação nova, copie `.env.example` para `.env` antes de iniciar. Node.js 20 ou superior.

## Automação 100% sem checkpoints de confirmação

Tanto o botão **Verificar agora** quanto as consultas agendadas executam a mesma rotina:

1. Inicia um navegador Playwright isolado, preenchendo CNPJ, categoria e filtros (tipo, vigência, UF e título) e conferindo os valores.
2. Clica em **Pesquisar**, encontra a janela de resultados e percorre as páginas; identifica e baixa documentos novos ou pendentes.
3. Salva DOC/PDF, SHA-256 e metadados no SQLite; processa análises e vínculos de CCT/aditivo e envia notificações configuradas.
4. **Sempre fecha as guias abertas pela aplicação, o contexto e o navegador** ao terminar ou falhar. Entre tipos de instrumentos, fecha as janelas de resultados da consulta anterior. Não toca nas guias do Chrome do usuário.

Nenhuma etapa apresenta botão **Continuar**. O painel acompanha o status e oferece **Interromper**, que solicita o cancelamento da execução e encerra o contexto do navegador.

### Sem janela / visível

Em **Configurações → Automação → Como executar as consultas**, selecione:

- **Sem janela (headless)**: processo Playwright em segundo plano. É o padrão das novas instalações.
- **Visível**: abre janela para diagnóstico, executa automaticamente e fecha ao finalizar, sem aguardar confirmação manual.

Clique em **Salvar automação**. O modo é guardado na tabela `ajustes`, chave `navegador`, do SQLite. A escolha vale para execuções manuais e agendadas. Para instalações antigas sem essa chave, usa-se `HEADLESS` do `.env` (agora `true` no exemplo).

**Limite importante:** o site pode bloquear navegação automatizada ou apresentar verificação humana (Cloudflare/CAPTCHA). Nesse caso a consulta **registra uma falha e encerra o navegador**; não tenta resolver, contornar ou esconder essa verificação. Se o modo sem janela falhar por indisponibilidade do portal, tente o modo visível para diagnóstico e, quando necessário, utilize o portal manualmente.

## Diagnóstico

- **Execuções**: histórico por sindicato e tipo de instrumento, com erros de consulta/download.
- `data/debug/`: HTML, screenshot e inventário DOM coletados **em falhas** (arquivos podem conter informações da consulta; proteja-os).
- Erros de Cloudflare/verificação humana são reportados sem aguardar até 10 minutos.
- Se o Playwright indicar ausência de Chromium, execute `npx playwright install chromium`.

## Configurações e dados

- `data/mediador.db` em novas instalações; se existir `data/mte-cct-monitor.db`, o projeto o utiliza para preservar a migração anterior. `DB_PATH` permite escolher outro.
- `downloads/` contém os documentos originais; não são armazenados como BLOB no banco.
- **Configurações**: endpoint LLM compatível com OpenAI, cron com fuso, modo do navegador, Slack e SMTP/Gmail wizard — com persistência SQLite.
- Chaves de API e senhas são armazenadas localmente e não devolvidas pela API de leitura, mas continuam em **texto claro no SQLite**. Proteja o diretório e os backups.

## Cláusulas e aditivos

A análise individual de CCT segue `TEMPLATE_CCT.md`: **60 campos em nove seções**; ausência expressa como `Não consta na CCT`, sem presumir direitos não documentados. Aditivos são analisados separadamente e vinculados à CCT por referência explícita ou confirmação manual. A consolidação mantém a origem das alterações, citações e pendências de revisão quando houver ambiguidade. Os documentos originais não são modificados.

## Testes

```powershell
npm test
npm run typecheck
npm run build
```

Testes offline adicionais:

```powershell
node --test test/*.smoke.mjs
```

A automação foi implementada com base nos HTMLs e capturas de tela de diagnóstico fornecidos. **O fluxo de navegação/download em uma sessão real do portal e a operação headless não podem ser garantidos sem teste na sua máquina**, especialmente por verificações de segurança do MTE. Não é possível garantir que o servidor do MTE aceitará navegadores sem interface.

## v0.3.9 — Revisão interativa de pendências da consolidação

Em **Registros → CCT e termos aditivos**, as pendências passam a mostrar um botão
**Revisar conflito**. Cada revisão exibe:

- regra que constava na CCT original e regra/citação encontrada no aditivo;
- botão **Solicitar sugestão da IA**, com evidências literais validadas contra os arquivos;
- sugestão não vinculante da IA: manter regra, considerar aditivo ou revisão manual;
- decisões explícitas: **Manter regra atual**, **Aplicar valor sugerido pela IA** (somente se a IA recomendar e a citação existir) ou **Definir interpretação manual**;
- justificativa e identificação do responsável obrigatórias;
- histórico auditável de decisões e mudanças, com os valores anteriores preservados.

A análise da IA NÃO aplica alterações automaticamente. O documento original, o texto
extraído e o JSON de consolidação inicial não são sobrescritos: as decisões são
aplicadas apenas na visão/relatório consolidado. Revogar, substituir ou interpretar
cláusulas não determina por si só a validade jurídica ou temporal de uma regra.
O responsável deve avaliar o texto integral antes de utilizar a decisão em rotinas
trabalhistas ou cálculos de folha.

**Segurança e consistência:** a aplicação de sugestões exige prova textual e
aprovação explícita. A decisão é vinculada a uma impressão digital da pendência,
que inclui a regra anterior e a alteração detectada. Se o conteúdo for modificado,
se o documento for atualizado ou se a consolidação mudar, a revisão antiga não é
aplicada a um novo conflito sem uma nova decisão. Se vários aditivos disputarem o
mesmo campo e não houver ordem comprovada, a UI não permite selecionar uma regra
por mera inferência cronológica: a revisão integrada deve ocorrer externamente.

### SQLite

Migração aditiva automática na inicialização:

- `revisoes_pendencias`: status e resultado da sugestão da IA, decisão, texto, autor,
  justificativa e impressão digital do contexto;
- `auditoria_revisoes`: histórico append-only das decisões, inclusive reversões.

O banco e as CCTs anteriores são mantidos. Faça cópia de segurança da pasta `data`
antes de atualizar. A consulta ao LLM continua usando a configuração OpenAI-compatible
já existente em **Configurações**.

### Verificação offline

```powershell
node --test test/*.smoke.mjs
```

Esta versão foi validada com testes de lógica, migração SQLite e sintaxe do JavaScript.
A execução ponta a ponta no Windows, a instalação integral das dependências npm e a
chamada real ao LLM configurado ainda precisam ser verificadas no ambiente do usuário.

## Gestão por escritório e portal de publicações

Após iniciar a aplicação e entrar, abra **Minha conta** (`/acesso`) e selecione um contexto. No contexto do escritório, administradores e operadores veem e preparam a fila de envios desse escritório; somente administradores podem aprovar/cancelar ou repreparar. A prévia, anexos e histórico são contextualizados. O administrador também configura SMTP, publica relatórios consolidados para uma empresa, revoga publicações e consulta/exporta auditoria. No contexto da empresa, o representante autenticado abre ou baixa os PDFs e pode registrar ciência. Os documentos publicados ficam no SQLite privado; links de notificação levam ao login e não substituem a autenticação.

Para habilitar SMTP por escritório, configure `CREDENTIALS_MASTER_KEY` conforme [.env.example](.env.example). Veja os limites de proxy, ciência e retenção em [Publicações e portal](docs/PUBLICACOES_E_PORTAL.md). Solicitações contextualizadas de monitoramento ainda não são executadas por um trabalhador próprio; confira o estado real da Sprint 4 em [Plano de sprints](docs/PLANO_SPRINTS.md).

### Banco local de desenvolvimento

PostgreSQL 18.6 pode ser iniciado localmente com Docker em `127.0.0.1:54329` usando `npm run db:up`; os dados ficam em volume persistente e a senha gerada fica no `.env.docker` ignorado pelo Git. O servidor da aplicação ainda usa SQLite até a migração dos repositórios da Sprint 6. Consulte [PostgreSQL local](docs/POSTGRESQL_LOCAL.md) antes de alterar os volumes.


## v0.3.10 — Redações clicáveis nas pendências

Na revisão de conflitos, clique no cartão **CCT original** para preservar a redação ou no cartão **Aditivo** para escolher o **trecho literal** do aditivo. Quando a IA apresentar uma sugestão aplicável, o texto sugerido também será selecionável. Para uma interpretação composta, escolha **Escrever redação personalizada**.

A seleção é apenas um rascunho: a aplicação exige justificativa, responsável e confirmação ao salvar. A opção do aditivo permanece disponível quando a sugestão da IA falha, mas o usuário deve confirmar ter conferido a íntegra dos instrumentos e suas condições. O texto armazenado é o trecho literal validado na extração (não uma paráfrase do modelo). Todas as escolhas geram auditoria no SQLite; nenhum documento é alterado.

