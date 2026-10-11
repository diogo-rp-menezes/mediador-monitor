# Entrega da recuperação de acesso PostgreSQL

O servidor no modo `APP_POSTGRES_CONTEXT=1` pode entregar o link de recuperação com SMTP exclusivo da plataforma. Ele não lê configuração SQLite nem SMTP de escritório, pois a conta e sua senha são globais. Nenhum transporte foi ativado no ambiente operacional por esta implementação.

Configure fora do banco e mantenha o arquivo de ambiente privado:

```dotenv
AUTH_PUBLIC_URL=https://seu-endereco
AUTH_SMTP_ENABLED=1
AUTH_SMTP_HOST=seu-servidor-smtp
AUTH_SMTP_PORT=587
AUTH_SMTP_SECURE=0
AUTH_SMTP_FROM=conta@seu-dominio
AUTH_SMTP_USER=seu-usuario
AUTH_SMTP_PASS=sua-senha
```

`AUTH_SMTP_SECURE=0` exige STARTTLS. Para TLS implícito, use `AUTH_SMTP_SECURE=1` e a porta adequada do provedor (normalmente 465). Certificado deve ser válido; não há opção para desabilitar a verificação. Usuário e senha devem ser configurados juntos ou ambos omitidos para relay autorizado. Sem `AUTH_SMTP_ENABLED=1`, não há entrega nem criação de transporte. Configuração habilitada inválida impede a inicialização, sem imprimir credenciais.

O destinatário é a conta ativa encontrada pelo fluxo de recuperação, não `MAIL_TO`. O token vai em `/login#recuperar=...`, sem query string. O texto informa validade de 30 minutos e uso único. O transporte tem limites de conexão/saudação/socket, não segue recursos de arquivo/URL em conteúdo e fecha após a tentativa. Erros remotos são substituídos por mensagem genérica. O fluxo de autenticação existente invalida o token se a entrega falhar e preserva a mesma resposta pública para contas inexistentes ou indisponíveis.

Build e testes de contrato do transporte passaram: TLS obrigatório, fragmento, destinatário, fechamento, recusa de configuração parcial/token inválido e erro sem detalhe remoto. Testes HTTP e inicialização PostgreSQL sem SQLite também passaram.

O ensaio `npm run test:postgres-recuperacao` passou em 09/10/2026, usando PostgreSQL descartável com papel runtime sujeito a RLS e servidor SMTP TLS local com certificado temporário confiado apenas pelo subprocesso. O teste extrai o token do e-mail recebido e verifica: armazenamento somente do hash, resposta igual para conta inexistente, redefinição da senha, recusa da senha anterior, revogação da sessão anterior, uso único, expiração e invalidação após falha de entrega. Também confere o evento de auditoria da redefinição. Banco, conexões e certificado temporários são removidos ao final; nenhum e-mail externo foi enviado nem o banco operacional foi alterado.

O ensaio usa os serviços de autenticação e transporte reais; não substitui os testes HTTP existentes nem valida um provedor externo. Para gerar o certificado, procura OpenSSL no PATH e nas instalações usuais do Git para Windows; `OPENSSL_BIN` permite indicar outro executável.
