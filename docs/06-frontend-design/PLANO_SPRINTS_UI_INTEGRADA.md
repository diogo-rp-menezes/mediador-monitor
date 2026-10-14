# Plano de sprints — Vue operacional com o visual aprovado

Data-base: 11/10/2026. Atualizado em 14/10/2026: Sprints 00, 01, 02, 03, 04, 05 e 06 concluídas tecnicamente; S06-T01–T05, S07-T01, S07-T02 e S07-T04 concluídas; S07-T03 auditada e bloqueada por D06; Sprint 07 em andamento.

## 1. Objetivo e fontes de verdade

Aplicar o acabamento do protótipo ao frontend Vue operacional, completar os domínios pendentes e preservar autenticação, isolamento entre escritórios, permissões, auditoria e regras PostgreSQL. O resultado deve ser uma interface única, utilizável localmente, com dados reais das APIs e sem ações simuladas.

Referências:

- Visual: https://mediador-monitor-vue.gconta-diretoria.chatgpt.site — protótipo Vue, fonte local em `sites/mediador-monitor-vue`. Commit publicado de referência: `faabe4f5c8c5aaacb99c895c9e46e0d8292f3a16`.
- Implementação: `frontend/src`, transporte contextual existente e handlers operacionais PostgreSQL em `src`. Código e schemas vigentes prevalecem sobre os dados fictícios do protótipo.
- Cobertura: [UI_FUNCTIONAL_PARITY.md](UI_FUNCTIONAL_PARITY.md), [inventário de contratos](UI_FUNCTIONAL_SOURCE_INVENTORY.md), [baseline funcional](BASELINE_UI_INTEGRADA.md), [especificação visual](ESPECIFICACAO_VISUAL_UI_INTEGRADA.md) e [plano F01–F19](VUE_FINALIZATION_PLAN.md).
- Este plano organiza as próximas execuções. Não invalida entregas técnicas anteriores nem converte suas evidências em comprovação de cobertura nova.

### Decisões já tomadas

1. Vue 3 + TypeScript no frontend existente. Não substituir o projeto pelo aplicativo demonstrativo nem criar outra interface operacional.
2. Preservar componentes de domínio; extrair componentes menores apenas onde houver responsabilidade clara ou reutilização. Evitar um único componente com todas as telas.
3. Manter a área **Documentos**, com Instrumentos, Revisões, Publicações e Acessos/ciência. Não reduzir seu fluxo ao botão fictício de revisão de registro.
4. Catálogo sindical compartilhado pertence à Plataforma. Consultas/monitoramentos privados pertencem ao escritório; vínculos de enquadramento pertencem ao cliente.
5. Dados de negócio vêm da API. `localStorage` pode guardar preferências visuais; não guardar cadastros, permissões, aprovações ou filas como fonte operacional.
6. Relações por IDs; vínculos completos preservados. Validação CNPJ vigente, incluindo alfanumérico e dígitos verificadores. Exclusões sujeitas às restrições do backend.
7. Estados e ações são definidos pelo backend. Nenhum sucesso antes da resposta persistida; nenhum SMTP, scraper ou processamento IA executado diretamente no navegador.
8. Alvo desta fase: aplicação local. O protótipo privado já publicado continua como referência; este plano não inclui hospedar o sistema operacional nem publicar dados reais no Sites.

## 2. Protocolo de cada execução

Uma execução implementa **uma task**, com seu código, verificação e atualização documental. Não começar automaticamente a próxima task no mesmo pedido de execução unitária.

1. Ler este plano, a matriz e os arquivos do domínio. Conferir mudanças concorrentes, preservar alterações preexistentes e confirmar dependências.
2. Escolher a primeira task pendente cujas dependências estejam concluídas. Trabalhar na ordem das sprints; tarefas posteriores só antecipam quando explicitamente solicitado.
3. Registrar a task como `EM ANDAMENTO`, indicando a data e a base inspecionada. Conferir contrato, payload, permissões e estados reais antes de implementar.
4. Entregar o menor fluxo vertical completo previsto na task: tela, interação, persistência quando aplicável, erros e autorização. Um stub ou botão simulado não conclui a task.
5. Executar a validação indicada e registrar resultados reais. Para mudança só visual, priorizar inspeção de navegador e regressão existente; não criar testes que apenas repitam CSS ou markup.
6. Atualizar o status, evidências e matriz funcional. Atualizar F01–F19 quando a task concluir integralmente o item correspondente; não marcar um item amplo como concluído por um subfluxo.
7. Encerrar com entrega, endereço local de validação, verificações aprovadas/falhas, limitações e próxima task elegível.

### Estados e limite de tamanho

- `PENDENTE`, `EM ANDAMENTO`, `BLOQUEADA` e `CONCLUÍDA`.
- Task bloqueada exige causa concreta, evidência e condição de desbloqueio. Não implementar um contrato fictício para contorná-la.
- Se a inspeção revelar trabalho maior que uma execução, dividir **antes de ampliar o escopo** em IDs derivados, por exemplo `S05-T03a/b`, cada qual com entrega e aceite próprios. O item pai só conclui quando todos os derivados concluírem.
- Não usar porcentagens subjetivas nem estimativas fixas de horas. O tamanho é medido pelo fluxo verificável; duração de sprint depende das execuções necessárias.

### Definição comum de concluído

- Comportamento e aparência previstos entregues na aplicação operacional; nenhuma regressão funcional conhecida introduzida.
- Carregando, vazio, erro, indisponibilidade e sucesso representados quando aplicáveis. Botão ocupado impede repetição acidental.
- Papel e contexto respeitados no frontend e no servidor. Troca de contexto invalida respostas antigas, detalhes, seleção e polling do domínio.
- Mutação conferida após reabrir/recarregar. Conflitos de versão preservam a decisão do usuário e orientam atualização; não sobrescrever silenciosamente.
- Navegação de teclado, foco de modal e fechamento funcionam. Desktop em 1280/1440 px; mobile de apoio em 390 px, sem transbordamento da página. Tabelas podem rolar dentro de seu contêiner.
- Documentação e evidência atualizadas. Teste indisponível não equivale a aprovado; a task permanece bloqueada se esse teste for requisito do aceite.

### Estratégia de verificação

- **V**: navegador com UI servida localmente, verificando o comportamento e visual da task.
- **T**: `npm run typecheck` após alterações TypeScript/Vue.
- **B**: `npm run build` para validar o artefato de integração.
- **U**: testes unitários/HTTP existentes do domínio, ampliados apenas para regras novas ou lacunas materiais.
- **E**: jornada Vue de interação; `npm run test:vue-ui` fornece cobertura controlada, não prova persistência PostgreSQL.
- **P**: navegador + API + PostgreSQL descartável, com dados sintéticos e recarga/reabertura. Executar somente o cenário pertinente na task e a jornada completa no fechamento da sprint.
- **X**: coleta/IA/SMTP com fronteiras controladas e serviços locais. Não utilizar destinatários externos nem modelos pagos para testes desta fase.

T e V acompanham tasks de código frontend. U/E/P/X são exigidos onde constam nas tabelas. B acompanha fechamentos de sprint e mudanças de contrato/integração. Preparar cenários menores reutilizando a infraestrutura existente; não repetir a suíte completa a cada alteração de espaçamento.

## 3. Backlog por sprint

S00-T01, S00-T02, S00-T03, S01-T01–T04, S02-T01–T04 e S03-T01–T04 estão **CONCLUÍDAS**; demais tasks estão **PENDENTES**. A coluna Dep. contém IDs exatos; além dela, a sprint anterior deve estar encerrada, salvo antecipação expressa.

### Sprint 00 — Base rastreável e ambiente de validação

Resultado: contratos, referência visual e testes locais prontos para implementação incremental.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S00-T01 | Consolidar baseline funcional e matriz de divergências por tela; registrar o que existe, falta ou será refinado. | Matriz identifica APIs, schemas, permissões e responsáveis por cada domínio; separar backend disponível de UI funcional. Conferência estática, sem mutações operacionais. | — |
| S00-T02 | Definir especificação visual: cores semânticas, fontes, espaçamentos, bordas, estados, hierarquia e composição das telas. | Guia com desktop/mobile, claro/escuro e correspondência com componentes existentes; preservar identidade oficial e conteúdo funcional. Não copiar marca/perfil fictícios do protótipo. | S00-T01 |
| S00-T03 | Preparar fixture comum para duas empresas/escritórios, administrador/operador, suporte com concessão de leitura, cliente e administrador da plataforma. | Ambiente descartável inicializa, autentica, troca contexto e termina sem tocar dados operacionais. Registrar comandos e executar baseline T/B/E/P; falhas preexistentes explicitadas. | S00-T01 |

### Sprint 01 — Estrutura visual e navegação segura

Resultado: nova aparência aplicada à estrutura da aplicação, sem perda de contexto ou acesso.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S01-T01 | Aplicar tokens e aparência compartilhada de botões, campos, cartões, tabelas, badges, toast e modal. | Claro/escuro legíveis; componentes atuais continuam utilizáveis; validar telas reais existentes. T/V; sem mudanças de regra. | S00-T02, S00-T03 |
| S01-T02 | Refinar sidebar, topo, seletor de contexto e identificação da conta. | Recolhimento desktop, menu mobile, logout e término de concessão preservados; áreas visíveis por papel/contexto; sem dados fictícios. T/E/P/V. | S01-T01 |
| S01-T03 | Implementar navegação direta com hash das áreas atuais, voltar/avançar e fallback autorizado. | Link/reload restaura área permitida; contexto continua validado no servidor; área proibida retorna à visão geral; troca de contexto limpa estado de tela. T/E/P/V. | S01-T02 |
| S01-T04 | Entregar Minha conta com nome/perfil via contrato atual. | Nome persiste após nova consulta de sessão; e-mail editável apenas se a API permitir; logout/expiração preservados. Recuperação/senha mantêm o fluxo existente. T/P/V. | S01-T02 |

### Sprint 02 — Cadastros completos com o novo acabamento

Resultado: clientes, contatos e consultas sindicais visualmente refinados e funcionalmente equivalentes.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S02-T01 | Refinar listas de clientes/contatos, filtros, ações e ficha; preservar CRUD existente. | Busca, ativo/inativo, ficha, edição e exclusão recusada com histórico; suporte sem mutação. T/E/P/V. | S01-T03 |
| S02-T02 | Refinar editor de cliente e consulta CNPJ com campos completos. | Consulta exige aceite para aplicar; formato alfanumérico/schema vigente; dados cadastrais persistem; resposta antiga descartada; erro não apaga formulário. T/U/P/V. | S02-T01 |
| S02-T03 | Refinar vínculos de contatos e sindicatos no cliente. | IDs e função/recebimento/tipos/categoria/localidade/principal/confirmação persistem; não vinculados não sobrescrevem valores; impedir dois principais. T/U/P/V. | S02-T02 |
| S02-T04 | Refinar consultas sindicais privadas, distinguindo-as do catálogo compartilhado. | Filtros CNPJ/categoria/UF/título/vigência/tipos; configuração vinculada ao escritório; exclusão com vínculo recusada; catálogo não alterado pelo escritório. T/U/P/V. | S02-T03 |

### Sprint 03 — Documentos, análise e revisão sem simplificações

Resultado: fluxo documental existente recebe o visual aprovado e validação real das decisões.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S03-T01 | Refinar catálogo de instrumentos, filtros/ordenação e ficha com original e clientes relacionados. | Original autenticado, ausência do arquivo e falha de download visíveis; contexto trocado invalida download/detalhe. T/E/P/V. | S02-T04 |
| S03-T02 | Refinar leitura da análise estruturada e evidências. | Campos ausentes diferenciados de valores existentes; citações preservadas; formatos suportados pelo componente atual; reanálise encaminhada à Plataforma autorizada. T/U/E/V. | S03-T01 |
| S03-T03 | Refinar vínculo/rejeição de aditivos com justificativa e controle de concorrência. | Base/aditivo corretos, edição por papel, conflito 409 sem sobrescrita; salvar/reabrir PostgreSQL. T/U/P/V. | S03-T01 |
| S03-T04 | Refinar consolidação e revisão por campo. | Manter/aplicar/manual, justificativa e versão; impedir revisão desatualizada; decisões persistem e liberam somente pendências efetivamente resolvidas. T/U/P/V. | S03-T02, S03-T03 |
| S03-T05 | Refinar relatórios finais, publicações e auditoria. | PDF/MD por cliente; pendência/versão antiga bloqueia publicação; publicação preserva versão; revogação confirmada; auditoria/CSV e isolamento preservados. T/P/V, com jornada real de criar e revogar. | S03-T04 |

### Sprint 04 — Documentos aplicáveis a cada cliente

Resultado: completar a lacuna operacional da ficha do cliente, sem confundir enquadramento com envio.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S04-T01 | Implementar lista contextual de documentos do cliente com filtros de aplicabilidade. | Candidato/confirmado/rejeitado, motivos e versão atual exibidos; originais acessíveis conforme permissão; cliente de outro escritório recusado. T/U/P/V. | S03-T05 |
| S04-T02 | Implementar confirmar/rejeitar aplicabilidade em modal. | Motivo, responsável/justificativa conforme contrato; conflito de contexto/versão exige nova conferência; decisão persiste após reabrir. T/U/P/V. | S04-T01 |
| S04-T03 | Implementar inclusão histórica e controle de participação no envio. | Documento anterior só incluído por ação explícita prevista no backend; decisão e inclusão não aprovam e-mail implicitamente. T/U/P/V. | S04-T02 |
| S04-T04 | Implementar preparação de envios a partir da ficha do cliente. | API respeita aplicabilidade, contatos/tipos e modo de envio; preparação repetida não duplica indevidamente; mostrar resultado real e encaminhar à fila. T/U/P/X/V. | S04-T03 |

### Sprint 05 — Monitoramento operacional

Resultado: substituir o painel pendente por consultas, agendas e execuções reais.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S05-T01 | Implementar lista de execuções, detalhe e atualização cancelável. | Situação e histórico vindos da API; vazio/erro/reconexão; polling interrompe ao sair/trocar contexto e não aplica respostas obsoletas. T/U/P/V. | S04-T04 |
| S05-T02 | Implementar solicitação de coleta por consulta selecionada. | Validar papel/filtros; confirmar criação da execução pelo servidor; worker controlado registra resultado real; não inventar novos instrumentos. T/U/P/X/V. | S05-T01 |
| S05-T03 | Implementar agenda de intervalo/semanal, dias, hora e fuso. | Formulário preserva schema existente; salvar/reabrir e próxima execução consistente; ativação/inativação sem criar agendas duplicadas. T/U/P/V. | S05-T02 |
| S05-T04 | Implementar limites de coleta e cancelamento autorizado. | Limites persistem; ação aparece apenas nos estados aceitos; requisição de cancelamento não é mostrada como execução já encerrada. T/U/P/X/V. | S05-T02 |
| S05-T05 | Implementar recuperação de execuções interrompidas. | Justificativa e confirmação de consumidor encerrado; token/reserva antigos invalidados pelo backend; histórico auditado e ausência de duplicação. T/U/P/X/V. | S05-T03, S05-T04 |

### Sprint 06 — Envios com estados e proteção contra repetição

Resultado: fila real por destinatário/documento, com revisão verificável e recuperação explícita.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S06-T01 | Implementar resumo, tabela operacional e filtros da fila. | Estados reais preservados, incluindo bloqueado/preparando/revisão/fila/enviando/enviado/incerto/cancelado e falhas existentes; chips resumem sem ocultar estado individual. T/U/P/V. | S05-T05 |
| S06-T02 | Implementar detalhe de envio, prévia e anexos autenticados. | Conteúdo vem do snapshot do backend; anexos corretos por contexto; expiração/versão antiga indicadas; sem edição livre de conteúdo não suportada pela API. T/U/P/V. | S06-T01 |
| S06-T03 | Implementar aprovação e cancelamento por estado/papel. | Aprovação usa hash da prévia; mudança de contato/aplicabilidade recusa prévia antiga; cancelamento respeita processamento em curso; segunda submissão não duplica. T/U/P/V. | S06-T02 |
| S06-T04 | Implementar histórico de tentativas e repreparação. | Erro/data/resultado exibidos; repreparar limpa aprovação conforme backend; entrega incerta exige conferência e confirmação do risco. T/U/P/X/V. | S06-T03 |
| S06-T05 | Implementar recuperação/processamento autorizados e validar o ciclo de entrega. | Contratos distintos respeitados: recuperação de envios recebe idade e marca `incerto`; processamento usa fila aprovada; SMTP somente local de teste; anexos íntegros, uma entrega e segundo ciclo sem reenvio. T/U/P/X/V. | S06-T04 |

### Sprint 07 — Escritório, equipe e canais

Resultado: gestão contextual completa, com segredos mantidos no servidor.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S07-T01 | Implementar dados cadastrais do escritório com formulário próprio. | Campos do contrato vigente exibidos; nome persistido atualiza seletor/identificação; CNPJ somente leitura conforme a rota contextual; recusa de usuário sem permissão. T/U/P/V. | S06-T05 |
| S07-T02 | Implementar equipe, papéis e revogação de vínculos. | Listar funcionários e representantes; cadastrar ou vincular sem inventar convite; alterar papel/ativo; tratar conflito de último administrador e refletir vínculo revogado. T/U/P/V. | S07-T01 |
| S07-T03 | Implementar convites e acessos disponíveis no contrato vigente. | Criar/listar/revogar/redeem conforme capacidades reais; validade e escopo explícitos; entrega de convite em serviço local controlado, sem envio externo. Lacuna de endpoint registrada como bloqueio, não simulada. T/U/P/X/V. | S07-T02 |
| S07-T04 | Implementar SMTP/canais e testes de conexão existentes. | Configuração SMTP contextual persistida; segredo nunca reexibido; omitir campo preserva segredo; teste de conexão só é exposto quando houver endpoint autorizado, sem simulação. T/U/P/X/V. | S07-T01 |

### Sprint 08 — Administração da plataforma

Resultado: separar responsabilidades globais das operações do escritório.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S08-T01 | Implementar gestão global de escritórios. | CRUD/inativação conforme restrições; contextos disponíveis atualizados; acesso exclusivo ao administrador da plataforma e recusado por API aos demais. T/U/P/V. | S07-T04 |
| S08-T02 | Implementar catálogo compartilhado de sindicatos. | Cadastro global e validação CNPJ vigente; escritório apenas consulta/usa nas suas configurações; vínculo existente preservado nas alterações permitidas. T/U/P/V. | S08-T01 |
| S08-T03 | Implementar configuração/teste de IA. | Provedor/modelo/segredos e revisão otimista; teste por endpoint autorizado com provedor local controlado; segredo não aparece em logs/UI. T/U/P/X/V. | S08-T01 |
| S08-T04 | Implementar solicitações/reanálise, tentativas e recuperação IA. | Original e estados reais; justificativa/confirmadores exigidos; invalidar reserva anterior; nenhuma segunda conclusão indevida. T/U/P/X/V. | S08-T03 |
| S08-T05 | Implementar operação global de coleta e filas exposta pelos handlers atuais. | Distinção clara entre global e escritório; ações por estado; auditoria/permissões; workers controlados, sem acionar coleta remota ou SMTP externo. T/U/P/X/V. | S08-T02, S08-T04 |

### Sprint 09 — Visão geral, busca e portal

Resultado: conectar o acabamento visual às informações e atalhos reais do produto.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S09-T01 | Implementar dashboard bento contextual. | Contagens e pendências reais, últimos documentos e atalhos autorizados; escritório vazio correto; distinguir dado indisponível de zero; sem séries/gráficos inventados. T/U/P/V. | S08-T05 |
| S09-T02 | Implementar busca global contextual com Ctrl/Cmd+K. | Pesquisar clientes/contatos/consultas/documentos/envios já autorizados; filtros em memória apenas sobre dados retornados e limites explícitos; navega por ID; cancelar resposta antiga; sem API global indiscriminada. T/E/P/V. | S09-T01 |
| S09-T03 | Refinar portal da empresa com o mesmo sistema visual. | Somente publicações autorizadas; abrir/baixar PDF, ciência explícita, revogação e identidade/IP preservados; sem funções administrativas. T/P/V. | S09-T01 |

### Sprint 10 — Fechamento funcional e aceite visual

Resultado: comprovar a interface única e documentar sua operação sem exagerar a cobertura.

| ID | Entrega da execução | Aceite e verificação | Dep. |
| --- | --- | --- | --- |
| S10-T01 | Executar jornada integrada Vue completa com PostgreSQL descartável. | Cadastro/vínculos → consulta/coleta → análise → aditivo/consolidação/revisão → aplicabilidade → preparação/aprovação/SMTP local → publicação/portal/ciência; hashes, auditoria, isolamento e não duplicação conferidos. T/B/P/X. | S09-T02, S09-T03 |
| S10-T02 | Validar acessibilidade, temas, responsividade e falhas transversais. | Teclado/foco, menu móvel, contraste dos estados, sem transbordamento; sessão expirada, 403, conflito 409, rede e troca de contexto durante operações; registrar/corrigir apenas defeitos encontrados neste escopo. V/E/P. | S10-T01 |
| S10-T03 | Limpar referências históricas sem uso e atualizar documentação/testes. | Inventário mostra dependências antes da remoção; não remover ferramentas históricas ainda necessárias nem restaurar fallback; scripts ativos usam Vue; matriz/F05–F19 atualizados conforme provas. T/B/U/E/P. | S10-T02 |
| S10-T04 | Preparar pacote de aceite visual e roteiro de operação local. | Capturas desktop/mobile e claro/escuro, endereço local, cenários e limitações, instruções de reinício/validação; aplicação disponível para conferência. Registrar aceite humano somente quando o usuário o fornecer. | S10-T03 |

## 4. Contratos, estados e restrições de integração

### APIs e tipos

- Reutilizar `createApiTransport`, sessão/CSRF e headers de contexto existentes. Não substituir autenticação do produto pelo login do Sites.
- Cadastros: manter nomes canônicos e tipos dos schemas, `ativo` booleano e `modo_envio` enumerado; nomes apresentados ao usuário não viram chaves relacionais.
- Documentos: preservar número do registro, cliente autorizado, original, versão/hash, aplicabilidade e decisões. Análise, revisão, publicação, entrega e vigência são dimensões distintas.
- Monitoramento: consultas privadas, agenda, limites, execução, cancelamento e recuperação permanecem entidades/ações separadas.
- Envios: preservar snapshot/prévia, hash de aprovação, destinatário, tentativas e transições permitidas. Kanban é opcional posteriormente; a primeira entrega será tabela com resumo e detalhe para cobrir todos os estados.
- Plataforma: `/api/plataforma/*` não vira API contextual de escritório. Permissões sempre revalidadas no backend.
- Não há migração de banco prevista. Ajuste aditivo de contrato/backend só ocorre quando necessário para um aceite concreto, com task derivada, compatibilidade e teste HTTP explícitos antes da integração da tela.
- Contrato ausente, ambíguo ou incompatível deve ser resolvido pela inspeção do handler/schema e evidências. Se faltar capacidade no backend, registrar task derivada; não inventar endpoint ou payload na UI.

### Mudanças de contexto e concorrência

- Limpar detalhes, formulários e caches do contexto anterior; cancelar polling e rejeitar respostas atrasadas.
- Não atualizar sucesso/contagem com resultado de escritório anterior. Ao mudar contexto durante mutação, não apresentar a resposta no novo contexto; recarregar o estado autorizado quando retornar.
- Nas ações versionadas, guardar a versão consultada e enviar o token/hash exigido; 409 solicita reconferência.
- Falha/entrega incerta não equivale a falha segura para repetir; usar exclusivamente a recuperação prevista pelo backend.

### Dados e efeitos externos

- Fixtures usam banco, contas e arquivos descartáveis. Banco operacional, segredos e arquivos existentes não são material de teste.
- Integração real nesta fase significa Vue + backend + PostgreSQL reais, com scraper/modelo/SMTP controlados quando houver fronteira externa.
- Qualidade de análise com modelo externo, coleta remota real, destinatários externos, piloto operacional e hospedagem serão trabalhos separados. Não declarar esses resultados a partir de fixtures locais.

## 5. Rastreabilidade com F01–F19

| Plano anterior | Tasks deste plano |
| --- | --- |
| F01–F04 | Preservação/regressão em S01 e S09-T03; não reimplementar sem defeito comprovado. |
| F05–F07 | S04-T01–T04. |
| F08–F10 | S05-T01–T05. |
| F11–F12 | S06-T01–T05. |
| F13–F14 | S07-T01–T04. |
| F15–F16 | S08-T01–T05. |
| F17 | S01-T04 e S09-T01. |
| F18 | Verificações P de S02–S09 e jornada S10-T01; não adiar persistência de cada task para o final. |
| F19 | S10-T03. |

S00, acabamento compartilhado, busca, acessibilidade e aceite complementam a matriz anterior. S03 preserva funções já implementadas e fecha suas lacunas de evidência; não conta como desenvolvimento do zero.

## 6. Registro de execução e retomada

Preencher uma linha por execução. O status de uma task não muda por mera existência de tela ou aprovação do plano.

| Execução/data | Task | Estado | Entrega/arquivos | Verificações e evidências | Bloqueio ou próxima task |
| --- | --- | --- | --- | --- | --- |
| Planejamento — 11/10/2026 | — | PLANEJADO | Este plano | Base funcional inspecionada; typecheck aprovado na revisão anterior | Próxima: S00-T01 |
| Execução 01 — 11/10/2026 | S00-T01 | CONCLUÍDA | [Baseline funcional](BASELINE_UI_INTEGRADA.md), matriz reconciliada e lacunas D01–D10 | Inspeção estática de componentes/handlers/schemas; links locais e diff conferidos; sem mutações operacionais | Próxima: S00-T02 |
| Execução 02 — 11/10/2026 | S00-T02 | CONCLUÍDA | [Especificação visual](ESPECIFICACAO_VISUAL_UI_INTEGRADA.md) com tokens, componentes, composição, responsividade e acessibilidade | Referência e CSS operacional comparados; links locais e diff conferidos; sem alteração executável | Próxima: S00-T03 |
| Execução 03 — 11/10/2026 | S00-T03 | CONCLUÍDA | Fixture compartilhada `test/ui-integrated-fixture.mjs`, integração ao runner HTTPS e [guia de validação](AMBIENTE_VALIDACAO_UI_INTEGRADA.md) | T/B/E/P aprovados: typecheck, Vue controlado e PostgreSQL/HTTPS/Chromium real; login, papéis, troca/recarga, isolamento, concessões e portal | Sprint 00 encerrada tecnicamente; próxima: S01-T01 |
| Execução 04 — 12/10/2026 | S01-T01 | CONCLUÍDA | [Entrega visual e evidências](ENTREGA_S01_T01.md), tokens/CSS comuns, tema inicial e variantes de ações | Typecheck, build, Vue controlado e PostgreSQL/HTTPS aprovados; 12 capturas claro/escuro em 1440/390 px; contraste textual conferido | Próxima: S01-T02 |
| Execução 05 — 12/10/2026 | S01-T02 | CONCLUÍDA | [Entrega e evidências](ENTREGA_S01_T02.md): sidebar, topo/contexto/conta, menu móvel nativo e encerramento de suporte | Typecheck, build, Vue controlado e PostgreSQL/HTTPS aprovados; foco/resize, recolhimento persistido, permissões, falhas/retry e revogação real; 16 capturas | Próxima: S01-T03 |

| Execução 06 — 12/10/2026 | S01-T03 | CONCLUÍDA | [Entrega e evidências](ENTREGA_S01_T03.md): hash das áreas, histórico e fallback autorizado | T/E/P/V e build aprovados; links/recarga, voltar/avançar, papéis, portal, troca com limpeza de filtro e contexto atual preservado no histórico; 16 capturas | Próxima: S01-T04 |

| Execução 07 — 12/10/2026 | S01-T04 | CONCLUÍDA | [Minha conta e evidências](ENTREGA_S01_T04.md): atualização real do nome, e-mail somente leitura e identidade sincronizada | T/B/E/P/V aprovados; persistência por sessão/recarga nos quatro perfis, falha/retry, CSRF, envio ocupado e expiração; 4 capturas da conta e 16 de regressão | Sprint 01 encerrada tecnicamente; próxima: S02-T01 |

| Execução 08 — 12/10/2026 | S02-T01 | CONCLUÍDA | [Listas e ficha](ENTREGA_S02_T01.md): cabeçalhos/ação principal, contagem, limpeza de filtros, busca CNPJ e identidade da ficha | T/E/P/V e build aprovados; CRUD de contato com recarga, cliente inativado/restaurado, exclusão com histórico recusada, suporte somente leitura e isolamento; 28 capturas | Próxima: S02-T02 |

| Execução 09 — 12/10/2026 | S02-T02 | CONCLUÍDA | [Editor e consulta CNPJ](ENTREGA_S02_T02.md): campos responsivos, bloqueio durante salvamento e confirmação da consulta | T/U/E/P/V e build aprovados; 44 testes, resposta antiga/divergente descartada, erro preserva rascunho, campos/metadados e CNPJ numérico/alfanumérico persistidos com recarga; 32 capturas | Próxima: S02-T03 |

| Execução 10 — 12/10/2026 | S02-T03 | CONCLUÍDA | [Vínculos de cliente](ENTREGA_S02_T03.md): identificação, orientação, contagem e campos de vínculo refinados | T/U/E/P/V e build aprovados; 50 testes, IDs/preferências/enquadramento persistidos, único principal, edição independente e desvinculação; 40 capturas | Próxima: S02-T04 |

| Execução 11 — 12/10/2026 | S02-T04 | CONCLUÍDA | [Consultas sindicais](ENTREGA_S02_T04.md): escopo privado, ação principal, busca, contagem e estados | T/U/E/P/V e build aprovados; 23 testes, filtros/tipos/inativação persistidos, exclusão com vínculo recusada, isolamento A/B e catálogo inalterado; 48 capturas | Sprint 02 encerrada tecnicamente; próxima: S03-T01 |

| Execução 12 — 12/10/2026 | S03-T01 | CONCLUÍDA | [Catálogo e originais](ENTREGA_S03_T01.md): filtros por cliente/original, contagem, limpeza, estados e invalidação de download | Typecheck, build, E2E Vue e PostgreSQL/HTTPS aprovados; original autenticado íntegro, erros visíveis, isolamento e respostas atrasadas descartadas; 56 capturas | Próxima: S03-T02 |

| Execução 13 — 12/10/2026 | S03-T02 | CONCLUÍDA | [Análise e evidências](ENTREGA_S03_T02.md): ausências, tópicos antigos/aditivos, citações e navegação autorizada à Plataforma | T/U/E/P/V e build aprovados; 10 testes, cinco formatos conferidos, dados/citações PostgreSQL preservados; 64 capturas | Próxima: S03-T03 |

| Execução 14 — 12/10/2026 | S03-T03 | CONCLUÍDA | [Decisões de aditivos](ENTREGA_S03_T03.md): decisão registrada/proposta, revisão e atualização após conflito sem perder rascunho | T/U/E/P/V e build aprovados; sete testes, vínculo/remoção/reabertura e 409 reais, tipos/escopo/papéis conferidos; 72 capturas | Próxima: S03-T04 |

| Execução 15 — 12/10/2026 | S03-T04 | CONCLUÍDA | [Consolidação e revisão](ENTREGA_S03_T04.md): regras anterior/atual/extraída, decisões e bloqueio de versão antiga | T/U/E/P/V e build aprovados; quatro testes, decisões reais manter/aplicar/manual, pendências 3→2→1→0, quatro versões, recarga e conflito sem sobrescrita; 84 capturas | Próxima: S03-T05, incluindo contrato PDF interno D01 |

| Execução 16 — 12/10/2026 | S03-T05 | CONCLUÍDA | [Relatórios, publicações e auditoria](ENTREGA_S03_T05.md): PDF interno D01, versão conferida e revogação | T/U/E/P/V e build aprovados; oito testes, PDF/MD reais, criação/revogação Vue, bloqueios 409, snapshot imutável e auditoria/CSV isolados; 96 capturas | Próxima: S04-T01 |

| Execução 17 — 12/10/2026 | S04-T01 | CONCLUÍDA | [Documentos do cliente](ENTREGA_S04_T01.md): lista contextual, aplicabilidade, motivos, versão e originais | T/U/E/P/V e build aprovados; sete testes, estados/filtros, integridade/ausência, desatualização, falha/retry, recarga/reabertura e isolamento reais; 104 capturas | Próxima: S04-T02 |

| Execução 18 — 12/10/2026 | S04-T02 | CONCLUÍDA | [Decisão de aplicabilidade](ENTREGA_S04_T02.md): modal, justificativa e responsável autenticado, conflito com nova conferência | T/U/E/P/V e build aprovados; sete testes, confirmar/rejeitar reais, auditoria/ator, cancelamento, 409 sem sobrescrita, atualização falha/retry, recarga e suporte sem escrita; 112 capturas | Próxima: S04-T03, incluindo contrato D03 |

| Execução 19 — 12/10/2026 | S04-T03 | CONCLUÍDA | [Inclusão histórica e participação](ENTREGA_S04_T03.md): D03 resolvida, contrato independente versionado/auditado, inclusão/exclusão explícitas | T/U/E/P/V e build aprovados; sete testes, Vue/HTTPS reais, histórico/recarga, 409, recálculo preserva exclusão e fila inalterada; regressão PostgreSQL/SMTP TLS local aprovada; 120 capturas | Próxima: S04-T04 |

| Execução 20 — 12/10/2026 | S04-T04 | CONCLUÍDA | [Preparo pela ficha do cliente](ENTREGA_S04_T04.md): confirmação, resultado real e consulta contextual à fila | T/U/E/P/X/V e build aprovados; 13 testes, candidato/exclusão, contatos/tipos, revisão no modo automático, retry, repetição sem duplicação, fila persistida e isolamento; PostgreSQL/SMTP TLS local aprovado; 128 capturas | Próxima: S05-T01 |

| Execução 21 — 12/10/2026 | S05-T01 | CONCLUÍDA | [Execuções de monitoramento](ENTREGA_S05_T01.md): lista, detalhe e atualização cancelável | T/U/P/V e build aprovados; sete testes, ciclos/reconexão/abort/respostas atrasadas, cinco estados reais, recarga e isolamento A/B; 136 capturas | Próxima: S05-T02 |

| Execução 22 — 12/10/2026 | S05-T02 | CONCLUÍDA | [Solicitação de coleta](ENTREGA_S05_T02.md): consulta, filtros, confirmação e criação auditada | T/U/P/X/V e build aprovados; 39 testes, três perfis autorizados/suporte 403, 202/ator/auditoria, duplicação/inativa/isolamento, worker com resultado vazio persistido sem novos instrumentos; 140 capturas | Próxima: S05-T03 |

| Execução 23 — 12/10/2026 | S05-T03 | CONCLUÍDA | [Agendas de coleta](ENTREGA_S05_T03.md): intervalo/semanal, dias, horário, fuso e previsão de calendário | T/U/P/V e build aprovados; 25 testes, persistência/reabertura/recarga, retry, papéis, scheduler real nos dois modos sem duplicação, inativação e isolamento; 148 capturas | Próxima: S05-T04 |

| Execução 24 — 12/10/2026 | S05-T04 | CONCLUÍDA | [Limites e cancelamento](ENTREGA_S05_T04.md): configuração/herança/teto/efetivo e pedido autorizado | T/U/P/X/V e build aprovados; 29 testes, persistência/recarga, RBAC, retry, reserva real com limites, cancelamento em fila e durante execução, conflito/isolamento/auditoria; 140 capturas | Próxima: S05-T05 |

| Execução 25 — 12/10/2026 | S05-T05 | CONCLUÍDA | [Recuperação de execuções](ENTREGA_S05_T05.md): justificativa, confirmação de consumidor encerrado e reserva invalidada | T/U/P/X/V e build aprovados; 33 testes, formulário/CSRF/busy/resposta antiga, exclusividade real, token invalidado, auditoria, conflito/isolamento e ausência de duplicação; 148 capturas | Sprint 05 encerrada tecnicamente; próxima: S06-T01 |

| Execução 26 — 12/10/2026 | S06-T01 | CONCLUÍDA | [Fila operacional de envios](ENTREGA_S06_T01.md): resumo, tabela, estados e filtros contextuais | T/U/P/V e build aprovados; fila limitada pelo backend a 500 itens, nove estados, retry com dados preservados, recarga e isolamento A/B comprovados para administrador, operador, suporte e plataforma; 4 capturas novas | Próxima: S06-T02 |

| Execução 27 — 12/10/2026 | S06-T02 | CONCLUÍDA | [Detalhe, prévia e anexos](ENTREGA_S06_T02.md): snapshot sanitizado, indicação de versão e download autenticado | T/U/P/V e build aprovados; prévia ausente e divergente sinalizadas, anexo baixado por rota contextual, recusa em outro escritório, recarga e quatro papéis comprovados; 4 capturas novas | Próxima: S06-T03 |

| Execução 28 — 12/10/2026 | S06-T03 | CONCLUÍDA | [Aprovação e cancelamento](ENTREGA_S06_T03.md): confirmação explícita por estado e papel | T/U/P/V e build aprovados; hash da prévia, CSRF, estado, confirmação, botão ocupado, fila contextual e isolamento nos quatro papéis validados; autorização definitiva permanece no backend | Próxima: S06-T04 |

| Execução 29 — 13/10/2026 | S06-T04 | CONCLUÍDA | [Histórico e repreparação](ENTREGA_S06_T04.md): tentativas imutáveis, erro/data/resultado e confirmação de risco | T/U/P/X/V e build aprovados; endpoint contextual de tentativas, repreparação com aprovação limpa, confirmação de entrega incerta, atualização após resposta e isolamento/regressões PostgreSQL/HTTPS | Próxima: S06-T05 |

| Execução 30 — 13/10/2026 | S06-T05 | CONCLUÍDA | [Recuperação e processamento da fila](ENTREGA_S06_T05.md): operações autorizadas, janela de recuperação e ciclo único de entrega | T/U/P/X/V e build aprovados; confirmação/modal, payloads `{}` e `mais_antigo_que_segundos`, recuperação sem reenvio, SMTP local, anexos íntegros, processamento idempotente na segunda execução e isolamento dos papéis | Próxima: S07-T01 |
| Execução 31 — 13/10/2026 | S07-T01 | CONCLUÍDA | [Dados cadastrais do escritório](ENTREGA_S07_T01.md): formulário contextual, persistência e atualização do seletor | T/U/P/V e build aprovados; GET/PUT contextual, CSRF, retry/rascunho, nome refletido no seletor após salvar e recarga, CNPJ somente leitura e área restrita ao administrador | Próxima: S07-T02 |
| Execução 32 — 13/10/2026 | S07-T02 | CONCLUÍDA | [Equipe, papéis e vínculos](ENTREGA_S07_T02.md): lista, cadastro/vínculo, alteração de papel e revogação | Typecheck, build, E2E Vue e PostgreSQL/HTTPS aprovados; resposta agrupada normalizada, CSRF, papel/ativo, representantes, erro de último administrador e recarga sem convite fictício | Próxima: S07-T03 |
| Execução 33 — 14/10/2026 | S07-T03 | BLOQUEADA | [Convites e acessos](ENTREGA_S07_T03.md): auditoria do contrato e registro da lacuna D06 | Não há endpoint/schema de convite, token, validade ou resgate; cadastro/vínculo de usuários não é convite. Nenhuma UI ou simulação foi criada | Próxima: S07-T04; contrato de convites derivado antes de reabrir S07-T03 |
| Execução 34 — 14/10/2026 | S07-T04 | CONCLUÍDA | [SMTP e canais](ENTREGA_S07_T04.md): configuração contextual, segredo preservado e limitação D07 explícita | Typecheck, build e E2E Vue aprovados; GET/PUT contextual, CSRF, senha não reexibida, omissão preserva credencial e troca de contexto isolada; teste de conexão não simulado | Próxima: S08-T01; D06 permanece bloqueio de convites |

Modelo de evidência: comandos com resultado, cenário testado, URL local, caminho de captura/relatório quando gerado e limitações. Não incluir segredos ou dados pessoais reais.

### Pedido sugerido para executar uma task

> Execute a próxima task elegível de `docs/06-frontend-design/PLANO_SPRINTS_UI_INTEGRADA.md`. Faça apenas essa task, preserve mudanças existentes, cumpra os critérios e atualize seu registro de execução. Informe a entrega, a validação e a próxima task.

### Fechamento das sprints

Uma sprint termina quando todas as suas tasks e derivadas estão concluídas tecnicamente, B passou e há evidência de navegador do fluxo entregue. Avaliação visual humana é registrada separadamente: entrega técnica não presume aceite do usuário. Defeitos descobertos viram tasks de correção com vínculo ao cenário e prioridade, mantendo o histórico.

## 7. Critério de término do plano

- Domínios operacionais aprovados disponíveis na única UI Vue; painéis pendentes removidos apenas depois da substituição funcional comprovada.
- Contratos, campos, vínculos, permissões, contexto, decisões versionadas, auditoria e recuperações preservados.
- Fluxos essenciais aprovados em navegador/PostgreSQL descartável, sem envios externos; suíte pertinente e build aprovados.
- Visual coerente com a referência em claro/escuro, desktop/mobile de apoio; roteiro e evidências entregues ao usuário.
- Lacunas e validações externas futuras explicitadas. Aceite visual humano registrado quando recebido; nuvem não faz parte deste encerramento.

## Lacunas confirmadas na S00-T01

O [baseline funcional](BASELINE_UI_INTEGRADA.md) registra D01–D10. D01/PDF interno foi resolvida na S03-T05. D03/inclusão histórica independente foi resolvida na S04-T03. S07-T03 (convites) permanece bloqueada por D06; S07-T04 entregou a configuração SMTP disponível e mantém o teste de conexão pendente de D07; S06-T04 (histórico detalhado) e S08-T05 (operação global) exigem resolver seus contratos ausentes antes de concluir os aceites. Dividir backend e UI em tasks derivadas quando necessário; não tratar essas entregas como migração apenas visual. A recuperação de envios tem payload distinto da recuperação de monitoramento (D05).
