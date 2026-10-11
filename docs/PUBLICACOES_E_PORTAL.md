# Publicações e portal autenticado

Publicações são versões privadas por escritório e empresa. A publicação guarda PDF, relatório usado para gerar a cópia, versão e hash SHA-256 no SQLite. Repetir a publicação da mesma versão reativa a cópia original; não substitui seus bytes. Revogação tira a cópia do portal e preserva registro e auditoria.

Administradores do escritório publicam em `Minha conta` > contexto do escritório > `Publicações para clientes`. A versão deve ter consolidação privada atualizada e sem pendências. A empresa precisa de representante com conta ativa para receber notificação. O e-mail traz somente um endereço de login; o cliente autentica e seleciona a empresa para consultar.

Representantes encontram os documentos em `Minha conta` > contexto da empresa. Abrir e baixar exigem sessão ativa, vínculo vigente e publicação ativa. A API confere empresa e escritório em cada requisição e devolve `no-store`. A confirmação de ciência é uma ação explícita e registra ator, versão, horário, IP direto da conexão, user-agent e request ID gerado no servidor.

Os eventos distinguem abertura autorizada, PDF servido, ciência confirmada, publicação, revogação e tentativa negada. Uma solicitação de abertura demonstra que o servidor autorizou e iniciou o retorno do PDF; não demonstra que a pessoa visualizou ou leu o conteúdo. A ciência confirma a declaração explícita feita pela conta, sem mecanismo adicional de assinatura digital.

## Configuração operacional

SMTP por escritório usa `CREDENTIALS_MASTER_KEY`, em Base64 com 32 bytes. Proteja essa chave fora do banco e inclua-a no backup operacional. Perder a chave torna os segredos cifrados irrecuperáveis. Para rotação, recifre configurações com processo de manutenção que tenha acesso à chave anterior e à nova, valide cada conexão e só então descarte a anterior. O transporte global legado continua separado.

O serviço local usa o IP do socket por padrão. `AUTH_TRUSTED_PROXY_CIDRS` permite configurar explicitamente IPs/CIDRs dos proxies. O portal e os eventos de autenticação/gestão usam a mesma resolução: só aceitam `X-Forwarded-For` vindo de socket confiável e param no primeiro endereço não confiável ao percorrer a cadeia da direita para a esquerda. Cabeçalho malformado ou repetido retorna ao socket. Consulte [Autenticação](AUTENTICACAO.md) para configuração; proxy/HTTPS operacional ainda precisa de validação na Sprint 6. Eventos de auditoria não podem ser alterados ou excluídos pela aplicação. Ainda não há expurgo automático nem prazo de retenção configurável.

As rotas principais são `POST/GET /api/contexto/publicacoes`, `POST /api/contexto/publicacoes/:id/revogar`, `GET /api/contexto/publicacoes/auditoria`, `GET /api/portal/documentos`, `GET /api/portal/documentos/:id` e `POST /api/portal/documentos/:id/ciencia`.
