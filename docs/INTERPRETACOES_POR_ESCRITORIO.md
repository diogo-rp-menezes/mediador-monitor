# Revisões, vínculos e relatórios por escritório — S3-07 a S3-09

## Conteúdo e propriedade

Originais e extrações estruturadas dos registros do Mediador continuam compartilhados. Associação manual de termo aditivo, consolidação, revisão humana, versões e relatórios são persistidos por `escritorio_id`. As tabelas globais antigas permanecem disponíveis somente no painel da plataforma. A migração 005 preserva um retrato delas como histórico legado do escritório inicial; outros escritórios precisam confirmar seus próprios vínculos antes de consolidar.

Uma associação ou consolidação só inclui documentos relacionados a ao menos uma empresa do escritório. Vínculos são exclusivos por escritório, identificados pelo registro do aditivo, e usam revisão otimista para evitar sobrescrever uma alteração feita em outra aba. Decisões antigas globais não são aplicadas automaticamente a novos escritórios.

## Consolidação e revisão

Em **Minha conta → Consolidações e revisões do escritório**, escolha uma CCT com extração estruturada concluída e associe os aditivos disponíveis. A consolidação reaproveita somente as extrações salvas e as citações verificadas contra os originais com hash conferido; não chama uma IA ou serviço externo. Sem data comprovada, múltiplas alterações do mesmo campo ficam pendentes. Identificadores da CCT original não são alterados.

Uma revisão exige justificativa, versão atual e ator da sessão. As ações mantêm a regra anterior, usam o valor estruturado do aditivo ou registram um valor revisado. Novos documentos, mudanças em extrações, vínculos e arquivos tornam a consolidação desatualizada. Uma consolidação repetida sobre as mesmas entradas conserva as revisões humanas. O histórico mantém versões recentes e auditoria contextual.

## Exportações

PDF e Markdown são montados com a consolidação e as decisões do escritório, e só podem ser baixados por empresa à qual todos os documentos estejam relacionados. O PDF renderiza dados já persistidos e não chama IA. Arquivos originais e anexos de e-mail usam os verificadores de caminho e hash existentes. Relatórios e anexos são auditados antes de seus bytes serem enviados. O evento de disponibilidade de um download é evidência do servidor, não prova de leitura humana.

As rotas contextualizadas são:

- `GET /api/contexto/interpretacoes` lista os registros disponíveis e vínculos do escritório; `?base=...` lê uma interpretação própria.
- `POST /api/contexto/vinculos` salva uma associação ou rejeição com sua revisão corrente.
- `POST /api/contexto/interpretacoes/consolidar` prepara e grava uma versão privada.
- `POST /api/contexto/revisoes` registra revisão com base, aditivo, campo, versão e justificativa.
- `GET /api/contexto/relatorio?base=...&cliente=...&formato=pdf|md` exporta relatório autorizado.
- `GET /api/contexto/anexo?envio=...&indice=...` libera anexo somente quando o envio pertence a uma empresa do escritório.

Todas exigem sessão e contexto; escrita também exige CSRF e revisão do vínculo/permissão depois da leitura do corpo. `404` oculta registros, clientes e envios fora do escopo.

## Limites ainda vigentes

A consolidação exige análise estruturada já existente; extrair ou chamar serviço de IA continua sendo uma função global do administrador da plataforma até o desenho de jobs/credenciais por escritório. Execuções globais antigas não são mostradas como se pertencessem a um escritório. A consulta de execuções contextualizada permanece vazia até a Sprint 4. Anexos são protegidos por escritório, mas criar, aprovar e processar fila de envio permanece escopo futuro da Sprint 4. Acesso e ciência pelo cliente seguem na Sprint 5.
