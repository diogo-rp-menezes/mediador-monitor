# Conferência da interface — 11/10/2026

Comparação do painel global (`web/index.html`) com a área contextual (`web/acesso.html` e módulos). A existência de uma função no legado não significa que ela esteja disponível no modo PostgreSQL.

| Recurso | Destino atual | Situação |
| --- | --- | --- |
| Indicadores | Visão geral | Contadores reais por escritório e até cinco execuções recentes, com situação e acesso ao histórico |
| Clientes e contatos | Cadastros | Campos, vínculos, situações e modo de envio preservados; tabelas com busca e edição em modal |
| Sindicatos e consultas | Cadastros / Administração da plataforma | Catálogo compartilhado com criação, edição e inativação em modal no PostgreSQL; CNPJ opcional validado e normalizado, permissão administrativa, CSRF e auditoria. Filtros permanecem privados por escritório |
| Execuções | Monitoramento | Indicadores da lista, solicitação e histórico priorizados; agendas/limites em grade e modais, erros persistentes e sucessos por toast |
| Agenda global cron/fuso | Monitoramento | Intervalo ou dias da semana, horário e fuso IANA em modal. Uma solicitação por data local; concorrência e pausa revalidadas. Expressões cron arbitrárias continuam exclusivas do legado |
| Instrumentos | Documentos e revisões | Lista selecionável com detalhe lateral, filtros e download; informações principais e análise em navegação própria |
| Análise e consolidação | Documentos e revisões | Detalhe apresenta extração disponível de qualquer tipo. Área de consolidações/revisões separada dentro de Documentos; seleção de CCT, regras expansíveis, decisões e relatórios preservados |
| Publicação e ciência | Documentos e revisões / portal | Área Publicações e acessos com tabelas de publicações e auditoria; criação em modal, download, ciência, revogação e auditoria CSV |
| Envios | Envios | Cartões com empresa, destinatário e badge de situação; prévia, revisão, aprovação, cancelamento e tentativas preservados; filtros e indicadores da lista |
| SMTP | Gestão do escritório | Configuração por escritório em modal; credencial preservada quando omitida |
| IA | Administração da plataforma | Configuração em modal, solicitações, recuperação e teste explícito da conexão salva, inclusive inativa. Versão, CSRF, permissão administrativa e auditoria; timeout de 15 segundos e mensagens sem conteúdo do provedor. URL/modelo livres atendem provedores compatíveis; atalhos são melhoria opcional |
| Slack | Legado global | Preservado somente no legado. Consumidor PostgreSQL não usa webhook global; MVP contextual usa SMTP por escritório e portal. Integração contextual de Slack permanece fora da entrega local atual |
| Navegador/coleta | Plataforma / Monitoramento / operação local | Card administrativo mostra opções não secretas do ambiente da interface; consumidor precisa usar o mesmo ambiente. HEADLESS respeitado, canal/timeouts/páginas validados; edição via ambiente e reinício. Limites de execução continuam por escritório |
| Equipe, perfil e escritórios | Gestão / Minha conta / Plataforma | Escritório em grade de quatro cartões; equipe, escritórios e sindicatos em tabelas. Modais, vínculos e papéis preservados; Plataforma separa cadastros/operação de IA/extrações |

## Correções desta conferência

- Navegação contextual fica oculta enquanto não há contexto confirmado, inclusive após encerramento de acesso administrativo.
- Representante de empresa não dispara consultas de consolidação e gestão internas ao abrir seu portal.

## Ordem de fechamento

1. Administração do catálogo compartilhado concluída e validada na jornada PostgreSQL/HTTPS isolada. Inativação preserva vínculos e histórico; não cancela consultas existentes automaticamente.
2. Detalhes e análise disponíveis para todos os tipos, com acesso contextual nos dois bancos. Jornada PostgreSQL/HTTPS conferiu visualização de alterações/citação de aditivo e fechamento do modal; teste de serviço confere recusa sem vínculo e ausência de caminhos privados.
3. Agenda semanal, teste de conexão IA e opções do navegador disponíveis. Configuração local é feita via ambiente, com valores visíveis no card administrativo; não utiliza ajustes SQLite. Atalhos de provedor não são necessários para configurar URL/modelo.
4. Slack global preservado no legado e não utilizado pelo consumidor contextual. Não há paridade completa com o legado: expressões cron arbitrárias e Slack contextual não fazem parte da entrega atual.
5. Cabeçalho, navegação e visão geral alinhados à identidade do mockup, com capturas reais conferidas em desktop claro/escuro e celular. As tabelas de Cadastros, navegação de Documentos e acabamento das demais áreas foram implementados nos incrementos seguintes. O aceite visual do usuário permanece pendente; existência de funções não significa fidelidade integral ao mockup.

Migração operacional, validação externa de coleta/IA/SMTP e piloto humano permanecem no plano MVP. Nenhuma configuração legada foi removida por esta conferência.

## Integração visual de Documentos — 11/10/2026

Instrumentos, consolidações/revisões e publicações/acessos têm navegação própria, evitando empilhamento no render inicial. Consultar consolidação abre a área com a CCT selecionada. Regras completas ficam em bloco expansível para priorizar decisões de revisão. Monitoramento e Envios tiveram a hierarquia revisada e foram conferidos em desktop/mobile. Escritório e Plataforma receberam revisão visual e conferência desktop/mobile em 11/10/2026; esta entrega não declara fidelidade completa ao mockup em todas as áreas.

## Estado da revisão visual

As áreas principais foram conferidas em incrementos: Visão geral, Cadastros, Documentos, Monitoramento, Envios, Escritório e Plataforma. Capturas usam dados de teste; nenhuma importação/cutover operacional foi executada. Execuções recentes contextuais estão disponíveis; um feed geral de ações de cadastro/publicação não faz parte desta entrega, e a paridade exclui os recursos do legado já explicitados acima. Fidelidade visual não implica copiar números ou ações demonstrativas sem suporte real.

## C07 — conferência após retirada do painel global

Correções: link da conta agora abre a Administração da plataforma atual, sem recarregar a antiga rota global. A função central de navegação recusa áreas ocultas, inclusive atalhos. Plataforma fica oculta até carregar a identidade. Limpeza/troca de contexto retorna à visão geral quando a área anterior deixa de estar disponível.

Validação: novo teste workspace-navigation.e2e.mjs confere atalhos sem contexto, contexto administrativo, limpeza, acesso à plataforma pelo modal, retirada de papel, toast e fechamento de modal com Escape. Testes resumo, monitoramento e IA, além da jornada real PostgreSQL HTTPS/Chromium, passaram.

Lacuna funcional identificada: cadastro contextual seleciona contatos/sindicatos e preserva preferências existentes, mas ainda não permite editar função/receber_email/tipos por contato e categoria/UF/município/principal/enquadramento_confirmado por sindicato. Esses atributos existem no contrato e eram editáveis no legado. C07 permanece parcial até acrescentar a edição, validar persistência e isolamento PostgreSQL, e conferir consulta cadastral de CNPJ. Não declarar completude de CRUD apenas pela seleção de vínculos.

## C07 — edição das preferências de vínculos

O modal de cliente agora permite editar função, recebimento por e-mail e tipos de documento por contato; categoria, UF, município, principal e enquadramento confirmado por sindicato. Os valores anteriores são carregados sem redefinir preferências. Principal é opcional, com no máximo um selecionado. Sem tipos selecionados o contato mantém a regra de todos os tipos. Remover/reselecionar um vínculo preserva o rascunho no mesmo cadastro; abrir outro cliente ou limpar contexto apaga o estado do editor. A serialização envia somente os campos do contrato, sem nomes ou atributos das respostas de leitura.

Validação: teste de navegador específico confere rascunho, principal único, preferências anteriores e reset. A jornada HTTPS PostgreSQL foi ampliada para editar todos os atributos dos vínculos, salvar e reabrir pela UI real, verificando preferências e enquadramento persistidos. A jornada completa posterior (coleta/IA, revisão/publicação, ciência/auditoria, revogação e isolamento) passou. Navegação/modal/toast também passou.

C07 continua em andamento: falta concluir a conferência da consulta cadastral de CNPJ e os demais critérios finais da matriz. Isso não constitui aceite visual humano.

## C07 — consulta CNPJ e fechamento técnico

Consulta contextual de CNPJ disponível no modal de cliente. Rota GET /api/contexto/clientes/consulta-cnpj/:cnpj exige sessão, escritório e clientes.gerenciar, com revalidação de autorização após resposta do provedor. Reutiliza serviço de consulta com validação, timeout, cache limitado e requisições concorrentes deduplicadas. Suporte somente leitura e contexto de cliente são recusados antes da chamada externa.

A consulta mostra razão social e situação, com dados completos em bloco expansível (endereço, CNAEs, natureza jurídica, porte e datas). Usar dados no cadastro preenche campos explicitamente, sem confirmar enquadramento ou salvar. Dados anteriores são carregados do PostgreSQL e preservados. Alterar CNPJ invalida resultado/aplicação anterior; fechar modal/trocar contexto descarta retorno atrasado. Erros mantêm preenchimento manual disponível. Conteúdo recebido é renderizado por textContent, não HTML.

Jornada HTTPS/Chromium real ampliada: consulta controlada, nenhum preenchimento automático, aplicar, salvar no PostgreSQL e reabrir com dados completos. Teste UI específico confere resposta obsoleta, fechamento, falha e escape de conteúdo. Serviço CNPJ (15 testes), gestão HTTP (19, incluindo bloqueios de consulta) e grafo operacional passaram; navegação e vínculos também passaram. Não houve chamada BrasilAPI real: fixture carregada apenas no processo de teste via --import.

C07 concluída para a conferência técnica dos recursos do MVP local descritos nesta matriz. Aceite visual final do usuário e qualidade dos provedores externos reais continuam separados. Recursos excluídos do escopo permanecem Slack contextual e cron arbitrário. Próximos gates: C08 ambiente Docker limpo/reinício e C09 recuperação PostgreSQL/documentação final.
