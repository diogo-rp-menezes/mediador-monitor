# Auditoria do MVP local para validação em DEV

Data: 11/10/2026. Versão declarada: 0.4.1.

## Parecer

Apto para iniciar validação funcional e visual local em DEV, com as limitações abaixo. Não foi confirmado, nesta revisão, um bloqueador técnico que impeça esse uso. Isso não representa aceite do produto nem certificação para distribuição ou exposição pública.

Este parecer substitui a priorização do PRODUCTION_AUDIT_mediador-monitor.md para o escopo atual. O relatório anterior permanece histórico: mistura runtime e código SQLite histórico, contém inferências não verificadas e afirma ausências contraditas pelo código e pelos testes existentes.

## Escopo e método

- Uma máquina Windows, dados de teste, PostgreSQL em Docker e aplicação no Windows.
- PostgreSQL é o único banco operacional. SQLite e UI antiga não integram o build operacional; fontes e ferramentas históricas continuam no repositório e nas dependências de desenvolvimento.
- Distribuição, domínio, nuvem, múltiplas instâncias e alta disponibilidade ficam fora do aceite atual.
- Revisão dirigida de servidor, autenticação, segredos, IP/proxy, coleta, configuração Docker, scripts, plano de consolidação e evidências de testes.
- Sem envio de mensagens reais, chamadas reais de IA/MTE nesta revisão, alteração de credenciais ou alteração da implementação.
- Não houve teste de carga, SCA/SBOM, pentest completo, inspeção de todos os registros armazenados ou aceite visual humano.

## Evidências e limites

| Área | Evidência | Limite |
| --- | --- | --- |
| Compilação | npm run typecheck aprovado nesta revisão | Não prova comportamento funcional |
| Ambiente | local:verificar aprovado: 15 migrações, papel restrito, 6/6 tabelas privadas com RLS, conta administrativa e Chromium | Formato da chave conferido; custódia não conferida pelo preflight |
| UI | workspace-navigation, cliente-vinculos-ui, cliente-cnpj-ui e resumo-ui aprovados nesta revisão | Automação não substitui avaliação de usabilidade; alguns testes usam respostas controladas |
| Proteções | 33 testes em seis arquivos aprovados na revisão precedente desta mesma auditoria: SMTP, CNPJ, IP, locks, auth HTTP e grafo runtime | Nem todos são integrações com banco real |
| Jornada | PostgreSQL HTTPS/Chromium aprovado na consolidação C01–C09 | Evidência anterior, não reexecutada nesta revisão; integrações controladas |
| Docker | Imagem sem driver/cron/UI legados; PDF, login, dois escritórios e sessão após restart aprovados no fechamento C08 | Dados isolados; documentos atuais com caminhos Windows não foram transferidos para Linux |
| Recuperação | Recuperação limpa e remapeada aprovadas no fechamento C09, com arquivos, banco e retomada controlada | Ensaio automatizado não equivale à custódia efetiva de um backup operacional fora da máquina |

## Achados para DEV local

### DEV-01 — Aceite visual e funcional com os dados atuais ainda aberto

Prioridade: alta para validar o produto; não é vulnerabilidade demonstrada.

A conferência técnica C07 e testes de UI não equivalem à aprovação humana de todas as telas. Validar o layout aprovado em desktop e tela estreita, navegação, campos necessários dos CRUDs, modais, toasts e estados vazios. Conferir especialmente o comportamento ao trocar entre um escritório com dados e outro vazio, inclusive com duas abas.

Aceite: roteiro abaixo executado e resultado registrado por cenário; correções de uso concluídas ou explicitamente adiadas.

### DEV-02 — Integrações reais ainda exigem ensaio local

Prioridade: alta para completude funcional.

As jornadas controladas comprovam contratos e persistência, mas não comprovam seletores atuais do MTE, disponibilidade do provedor IA escolhido ou entrega na caixa de e-mail real. Workers são processos explícitos; a interface não os inicia automaticamente. Sem consumidor, uma solicitação pode continuar na fila sem representar defeito de isolamento ou persistência.

Aceite: executar uma coleta pequena; analisar um documento com o provedor configurado; revisar/publicar; aprovar e entregar uma mensagem a destinatário de teste; conferir abertura/download/ciência no portal e auditoria. Registrar falhas e evitar repetir automaticamente envios de resultado incerto.

### DEV-03 — Diagnóstico HTTP insuficiente

Prioridade: média; melhoria útil antes de ampliar os ensaios.

src/server.ts responde corretamente com erro genérico, mas registra falhas internas sem causa ou correlação. Isso dificulta investigar problemas durante DEV.

Aceite proposto: identificador de requisição consistente e diagnóstico sanitizado com método, caminho sem query sensível e causa categorizada. Não registrar tokens, cookies, senhas, chaves ou corpos de documentos. Não imprimir stack/message indiscriminadamente, pois erros de integrações podem conter conteúdo sensível.

### DEV-04 — Suíte de aceite operacional dispersa

Prioridade: média.

Existem testes unitários, navegador e integrações em scripts distintos. npm test sozinho não executa toda a jornada operacional. Os testes históricos também precisam ser distinguidos dos gates atuais.

Aceite proposto: um comando de validação DEV, com etapas sequenciais e interrupção na primeira falha, para build, testes operacionais selecionados, preflight e jornada PostgreSQL. Recuperação e Docker podem permanecer em uma validação ampliada por serem mais custosos. CI pode consumir esses mesmos comandos posteriormente.

### DEV-05 — Caminhos de arquivos limitam a forma atual de execução

Prioridade: média; restrição conhecida, com caminho suportado.

Os documentos importados usam caminhos Windows. Executar a imagem Linux contra o banco atual sem remapear arquivos pode impedir downloads/relatórios. A imagem foi validada com dados isolados.

Aceite atual: executar aplicação no Windows e PostgreSQL no Docker. Containerizar a aplicação com o conjunto atual exige migração/remapeamento e validação de arquivos; isso não bloqueia o MVP local nessa configuração.

### DEV-06 — Documentação histórica pode confundir a operação

Prioridade: baixa.

Alguns documentos acumulam notas antigas de migração/UI pendentes. O plano de consolidação e README atual devem prevalecer. Não repetir bootstrap/importação por seguir uma nota histórica.

Aceite proposto: destacar documentos vigentes, marcar instruções superadas e manter os comandos históricos fora do roteiro de uso diário.

## Correções ao relatório anterior

| Alegação | Resultado |
| --- | --- |
| SMTP em texto plano | Refutada no caminho operacional: postgres-smtp.ts cifra com AES-256-GCM antes de gravar |
| IA PostgreSQL em texto plano | Refutada: postgres-ia-settings.ts usa envelope AES-256-GCM com dados associados; ajustes importados também têm envelope |
| Sem proteção contra força bruta | Refutada como afirmação geral: postgres-autenticacao.ts limita login por conta e IP; rate limit HTTP abrangente continua sendo evolução |
| Lock órfão até reiniciar PostgreSQL | Incorreta: advisory locks de sessão terminam com a sessão; código libera/destrói conexões incertas. Sessão travada e falha de rede são cenários distintos |
| Sem E2E/integração | Refutada pelos scripts e jornadas PostgreSQL, HTTPS, SMTP, Docker e recuperação |
| CNPJ sem timeout | Refutada: timeout de 12 s, cache limitado e deduplicação |
| Docker sem USER/HEALTHCHECK | Refutada: ambos presentes. Endpoints dedicados de readiness/liveness ainda não existem |
| Dois bancos operacionais | Desatualizada: SQLite histórico fora do runtime/build operacional |
| CSRF vazio permite ataque | Exploração não demonstrada: rotas protegidas exigem sessão válida |
| HTTP externo permitido | Refutada: origem HTTP externa é recusada; localhost é exceção local explícita |
| N+1 na lista de escritórios | Há subconsultas correlacionadas em uma consulta; gargalo não medido, otimizar somente com evidência |
| Documentos grandes falham silenciosamente | Limite real de 150 mil caracteres, mas erro explícito. Chunking é evolução se necessário no corpus de validação |
| Browser sem fechamento | Não demonstrado: coleta PostgreSQL fecha sessão em finally; ausência de pool não prova vazamento |

Criptografia implementada não substitui proteção/custódia da chave mestra e das cópias históricas. A revisão do código não comprova o conteúdo de todas as linhas do banco.

## Roteiro de aceite local

1. Iniciar PostgreSQL, build, preflight e aplicação pelos comandos do README; acessar a UI atual, não o arquivo estático do mockup.
2. Entrar como administrador, membro de escritório e representante de empresa; conferir navegação e ações disponíveis.
3. Alternar escritórios com dados distintos e duas abas; nenhum dado ou resposta atrasada pode permanecer no contexto errado.
4. Criar, editar e reabrir cliente, contato e consulta privada, incluindo preferências de contato, sindicato principal, CNPJ e situações inativas.
5. Executar coleta pequena, download e análise; conferir erro legível e possibilidade de recuperação quando houver falha.
6. Consolidar/revisar/publicar; conteúdo pendente não pode ser disponibilizado indevidamente.
7. Enviar a destinatário de teste com aprovação explícita; conferir anexos e impedir repetição cega após resultado incerto.
8. Abrir/baixar documento e registrar ciência com usuário de empresa; conferir ator, horário e IP na auditoria. Abertura registrada comprova acesso, não leitura humana integral.
9. Reiniciar a aplicação e conferir contexto, dados e filas; conferir a recuperação pelos ensaios existentes quando houver mudança de persistência/arquivos.
10. Registrar aceite visual do layout, estados vazios, modais e feedback rápido; listar problemas observados com passos reproduzíveis.

## Adiado até distribuição ou nuvem

- Topologia de proxy TLS, domínio, exposição de portas e cabeçalhos na infraestrutura real.
- Rate limiting abrangente e limites de capacidade por ambiente, carga/concorrência representativas.
- Observabilidade centralizada, métricas, alertas e readiness/liveness conforme o modelo de implantação.
- CI de publicação, análise de dependências/imagem, atualização e empacotamento distribuível.
- Backups externos com custódia, retenção e recuperação verificadas para o ambiente de destino.
- Estratégia para múltiplos processos/hosts, armazenamento compartilhado e supervisão dos workers.

Redis/SQS, microserviço de scraper, materialized views e OpenTelemetry não são requisitos obrigatórios do MVP local. O controller concentrado é dívida de manutenção; refatorar quando necessário com testes, sem classificá-lo como incidente crítico por tamanho.

## Decisão

Prosseguir com validação DEV local. Priorizar DEV-01/02 e facilitar diagnóstico/repetição com DEV-03/04. A decisão de distribuir ou publicar exige nova auditoria do ambiente e dos resultados de aceite; não é autorizada por este parecer.
