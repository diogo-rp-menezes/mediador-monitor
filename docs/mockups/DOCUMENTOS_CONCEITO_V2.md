# Documentos — proposta visual 02

Mockup independente: documentos-conceito-v2.html, com HTML/CSS/JS inline. Não altera a aplicação, não acessa banco ou serviços externos e usa instrumentos, regras, pessoas e eventos demonstrativos.

## Diagnóstico e composição

A UI atual exige selecionar a CCT novamente em instrumentos e consolidações, mistura consulta com operação e apresenta decisões em formulários extensos. A proposta aplica a organização aprovada em Cadastros: subnavegação, uma área visível por vez, indicadores compactos, tabela com busca/filtro e ações de detalhe em modais.

1. Instrumentos: catálogo do escritório, tipo, vigência, análise e estado da revisão separados. Abrir ficha mantém o documento selecionado.
2. Revisões: fila de CCTs e decisões, com comparação entre regra anterior e trecho do aditivo, evidência, decisão e justificativa. Publicação não é confundida com conclusão de análise IA.
3. Publicações: empresa, documento, versão específica e situação. Escolha explícita de cliente/versão; revogação tem confirmação separada.
4. Acessos e ciência: tabela própria para ator, empresa, documento, evento, horário e IP; exportação CSV demonstrativa. Acesso não comprova leitura integral.

A ficha do instrumento separa Visão geral, Original, Análise, Consolidação, Aditivos e Clientes. Consolidação reúne regras, atualização, histórico e relatórios PDF/Markdown. Pendências mantêm relatórios finais indisponíveis. A ação principal encaminha à revisão, publicação ou gestão de vínculo conforme o exemplo.

## Paridade a preservar na implementação

Conferidos web/gestao-ui.js, web/publicacoes-ui.js e web/acesso.html. Devem permanecer: download autorizado do original, todos os campos/evidências da análise, consolidação privada, vínculos de aditivo com justificativa e revisão concorrente, decisões por campo/versão, histórico, relatórios PDF/Markdown por cliente, bloqueio por pendência ou versão desatualizada, publicação por cliente, revogação, auditoria/CSV e portal com abertura/download/ciência. Relacionamento com empresa não substitui decisão de aplicabilidade.

Indicadores e situações novos só poderão usar evidências retornadas pelo backend; não inferir revisão/publicação pela existência de análise. Permissões e isolamento permanecem no backend. No portal da empresa, expor apenas suas publicações autorizadas, sem filas/regras internas do escritório.

## Limites do protótipo

Uma pendência demonstra a comparação; registrar revisão altera apenas o exemplo em memória. Vínculo, original, análise completa, consolidação e relatórios têm ações ilustrativas; não executam operações reais. O original mostrado é uma página fictícia, não um PDF do MTE. Publicações e revogação são simuladas. O CSV contém exemplos. Recarregar restaura os dados. Gconta demonstra escritório vazio.

A revisão real pode conter várias decisões: a implementação deverá manter a fila por campo e não considerar uma CCT concluída após apenas uma decisão. Cabeçalho/indicadores do protótipo são demonstração, não afirmação sobre dados operacionais. A ordenação e os filtros finais deverão usar datas/status reais.

## Validação

Chromium: ficha e seções, revisão com justificativa, publicação com confirmação, revogação, filtro de auditoria, busca sem resultados, contexto vazio, temas e ausência de transbordamento do documento a 390px. Modal tem navegação interna com rolagem horizontal em telas estreitas. Aceite visual humano pendente; nenhuma mudança operacional aplicada.

## Implementação operacional

A página operacional usa catálogo em tabela com métricas reais, busca/tipo/ordenação, ficha modal com abas Visão geral, Original, Análise, Consolidação, Aditivos e Clientes. A lista de Revisões abre a mesma ficha na consolidação. Decisões usam modais com justificativa obrigatória e versão otimista; somente decisões manuais exibem o campo de texto revisado.

Publicações e Acessos e ciência são áreas separadas. Publicação verifica a consolidação atual antes de habilitar o envio e o servidor revalida as condições. Revogação e ciência usam confirmação em diálogo. A publicação mantém a versão fixa, e filtros por cliente/documento/situação auxiliam a consulta. Downloads originais, relatórios PDF/MD, histórico e auditoria CSV continuam usando as APIs contextuais. O catálogo PostgreSQL informa todos os IDs de clientes relacionados, respeitando o escritório e RLS.

Validação automatizada: `npm run test:documentos-ui` cobre ficha, análise, clientes relacionados, revisão com versão e cabeçalhos de contexto/CSRF, publicação, auditoria, mobile e limpeza de contexto. A jornada PostgreSQL/HTTPS/Chromium foi adaptada aos novos modais e mantém a prova de bloqueio no servidor, integridade de downloads, ciência e eventos de auditoria.
