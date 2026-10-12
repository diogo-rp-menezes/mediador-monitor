# Especificação visual da UI integrada — S00-T02

Data: 11/10/2026. Esta especificação traduz o protótipo Vue aprovado para a aplicação operacional. Ela define o contrato visual das Sprints 01–10; não altera regras de negócio nem autoriza conteúdo fictício.

Referências inspecionadas: `sites/mediador-monitor-vue/src/style.css`, `frontend/src/styles.css`, `frontend/src/sidebar.css`, `frontend/src/dialog.css`, componentes em `frontend/src/components/` e [baseline funcional](BASELINE_UI_INTEGRADA.md).

## Direção visual

A interface usa superfícies claras, verde institucional sóbrio, tipografia compacta e cartões com hierarquia discreta. O acabamento deve ajudar a localizar contexto, estado e próxima ação. Dados operacionais, identidade do usuário e nome do escritório vêm da sessão; marca, perfil, indicadores e textos demonstrativos do protótipo não entram na aplicação.

Princípios:

1. Priorizar conteúdo e estado sobre decoração. Sombras são leves; cor intensa fica reservada a ação primária, foco e significado semântico.
2. Uma ação primária por região. Ações perigosas exigem rótulo explícito e confirmação contextual.
3. Mesma semântica nos temas claro e escuro. Cor nunca é o único indicador de estado.
4. Densidade adequada a backoffice: tabelas compactas, detalhes legíveis e áreas clicáveis de pelo menos 40 × 40 px.
5. Movimento curto e funcional. Respeitar `prefers-reduced-motion`.

## Tokens canônicos

Os tokens devem morar em uma única camada global. Componentes consomem variáveis sem repetir valores de tema. Os nomes abaixo substituem gradualmente os valores literais atuais.

### Cor

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--color-canvas` | `#f4f6f5` | `#0c1211` | Fundo da aplicação |
| `--color-surface` | `#ffffff` | `#131b1a` | Sidebar, cartões, modal |
| `--color-surface-subtle` | `#edf1ef` | `#1b2625` | Filtros, hover, cabeçalhos de tabela |
| `--color-border` | `#dce4e0` | `#2b3937` | Contornos e divisores |
| `--color-text` | `#1b302a` | `#e9f0ef` | Texto principal |
| `--color-text-muted` | `#5e6e67` | `#a5b4b1` | Texto secundário; tom claro ajustado na S01-T01 para contraste AA sobre canvas e superfície sutil |
| `--color-accent` | `#176b54` | `#5fd0ad` | Ação primária, foco, seleção |
| `--color-accent-ink` | `#ffffff` | `#05241c` | Texto sobre o destaque |
| `--color-accent-subtle` | `#e1f0e9` | `#16362c` | Item selecionado e destaque discreto |
| `--color-success` / `-subtle` | `#17784a` / `#d8f0e3` | `#72dca2` / `#14301f` | Concluído, ativo, enviado |
| `--color-warning` / `-subtle` | `#825500` / `#f8e7c3` | `#f0c266` / `#352a0e` | Atenção, revisão, pendência |
| `--color-danger` / `-subtle` | `#b3261e` / `#fadbd8` | `#ff9a92` / `#3a1816` | Erro, falha, revogação |
| `--color-info` / `-subtle` | `#2457a6` / `#dce7f8` | `#9abcf5` / `#16253f` | Em execução e informação |

Texto normal deve alcançar contraste WCAG AA. O tom `muted` não é usado em corpo menor que 12 px quando seu contraste ficar abaixo de 4,5:1. Bordas não substituem texto ou ícone para indicar erro.

### Tipografia

- Família de interface: `Inter`, `Segoe UI`, system-ui, sans-serif. Nesta fase não carregar fonte remota; `Segoe UI` é a primeira fonte disponível no ambiente atual.
- Família monoespaçada: `ui-monospace`, `Cascadia Code`, `Consolas`, monospace para IDs, hashes, CNPJ e números tabulares.
- Título da página: `clamp(1.75rem, 2.3vw, 2.125rem)`, peso 650, altura 1.15.
- Título de cartão: 1rem, peso 650. Corpo: 0.875rem/1.5. Texto auxiliar: 0.75rem/1.45.
- Rótulo editorial: 0.6875rem, peso 650, maiúsculas, espaçamento 0.08em. Evitar esse estilo em frases longas.
- Números de KPI: `clamp(2.25rem, 4vw, 3.5rem)`, peso 650, números tabulares.

### Espaço, forma e elevação

- Escala espacial: 4, 8, 12, 16, 20, 24, 32 e 40 px.
- Raio: 8 px em controles; 12 px em grupos e tabelas; 16 px em cartões; 20 px em modal de destaque. Pílulas usam 999 px.
- Sombra de cartão: `0 2px 4px rgb(20 32 31 / 4%)`; sombra de modal: `0 28px 80px rgb(0 0 0 / 28%)`.
- Conteúdo principal: largura fluida, máximo de 1600 px, 32 px laterais no desktop, 18 px no tablet e 14 px no celular.
- Grid: 12 colunas, intervalo 18 px; cartões colapsam para 6 colunas em até 1100 px e 12 colunas em até 560 px conforme sua importância.

## Componentes compartilhados

| Padrão | Composição e estados | Aplicação atual |
| --- | --- | --- |
| Botão | Altura mínima 40 px; primário, secundário, discreto e perigoso; ícone sempre com nome acessível | `.secondary`, ações nos painéis e rodapés de `AppDialog.vue` |
| Campo | Rótulo persistente, ajuda/erro associado, fundo canvas e borda; foco de 2 px; `disabled` e `readonly` distintos | Formulários de cliente, contato, sindicato e diálogos |
| Cartão | Superfície, borda, raio 16 px, cabeçalho flexível; sem sombra forte | Hero, métricas, ficha e seções documentais |
| Tabela | Cabeçalho sutil, linhas de 44 px ou mais, hover não essencial; rolagem dentro do contêiner | `RegistryPanel.vue`, documentos, publicações e auditoria |
| Badge | Texto + cor + ponto/ícone; variantes sucesso, alerta, erro, informação e neutro | Status de cadastro, documentos, execuções e envios |
| Tabs | `role=tablist`, seleção por texto/fundo e foco; rolagem horizontal em telas estreitas | Cadastros, análise, consolidação e publicações |
| Modal | `dialog` nativo, título, descrição, conteúdo, erro e rodapé; foco inicial útil, restauração e Escape | `AppDialog.vue` e formulários internos |
| Toast | Mensagem curta, `role=status`; erro persistente até ação/fechamento com `role=alert` | Feedback transversal em `App.vue` |
| Estado vazio | Título, motivo e ação quando autorizada; nenhum dado demonstrativo | Todas as listas e cartões de resumo |
| Skeleton/carregamento | Preservar geometria; botão ocupado fica desabilitado e mantém seu rótulo compreensível | Requisições iniciais e mutações |

Estados de interação seguem esta ordem: padrão, hover, foco visível, ativo/selecionado, ocupado, desabilitado, erro e sucesso. `disabled` não usa `cursor: wait` fora de operação em curso; indisponibilidade usa `not-allowed`, operação usa `aria-busy=true` e indicador textual.

## Estrutura da aplicação

### Desktop, 1280–1600 px

- Sidebar com 236 px, recolhível para 80 px. Marca oficial, contexto autorizado, navegação por papel e identidade real ficam em regiões separadas.
- Topbar com menu móvel oculto, título curto do contexto, ações globais reais e tema. Busca global só aparece quando houver implementação conectada a resultados reais.
- Cabeçalho da página contém breadcrumb curto, título, descrição e ação principal autorizada.
- Área bento serve ao dashboard. Telas transacionais usam cabeçalho, ferramentas, tabela ou master-detail; não forçar todas as telas a cartões.

### Tablet, 821–1100 px

- Sidebar permanece visível entre 210 e 220 px quando houver espaço; cartões de 3/4 colunas passam a 6, cartões principais passam a 12.
- Ferramentas quebram linha sem separar rótulo de seu controle.
- Master-detail pode virar uma coluna com lista limitada a 290 px.

### Mobile de apoio, até 820 px

- Sidebar vira gaveta de 260 px com scrim. O botão de menu é o primeiro controle da topbar; abrir move foco para a gaveta, fechar devolve foco ao botão.
- Conteúdo ocupa uma coluna. Margens de 14–18 px; ação principal pode ocupar toda a largura.
- Tabelas mantêm estrutura sem ocultar colunas críticas e rolam apenas dentro de `.tablewrap`. A página não pode ter overflow horizontal.
- Diálogos usam `calc(100vw - 20px)`, máximo de 90dvh, conteúdo rolável e ações que quebram linha.
- KPIs podem permanecer em duas colunas somente quando cada cartão tiver ao menos 150 px; abaixo disso ficam em uma coluna.

## Tema e preferência

`data-theme="light|dark"` no elemento raiz controla o tema. A preferência explícita fica em `localStorage` sob chave já existente `mediador_tema`; na ausência, usar `prefers-color-scheme`. O botão informa a ação futura em seu `aria-label`. A mudança é visual e não requer API.

O tema escuro não é uma inversão automática: usa superfícies em níveis, texto menos luminoso que branco puro e cores semânticas próprias. Gráficos, ícones SVG e estados devem consumir `currentColor` ou tokens. O primeiro paint deve receber o tema antes de exibir a aplicação para evitar flash perceptível na implementação de S01-T01.

## Correspondência por tela

| Área | Composição aprovada | Componentes a preservar/refinar |
| --- | --- | --- |
| Início | Cabeçalho + grid bento com contadores reais, pendências e atalhos autorizados | `App.vue`; dados de `/api/contexto/resumo`, sem séries inventadas |
| Cadastros | Tabs, ferramentas, tabela; ficha/edição em modal amplo | `RegistryPanel.vue`, `ClientEditor.vue`, `ClientSheet.vue`, `UnionPanel.vue`, `CnpjLookup.vue` |
| Documentos | Master-detail para instrumento, tabs internas e cards de campos/evidências | `DocumentsPanel.vue`, `DocumentAnalysis.vue`, `AnalysisValue.vue` |
| Aditivos/consolidação | Seções progressivas, versão e conflito próximos da decisão | `AmendmentLinks.vue`, `ConsolidationPanel.vue` |
| Publicações/auditoria | Ferramentas + tabela; ações perigosas em modal; downloads como ação explícita | `PublicationsPanel.vue` |
| Portal do cliente | Lista simples de publicações, visualização/download e ciência explícita | `ClientPortal.vue`; sem navegação administrativa |
| Monitoramento | Contadores de estado, ferramentas, execuções em tabela e agenda em formulário/modal | Novo painel da Sprint 05 substitui `PendingPanel.vue` |
| Envios | Resumo + filtros + tabela ou colunas por estado quando preservarem todos os itens; detalhe em painel/modal | Novo painel da Sprint 06; estados vêm da API |
| Gestão | Tabs Escritório, Equipe, SMTP e Limites; formulários por responsabilidade | Novo painel da Sprint 07 |
| Plataforma | Subnavegação Escritórios, Sindicatos, Coleta e IA; contexto global sempre explícito | Novo painel da Sprint 08 |
| Perfil | Cartão simples com nome editável e identidade não editável | Novo painel da Sprint 09 |

## Conteúdo, estados e linguagem

- Usar português do Brasil consistente, nomes reais do domínio e datas no fuso apresentado pelo servidor/contexto.
- Títulos descrevem o objeto; botões usam verbo e objeto: “Salvar cliente”, “Cancelar execução”, “Revogar publicação”.
- Confirmações informam efeito, objeto e irreversibilidade real. Não usar “Tem certeza?” isoladamente.
- Erros da API são exibidos próximos da ação e preservam dados digitados. 401 leva ao acesso; 403 explica falta de permissão; 409 solicita atualização e conserva a decisão local.
- Zero, vazio, indisponível e carregando têm apresentações diferentes. Nunca preencher espaço com métricas fictícias.

## Acessibilidade e movimento

- Ordem DOM acompanha a ordem visual. Todos os fluxos funcionam por teclado.
- Foco visível: 2 px em `--color-accent`, offset 2 px; em fundos de destaque usar anel com contraste equivalente.
- Inputs têm `label`; ajuda/erro usa `aria-describedby`; erros agregados recebem foco apenas após submissão inválida.
- Modais prendem foco enquanto abertos e devolvem ao acionador. Gaveta móvel segue o mesmo princípio.
- Ícones decorativos ficam ocultos da árvore acessível. Botões somente com ícone têm nome acessível e tooltip opcional.
- `prefers-reduced-motion: reduce` remove transições e animações não essenciais. Transições normais duram 120–220 ms.
- Alvos interativos têm mínimo 40 × 40 px; exceções de texto inline mantêm espaçamento suficiente.

## Regras para implementação e aceite

1. S01-T01 centraliza tokens e componentes primitivos antes de refinar telas de domínio. Remover duplicações somente após conferir consumidores.
2. Não importar o CSS inteiro do protótipo: ele contém classes e dados próprios da demonstração. Migrar padrões por componente.
3. Uma alteração visual não muda payload, permissão, estado ou resultado operacional.
4. Validar ao menos uma tela com tabela, uma com formulário/modal e uma com master-detail em claro/escuro, 1440 px e 390 px.
5. Conferir foco, contraste semântico, zoom de 200%, rolagem interna e preferência de movimento reduzido.
6. Capturas são evidência visual; typecheck/build e jornadas continuam obrigatórios conforme a task.

S00-T02 conclui a especificação. A implementação física desses tokens começa em S01-T01 após S00-T03 preparar o ambiente comum de validação.
