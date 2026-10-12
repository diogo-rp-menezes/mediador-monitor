# Preparação para possível distribuição desktop

Status: preparação arquitetural; Tauri/Electron não adotados. O alvo atual continua sendo MVP local em navegador.

## Fronteiras

- As telas são componentes Vue sem acesso direto a Node, PostgreSQL, filesystem, IPC ou credenciais de infraestrutura.
- `frontend/src/services/api.ts` concentra JSON, arquivos, cookies e CSRF. Aceita um transporte `fetch` injetado; um futuro host pode adaptar a comunicação mantendo o contrato de tela.
- O backend continua responsável por sessão, RBAC, RLS, auditoria e arquivos. Embalar a UI não transforma o frontend em backend.
- O build Vite produz assets estáticos. A aplicação desktop poderá hospedar esses assets junto ao serviço local ou definir uma ponte de transporte dedicada.

## Decisões reservadas para o empacotamento

Antes de escolher Tauri ou Electron, definir distribuição do backend, disponibilidade PostgreSQL, origem/cookies, download de arquivos, armazenamento seguro, atualizações e assinatura. Não embutir credenciais PostgreSQL ou chaves no frontend; não habilitar integrações nativas irrestritas para resolver comunicação.

## Experiência desktop first

Referência: tela de 1366–1920px, lateral recolhível, conteúdo fluido, tabelas amplas, abas e modais de ficha. Modais de documento usam até 1280px disponíveis. A interface preserva navegação por teclado e adapta o conteúdo a telas estreitas. O desenho não depende de APIs específicas do browser desktop para regras de negócio.

## Implementado neste incremento

Transporte HTTP separado, download autenticado por contexto, catálogo de instrumentos Vue e ficha com visão geral, original, análise por template, evidências, aditivos e clientes. Consolidação, revisão versionada, relatórios, publicações, auditoria e gestão de vínculos de aditivos também estão em Vue. O portal do cliente também está em Vue, com abertura, download e ciência validados em PostgreSQL/HTTPS real. O workspace anterior deixou de ser servido.
