# Cadastros — proposta visual 02

Mockup independente, HTML/CSS/JS inline, sem serviços externos, banco ou alterações na aplicação. Abra cadastros-conceito-v2.html. Exemplos fictícios, incluindo empresas adicionais e contatos; não representam o estado operacional.

## Organização proposta

- Cadastros abre uma subnavegação persistente: Clientes, Contatos e Sindicatos. Clientes é o destino inicial; somente uma lista é renderizada por vez.
- Busca, filtro de situação, ordenação e ação de criação pertencem ao cadastro escolhido. A lista usa a largura disponível; indicadores compactos ajudam a localizar vínculos incompletos.
- Cliente possui ficha resumida com dados, contatos, sindicatos e atalho para documentos. O formulário tem três seções: Dados da empresa, Contatos e envio, Sindicatos.
- Vínculos usam cartões com checkbox e preferências expansíveis, em lugar de select múltiplo. Principal usa radio; confirmação de enquadramento fica junto ao vínculo.
- Contatos deixam explícita a diferença entre cargo da pessoa e função/preferências por cliente.
- Sindicatos mostra consultas privadas vinculadas ao catálogo compartilhado. Filtros ficam numa seção própria; agendas e execuções continuam em Monitoramento.
- Confirmações rápidas usam toast, formulários usam dialog nativo com Escape e foco gerenciado pelo navegador. Há tema claro/escuro e estado vazio ao escolher Gconta.

## Relação com os recursos atuais e históricos

Conferidos: web/acesso.html, web/clientes-ui.js histórico, src/cadastros.ts, src/monitoramentos-escritorio.ts e src/instrumentos.ts. A ficha de cliente e a organização dos vínculos recuperam conceitos úteis da legada. CRUDs, consulta CNPJ, preferências de contato, principal/enquadramento e filtros privados orientam a proposta.

Este mockup valida a composição e os componentes, não a paridade funcional completa. Os quatro tipos de instrumento mais comuns ilustram o seletor; a implementação deve manter os oito tipos específicos existentes e a semântica de Todos os tipos. Consulta CNPJ é simulada; endereço, CNAEs, fonte e demais dados cadastrais consultados devem continuar disponíveis na implementação. Excluir e restrições de histórico não foram simulados: devem ficar em ações secundárias da ficha/formulário com confirmação, respeitando as regras atuais. Não adicionar importação em massa ou outras funções sem verificar suporte e necessidade.

Salvar altera exemplos apenas na memória desta página (Gescon); recarregar restaura os exemplos. Gconta demonstra estado vazio e salvamento simulado. Documentos e demais áreas da navegação apenas informam o escopo da prévia; não abrem funcionalidades reais. Antes de implementação, fechar a matriz de paridade dos recursos necessários com o backend PostgreSQL; nenhuma API legada deve ser reativada.

## Conferência

Chromium: subnavegação, busca, filtros, ficha, modais/seções, edição demonstrativa, mudança para escritório vazio, temas e documento sem transbordamento horizontal a 390px. Tabelas têm rolagem interna em telas estreitas. Capturas desktop, vínculos, claro e mobile ao lado do HTML. A validação visual humana permanece aberta.
