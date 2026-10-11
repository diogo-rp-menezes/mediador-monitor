# Autenticação — Sprint 2

## Primeiro acesso local

Faça backup de `data/` e `downloads/`. A abertura do banco aplica as migrações de organizações e autenticação; não cria credenciais padrão.

```powershell
npm run auth:bootstrap -- --nome "Seu nome" --email "seu@email.com"
npm run dev
```

Abra `http://localhost:3000`. O bootstrap solicita e confirma uma senha oculta de 15 a 128 caracteres. Só pode criar o administrador inicial enquanto não existir administrador da plataforma. Esse papel é diferente de administrador de escritório. Quem opera o comando tem acesso privilegiado ao banco local.

Senhas usam scrypt com N=131072, r=8, p=1 e salt aleatório. Não há senha padrão, truncamento ou armazenamento de senha em texto. Duas derivações podem executar simultaneamente para limitar consumo de memória. Os comandos não aceitam senha como argumento; variáveis `AUTH_BOOTSTRAP_PASSWORD` e `AUTH_RESET_PASSWORD` são alternativas para automação não interativa e devem ser tratadas como segredos.

## Recuperação

Na tela de login, **Esqueci minha senha** responde genericamente, mesmo para e-mail inexistente. O envio usa o SMTP ativo das configurações atuais. O token expira em 30 minutos, tem somente o hash persistido e só pode ser utilizado uma vez. O link usa fragmento da URL, removido pela interface; não é enviado como query ao servidor. A confirmação revoga sessões e demais tokens anteriores.

Configure `AUTH_PUBLIC_URL` com a origem exata do aplicativo quando necessário. O padrão é `http://localhost:PORT`. HTTP é aceito somente para localhost/127.0.0.1; outras origens exigem HTTPS. Cabeçalhos encaminhados pelo cliente não definem origem ou segurança do cookie. A URL não aceita caminho adicional, credenciais, query ou fragmento.

`AUTH_TRUSTED_PROXY_CIDRS` é uma lista opcional de IPs/CIDRs separados por vírgula, vazia por padrão. Sem ela, auditoria e limitação por IP usam o socket. Com ela, `X-Forwarded-For` só é considerado se o socket pertencer a um proxy confiável; a cadeia é percorrida da direita até o primeiro endereço não confiável. Só cadastre os endereços dos proxies que acrescentam o IP real do cliente à cadeia ou sobrescrevem o cabeçalho, e restrinja o acesso direto ao backend no ambiente com proxy. Configuração inválida impede a inicialização dos handlers de autenticação.

Cabeçalhos repetidos, inválidos, com mais de 32 endereços ou mais de 4096 caracteres são ignorados e o socket é usado. Endereços com porta, colchetes, nomes DNS ou zona IPv6 não são aceitos no cabeçalho. `Forwarded`, `X-Real-IP`, `X-Forwarded-Host` e `X-Forwarded-Proto` não definem identidade, origem pública ou segurança do cookie. Reinicie o servidor após alterar a configuração. Validação com proxy/HTTPS do ambiente operacional permanece em S6-09; o padrão local não foi alterado.

Sem SMTP, o responsável pela instalação pode redefinir uma senha pelo terminal local:

```powershell
npm run auth:redefinir -- --email "seu@email.com"
```

O comando solicita a nova senha, revoga sessões/tokens e registra uma ação administrativa local com usuário alvo; não representa um usuário autenticado pela web. O e-mail de recuperação roda em segundo plano no processo, sem fila durável: reinício pode exigir novo pedido. Falha conhecida no transporte invalida o token. O provedor real precisa ser validado no piloto.

## Sessões e proteção HTTP

Sessões opacas usam token aleatório no cookie `mediador_sessao`, HttpOnly, SameSite=Strict e Secure quando a origem configurada é HTTPS. O banco guarda apenas seu hash. Prazo absoluto de oito horas e inatividade de trinta minutos; logout revoga a sessão. Inativação de usuário e revogação de papéis/vínculos são verificadas nas próximas requisições.

Login limita tentativas por conta e IP. Requisições mutáveis exigem JSON, origem aceita e, após login, token CSRF associado à sessão. Host incompatível, origem externa e acesso cross-site são rejeitados. Tokens de sessão não são aceitos em URL ou Bearer. Segredos não são armazenados em localStorage/sessionStorage; o contexto selecionado fica apenas por aba.

## Papéis e contextos

| Papel | Escopo da política |
|---|---|
| Administrador da plataforma | Painel global existente, gestão futura da plataforma e acesso administrativo justificado a escritório |
| Suporte | Contexto temporário justificado; leitura limitada, sem assumir a identidade do cliente |
| Administrador do escritório | Gestão do próprio escritório, usuários, clientes, revisão, publicação e auditoria |
| Operador | Clientes e revisão no escritório vinculado; sem gestão de usuários/publicação |
| Cliente | Somente publicações destinadas à empresa vinculada |

A matriz é aplicada por permissão e nega ações não previstas. Somente administrador da plataforma acessa o painel legado. Na área **Minha conta**, administradores e operadores de escritório já gerenciam seus clientes/contatos pelo contexto autorizado; suporte tem consulta justificada. As demais capacidades serão expostas nos próximos incrementos. Selecionar escritório não filtra as APIs globais existentes. Consulte [Cadastros por escritório](CADASTROS_POR_ESCRITORIO.md).

O contexto é validado em cada requisição por `X-Context-Type`, `X-Context-Id` e, quando necessário, `X-Support-Grant`. A empresa deriva seu escritório do cadastro. Não existe escritório ativo global na sessão. A concessão de suporte pertence à sessão que a criou, dura no máximo uma hora e exige motivo; o ator real permanece na auditoria.

## Auditoria e limites

Eventos de autenticação, recuperação, perfil e contexto administrativo registram ator, horário UTC, request ID, contexto, IP direto da conexão e user-agent. Cabeçalhos de IP encaminhado são ignorados; proxies confiáveis serão tratados na Sprint 5. Mutações do painel legado usam a identidade autenticada como responsável e têm registro complementar de operação; a auditoria detalhada por documento/publicação ainda será entregue.

Esta entrega continua local. Cadastros, interpretações e exportações internas por escritório estão implementados na Sprint 3. Tarefas assíncronas e SMTP por escritório são Sprint 4; portal e evidências de abertura/download são Sprint 5. Agendamentos atuais continuam globais. Retenção/expurgo da auditoria e implantação com PostgreSQL ainda não estão concluídos. Não publicar na internet nesta etapa.

## Validação

111 testes Vitest, 84 testes smoke, typecheck e build passaram. Os testes HTTP verificam negações de acesso e adulteração de contexto/ator. O navegador validou bootstrap, login, logout, perfil, recuperação genérica, redefinição local, contexto por aba e suporte auditado. A regressão de clientes validou PDF real e SMTP TLS local simulado. Todos usam bancos temporários ou em memória, sem criar conta no banco real.

```powershell
npm test
npm run typecheck
npm run build
node --test test/*.smoke.mjs
npm run test:auth-ui
npm run test:clientes-ui
```

O teste de clientes exige um navegador Chromium disponível. Busca OpenSSL no PATH e, no Windows, nas instalações usuais do Git e OpenSSL-Win64. Para outro local, defina `OPENSSL_BIN` apontando ao executável. Não exige provedor SMTP real.

Referências: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) e [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
