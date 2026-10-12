# Padrão Oficial de UI/UX — Mediador Monitor

**Status:** aprovado e vigente  
**Escopo:** área de trabalho operacional, autenticação e futuras telas internas  
**Implementação de referência:** `web/workspace-ui.js` e `web/workspace-conceito.css`  
**Atualizado em:** 11/10/2026

## 1. Objetivo

Este documento é a fonte de verdade para a experiência visual do Mediador Monitor. Ele consolida as decisões já aprovadas para que novas telas sejam parte de uma única aplicação: profissional, clara, orientada à operação e consistente entre desktop e mobile.

Não se deve criar uma tela, card, formulário, feedback ou navegação nova sem seguir estas regras. Quando uma necessidade não estiver prevista, a implementação deve estender o padrão existente e registrar a decisão neste documento.

## 2. Princípios

1. **O contexto vem antes da ação.** O usuário sempre sabe em qual escritório ou empresa está trabalhando. A troca ocorre no seletor compacto do cabeçalho.
2. **Uma tarefa por área.** A navegação principal abre áreas; navegações secundárias revelam subáreas relacionadas sem misturar seus conteúdos em uma página longa.
3. **Informação para decidir.** A primeira dobra mostra situação, pendências e próximo passo. Detalhes ficam em abas, listas, painéis de detalhe ou modais.
4. **Bento para síntese, tabela para operação.** Indicadores e resumos usam cards; listas comparáveis usam tabela semântica; leitura aprofundada usa ficha estruturada.
5. **Densidade controlada.** Espaço em branco, hierarquia e agrupamento devem reduzir esforço visual. Não empilhar blocos sem relação em uma mesma tela.
6. **Fonte de verdade explícita.** Para análises de documentos, o original permanece a fonte de verdade; a UI mostra evidências e nunca apresenta extração automática como decisão final.
7. **Feedback sem ruído.** Confirmações rápidas usam toast. Ações que exigem decisão ou explicação usam modal. Erros persistem até serem compreendidos ou corrigidos.

## 3. Fundamentos visuais

### Tema

O sistema oferece tema claro e escuro pelos tokens abaixo. Não usar cores literais fora dos poucos casos semânticos documentados. Novos componentes devem consumir os tokens do `body.workspace`.

| Papel | Claro | Escuro | Token |
| --- | --- | --- | --- |
| Fundo da aplicação | `#f4f4f8` | `#09090d` | `--bg` |
| Superfície principal | `#fff` | `#14141b` | `--surface` |
| Superfície secundária | `#ededf5` | `#1d1d28` | `--soft` |
| Borda e divisor | `#dddde9` | `#292936` | `--line` |
| Texto principal | `#222235` | `#f4f4fa` | `--ink` |
| Texto auxiliar | `#69697d` | `#9b9bad` | `--muted` |
| Ação, seleção e foco visual | `#6554db` | `#a39aff` | `--accent` |

### Tipografia e espaço

- Fonte: `Segoe UI, sans-serif`.
- Títulos de área: 25–30px; títulos de card/ficha: 19–26px; texto operacional: 13–14px; metadados: 11–12px.
- Usar pesos 500–650, evitando excesso de negrito.
- Usar espaçamento em múltiplos de 4px. Gaps usuais: 8, 12, 16, 20, 24 e 32px.
- Cards e controles usam raio entre 8 e 18px; bordas discretas com `--line`.
- Não usar gradientes, sombras pesadas, animações decorativas ou cores como único indicador de estado.

### Ícones

- Ícones são de traço, monocromáticos e têm finalidade funcional.
- Todo ícone sem texto precisa de `aria-label`; ícones decorativos usam `aria-hidden="true"`.
- Um ícone pode acompanhar o rótulo de navegação, nunca substituí-lo em desktop.

## 4. Estrutura padrão da área de trabalho

### Cabeçalho

O cabeçalho é persistente no topo da área e contém marca, seletor de contexto compacto e ações globais: tema, avatar/minha conta e sair.

O seletor contém somente escritórios ou empresas aos quais o usuário tem acesso. A alteração muda o contexto imediatamente, preserva a identidade e exibe toast de confirmação. Não pedir motivo, confirmação intermediária nem exibir bloco permanente de “contexto selecionado” para a troca ordinária de escritório.

### Navegação principal

**Atualização aprovada — barra lateral:** a navegação principal passa a ocupar uma barra lateral recolhível no desktop. Ao recolher, manter ícones com nomes acessíveis e indicação da área ativa. No celular, usar gaveta aberta pelo botão Menu, com fechamento por Escape ou toque fora. O seletor de contexto fica na lateral expandida. O conteúdo aproveita toda a largura restante. Esta decisão substitui a faixa horizontal de navegação principal; as subáreas continuam dentro de cada painel.

O mockup lateral orienta somente a estrutura aprovada: manter **Documentos** (e não “Registros”), suas subáreas e a ficha de análise estruturada já implementada. A identidade violeta, os modais, o dropdown de contexto e os toasts permanecem oficiais.

Áreas oficiais: **Visão geral**, **Cadastros**, **Monitoramento**, **Documentos**, **Envios**, **Escritório** e, para quem tem permissão, **Plataforma**. “Minha conta” abre pelo avatar como modal e não ocupa item permanente na navegação.

- A área ativa usa `aria-current="page"`, superfície secundária e ícone em `--accent`.
- Áreas sem permissão não aparecem.
- Em mobile, a navegação principal usa gaveta. As subnavegações podem rolar horizontalmente sem encolher os rótulos.

### Subnavegação

Subáreas são usadas quando uma área tem tarefas distintas. O padrão é uma faixa de botões com `aria-pressed`:

- **Cadastros:** Clientes, Contatos e Sindicatos e filtros.
- **Documentos:** Instrumentos, Revisões, Publicações e Acessos e ciência.
- **Plataforma:** Cadastros e operação local, IA e extrações.

Ao entrar em uma área, somente a primeira subárea é renderizada ou exibida. Não apresentar todas as seções simultaneamente.

## 5. Layouts de conteúdo

### Visão geral

Usar bento grid para o resumo operacional: card hero para a prioridade, cards KPI para contagens/pendências e atalhos somente para ações frequentes. Os cards podem variar em largura e altura para estabelecer hierarquia; evitar grades uniformes sem destaque.

### Área de cadastro

Cada subárea possui título e descrição, barra de ferramentas com ação primária/busca/filtros, tabela com dados e ações, e estado vazio orientado à primeira ação. Clientes, contatos e sindicatos não ficam empilhados. Criar e editar abrem modal e preservam lista e filtro no plano de fundo.

### Listas, tabelas e painéis de detalhe

- Usar `<table>` para itens comparáveis em colunas. Em tela estreita, oferecer rolagem horizontal dentro do contêiner; nunca cortar dados silenciosamente.
- Ações de linha têm rótulos claros: “Editar”, “Excluir”, “Documentos”, e não somente ícones.
- A seleção é visível por superfície, borda/acento e `aria-pressed`; nunca só por cor do texto.
- Em mestre-detalhe, a lista fica à esquerda no desktop e acima do detalhe no mobile.

### Documentos e análises

A ficha de documento é um modal amplo com abas: visão geral, documento original, análise, consolidação/revisões, aditivos e clientes relacionados.

A aba **Análise** de uma CCT estruturada contém cabeçalho com versão do template, bento de cobertura/evidências/situação, navegação por seções, grupos de campos em cards e ação “Ver evidência” em modal. Campo ausente aparece como “Não consta na CCT” com menor ênfase, sem parecer erro. O original é sempre a fonte de verdade e a decisão é humana.

`TEMPLATE_CCT.md` é canônico. A UI mostra a versão recebida e renderiza as seções e campos normalizados, sem inventar campos ou inferir ausências como direitos.

## 6. Componentes oficiais

| Componente | Uso | Regra |
| --- | --- | --- |
| Card bento | KPI, síntese e atalho | Uma informação central por card; tamanhos expressam prioridade. |
| Card de registro | Conteúdo agrupado | Fundo `--surface`, borda `--line`, raio 14–18px. |
| Botão primário | Ação principal | Uma ação principal por grupo; rótulo inicia com verbo. |
| Botão secundário | Ação reversível/complementar | Superfície secundária e borda. |
| Botão destrutivo | Exclusão/inativação irreversível | Só após confirmação explícita. |
| Busca | Filtrar coleção | `type="search"`, rótulo acessível e estado sem resultado. |
| Select | Opções finitas | Usar para UF, situação, escritório/empresa e filtros fechados. |
| Badge de status | Situação curta | Texto obrigatório; ponto/cor é complemento. |
| Toast | Sucesso ou informação rápida | Não bloqueia fluxo; fecha em 5s e permite fechamento manual. |
| Modal (`dialog`) | Criar, editar, confirmar, ver evidência | Foco inicial no primeiro campo/ação; Escape fecha quando seguro. |
| Alerta persistente | Erro ou impedimento | Próximo ao contexto da falha, com `role="alert"`. |

## 7. Formulários e ações

- Um formulário por modal, com título objetivo: “Novo cliente”, “Editar contato”, “Configurar sindicato”.
- Cada campo tem `<label>` visível. Placeholder oferece exemplo, não substitui rótulo.
- UF é sempre `<select>` com as unidades federativas permitidas; não usar texto livre.
- Campo obrigatório é indicado por texto e validação, não apenas por asterisco ou cor.
- O botão principal só é bloqueado quando há motivo claro e próximo ao controle.
- Validação ocorre no envio, com mensagem específica junto ao campo. Após falha, o foco vai ao resumo ou primeiro campo inválido.
- Ações destrutivas exigem confirmação com nome do objeto e consequência. Troca ordinária de escritório não exige confirmação.

## 8. Feedback e estados

### Toasts

Usar para confirmação curta e recuperável: contexto alterado, cadastro salvo, filtro aplicado ou arquivo solicitado. Exemplo: “Contexto alterado para Gescon.”

- Canto inferior da área de trabalho, respeitando área segura.
- Sucesso/informação: `role="status"`, fechamento após 5 segundos, pausa ao interagir.
- Evitar mais de uma mensagem simultânea; a mais recente substitui a anterior quando se referir à mesma ação.

### Erros e estados

Erros são alertas persistentes, com explicação e nova tentativa quando segura. Nunca expor stack trace, segredo ou detalhe técnico sensível.

| Estado | Texto esperado | Próximo passo |
| --- | --- | --- |
| Carregando | “Carregando clientes…” | Não substituir toda a tela por vazio. |
| Vazio inicial | “Ainda não há clientes neste escritório.” | Mostrar “Novo cliente”. |
| Sem resultado | “Nenhum resultado para esta busca.” | Manter busca e filtros visíveis. |
| Sem permissão | “Você não tem permissão para esta área.” | Não mostrar controles graváveis. |
| Falha | Explicar a operação não concluída | Oferecer nova tentativa quando segura. |

## 9. Responsividade e acessibilidade

**Diretriz desktop first aprovada:** projetar primeiro para uso operacional em desktop (1366–1920px), com conteúdo ocupando a largura disponível após a lateral, ferramentas compactas, tabelas legíveis e modais amplos. A versão estreita adapta essa estrutura sem eliminar ações. O produto deve parecer uma aplicação ERP/SaaS única, com densidade útil e hierarquia consistente. A possibilidade de empacotamento desktop não autoriza dependências Tauri/Electron nesta fase.

| Faixa | Comportamento |
| --- | --- |
| Acima de 1100px | Bento multi-coluna, mestre-detalhe lado a lado, navegação lateral da análise. |
| 701–1100px | Header pode quebrar em linhas; cards reduzem colunas sem reduzir legibilidade. |
| Até 700px | Margens de 16px; bento em uma ou duas colunas; navegação/abas com rolagem horizontal; modais têm largura da viewport menos 32px. |

- Nenhuma rolagem horizontal do documento inteiro em 390px de largura; tabelas podem rolar apenas dentro de seu contêiner.
- Usar landmarks semânticos e controles operáveis por teclado, com foco visível em `--accent`.
- Usar `aria-current` para área ativa e `aria-pressed` para subáreas e abas alternáveis.
- Diálogos precisam de nome acessível, foco controlado e fechamento seguro.
- Status nunca depende apenas de cor. Respeitar `prefers-reduced-motion`.

## 10. Padrões proibidos

- Página longa de “Minha conta” que mistura perfil, contexto, cadastros e administração.
- Justificativa para troca ordinária de escritório pelo usuário autorizado.
- Várias seções CRUD renderizadas juntas.
- Confirmação em bloco permanente para uma ação que deveria ser toast.
- Formulário inline ocupando lista após “Novo” ou “Editar”.
- Cards como tabela quando é preciso comparar linhas.
- Texto truncado sem possibilidade de leitura completa, especialmente em documentos, CNPJ, razão social e evidência.
- Gradientes, sombra excessiva, animações decorativas e componentes desconectados do workspace.

## 11. Processo para nova tela

1. Classificar a tela em uma área e, se necessário, subárea existente.
2. Reutilizar tokens, shell, navegação, tabelas, modais e feedback deste padrão.
3. Definir carregando, vazio, sem resultado, erro, sem permissão e sucesso.
4. Implementar desktop e mobile no mesmo incremento.
5. Criar ou atualizar mockup HTML e obter aprovação quando o fluxo ou estrutura visual mudar materialmente.
6. Cobrir a jornada com teste de interface quando houver mudança de comportamento.
7. Atualizar este documento se a decisão for reutilizável em outras telas.

## 12. Referências e aceite

| Referência | Papel |
| --- | --- |
| `web/workspace-ui.js` | Shell, contexto, navegação, toast e modais. |
| `web/workspace-conceito.css` | Tokens e estilos do workspace. |
| `docs/mockups/workspace-conceito.html` | Conceito aprovado da área de trabalho. |
| `docs/mockups/cadastros-conceito-v2.html` | Conceito aprovado de cadastros. |
| `docs/mockups/documentos-conceito-v2.html` | Conceito aprovado de documentos. |
| `docs/mockups/analise-cct-conceito-v3.html` | Conceito aprovado de análise CCT. |
| `TEMPLATE_CCT.md` e `src/cct-template.ts` | Estrutura canônica da análise. |

Uma entrega de UI só está concluída quando segue este padrão em tema claro/escuro, respeita contexto/permissões, oferece todos os estados necessários, funciona em 390px e desktop, pode ser navegada por teclado e não introduz componente visual isolado.
