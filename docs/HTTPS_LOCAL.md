# HTTPS local

O comando `npm run ui:https` inicia um terminador TLS em `127.0.0.1`, separado da aplicação HTTP local. Não publica portas na rede, não serve arquivos e encaminha somente para `127.0.0.1:UI_PORT`. O PostgreSQL continua no Docker existente.

Use um certificado de desenvolvimento com SAN para `localhost` e `127.0.0.1`, confiado pelo navegador no Windows, e uma chave privada fora do repositório. Configure os dois terminais com os mesmos valores de origem e porta da aplicação:

```powershell
$env:AUTH_PUBLIC_URL = 'https://localhost:3443'
$env:UI_PORT = '3000'
$env:AUTH_TRUSTED_PROXY_CIDRS = '127.0.0.1'
$env:LOCAL_TLS_CERT = 'C:\caminho-privado\localhost.pem'
$env:LOCAL_TLS_KEY = 'C:\caminho-privado\localhost-key.pem'
```

No terminal da aplicação, preserve a configuração PostgreSQL existente e execute `npm run build` e `npm run start`. No outro terminal, execute `npm run ui:https`. Acesse `https://localhost:3443/login`. A origem HTTPS deve estar configurada antes de iniciar a aplicação, pois determina a proteção Secure do cookie. O certificado precisa ser confiável; a implementação não desabilita a validação TLS. A configuração acima é um exemplo, não foi aplicada ao ambiente operacional.

O proxy substitui todos os cabeçalhos `X-Forwarded-*`, remove `Forwarded` e usa o endereço da conexão como IP. Remove cabeçalhos de salto, confere Host e caminho, transmite corpo e resposta por streams e encerra a conexão com o backend após interrupção do cliente. Há limites de tempo para cabeçalhos, requisição e inatividade do backend. Backend indisponível produz erro genérico 502. Essa configuração exige que somente o proxy local seja confiado pela aplicação; não use uma faixa ampla de proxies.

## Validação

`npm run test:https-local` gera certificado temporário com OpenSSL (PATH, Git para Windows ou `OPENSSL_BIN`) e o confia apenas no subprocesso do teste. O ensaio usa servidores HTTPS e HTTP reais e verifica corpo da requisição, resposta binária, preservação de cookie Secure, IP resolvido sem cabeçalho forjado, recusa de Host/caminho incorretos e erro de backend indisponível. Certificado e chave temporários são removidos ao final.

O ensaio passou em 09/10/2026. Ele verifica o proxy; a sessão retornada pelo backend desse ensaio específico é sintética.

`npm run test:postgres-https` complementa a validação: cria banco PostgreSQL descartável, aplica migrações, usa papel runtime sem superuser/BYPASSRLS e inicia o servidor real em modo PostgreSQL atrás do proxy. Chromium usa as telas reais de login, contexto e portal. O teste confere cookie Secure/HttpOnly/SameSite Strict, lista restrita à empresa, bytes do PDF baixado, ciência explícita e auditoria com ator/IP/request ID. Também verifica acesso anônimo, publicação alheia, contexto sem vínculo, CSRF inválido, origem externa, cabeçalho de IP forjado, revogação de vínculo/publicação, logout e recusa de caminhos privados. O PDF é gerado pelo Chromium a partir de conteúdo sintético, sem dados operacionais.

Essa jornada passou em 09/10/2026. O cliente Node valida o certificado por uma confiança temporária no subprocesso; o Chromium aceita exclusivamente a chave pública SPKI do certificado temporário, sem `ignoreHTTPSErrors` ou desativação geral de validação. Servidor, proxy, navegador, banco e certificado do ensaio são encerrados/removidos ao final. Nenhum certificado foi instalado no Windows, e o ambiente operacional permanece inalterado.

S6-09 permanece parcial: a configuração operacional do certificado, a proteção/recuperação das pastas e a validação do ambiente efetivamente adotado ainda precisam ser concluídas. A jornada local automatizada de login/portal/download pelo proxy está validada.
