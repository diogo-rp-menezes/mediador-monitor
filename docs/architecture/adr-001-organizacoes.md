# ADR-001 — Escritório como unidade de isolamento

Data: 08/10/2026. Estado: adotado para a fundação local; isolamento HTTP e operação centralizada pendentes.

## Contexto

A aplicação 0.4.1 funciona localmente, sem identidade autenticada, e mantém clientes, contatos, relatórios e tarefas globais. A evolução autorizada prevê gestão de escritórios, RBAC, isolamento e auditoria de documentos. O usuário definiu uma empresa sob um escritório inicialmente.

## Decisão

Escritório é a unidade de isolamento. Usuário tem identidade global; papel e elegibilidade são definidos por associações com escritórios e empresas. Contato é cadastro de destinatário e não representa uma conta. Originais públicos/extrações padronizadas podem ser compartilhados; decisões humanas, publicações e relatórios personalizados têm contexto privado.

A primeira migração cria um escritório inicial e atribui os clientes/contatos existentes a ele. Preserva IDs, arquivos, análises e vínculos. Não cria credenciais ou usuários padrão. Novos serviços são internos até a proteção das rotas. Ownership não pode ser trocada como uma edição comum; transferência exige uma decisão e fluxo próprio posteriores.

## Alternativas e custos

| Alternativa | Benefício | Custo/limite | Decisão |
|---|---|---|---|
| Um banco por escritório | Fronteira física mais forte | Operação, migrações e acesso de representantes de várias empresas mais complexos | Reservar para necessidade comprovada |
| Banco compartilhado e contexto verificado | Compatível com a base e com usuários em várias organizações | Todas as rotas, tarefas e arquivos exigem aplicação consistente do escopo | Adotar, com constraints e RLS no alvo PostgreSQL |
| Usuário preso a um escritório | Menor número de vínculos | Impede funcionário multi-escritório e representante multiempresa | Descartar por incompatibilidade funcional |

SQLite permanece no desenvolvimento local para evitar uma migração operacional simultânea à primeira mudança de domínio. Esse passo não torna a versão multi-tenant segura. PostgreSQL traz custo de implantação e mudança de consultas/driver; é o alvo do piloto centralizado, com validação de migração, RLS e recuperação.

## Consequências e transição

- Migração de organizações é transacional e versionada. Reexecutar não reseta o escritório inicial.
- Colunas adicionadas por ALTER TABLE têm FK anulável no schema SQLite, por limitação de adicionar REFERENCES com default não nulo a tabelas preenchidas. Backfill e triggers completam a propriedade após INSERT e rejeitam NULL no UPDATE. A futura escrita autenticada exige contexto explícito; PostgreSQL usa NOT NULL.
- Unicidade global do e-mail de contatos ainda pertence ao schema legado e será migrada na S3-04. Não há liberação de cadastros de vários escritórios pela interface nesta etapa.
- Serviço de identidade não autentica nem autoriza: seus métodos precisam da política de acesso ao serem expostos na sprint 2/3.
- Histórico da fundação usa a auditoria existente com origem de sistema/serviço interno. Nenhum nome digitado é apresentado como identidade autenticada. A sprint 2 adicionará ator validado.
- O fallback de escritório inicial serve à instalação local antiga. Será removido das escritas de operação centralizada.
- Revisar este ADR se empresas precisarem de escritórios simultâneos ou se houver necessidade de isolamento físico por contrato.

## Verificação

Cobrir migração com dados anteriores, rollback, reexecução, vínculos com papéis diferentes, revogação/inativação, FK composta empresa/escritório e proteção de cliente/contato de escritórios diferentes. Isolamento HTTP só será declarado após os cenários adversariais da sprint 3.
