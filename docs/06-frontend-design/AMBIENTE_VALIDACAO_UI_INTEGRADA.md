# Ambiente descartável de validação — S00-T03

Execução: 11/10/2026. Infraestrutura comum para as próximas tasks do [plano de sprints](PLANO_SPRINTS_UI_INTEGRADA.md).

## Fixture e ciclo de vida

`test/ui-integrated-fixture.mjs` exporta `prepararFixtureUiIntegrada(setup)` e `validarFixtureUiIntegrada(browser, origin, fixture, setup)`. O runner `test/postgres-https.integration.mjs` cria o banco, migra, concede acesso ao papel runtime, prepara a fixture e executa as jornadas. O preparo verifica `current_database()` e recusa nomes fora de `mediador_https_test_<32 caracteres hexadecimais>` antes de inserir dados.

| Identidade sintética | Vínculo | Validação real |
| --- | --- | --- |
| Administrador | Membro administrador dos escritórios A e B | Login, leitura, controles de edição, gestão do escritório, troca A/B, recarga, isolamento e logout |
| Operador | Membro operador do escritório A | Leitura, controles de edição, gestão do escritório/plataforma recusada, contexto B recusado e logout |
| Suporte | Papel global de suporte, sem vínculo de membro | Concessão real, leitura sem controles de edição, POST recusado pela API, troca A/B, revogação da concessão anterior, recarga e encerramento explícito |
| Administrador da plataforma | Papel global, sem vínculo de membro | Gestão global, concessão contextual administrativa, troca/recarga, isolamento e encerramento explícito |
| Cliente | Representante da empresa A | Jornada existente do portal: login, contexto, PDF, ciência, auditoria/IP, isolamento, CSRF/origem, revogação e logout |

Cada escritório contém uma empresa. Nomes e CNPJs são sintéticos, e-mails usam `example.invalid`. A senha é aleatória por execução, existe apenas em memória e não é impressa. A função retorna IDs e credenciais para uso interno da jornada; não persistir esse objeto como artefato.

O runner gera certificado local temporário, escolhe portas livres em loopback, inicia o servidor compilado com o banco descartável e usa Chromium headless pelo proxy HTTPS. A URL tem formato `https://localhost:<porta aleatória>` e só existe durante o teste. As rotas não são mockadas nessa jornada.

Ao terminar, inclusive em falha, o runner fecha navegador, proxy e processo filho, encerra o pool, remove somente o banco cujo nome aleatório foi validado e apaga o diretório temporário do certificado. Não inicia workers de coleta, IA ou SMTP. `AUTH_SMTP_ENABLED=0` é passado ao servidor do ensaio.

## Pré-requisitos

- Node e dependências do projeto instalados; Chromium do Playwright disponível (`npm run playwright:install` quando necessário).
- PostgreSQL local acessível, conta administrativa com permissão de criar/remover bancos de teste e papel runtime já provisionado, sem superuser ou bypass RLS.
- Variáveis de conexão administrativas: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`; runtime: `PGAPPUSER`, `PGAPPASSWORD`. A fábrica existente carrega `.env` e `.env.docker`; não imprimir esses arquivos nem copiar suas credenciais para documentação.
- OpenSSL disponível no PATH ou em um dos caminhos do Git para Windows já reconhecidos pelo runner. `OPENSSL_BIN` pode indicar outro executável.

O ensaio usa a conexão administrativa para criar um banco novo e migra somente esse banco. Não é preciso substituir o banco configurado, importar dados operacionais ou executar scripts de provisionamento novamente. Não executar ensaios que recompilam `web/vue` simultaneamente, pois compartilham o artefato de build.

## Comandos reproduzíveis

Executar na raiz do projeto, em sequência:

```powershell
npm run typecheck
npm run test:vue-ui
npm run test:postgres-https
```

- `typecheck`: TypeScript do backend e Vue.
- `test:vue-ui`: compila o frontend e roda a jornada controlada de componentes com APIs simuladas. É complementar à persistência real.
- `test:postgres-https`: executa `build` completo e o ensaio com PostgreSQL, HTTPS e Chromium. Também verifica os atributos do papel runtime.

Para reaproveitar a fixture em novas jornadas, importar as funções do helper e manter a criação/limpeza no runner. Usar os IDs retornados, nunca IDs fixos. Asserções de novas mutações devem conferir o estado persistido e as permissões relevantes. Não usar essa fixture contra a aplicação já aberta com dados operacionais.

## Evidências desta execução

| Verificação | Resultado observado |
| --- | --- |
| `npm run typecheck` | Aprovado, código de saída 0 |
| `npm run test:vue-ui` | Aprovado, código de saída 0; shell/contexto, mobile, cadastros/vínculos/CNPJ, documentos, revisão/conflito, publicações/auditoria, suporte e placeholders |
| Build operacional via `test:postgres-https` | Aprovado; 46 módulos frontend, 148 módulos operacionais e 40 históricos excluídos |
| `npm run test:postgres-https` | Aprovado, código de saída 0; quatro jornadas novas de papéis e jornada real existente do cliente |
| Concessões | Papel derivado conferido; concessão anterior revogada ao trocar escritório; encerramento explícito torna leitura subsequente 403; eventos de início/fim presentes na auditoria |
| Persistência/contexto | Empresa B permanece acessível após recarga para usuários autorizados; empresa A não permanece na tela de B; acesso cruzado recusado pela API |
| Limpeza | Runner verifica pelo nome exato que seu banco foi removido. Inventário do cluster também encontrou dois outros bancos no namespace de ensaio; sua origem não foi determinada e eles foram preservados |

Não foi encontrada falha preexistente nos comandos executados. As telas ainda pendentes continuam pendentes: esta baseline não comprova fluxos novos de monitoramento, envios, gestão, plataforma ou alterações documentais completas. Os testes não produzem capturas de aceite visual nesta task.

Próxima execução: **S01-T01**, aplicar os tokens e padrões compartilhados definidos na [especificação visual](ESPECIFICACAO_VISUAL_UI_INTEGRADA.md), usando este ambiente para regressão.
