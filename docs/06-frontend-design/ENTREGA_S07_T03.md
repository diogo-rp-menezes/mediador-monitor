# Entrega S07-T03 — convites e acessos

Data: 14/10/2026  
Estado: **BLOQUEADA POR D06 — contrato de convites ausente**

## Resultado

A auditoria do contrato vigente confirmou que a gestão de equipe entregue na S07-T02 cobre cadastro de uma conta nova, vínculo de uma conta existente, alteração de papel e revogação de vínculo. Esse fluxo não é um convite: não cria token, validade, estado pendente, resgate ou mecanismo de entrega.

O router contextual atual expõe apenas `/api/contexto/usuarios` para esses cadastros e vínculos. Não há rota, schema, migração ou serviço para criar, listar, revogar ou resgatar convites. Também não existe contrato para escopo do convite, expiração, consumo único, auditoria de resgate ou entrega local controlada.

## Decisão de implementação

Nenhum componente Vue, chamada HTTP, fixture de sucesso, estado de convite ou item de navegação foi criado nesta execução. O mockup que apresenta “Convidar por e-mail” é referência visual e não substitui um contrato de backend.

Manter o bloqueio explícito evita prometer ao usuário uma ação que não pode persistir nem ser resgatada. A implementação deve ser retomada somente após a definição do contrato de convites e de suas regras de segurança; a UI poderá então ser derivada desse contrato em uma task própria.

## Evidências

- `src/postgres-gestao-http.ts`: o recurso contextual de usuários é a única rota de gestão de membros e aceita somente `modo=cadastrar|vincular`, `papel`, `cliente_id` e, no cadastro, `nome`/`senha`.
- `src/postgres-organizacoes.ts`: as operações existentes persistem usuários e vínculos em `usuarios`, `usuarios_escritorios` e `usuarios_clientes`; não há entidade de convite.
- Busca no workspace por `convite`, `redeem`, `token` e `validade` encontrou apenas documentação, mockups e tokens de sessão/recuperação não relacionados a convite.

## Validação

- Auditoria estática do router, schemas e persistência: bloqueio D06 confirmado.
- `git diff --check`: executado após a atualização documental.
- Não foi executado fluxo de navegador porque não há endpoint real a exercitar.

## Próxima ação

Definir no backend o contrato de convites (criação, consulta, revogação, resgate, escopo, validade, consumo único, auditoria e entrega local controlada) e abrir uma task derivada. A próxima task executável do plano, independente desse bloqueio, é a S07-T04 de SMTP/canais.
