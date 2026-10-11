# Application Security Policies & Boundary Enforcement — mte-mediador-monitor-unificado

> **Owner:** Engenharia/Arquitetura (Security Lead a designar) · **Classificação do documento:** Interno
> **Versão:** 1.0 · **Status:** Draft
> **Artefatos-fonte:** System Architecture Document (SAD) v1.0, Non-Functional Requirements (NFR) v1.0, diagnóstico determinístico do workspace

## 1. Threat Model Overview

* **Ativos a proteger:**
  - Base consolidada de CCTs e aditivos no arquivo `.sqlite` (integridade garantida por `fingerprintDocumentos` — NFR-A04).
  - Credenciais de usuários administradores/operadores (hashes gerados por `criarHashSenha` — NFR-SEC01).
  - Tokens de sessão e de recuperação de senha (protegidos por `hashToken` — NFR-SEC03).
  - Segredos operacionais em `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, segredo de sessão, porta HTTP.
  - Dados de contato de clientes e administradores (PII — NFR-C01, LGPD).
  - Documentos temporários (PDF/Word) baixados durante a coleta.
* **Atores de ameaça considerados:**
  - Usuário externo malicioso com acesso à interface HTTP administrativa (única superfície inbound).
  - Operador autenticado tentando escalada de privilégio (admin → dados além de seu papel).
  - Conteúdo hostil vindo de fontes externas: HTML de portais de CCT (via `playwright`), PDFs/Word malformados (via `pdf-parse`/`word-extractor`), respostas da API de CNPJ.
  - Vazamento acidental via logs (26 chamadas `console.*` residuais — NFR-SEC04).
* **Superfícies de ataque principais:**
  - **Servidor HTTP próprio** (`src/auth-http.ts`: `criarAcessoHttp`, `tratar`, `validarRequisicao`) — sem framework, roteamento e parsing implementados manualmente; `criarAcessoHttp` tem complexidade ciclomática 61, o que eleva o risco de caminhos de validação esquecidos (NFR-M01).
  - **Autenticação/autorização** (`src/autenticacao.ts`, `src/auth-cli.ts`) — `criarAutenticacao` com complexidade 22.
  - **Web scraping outbound** (`playwright`) — execução de páginas de terceiros em browser real no mesmo host do banco.
  - **Parsing de documentos** (`pdf-parse`, `word-extractor`) — entrada não confiável processada in-process.
  - **Arquivo SQLite local** — corrupção, acesso indevido ao arquivo, ausência de criptografia nativa.
  - **SMTP outbound** (`nodemailer`) — credenciais em `.env`.

## 2. Context Isolation Boundary

* **Princípio:** O sistema é **single-tenant e single-process** (NFR-S01): não existe isolamento entre tenants porque não há multi-tenancy no modelo de dados. O boundary de isolamento real é entre **(a) sessões de usuários autenticados** e **(b) o conteúdo não confiável executado/processado durante a coleta** (páginas web via `playwright`, documentos PDF/Word).
* **Mecanismo de enforcement:**
  - **Sessões escopadas:** tokens de sessão armazenados como hash (`hashToken`) na tabela de sessões do SQLite; middleware `exigirPermissao` aplica RBAC simples (admin/operador) em cada requisição sensível (NFR-SEC02).
  - **CSRF:** middleware `exigirCsrf` obrigatório em toda rota que altera estado (NFR-SEC02).
  - **Isolamento do scraper:** o browser do `playwright` roda headless no mesmo host; como medida de contenção, o contexto de navegação **não deve** compartilhar cookies/credenciais da sessão administrativa, e o perfil do browser deve ser efêmero (sem persistência de storage entre execuções de coleta).
  - **Sem IPC/rotas detectadas:** o diagnóstico não identificou rotas/IPC formais; todo o controle de acesso inbound passa por `validarRequisicao`/`tratar` em `auth-http.ts` — qualquer novo endpoint DEVE passar por esses middlewares.
* **Validação:**
  - Testes `test:auth-ui` e `test:clientes-ui` devem cobrir: acesso sem sessão → 401; acesso com papel insuficiente → 403; requisição sem token CSRF → rejeição.
  - Auditoria manual obrigatória de qualquer alteração em `auth-http.ts` dada a complexidade ciclomática atual (61 em `criarAcessoHttp`, 26 em `tratar`) até a refatoração prevista em NFR-M01.

## 3. Workspace / Filesystem Boundary Validation

* **Regra:** Todo acesso ao sistema de arquivos (diretório temporário de PDFs/Word baixados, caminho do arquivo `.sqlite`, arquivos de exportação) deve ser resolvido e validado contra um diretório raiz permitido configurado via `.env`. **É proibido** aceitar caminhos fornecidos por requisições HTTP ou derivados de conteúdo extraído (nomes de arquivo vindos de portais de CCT ou de metadados de PDF) sem sanitização e validação de contenção.

```typescript
// Regra algorítmica de referência
function isPathAllowed(basePath: string, targetPath: string): boolean {
  const resolved = path.resolve(basePath, targetPath);
  return resolved.startsWith(path.resolve(basePath) + path.sep);
}
```

* **Aplicações concretas neste projeto:**
  - Nomes de arquivos baixados pelo scraper devem ser **regerados internamente** (ex: hash/fingerprint do documento) em vez de usar o nome remoto, eliminando risco de `../` ou caracteres especiais vindos da fonte externa.
  - O caminho do `.sqlite` e do diretório temporário devem ser absolutos, definidos em `.env`, nunca concatenados com input externo.
* **Casos de teste obrigatórios (a adicionar em `vitest`):**
  - Path traversal: `../../etc/passwd`, `..\\..\\` (Windows), sequências URL-encoded (`%2e%2e%2f`).
  - Symlinks maliciosos dentro do diretório temporário apontando para fora do workspace.
  - Caminhos absolutos injetados (`/etc/...`, `C:\...`) onde se espera caminho relativo.
  - Nomes de arquivo com NUL byte ou caracteres de controle vindos de metadados de documentos.

## 4. Command Execution Boundary

* **Situação real:** O código **não executa comandos de shell arbitrários** — não há uso de `child_process` identificado no diagnóstico. A "execução" existente é: (a) scripts CLI operacionais via `npm run` (`check:auto`, `seed:auto`, `auth:bootstrap`, `importar-legado`, `reanalisar`) e (b) automação de browser via `playwright`.
* **Política:**
  - **Allowlist de automação:** as únicas rotinas agendadas permitidas via `node-cron` são as já existentes (`check:auto`, `seed:auto`, consolidação). Qualquer nova rotina agendada exige revisão de código e registro neste documento.
  - **Proibição de shell-out:** é vedado introduzir `child_process.exec`/`spawn` com strings dinâmicas. Se uma necessidade futura exigir execução de processo, usar `spawn` com array de argumentos (sem shell), allowlist explícita de binários e timeout.
  - **Timeout máximo:** navegações e seletores do `playwright` já possuem timeouts configurados no scraper; o valor máximo permitido é de 60s por página e 5min por rotina de coleta completa [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — os timeouts existem no código, mas os valores exatos não foram extraídos no diagnóstico].
  - **Isolamento de rede (egress):** o processo só precisa de egress para: portais oficiais de CCT (lista de domínios mantida no scraper), API de CNPJ e servidor SMTP. Recomenda-se regra de firewall no host limitando egress a esses destinos [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — controle de infraestrutura, fora do código].
  - **Auditoria:** toda execução de rotina agendada deve registrar início, fim, resultado e erro (sem dados sensíveis) no log estruturado a ser implementado (NFR-O01).

## 5. Data Protection Rules

* **Classificação de dados:**

| Classe | Exemplos no projeto | Tratamento |
| :--- | :--- | :--- |
| Público | Texto de CCTs publicadas em portais oficiais | Sem restrição |
| Interno | Fingerprints de documentos, cache de CNPJ, logs operacionais | Acesso restrito ao processo |
| Confidencial | Dados de clientes, configurações de coleta | Acesso apenas autenticado (RBAC) |
| Restrito (PII/Sensível) | Senhas (hash), tokens de sessão/recuperação, credenciais SMTP, dados de contato de administradores | Nunca em logs; hash irreversível; acesso mínimo |

* **Criptografia em repouso:**
  - **Senhas:** hash via `criarHashSenha` (NFR-SEC01). O algoritmo exato (bcrypt/scrypt/argon2) **precisa ser confirmado** em `src/autenticacao.ts` — o SAD registra essa verificação como pendente. Até confirmação: [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] recomenda-se `scrypt` do módulo `node:crypto` (sem nova dependência) com salt único por senha.
  - **Tokens:** armazenados apenas como hash (`hashToken`), nunca em texto claro (NFR-SEC03).
  - **Banco SQLite:** `better-sqlite3` **não oferece criptografia nativa** no build utilizado. A proteção do arquivo `.sqlite` depende de: permissões de filesystem restritas (`chmod 600`, dono = usuário do serviço) e, se exigido por compliance, criptografia de disco/volume no nível do host [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — decisão de infraestrutura].
* **Criptografia em trânsito:**
  - **Outbound:** HTTPS obrigatório para API de CNPJ e portais de CCT; SMTP deve usar STARTTLS/TLS (porta 587/465) — validar configuração de `SMTP_PORT` no `.env`.
  - **Inbound (interface admin):** o servidor HTTP nativo não implementa TLS no código. Política: a interface administrativa deve ser exposta **apenas em interface local/VPN**, ou atrás de proxy reverso com TLS 1.2+ terminado na infraestrutura [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — o SAD já registra que a responsabilidade de rede é da hospedagem].
* **Mascaramento/Anonimização:** ambientes de desenvolvimento/teste não devem usar cópia integral do `.sqlite` de produção com dados de clientes; usar `seed` para gerar massa sintética [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA].
* **Retenção & Descarte:**
  - Documentos temporários (PDF/Word): o SAD registra que **limpeza automática não está implementada** — é obrigatório implementar remoção após extração bem-sucedida (gap a corrigir).
  - Dados pessoais (LGPD, NFR-C01): política de retenção e processo de exclusão segura [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — hipótese: retenção de dados de contato enquanto o cliente estiver ativo + 5 anos por obrigações trabalhistas; exclusão via remoção do registro no SQLite + exclusão do arquivo em backups expirados.
  - Tokens de recuperação: expiração curta (já prevista em `hashToken` — NFR-SEC03); sessões expiradas devem ser purgadas periodicamente.

## 6. Authentication & Authorization

* **Mecanismo de auth:** implementação própria em `src/autenticacao.ts` + `src/auth-http.ts` (sem Passport/Lucia/NextAuth — decisão registrada no SAD). Login por senha com hash (`criarHashSenha`), sessão via cookie/header HTTP, bootstrap do primeiro administrador exclusivamente via CLI (`npm run auth:bootstrap` — NFR-SEC03), redefinição de senha via `auth:redefinir` e tokens de recuperação com expiração (`hashToken`).
* **Modelo de autorização:** RBAC simples com papéis **admin** e **operador**, enforced por `exigirPermissao` em cada rota sensível (NFR-SEC02). Não há ABAC nem permissões granulares por recurso.
* **Política de senha/MFA:**
  - Senha: armazenamento apenas como hash (NFR-SEC01); leitura de senha no CLI via `lerSenha` sem echo.
  - Política de complexidade mínima e MFA: **não implementados no código** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — recomenda-se mínimo de 12 caracteres e, dado o acesso restrito via VPN/local, MFA pode ser substituído por controle de acesso à rede, sujeito a validação humana.
* **Gestão de sessão:** sessões persistidas no SQLite (tabela de sessões); tokens armazenados como hash; expiração e revogação via logout (`/logout`). Cadência exata de expiração a confirmar no código [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — recomenda-se expiração de 12h para sessões administrativas e revogação imediata em troca de senha.

## 7. Secrets Management

* **Armazenamento:** segredos residem em `.env` (carregado via `dotenv`), **não versionado**. Não há integração com Vault/Secrets Manager — coerente com a topologia de nó único de baixo custo (NFR-CO01). Regras obrigatórias:
  - `.env` com permissão `600`, dono = usuário do serviço.
  - Proibido commitar `.env`; manter `.env.example` apenas com chaves (sem valores).
  - Proibido ler segredos de qualquer outra fonte que não `process.env` no código.
* **Inventário de segredos conhecidos:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, segredo de sessão/CSRF, porta HTTP. Qualquer novo segredo deve ser registrado aqui.
* **Rotação:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — recomenda-se rotação semestral das credenciais SMTP e do segredo de sessão, e imediata em caso de suspeita de comprometimento; rotação do segredo de sessão invalida todas as sessões ativas (aceitável dado o baixo número de operadores).
* **Acesso:** princípio do menor privilégio — apenas o processo Node.js e o administrador do host têm leitura do `.env`; o backup (NFR-A02) inclui `.env` e deve ser criptografado em repouso no destino externo.

## 8. Input Validation & Output Encoding

* **Validação:** schema validation com `zod` em toda borda de entrada — já aplicada em `validarExtracaoCct`, `exigirPermissao`, `exigirCsrf`. Política: **allowlist, não denylist** — todo payload HTTP e todo dado extraído de documento deve ser validado contra schema `zod` antes de persistir.
* **Prevenção de injeção:**
  - **SQL injection:** o acesso a dados usa `better-sqlite3` com `db.prepare()` e parâmetros bindados — **é proibido** concatenar strings em SQL. Revisões de código devem rejeitar qualquer `db.exec()`/`prepare()` com interpolação de input externo.
  - **Command injection:** mitigado pela proibição de shell-out (Seção 4).
  - **Prompt injection:** não aplicável — o sistema não integra LLM.
  - **Conteúdo hostil de scraping:** texto extraído por `pdf-parse`/`word-extractor` e HTML de portais é **não confiável**; `validarExtracaoCct` não deve mascarar erros (NFR-C02), e falhas de parsing devem abortar a consolidação do documento afetado sem derrubar a rotina.
* **Sanitização de output:** todo conteúdo extraído renderizado na UI ou em e-mails deve passar por encoding via `html-entities` (já em uso) para prevenir XSS. É proibido injetar HTML bruto de fontes externas na interface administrativa.

## 9. Dependency & Supply Chain Security

* **Inventário real (9 dependências de produção):** `better-sqlite3`, `dotenv`, `html-entities`, `nodemailer`, `pdf-parse`, `playwright`, `word-extractor`, `zod`, `node-cron` — mais 6 de desenvolvimento (`tsx`, `typescript`, `vitest`, `@types/*`).
* **Scan de vulnerabilidades:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — executar `npm audit` em CI a cada merge e semanalmente agendado; o SAD já lista auditoria de dependências como item de hardening (NFR-SEC04).
* **Política de atualização:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — patches críticos (CVE com exploit ativo ou CVSS ≥ 9) em até 7 dias; altas em até 30 dias; demais no ciclo normal de release. `playwright` exige atenção especial: atualização de browser pode quebrar seletores de scraping (NFR-O02) — atualizações devem ser acompanhadas de `test:smoke`.
* **Riscos específicos conhecidos:** `pdf-parse` 1.1 e `word-extractor` 1.0 são pacotes de baixa manutenção — monitorar abandono e avaliar substitutos se CVEs não forem corrigidos.
* **SBOM:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — gerar SBOM (ex: `npm sbom` / CycloneDX) a cada release e arquivar junto ao artefato de build; hoje não há SBOM gerado.

## 10. Logging & Auditability

* **O que deve ser logado:**
  - Falhas e sucessos de autenticação (sem senha), logouts, redefinições de senha.
  - Mudanças de permissão/papel e criação de usuários (`auth:bootstrap`).
  - Execuções de rotinas agendadas (`node-cron`): início, fim, documentos processados, erros de extração (NFR-O01/O02).
  - Falhas de scraping por fonte (para alerta de quebra de layout — NFR-O02).
  - Locks/timeouts de escrita no SQLite (NFR-P02).
* **O que NUNCA deve ser logado (proibição absoluta):**
  - Senhas (em qualquer formato, inclusive hash em logs de debug).
  - Tokens de sessão e de recuperação (nem parcialmente).
  - Credenciais SMTP e demais valores de `.env`.
  - PII em texto claro (dados de contato de clientes/administradores, CNPJs associados a pessoas) — NFR-SEC04.
* **Estado atual e obrigação:** existem **26 chamadas `console.*` residuais** (diagnóstico: `src/auth-cli.ts`, `src/index.ts`, entre outros) — sua eliminação e substituição por logger estruturado com redação de campos sensíveis é **obrigatória** (NFR-SEC04, NFR-O01) antes de qualquer exposição da interface HTTP fora de ambiente local.
* **Retenção de logs de auditoria:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] — recomenda-se 12 meses para eventos de autenticação/autorização (alinhado a investigações LGPD) e 90 dias para logs operacionais, com rotação de arquivo no host.

## 11. Incident Response (Segurança)

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

* **Premissas adotadas:** projeto de nó único operado por equipe pequena, sem canal de segurança formalizado no código.
* **Processo de disclosure:** criar canal responsável (ex: `security@<dominio-da-organização>`) e publicá-lo em `SECURITY.md` no repositório; proibir abertura de issues públicas com detalhes de vulnerabilidade antes da correção.
* **SLA de resposta por severidade (proposta):**

| Severidade | Exemplo | Resposta inicial | Correção/mitigação |
| :--- | :--- | :--- | :--- |
| Crítica | Vazamento de credenciais, bypass de auth em `auth-http.ts` | 4h | 24h + rotação de segredos |
| Alta | Escalada de privilégio via `exigirPermissao`, XSS na UI admin | 24h | 7 dias |
| Média | Vazamento de PII em logs, falha de CSRF em rota específica | 72h | 30 dias |
| Baixa | Dependência desatualizada sem exploit | Próximo ciclo | Próximo release |

* **Passos pós-incidente obrigatórios:** contenção (derrubar processo/isolar host), preservação do `.sqlite` e logs para forense, rotação de todos os segredos do `.env`, restauração a partir de backup conforme RTO ≤ 4h (NFR-A02), post-mortem documentado.

## 12. Compliance Mapping

| Requisito Regulatório | Como é atendido | Evidência |
| :--- | :--- | :--- |
| LGPD — Segurança de dados pessoais (Art. 46) [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] | Hash de senhas (`criarHashSenha`), controle de acesso RBAC (`exigirPermissao`), proibição de PII em logs (NFR-SEC04) | NFR-SEC01/SEC02/SEC04; código em `src/autenticacao.ts` |
| LGPD — Titularidade e exclusão de dados (Art. 18) [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] | Processo de exclusão de dados de contato **a definir** — não implementado no código | NFR-C01; pendente de implementação |
| Auditabilidade de extração (autenticidade da fonte textual) | `validarExtracaoCct` não mascara erros; `fingerprintDocumentos` garante integridade/unicidade | NFR-C02, NFR-A04 |
| Gestão de acesso administrativo | Bootstrap via CLI (`auth:bootstrap`), tokens de recuperação com hash e expiração (`hashToken`) | NFR-SEC03; scripts `auth:bootstrap`, `auth:redefinir` |
| Proteção de credenciais em configuração | Segredos exclusivamente em `.env` não versionado, carregados via `dotenv` | SAD §11; `package.json` (dependência `dotenv`) |

> **Pendências de validação humana consolidadas:** algoritmo exato de `criarHashSenha`; valores de timeout do scraper; política de retenção LGPD; canal e SLAs de incident response; criptografia de disco do host; geração de SBOM; ferramenta de scan de dependências em CI.