# User Stories Specification

> **Épico relacionado:** mte-mediador-monitor-unificado · **Sprint:** 1 · **Status geral:** Backlog

---

## US-001 — Autenticação Básica e Sessão

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: refatoração de `criarAutenticacao` CC 22 e `criarAcessoHttp` CC 61 incluída no escopo)
* **Épico:** Autenticação e Acesso
* **Labels:** backend, security, tech-debt
* **Story Map:** REQ-001 (Slice 1: MVP)

### 1. Description (INVEST)
* **As a** Administrador / Usuário do Sistema
* **I want to** autenticar-me com credenciais válidas e obter uma sessão segura
* **So that** eu possa acessar funcionalidades protegidas do sistema de monitoramento de CCTs

*Checklist INVEST — a story deve ser: Independent, Negotiable, Valuable, Estimable, Small, Testable.*

### 2. Business Context
Primeira story do MVP: sem autenticação funcional, nenhuma outra funcionalidade pode ser validada. O diagnóstico revela complexidade ciclomática alta nas funções de auth (`criarAutenticacao` CC 22, `criarAcessoHttp` CC 61, `tratar` CC 26) que devem ser refatoradas como parte desta story para mitigar risco de segurança (NFR-M01, NFR-SEC02).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Login bem-sucedido com credenciais válidas
* **Given** o usuário possui credenciais cadastradas no banco `better-sqlite3` com senha protegida por `criarHashSenha`
* **When** o usuário submete email e senha corretos via requisição HTTP
* **Then** o sistema valida a senha via `criarHashSenha`, gera `cookieSessao`, valida CSRF via `exigirCsrf` e redireciona para a página inicial com acesso concedido

#### Scenario 2: Tentativa de login com senha incorreta
* **Given** o usuário submete email válido mas senha incorreta
* **When** o sistema processa a autenticação via `criarAutenticacao`
* **Then** o acesso é negado, mensagem de erro de autenticação é exibida e nenhum `cookieSessao` é gerado

#### Scenario 3: Requisição sensível sem token CSRF válido
* **Given** o usuário possui sessão válida (`cookieSessao`)
* **When** o usuário faz uma requisição POST sem header/token CSRF ou com token inválido
* **Then** a função `exigirCsrf` bloqueia a requisição e retorna erro de segurança (HTTP 403)

#### Scenario 4: Acesso a rota protegida sem permissão adequada
* **Given** usuário autenticado sem permissão de administrador
* **When** tenta acessar endpoint que exige `exigirPermissao('admin')`
* **Then** o sistema retorna erro de autorização (HTTP 403) e loga a tentativa

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Tela de login responsiva (1366px–1920px) com campos email/senha, botão "Entrar" e link "Esqueci a senha"
* **Estados da interface:** loading (submissão), error (credenciais inválidas/CSRF), success (redirecionamento)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** `src/autenticacao.ts` (`criarAutenticacao`, `criarHashSenha`), `src/auth-http.ts` (`criarAcessoHttp`, `validarRequisicao`, `tratar`, `exigirCsrf`, `exigirPermissao`), `src/auth-cli.ts`
* **Dependências técnicas:** `better-sqlite3` (tabela de usuários/sessões), `zod` (validação de entrada), `dotenv` (configuração)
* **Considerações de performance/segurança:** Refatorar `criarAutenticacao` e `criarAcessoHttp` em funções menores (NFR-M01); eliminar 26 chamadas `console.*` residuais (NFR-SEC04); hashing seguro obrigatório (NFR-SEC01, BR-AUTH-01)

### 6. Out of Scope
* Recuperação de senha via e-mail (coberto em US-008)
* Gestão de usuários (CRUD de administradores)
* MFA/2FA

### 7. Definition of Ready
- [ ] Critérios de aceite validados com PO
- [ ] Plano de refatoração das funções de alta complexidade aprovado
- [ ] Esquema da tabela de usuários/sessões no `better-sqlite3` confirmado

### 8. Definition of Done
- [ ] Código implementado e revisado (PR aprovado)
- [ ] Testes unitários cobrindo cenários BDD (vitest)
- [ ] Testes E2E `test:auth-ui` passando
- [ ] Tipagem estrita TypeScript (`typecheck` ok)
- [ ] Lint/format ok
- [ ] Complexidade ciclomática de `criarAutenticacao` ≤ 10 e `criarAcessoHttp` ≤ 15
- [ ] Zero chamadas `console.*` em código de produção
- [ ] Documentação de API de auth atualizada

### 9. Traceability
* **NFRs relacionadas:** NFR-SEC01, NFR-SEC02, NFR-SEC04, NFR-M01
* **Use Cases relacionados:** UC-01
* **Riscos relacionados:** Risco de Segurança no MVP (Story Map §6), Complexidade ciclomática alta

---

## US-002 — Coleta Automatizada via Playwright

* **Priority:** Must
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: múltiplas fontes externas com seletores distintos; tratamento de falhas de navegação)
* **Épico:** Monitoramento e Extração
* **Labels:** backend, automation, playwright
* **Story Map:** REQ-002 (Slice 1: MVP)

### 1. Description (INVEST)
* **As a** Sistema (Processo Automatizado)
* **I want to** executar varredura periódica em fontes externas configuradas via `loadWatchConfig` usando `playwright`
* **So that** novos documentos de CCT sejam identificados e baixados automaticamente sem intervenção manual

### 2. Business Context
Core do MVP: a coleta automatizada substitui processo manual de monitoramento de sites de sindicatos/órgãos públicos. Disparada por `node-cron` via scripts `check:auto` e `seed:auto`. Risco de quebra por mudança de layout (Story Map §6).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Varredura agendada identifica e baixa novos documentos
* **Given** o `node-cron` dispara a rotina `check:auto` e `loadWatchConfig` carrega fontes configuradas
* **When** o `playwright` navega em cada fonte e encontra links para PDFs/DOCs não processados
* **Then** o sistema baixa os arquivos, armazena localmente e registra a origem (URL, data, fonte) para processamento posterior

#### Scenario 2: Fonte externa com layout alterado (seletores não encontrados)
* **Given** `loadWatchConfig` define seletores CSS/XPath para uma fonte
* **When** o `playwright` não localiza os elementos esperados na página
* **Then** o sistema registra falha de coleta com detalhes (fonte, seletor, HTML atual), gera alerta para administrador e continua processando demais fontes [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

#### Scenario 3: Execução manual via script `reanalisar`
* **Given** administrador executa `npm run reanalisar`
* **When** o sistema força varredura de todas as fontes ignorando caches temporários
* **Then** todos os documentos disponíveis são baixados e processados conforme Scenario 1

#### Scenario 4: Falha de rede ou timeout durante navegação
* **Given** uma fonte externa está indisponível ou lenta
* **When** o `playwright` excede timeout configurado ou recebe erro de rede
* **Then** o erro é logado estruturadamente (NFR-O01), a fonte é marcada como "falha temporária" e a rotina prossegue para a próxima fonte

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A (processo headless)
* **Estados da interface:** CLI/logs mostram: "Iniciando coleta", "Fonte X: OK", "Fonte Y: Falha - seletor não encontrado", "Coleta finalizada"

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo de coleta (arquivos não explicitados no diagnóstico, mas invocados por `check:auto`/`seed:auto`), `loadWatchConfig`, `playwright`
* **Dependências técnicas:** `playwright` (navegadores instalados via `playwright:install`), `node-cron` (agendamento), `better-sqlite3` (registro de documentos baixados)
* **Considerações de performance/segurança:** Execução assíncrona/background (NFR-P03); logs estruturados substituindo `console.*` (NFR-O01); alertas para falhas de layout (NFR-O02)

### 6. Out of Scope
* Extração de texto dos arquivos baixados (US-003)
* Painel de monitoramento em tempo real (US-012, Slice 3)

### 7. Definition of Ready
- [ ] `loadWatchConfig` documentado com exemplos de seletores por fonte
- [ ] Lista de fontes-alvo validada com stakeholders
- [ ] Ambiente de testes com `playwright` configurado

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes de integração simulando fontes com/sem documentos novos
- [ ] Testes de falha: seletor alterado, rede indisponível, timeout
- [ ] Logs estruturados (JSON) para NFR-O01
- [ ] Alerta de falha de layout implementado (NFR-O02)
- [ ] `check:auto` e `seed:auto` executando sem erros em staging

### 9. Traceability
* **NFRs relacionadas:** NFR-P03, NFR-A01, NFR-O01, NFR-O02
* **Use Cases relacionados:** UC-02
* **Riscos relacionados:** Risco de UX no MVP (Story Map §6), Dependência de fontes externas

---

## US-003 — Extração de Texto (PDF/DOC)

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: dois formatos com bibliotecas distintas; validação de qualidade da extração)
* **Épico:** Monitoramento e Extração
* **Labels:** backend, processing, pdf, doc
* **Story Map:** REQ-003 (Slice 1: MVP)

### 1. Description (INVEST)
* **As a** Sistema (Processo Automatizado)
* **I want to** extrair conteúdo textual de arquivos PDF (`pdf-parse`) e DOC (`word-extractor`) baixados
* **So that** o texto bruto possa ser validado, fingerprinted e consolidado em CCTs

### 2. Business Context
Etapa obrigatória após coleta (US-002). A extração deve ser auditável (BR-EXT-01, NFR-C02) e processada em background (NFR-P03). Duplicidade evitada via `fingerprintDocumentos` (BR-EXT-02, NFR-A04).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Extração bem-sucedida de PDF textual
* **Given** um arquivo PDF baixado contendo texto selecionável
* **When** o sistema processa via `pdf-parse`
* **Then** o texto completo é extraído, `fingerprintDocumentos` é gerado, e o conteúdo bruto + fingerprint + metadados (fonte, data) são armazenados no `better-sqlite3`

#### Scenario 2: Extração bem-sucedida de DOC/DOCX
* **Given** um arquivo DOC/DOCX baixado
* **When** o sistema processa via `word-extractor`
* **Then** o texto é extraído, `fingerprintDocumentos` gerado e armazenado conforme Scenario 1

#### Scenario 3: Arquivo corrompido ou formato não suportado
* **Given** um arquivo baixado que `pdf-parse` ou `word-extractor` não conseguem ler
* **When** a extração falha
* **Then** `validarExtracaoCct` identifica a falha, marca o documento como "Erro de Extração" no banco, registra erro detalhado para auditoria e **não** mascara o erro (BR-EXT-01, NFR-C02)

#### Scenario 3: Documento duplicado (mesmo fingerprint)
* **Given** um documento recém-baixado gera `fingerprintDocumentos` idêntico a um já armazenado
* **When** o sistema verifica duplicidade antes de inserir
* **Then** o documento é descartado, log de "duplicata ignorada" é registrado e o processo continua

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A
* **Estados da interface:** Logs CLI: "Extraindo: arquivo.pdf", "OK - fingerprint: abc123", "ERRO - arquivo corrompido", "DUPLICATA - fingerprint: abc123"

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Pipeline de extração (invoca `pdf-parse`, `word-extractor`, `fingerprintDocumentos`, `validarExtracaoCct`), armazenamento no `better-sqlite3`
* **Dependências técnicas:** `pdf-parse`, `word-extractor`, `html-entities` (sanitização), `better-sqlite3`
* **Considerações de performance/segurança:** Processamento assíncrono/background (NFR-P03); integridade via fingerprint (NFR-A04); auditabilidade (NFR-C02)

### 6. Out of Scope
* OCR para PDFs baseados em imagem (não suportado pelas libs atuais)
* Classificação automática de tipo de documento (CCT, aditivo, etc.)

### 7. Definition of Ready
- [ ] Amostras de PDFs/DOCs reais das fontes-alvo disponíveis para teste
- [ ] Estratégia de `fingerprintDocumentos` definida (hash de conteúdo? metadados?)

### 8. Definition of Done
- [ ] Testes com corpus real de PDFs/DOCs das fontes-alvo
- [ ] `validarExtracaoCct` não mascara erros (teste com arquivo corrompido)
* [ ] Duplicatas corretamente identificadas via fingerprint
* [ ] Logs estruturados para NFR-O01
* [ ] Performance de extração dentro do aceitável para background job

### 9. Traceability
* **NFRs relacionadas:** NFR-P03, NFR-A04, NFR-C02
* **Use Cases relacionados:** UC-02
* **Riscos relacionados:** Falha na Extração de Texto (UC-02 EX-2)

---

## US-004 — Validação de CNPJ e Cadastro Básico

* **Priority:** Must
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: validação algorítmica + consulta externa; cache local simples)
* **Épico:** Auditoria de Cadastro
* **Labels:** backend, integration, cnpj
* **Story Map:** REQ-004 (Slice 1: MVP)

### 1. Description (INVEST)
* **As a** Administrador / Analista de Cadastro
* **I want to** validar e normalizar CNPJs e consultar dados cadastrais atualizados via serviço externo
* **So that** empresas vinculadas a CCTs estejam corretamente identificadas na base

### 2. Business Context
Vinculação empresa↔CCT requer CNPJ válido e dados atualizados. Usa `normalizarCnpj`, `cnpjValido`, `criarConsultaCnpj`. Serviço externo de CNPJ [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (item em aberto no BRD/UC-03).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: CNPJ válido com consulta externa bem-sucedida
* **Given** usuário informa CNPJ (com ou sem formatação)
* **When** o sistema executa `normalizarCnpj` → `cnpjValido` → `criarConsultaCnpj`
* **Then** dados da empresa (razão social, nome fantasia, endereço, situação cadastral) são retornados, cacheados localmente e disponibilizados para vinculação a CCTs

#### Scenario 2: CNPJ inválido (dígitos verificadores incorretos)
* **Given** usuário informa CNPJ com dígitos inválidos
* **When** `cnpjValido` retorna false
* **Then** o sistema interrompe o processo e exibe erro "CNPJ inválido" sem chamar serviço externo

#### Scenario 3: CNPJ válido mas serviço externo indisponível
* **Given** CNPJ passa na validação local
* **When** `criarConsultaCnpj` falha (timeout, HTTP 5xx, rede)
* **Then** o sistema retorna erro claro "Serviço de consulta indisponível", não cacheia resultado negativo e permite retentativa manual

#### Scenario 4: Consulta duplicada usa cache local
* **Given** CNPJ já foi consultado e está no cache local
* **When** usuário solicita consulta do mesmo CNPJ
* **Then** o sistema retorna dados do cache sem chamar serviço externo (NFR-S02, BR-CAD-01)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Formulário com campo CNPJ (máscara 00.000.000/0000-00), botão "Consultar", área de resultado com dados da empresa
* **Estados da interface:** loading (consultando), success (dados preenchidos), error (CNPJ inválido / serviço indisponível), cached (badge "do cache")

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** `src/index.ts` (`auditarCadastro`, `normalizarCnpj`, `cnpjValido`, `criarConsultaCnpj`), cache local (tabela no `better-sqlite3`)
* **Dependências técnicas:** Serviço externo de CNPJ [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA], `better-sqlite3` (cache), `zod` (validação)
* **Considerações de performance/segurança:** Cache local obrigatório (NFR-S02); normalização/validação antes de chamada externa (BR-CAD-01); retry/backoff para escrita no SQLite (NFR-P02)

### 6. Out of Scope
* Migração de dados legados (US-005)
* Cache avançado com TTL/invalidação (US-010, Slice 2)
* Auditoria em lote (US-013, Slice 3)

### 7. Definition of Ready
- [ ] Fornecedor/serviço de consulta CNPJ definido e credenciais configuradas
- [ ] Esquema da tabela de cache de CNPJ no `better-sqlite3` aprovado

### 8. Definition of Done
- [ ] Testes unitários: CNPJ válido/inválido, cache hit/miss, falha de rede
- [ ] Integração real com serviço externo validada em staging
- [ ] Logs estruturados para auditoria de consultas
- [ ] Performance: consulta cacheada < 10ms (NFR-S02)

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-S02
* **Use Cases relacionados:** UC-03
* **Riscos relacionados:** Estabilidade do serviço externo de CNPJ (UC-03 Assumptions)

---

## US-005 — Migração de Dados Legados

* **Priority:** Must
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: volume de dados legado desconhecido; preservação de vínculos históricos complexa)
* **Épico:** Auditoria de Cadastro
* **Labels:** backend, migration, data-integrity
* **Story Map:** REQ-005 (Slice 1: MVP)

### 1. Description (INVEST)
* **As a** Administrador
* **I want to** executar migração única de dados legados via script `importar-legado`
* **So that** cadastros históricos e autenticação sejam preservados no novo sistema sem perda de vínculos

### 2. Business Context
Migração "big bang" para popular o `better-sqlite3` inicial. Usa `migrarCadastros`, `migrarAutenticacao`, `protegerLegado`. Risco de integridade (Story Map §6). Validado via `check:dry` antes da execução real.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Migração completa com `check:dry` prévio
* **Given** administrador executa `npm run check:dry` e valida relatório de simulação
* **When** executa `npm run importar-legado`
* **Then** `migrarCadastros` e `migrarAutenticacao` processam todos os registros, `protegerLegado` garante retrocompatibilidade, e relatório final mostra: total migrado, erros (zero esperados), vínculos preservados

#### Scenario 2: `check:dry` detecta inconsistências
* **Given** dados legados contêm CNPJs inválidos, usuários sem senha, ou vínculos órfãos
* **When** `check:dry` é executado
* **Then** relatório lista cada inconsistência com ID do registro legado, tipo de erro e sugestão de correção; migração real **não** prossegue até correções

#### Scenario 3: Concorrência durante migração (lock SQLite)
* **Given** outro processo tenta escrever no `better-sqlite3` durante migração
* **When** `reservarConsolidacao` (ou equivalente de lock) detecta contenção
* **Then** retry/backoff é aplicado (NFR-P02) e migração completa sem corrupção

#### Scenario 4: Rollback / re-execução idempotente
* **Given** migração falhou parcialmente
* **When** administrador corrige causa raiz e re-executa `importar-legado`
* **Then** registros já migrados são ignorados (idempotência), apenas pendentes são processados

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A (CLI)
* **Estados da interface:** CLI output: "Simulação (dry-run): 1.234 registros, 0 erros", "Migração: [=======>    ] 67%", "Concluído: 1.234 migrados, 0 falhas"

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Scripts `importar-legado`, `check:dry`, `migrarCadastros`, `migrarAutenticacao`, `protegerLegado`, `reservarConsolidacao`
* **Dependências técnicas:** `better-sqlite3` (single-writer lock), formato dos dados legados (não especificado no diagnóstico)
* **Considerações de performance/segurança:** Idempotência; retry/backoff para lock SQLite (NFR-P02); preservação integral de vínculos (BR-CAD-02); logs de auditoria completos

### 6. Out of Scope
* Migração incremental contínua
* Transformação complexa de schema (assume-se compatibilidade via `protegerLegado`)

### 7. Definition of Ready
- [ ] Especificação completa do formato dos dados legados (arquivos, colunas, encoding)
- [ ] Mapeamento campo-a-campo legado → novo schema documentado
- [ ] Ambiente de staging com cópia real dos dados legados

### 8. Definition of Done
- [ ] `check:dry` passa com zero erros em staging
- [ ] `importar-legado` executa com sucesso em staging
- [ ] Validação manual: 100% dos vínculos empresa↔CCT preservados
- [ ] Rollback testado e documentado
- [ ] Tempo total de migração dentro da janela de manutenção acordada

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-A04
* **Use Cases relacionados:** UC-03 (AS-1)
* **Riscos relacionados:** Risco de Integridade no MVP (Story Map §6)

---

## US-006 — Validação de Extração e Alterações

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: fluxo de aprovação humano no loop; comparação de versões)
* **Épico:** Consolidação e Entrega
* **Labels:** backend, workflow, audit
* **Story Map:** REQ-006 (Slice 1: MVP)

### 1. Description (INVEST)
* **As a** Analista Jurídico / Administrador
* **I want to** revisar e aprovar/rejeitar alterações detectadas em CCTs extraídas
* **So that** apenas alterações validadas entrem na base consolidada

### 2. Business Context
Garante auditabilidade (BR-EXT-01, NFR-C02). `validarExtracaoCct` já existe para falhas técnicas; esta story cobre validação semântica/negocial por humano. Pré-requisito para renderização (US-007).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Nova CCT extraída aguarda primeira validação
* **Given** extração (US-003) concluiu com sucesso e gerou fingerprint novo
* **When** analista acessa fila de validação
* **Then** documento aparece com status "Pendente", mostrando: texto extraído, fonte, data, fingerprint; botões "Aprovar" / "Rejeitar" / "Solicitar Reextração"

#### Scenario 2: CCT existente com alterações detectadas
* **Given** nova extração gera fingerprint diferente de versão já aprovada
* **When** analista abre comparação
* **Then** sistema mostra diff (texto novo vs. aprovado), metadados de ambas versões; analista pode "Aprovar nova versão", "Manter versão atual" ou "Marcar para revisão jurídica"

#### Scenario 3: Rejeição com justificativa obrigatória
* **Given** analista clica "Rejeitar" em documento pendente ou alterado
* **When** sistema solicita justificativa
* **Then** justificativa é salva, documento volta para "Erro de Extração" ou "Versão anterior mantida", e notificação é enviada à equipe de coleta

#### Scenario 4: Aprovação dispara consolidação
* **Given** analista aprova documento (novo ou nova versão)
* **When** confirmação é registrada
* **Then** status muda para "Aprovado", `reservarConsolidacao` é acionado para escrita atômica no banco, e documento fica disponível para renderização (US-007)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Lista tipo "inbox" com filtros (Pendente, Alterado, Rejeitado), painel lateral com texto + diff, modal de justificativa
* **Estados da interface:** loading (carregando diff), empty (fila vazia), success (aprovado), error (falha na consolidação)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Fila de validação (novo módulo), `validarExtracaoCct` (estender para fluxo humano), `reservarConsolidacao`, `better-sqlite3` (tabelas: documentos, versões, validações)
* **Dependências técnicas:** Diff textual (algoritmo a definir), `reservarConsolidacao` para concorrência (NFR-S03)
* **Considerações de performance/segurança:** Escrita atômica via reserva (NFR-S03, NFR-P02); trilha de auditoria completa (quem aprovou, quando, justificativa)

### 6. Out of Scope
* Diff visual avançado (side-by-side, highlight semântico) — versão básica textual no MVP
* Notificações por e-mail/Slack (apenas log/in-app no MVP)

### 7. Definition of Ready
- [ ] Fluxo de estados do documento definido (Pendente → Aprovado/Rejeitado → Consolidado)
- [ ] Algoritmo de diff selecionado/testado com amostras reais de CCTs

### 8. Definition of Done
- [ ] Testes E2E: aprovação, rejeição, alteração, reextração
- [ ] Concorrência: dois analistas não aprovam mesmo documento simultaneamente
- [ ] Auditoria: log imutável de todas as decisões
- [ ] Integração com US-007 (renderização) validada

### 9. Traceability
* **NFRs relacionadas:** NFR-S03, NFR-P02, NFR-C02
* **Use Cases relacionados:** UC-02 (validação), UC-03 (consolidação)
* **Riscos relacionados* **Riscos relacionados:** Falha na Extração de Texto (UC-02 EX-2), Concorrência de Escrita (UC-03 EX-2)

---

## US-007 — Renderização de CCT em Markdown

* **Priority:** Must
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: template Markdown definido; função `renderizarCctMarkdown` existe)
* **Épico:** Consolidação e Entrega
* **Labels:** backend, rendering, output
* **Story Map:** REQ-007 (Slice 1: MVP)

### 1. Description (INVEST)
* **As a** Analista Jurídico / Administrador
* **I want to** gerar documento Markdown final a partir de CCT aprovada
* **So that** o documento possa ser exportado, versionado e consumido por ferramentas downstream

### 2. Business Context
Entrega final do MVP: transforma dado validado em artefato legível e portável. Usa `renderizarCctMarkdown` (mencionado no Story Map §2). Requisito de legibilidade (NFR-U02).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Geração de Markdown para CCT aprovada
* **Given** uma CCT com status "Aprovado" e todos os metadados preenchidos
* **When** usuário solicita renderização (CLI ou botão na UI)
* **Then** `renderizarCctMarkdown` gera arquivo `.md` com: cabeçalho padronizado (título, CNPJ, sindicato, vigência), cláusulas estruturadas, rodapé com fingerprint e data de aprovação

#### Scenario 2: CCT com aditivos vinculados
* **Given** CCT principal aprovada possui aditivos também aprovados
* **When** renderização é solicitada
* **Then** o Markdown inclui seção "Aditivos" listando cada um com link/referência, mantendo ordem cronológica

#### Scenario 3: Dados incompletos impedem renderização
* **Given** CCT aprovada falta campo obrigatório (ex: data de vigência, sindicato)
* **When** renderização é tentada
* **Then** sistema retorna erro claro listando campos faltantes e **não** gera arquivo parcial

#### Scenario 4: Exportação em lote
* **Given** administrador executa script de exportação em lote
* **When** múltiplas CCTs aprovadas são processadas
* **Then** cada uma gera seu `.md` em diretório organizado (ex: `/export/YYYY-MM/CNPJ_titulo.md`), com log de sucessos/falhas

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Botão "Exportar Markdown" na tela de detalhes da CCT; preview do Markdown renderizado (HTML) antes de baixar
* **Estados da interface:** loading (gerando), success (download automático), error (campos faltantes listados)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** `renderizarCctMarkdown`, template Markdown (arquivo `.md` ou string template), CLI de exportação
* **Dependências técnicas:** `better-sqlite3` (leitura de CCTs aprovadas + aditivos), `html-entities` (escape se necessário)
* **Considerações de performance/segurança:** Geração síncrona aceitável (arquivo único); sanitização de conteúdo para evitar injeção no Markdown; legibilidade do output (NFR-U02)

### 6. Out of Scope
* Geração de PDF/DOCX a partir do Markdown (ferramentas externas)
* Versionamento Git automático dos `.md` gerados

### 7. Definition of Ready
- [ ] Template Markdown aprovado por Jurídico
- [ ] Lista de campos obrigatórios para renderização definida

### 8. Definition of Done
- [ ] Testes: CCT simples, CCT com aditivos, campos faltantes, lote
- [ ] Output validado visualmente (NFR-U02)
- [ ] CLI de exportação documentado e funcional
- [ ] Integração ponta-a-ponta: coleta → extração → validação → renderização

### 9. Traceability
* **NFRs relacionadas:** NFR-U02, NFR-A04
* **Use Cases relacionados:** UC-02, UC-03
* **Riscos relacionados:** Nenhum identificado além dos já mapeados

---

## US-008 — Fluxo Completo de Recuperação de Senha via E-mail

* **Priority:** Should
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: SMTP configurado; tokens com expiração; fluxo multi-etapa)
* **Épico:** Autenticação e Acesso
* **Labels:** backend, security, email, auth
* **Story Map:** REQ-008 (Slice 2: Should Have)

### 1. Description (INVEST)
* **As a** Usuário do Sistema
* **I want to** recuperar minha senha via e-mail com token seguro
* **So that** eu possa recuperar acesso autonomamente sem intervenção do administrador

### 2. Business Context
Elimina dependência manual de admin para reset de senha (Story Map §5 corte Should). Usa `solicitarRecuperacao`, `hashToken`, `recuperar`, `definirCredencial`, `nodemailer`. SMTP via `dotenv` (UC-01 Assumptions).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Solicitação de recuperação com e-mail cadastrado
* **Given** usuário informa e-mail cadastrado na tela "Esqueci a senha"
* **When** submete o formulário
* **Then** sistema gera token protegido por `hashToken`, envia e-mail via `nodemailer` com link de recuperação (expiração: 1h), e exibe mensagem genérica "Se o e-mail existe, instruções foram enviadas" (não revela se e-mail está cadastrado)

#### Scenario 2: Solicitação com e-mail não cadastrado
* **Given** usuário informa e-mail não cadastrado
* **When** submete o formulário
* **Then** mesma mensagem genérica do Scenario 1 é exibida (prevenção de enumeração de usuários); nenhum e-mail é enviado

#### Scenario 3: Uso de link de recuperação válido
* **Given** usuário clica link recebido por e-mail dentro do prazo de validade
* **When** acessa a página de redefinição com token válido
* **Then** sistema valida token via `recuperar`, permite definir nova senha via `definirCredencial` (com `criarHashSenha`), invalida o token usado e redireciona para login com mensagem "Senha alterada com sucesso"

#### Scenario 4: Token expirado ou inválido
* **Given** usuário acessa link com token expirado (>1h), já usado, ou adulterado
* **When** tenta redefinir senha
* **Then** sistema rejeita com erro "Link inválido ou expirado", não permite redefinição, e loga tentativa para auditoria

#### Scenario 5: Nova senha deve atender política de complexidade
* **Given** usuário define nova senha no formulário de recuperação
* **When** submete senha fraca (ex: < 8 chars, sem número)
* **Then** sistema rejeita com requisitos claros e mantém token válido para nova tentativa

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] 3 telas: (1) Solicitação (campo e-mail), (2) Redefinição (nova senha + confirmação), (3) Sucesso; todas responsivas 1366px–1920px
* **Estados da interface:** loading (enviando e-mail / salvando senha), success, error (token inválido, senha fraca), empty

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** `src/autenticacao.ts` (`solicitarRecuperacao`, `hashToken`, `recuperar`, `definirCredencial`), `nodemailer` (transporte SMTP), templates de e-mail
* **Dependências técnicas:** `dotenv` (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, APP_BASE_URL), `better-sqlite3` (tabela de tokens de recuperação com expiração)
* **Considerações de performance/segurança:** Token com hash (NFR-SEC03); expiração curta; rate-limiting em `solicitarRecuperacao` (prevenir spam); logs sem dados sensíveis (NFR-SEC04)

### 6. Out of Scope
* MFA/2FA como fator adicional
* Perguntas de segurança alternativas
* Desbloqueio de conta por admin (fora do fluxo self-service)

### 7. Definition of Ready
- [ ] Credenciais SMTP validadas em staging
- [ ] Template de e-mail aprovado (texto + link com token)
- [ ] Política de complexidade de senha definida

### 8. Definition of Done
- [ ] Testes E2E: fluxo completo, token expirado, token reutilizado, e-mail inexistente, senha fraca
- [ ] E-mail entregue em provedores principais (Gmail, Outlook, corporativo)
- [ ] Rate-limiting implementado e testado
- [ ] Zero `console.*` no código de produção (NFR-SEC04)
- [ ] Documentação de configuração SMTP atualizada

### 9. Traceability
* **NFRs relacionadas:** NFR-SEC01, NFR-SEC03, NFR-SEC04
* **Use Cases relacionados:** UC-01 (AS-1)
* **Riscos relacionados:** Entregabilidade de e-mail (spam, bloqueio corporativo)

---

## US-009 — Controle de Concorrência via `reservarConsolidacao`

* **Priority:** Should
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: implementação de lock otimista/pessimista no SQLite; integração com fluxos de escrita)
* **Épico:** Consolidação e Entrega
* **Labels:** backend, concurrency, database, tech-debt
* **Story Map:** REQ-009 (Slice 2: Should Have)

### 1. Description (INVEST)
* **As a** Sistema
* **I want to** garantir escrita atômica no `better-sqlite3` via `reservarConsolidacao` com retry/backoff
* **So that** múltiplos processos (coleta, validação, migração) não corrompam o banco nem travem indefinidamente

### 2. Business Context
Mitiga risco de lock do SQLite (single-writer). Necessário para estabilidade do Release 1.1 (Story Map §5). NFR-P02, NFR-S03, BR-CAD-02 (migração), UC-03 EX-2.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Escrita única adquire reserva e completa
* **Given** processo inicia consolidação (ex: aprovação de CCT em US-006)
* **When** chama `reservarConsolidacao`
* **Then** reserva é adquirida imediatamente, escrita ocorre, reserva é liberada, processo retorna sucesso

#### Scenario 2: Concorrência — segunda escrita aguarda e retenta
* **Given** Processo A detém reserva (escrita em andamento)
* **When** Processo B chama `reservarConsolidacao`
* **Then** Processo B entra em retry/backoff (ex: 50ms, 100ms, 200ms... max 5s), adquire reserva quando A libera, completa sua escrita e libera

#### Scenario 3: Timeout de reserva — falha controlada
* **Given** Processo A mantém reserva por tempo excessivo (>30s, indicando bug/travamento)
* **When** Processo B excede max retries/tempo total
* **Then** `reservarConsolidacao` lança erro `ConsolidationLockTimeout`, Processo B falha graciosamente, loga erro estruturado (NFR-O01) e alerta administrador

#### Scenario 4: Migração de legado (US-005) usa mesma reserva
* **Given** `importar-legado` executa `migrarCadastros`/`migrarAutenticacao`
* **When** cada batch de escrita chama `reservarConsolidacao`
* **Then** mesma semântica de retry/backoff aplica-se; migração não trava outros processos indefinidamente

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A (infraestrutura)
* **Estados da interface:** Logs: "Aguardando reserva de consolidação... (tentativa 3/10)", "Reserva adquirida", "Liberada"

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** `reservarConsolidacao` (implementar/estender), todos os pontos de escrita: US-003 (extração), US-005 (migração), US-006 (aprovação), US-004 (cache CNPJ)
* **Dependências técnicas:** `better-sqlite3` (pragmas `busy_timeout`, `journal_mode=WAL` recomendado), implementação de lock (tabela `consolidation_lock` ou `sqlite3_lock` nativo)
* **Considerações de performance/segurança:** Backoff exponencial com jitter; max wait time configurável; deadlock detection básico; métricas de contenção (NFR-O01)

### 6. Out of Scope
* Escalonamento horizontal / multi-nó (fora de escopo: NFR-S01, Story Map Won't Have)
* Transações distribuídas

### 7. Definition of Ready
- [ ] Estratégia de lock definida (tabela auxiliar vs. `sqlite3_lock` vs. `busy_timeout` estendido)
- [ ] Parâmetros de retry/backoff acordados (base, max, jitter)

### 8. Definition of Done
- [ ] Testes de carga: 10 writers concorrentes, 1000 escritas cada — zero corrupção, zero timeout indevido
- [ ] Testes de falha: writer morre segurando lock — lock é liberado (timeout ou cleanup)
- [ ] Métricas de latência de aquisição de lock expostas (NFR-O01)
- [ ] Integração validada em US-003, US-005, US-006, US-004

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-S03, NFR-O01
* **Use Cases relacionados:** UC-02, UC-03 (EX-2, AS-1)
* **Riscos relacionados:** Concorrência de Escrita (UC-03 EX-2), Risco de Integridade no MVP (Story Map §6)

---

## US-010 — Cache de Consultas de CNPJ para Performance

* **Priority:** Should
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: TTL configurável; invalidação manual; armazenamento no SQLite)
* **Épico:** Auditoria de Cadastro
* **Labels:** backend, performance, cache, cnpj
* **Story Map:** REQ-010 (Slice 2: Should Have)

### 1. Description (INVEST)
* **As a** Sistema
* **I want to** cachear resultados de `criarConsultaCnpj` no `better-sqlite3` com TTL
* **So that** consultas repetidas não saturam o serviço externo e latência cai para <10ms (NFR-S02)

### 2. Business Context
Evolução do cache simples do MVP (US-004) para cache com TTL e invalidação. NFR-S02, BR-CAD-01.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Cache hit — retorno imediato
* **Given** CNPJ consultado há < TTL (ex: 24h) está no cache
* **When** `criarConsultaCnpj` é chamado
* **Then** dados são retornados do SQLite em <10ms, sem chamada HTTP externa, log indica "cache hit"

#### Scenario 2: Cache miss — consulta externa e armazenamento
* **Given** CNPJ não está no cache ou expirou (TTL)
* **When** `criarConsultaCnpj` é chamado
* **Then** chamada externa é feita, resultado salvo no cache com timestamp, e retornado ao caller

#### Scenario 3: Invalidação manual por administrador
* **Given** administrador sabe que dados de um CNPJ mudaram (ex: alteração de endereço)
* **When** executa comando `invalidar-cache-cnpj <CNPJ>`
* **Then** entrada é removida do cache; próxima consulta vai para serviço externo

#### Scenario 4: Serviço externo falha — cache stale como fallback
* **Given** CNPJ tem entrada no cache (mesmo expirada) e serviço externo retorna erro 5xx
* **When** `criarConsultaCnpj` é chamado
* **Then** sistema retorna dados do cache (stale), loga aviso "usando cache expirado por falha externa", e **não** remove a entrada

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A
* **Estados da interface:** CLI: `invalidar-cache-cnpj 12.345.678/0001-90` → "Cache invalidado"; Logs: "[CACHE HIT] 12.345.678/0001-90", "[CACHE MISS] ...", "[CACHE STALE FALLBACK] ..."

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** `criarConsultaCnpj` (estender), tabela `cnpj_cache` no `better-sqlite3` (cnpj PK, dados JSON, updated_at), CLI de invalidação
* **Dependências técnicas:** TTL configurável via `dotenv` (ex: `CNPJ_CACHE_TTL_HOURS=24`)
* **Considerações de performance/segurança:** Índice em `updated_at` para limpeza periódica; dados sensíveis no cache (LGPD — NFR-C01); tamanho do cache monitorado

### 6. Out of Scope
* Cache distribuído (Redis) — nó único (NFR-S01)
* Invalidação automática por webhook do serviço de CNPJ

### 7. Definition of Ready
- [ ] TTL padrão acordado com negócio (24h? 72h?)
- [ ] Esquema da tabela `cnpj_cache` aprovado

### 8. Definition of Done
- [ ] Testes: hit, miss, expiração, fallback stale, invalidação manual
- [ ] Benchmark: cache hit p95 < 10ms (NFR-S02)
- [ ] Limpeza periódica de entradas antigas implementada (job ou on-write)
- [ ] Documentação de operação do cache

### 9. Traceability
* **NFRs relacionadas:** NFR-S02, NFR-P01
* **Use Cases relacionados:** UC-03
* **Riscos relacionados:** Estabilidade do serviço externo de CNPJ (UC-03 Assumptions)

---

## US-011 — Alertas de Mudança de Layout em Fontes Externas

* **Priority:** Should
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: detecção heurística de mudança de seletores; canal de alerta a definir)
* **Épico:** Monitoramento e Extração
* **Labels:** backend, monitoring, alerting, playwright
* **Story Map:** REQ-011 (Slice 2: Should Have)

### 1. Description (INVEST)
* **As a** Administrador
* **I want to** receber alertas automáticos quando `playwright` não encontra seletores esperados nas fontes
* **So that** eu possa corrigir `loadWatchConfig` antes que a coleta pare silenciosamente

### 2. Business Context
Mitiga risco de UX no MVP (Story Map §6). NFR-O02, UC-02 EX-1. No MVP apenas logs; no Should alertas acionáveis.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Seletor não encontrado — alerta disparado
* **Given** `loadWatchConfig` define seletor `.cct-list a` para fonte "Sindicato X"
* **When** `playwright` carrega a página e `document.querySelectorAll('.cct-list a')` retorna vazio
* **Then** sistema registra falha estruturada: `{fonte: "Sindicato X", seletor: ".cct-list a", htmlSample: "<div class='new-layout'>...", timestamp}`, e dispara alerta para canal configurado (e-mail, log estruturado, webhook)

#### Scenario 2: Página retorna erro HTTP (404, 500)
* **Given** fonte externa retorna status != 200
* **When** `playwright` tenta navegar
* **Then** alerta similar com `httpStatus`, `url`, sem `htmlSample` (ou body de erro)

#### Scenario 3: Alerta inclui contexto para correção rápida
* **Given** alerta é recebido pelo administrador
* **When** ele inspeciona o payload
* **Then** encontra: nome da fonte, URL, seletor que falhou, amostra do HTML atual (primeiros 5KB), sugestão de novo seletor se heurística detectar padrão similar

#### Scenario 4: Coleta continua para demais fontes
* **Given** fonte A falha com mudança de layout
* **When** rotina `check:auto` processa fontes A, B, C
* **Then** fonte A gera alerta e é marcada "falha"; fontes B e C são processadas normalmente

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Painel simples "Alertas de Coleta" listando: Fonte, Última falha, Tipo (seletor/HTTP), Amostra HTML, Status (Aberto/Corrigido)
* **Estados da interface:** Lista vazia (sem alertas), loading, error (falha ao buscar alertas)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo de coleta (US-002), `loadWatchConfig`, sistema de alertas (novo: e-mail via `nodemailer` ou webhook), armazenamento de alertas no `better-sqlite3`
* **Dependências técnicas:** Heurística de sugestão de seletor (ex: buscar elemento com mesmo texto/atributo `href`); canal de alerta configurável via `dotenv`
* **Considerações de performance/segurança:** Amostra HTML truncada (não vazar dados sensíveis); rate-limiting de alertas (evitar spam se fonte ficar instável); logs estruturados (NFR-O01, NFR-O02)

### 6. Out of Scope
* Auto-correção de seletores (IA/ML)
* Painel de monitoramento em tempo real (US-012, Slice 3)

### 7. Definition of Ready
- [ ] Canal de alerta padrão definido (e-mail para admin? webhook para Slack/Teams?)
- [ ] Formato do payload de alerta padronizado

### 8. Definition of Done
- [ ] Testes: seletor alterado, HTTP 404, HTTP 500, rede falha — alerta disparado com payload correto
- [ ] Teste de não-interrupção: falha em fonte A não afeta B, C
- [ ] Alerta recebido no canal configurado em < 5min após falha
- [ ] Painel de alertas (CLI ou UI básica) funcional

### 9. Traceability
* **NFRs relacionadas:** NFR-O02, NFR-O01, NFR-A01
* **Use Cases relacionados:** UC-02 (EX-1)
* **Riscos relacionados:** Risco de UX no MVP (Story Map §6), Dependência de fontes externas

---

## US-012 — Painel de Monitoramento de Status de Coleta em Tempo Real

* **Priority:** Could
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: frontend web (web/) consumindo API de status; WebSocket ou polling; métricas agregadas)
* **Épico:** Monitoramento e Extração
* **Labels:** frontend, web, monitoring, ux
* **Story Map:** REQ-012 (Slice 3: Could Have)

### 1. Description (INVEST)
* **As a** Administrador
* **I want to** visualizar dashboard em tempo real do status de coleta por fonte
* **So that** eu possa identificar falhas imediatamente sem depender de logs/alertas

### 2. Business Context
Refinamento de UX (Slice 3). Usa stack `web/` (3 arquivos detectados no diagnóstico). NFR-U01 (responsivo 1366px–1920px).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Dashboard mostra status atual de todas as fontes
* **Given** administrador acessa `/monitor` no navegador
* **When** página carrega
* **Then** tabela/lista mostra cada fonte: Nome, Última execução, Status (OK/Falha/Aguardando), Documentos coletados hoje, Último erro (se houver), Próxima execução agendada

#### Scenario 2: Atualização em tempo real durante execução
* **Given** dashboard aberto e rotina `check:auto` inicia
* **When** coleta da fonte A começa → termina OK → fonte B começa → falha
* **Then** linha da fonte A muda: "Executando..." → "OK ✓ 3 docs"; fonte B: "Executando..." → "Falha ✗" com tooltip do erro; tudo sem refresh manual

#### Scenario 3: Detalhe de execução histórica
* **Given** administrador clica em uma fonte no dashboard
* **When** modal/drawer abre
* **Then** mostra histórico das últimas 50 execuções: timestamp, duração, docs coletados, status, erro (se falha), link para logs completos

#### Scenario 4: Ação manual de reexecução
* **Given** fonte está em status "Falha"
* **When** administrador clica "Reexecutar agora"
* **Then** dispara coleta apenas para essa fonte (fora do cron), dashboard reflete "Executando..." e depois resultado

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Layout: sidebar navegação, header com status geral, grid de cards por fonte (verde/vermelho/amarelo), modal de detalhe, botão "Reexecutar" proeminente em falhas. Responsivo 1366px–1920px (NFR-U01).
* **Estados da interface:** loading inicial, empty (nenhuma fonte configurada), real-time updates, error state (falha ao buscar status)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** `web/` (frontend), nova API HTTP `/api/monitor/status` (ou WebSocket), `node-cron` emite eventos de status, `better-sqlite3` (tabela `collection_runs` para histórico)
* **Dependências técnicas:** Frontend framework não especificado (arquivos `web/` detectados); polling (ex: 10s) ou Server-Sent Events / WebSocket; `zod` para validação de API
* **Considerações de performance/segurança:** Autenticação via sessão existente (US-001); rate-limit na API de status; dados sensíveis não expostos no dashboard

### 6. Out of Scope
* Alertas configuráveis pelo usuário (apenas visualização)
* Métricas de negócio avançadas (ex: volume de cláusulas por tema)

### 7. Definition of Ready
- [ ] API de status definida (REST + SSE/WS)
- [ ] Esquema `collection_runs` aprovado
- [ ] Design do dashboard validado com PO

### 8. Definition of Done
- [ ] Dashboard funcional em staging com dados reais
- [ ] Atualização em tempo real testada (coleta real + dashboard aberto)
- [ ] Responsividade validada em 1366px, 1920px, mobile (NFR-U01)
- [ ] Acessibilidade básica (contraste, navegação teclado, labels)
- [ ] Testes E2E Playwright (`test:clientes-ui` ou similar)

### 9. Traceability
* **NFRs relacionadas:** NFR-U01, NFR-O01, NFR-A01
* **Use Cases relacionados:** UC-02
* **Riscos relacionados:** Risco de UX no MVP (Story Map §6) — mitigado tardiamente

---

## US-013 — Auditoria de Cadastro Automatizada por Lotes

* **Priority:** Could
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: job agendado; relatório de divergências; integração com cache CNPJ)
* **Épico:** Auditoria de Cadastro
* **Labels:** backend, batch, audit, cnpj
* **Story Map:** REQ-013 (Slice 3: Could Have)

### 1. Description (INVEST)
* **As a** Administrador / Compliance
* **I want to** executar auditoria periódica em lote de todos os CNPJs cadastrados
* **So that** divergências entre base local e Receita Federal sejam detectadas proativamente

### 2. Business Context
Escala a validação unitária (US-004) para base completa. NFR-S02 (cache), NFR-P02 (retry), UC-03.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Auditoria agendada executa e gera relatório
* **Given** `node-cron` dispara job semanal de auditoria
* **When** sistema itera todos CNPJs únicos na base de CCTs/empresas
* **Then** para cada: consulta cache (se fresco) ou serviço externo; compara com dados locais; gera relatório CSV/JSON: CNPJ, Razão Social Local, Razão Social Externa, Status (OK/DIVERGÊNCIA/ERRO_EXTERNO), Detalhes

#### Scenario 2: Relatório destaca apenas divergências relevantes
* **Given** relatório de auditoria gerado
* **When** administrador abre
* **Then** resumo mostra: Total auditados, OK, Divergências (críticas: nome/endereço/situação), Erros externos; opção de filtrar/exportar apenas divergências

#### Scenario 3: Correção assistida para divergências
* **Given** divergência detectada (ex: razão social mudou)
* **When** administrador clica "Atualizar com dados externos"
* **Then** sistema pré-preenche formulário de edição com dados da Receita Federal, exige confirmação, e ao salvar invalida cache (US-010) e registra auditoria (quem, quando, antes/depois)

#### Scenario 4: Respeito a rate-limits e concorrência
* **Given** base tem 5.000 CNPJs únicos
* **When** auditoria roda
* **Then** usa cache (US-010) para maioria; para misses, faz requisições com delay/respeito a rate-limit do serviço externo; usa `reservarConsolidacao` (US-009) para escritas de atualização; completa em janela noturna

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Tela "Auditoria de Cadastro": botão "Executar agora", lista de execuções passadas com link para relatório, cards de resumo da última execução
* **Estados da interface:** loading (auditoria rodando), success (relatório pronto), error (falha crítica), empty (nenhuma execução)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Novo job `auditar-cadastro-lote`, `criarConsultaCnpj` (reuso), `reservarConsolidacao`, `better-sqlite3` (tabela `audit_runs`, `audit_findings`)
* **Dependências técnicas:** `node-cron` (agendamento), serviço externo CNPJ [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA], relatório em arquivo (CSV/JSON) ou tabela
* **Considerações de performance/segurança:** Processamento em batches (ex: 50 CNPJs por vez); retry/backoff (NFR-P02); logs estruturados (NFR-O01); LGPD nos logs/relatórios (NFR-C01)

### 6. Out of Scope
* Correção automática sem validação humana
* Integração direta com API da Receita Federal (assume serviço intermediário)

### 7. Definition of Ready
- [- [ ] Frequência e janela de execução acordadas (ex: domingo 02:00)
- [ ] Limite de rate do serviço externo conhecido para configurar delay

### 8. Definition of Done
- [ ] Job executa em staging com base real (subset) e gera relatório correto
- [ ] Correção assistida testada: divergência → atualização → cache invalidado → auditoria registrada
- [ ] Performance: 5.000 CNPJs em < 4h (respeitando rate-limits)
- [ ] Relatório acessível via UI e arquivo

### 9. Traceability
* **NFRs relacionadas:** NFR-S02, NFR-P02, NFR-O01, NFR-C01
* **Use Cases relacionados:** UC-03
* **Riscos relacionados:** Estabilidade do serviço externo de CNPJ (UC-03 Assumptions)

---

## US-014 — Histórico de Versões de CCTs Consolidadas

* **Priority:** Could
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] (Premissa: versionamento imutável; diff entre versões; retenção configurável)
* **Épico:** Consolidação e Entrega
* **Labels:** backend, versioning, audit, history
* **Story Map:** REQ-014 (Slice 3: Could Have)

### 1. Description (INVEST)
* **As a** Analista Jurídico / Administrador
* **I want to** visualizar histórico completo de versões de cada CCT consolidada
* **So that** eu possa auditar alterações, comparar versões e restaurar versão anterior se necessário

### 2. Business Context
Complementa US-006 (validação) e US-007 (renderização). Garante rastreabilidade total (NFR-C02, NFR-A04). Base para compliance e resolução de disputas.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Listagem de versões de uma CCT
* **Given** CCT consolidada possui 3 versões aprovadas ao longo do tempo
* **When** analista acessa "Histórico" na tela da CCT
* **Then** tabela mostra: Versão, Data aprovação, Aprovado por, Fingerprint, Hash do Markdown, Resumo de alterações (auto-gerado do diff), Status (Atual/Histórica)

#### Scenario 2: Comparação detalhada entre duas versões
* **Given** analista seleciona duas versões no histórico
* **When** clica "Comparar"
* **Then** abre view de diff (side-by-side ou unified) destacando: cláusulas adicionadas, removidas, modificadas; metadados alterados (vigência, sindicato); fingerprint de cada versão

#### Scenario 3: Restauração de versão anterior (nova versão baseada em histórica)
* **Given** analista identifica que versão 2 estava correta e versão 3 introduziu erro
* **When** clica "Criar nova versão baseada nesta" na versão 2
* **Then** sistema cria rascunho de nova versão (v4) copiando conteúdo da v2, analista revisa/ajusta, submete para validação (fluxo US-006), e ao aprovar v4 torna-se "Atual"

#### Scenario 4: Retenção e integridade
* **Given** política de retenção: manter todas as versões aprovadas indefinidamente
* **When** qualquer operação tenta deletar versão histórica
* **Then** sistema bloqueia (FK/constraint), loga tentativa, apenas admin com flag especial pode purgar (auditado)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Aba "Histórico" na tela de detalhes da CCT: timeline vertical com cards por versão, botões "Ver", "Comparar", "Restaurar base", diff modal com syntax highlight para Markdown
* **Estados da interface:** loading (carregando versões), empty (apenas versão atual), diff view, confirm modal para restauração

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Tabela `cct_versions` no `better-sqlite3` (id, cct_id, version_num, content_hash, markdown_hash, approved_by, approved_at, diff_summary JSON), `renderizarCctMarkdown` (gera hash), diff engine (reuso US-006), API de histórico
* **Dependências técnicas:** `better-sqlite3` (triggers/constraints para imutabilidade), algoritmo de diff (mesmo US-006)
* **Considerações de performance/segurança:** Índices em `cct_id`, `approved_at`; imutabilidade via trigger `BEFORE DELETE/UPDATE`; hashes para integridade (NFR-A04); LGPD nos metadados de auditoria (NFR-C01)

### 6. Out of Scope
* Branching/merging complexo (apenas linear: v1 → v2 → v3...)
* Assinatura digital/certificação de versões

### 7. Definition of Ready
- [ ] Esquema `cct_versions` aprovado
- [ ] Política de retenção definida (indeterminada? 10 anos?)

### 8. Definition of Done
- [ ] Histórico exibe todas versões com metadados corretos
- [ ] Diff entre quaisquer duas versões funcional e performático
- [ ] Restauração cria nova versão válida no fluxo US-006
- [ ] Imutabilidade testada: tentativas de delete/update falham
- [ ] Integração com US-007: renderização de versão histórica gera Markdown idêntico ao original (hash confere)

### 9. Traceability
* **NFRs relacionadas:** NFR-A04, NFR-C02, NFR-U02
* **Use Cases relacionados:** UC-02, UC-03
* **Riscos relacionados:** Nenhum novo — reforça mitigação de integridade

---

## Resumo de Rastreabilidade Geral (US-xxx ↔ REQ-xx ↔ Slice)

| US | Título | REQ | Slice | Prioridade | UC Principal | NFRs Críticas |
|----|--------|-----|-------|------------|--------------|---------------|
| US-001 | Autenticação Básica e Sessão | REQ-001 | 1 (MVP) | Must | UC-01 | NFR-SEC01, SEC02, SEC04, M01 |
| US-002 | Coleta Automatizada via Playwright | REQ-002 | 1 (MVP) | Must | UC-02 | NFR-P03, A01, O01, O02 |
| US-003 | Extração de Texto (PDF/DOC) | REQ-003 | 1 (MVP) | Must | UC-02 | NFR-P03, A04, C02 |
| US-004 | Validação de CNPJ e Cadastro Básico | REQ-004 | 1 (MVP) | Must | UC-03 | NFR-P02, S02 |
| US-005 | Migração de Dados Legados | REQ-005 | 1 (MVP) | Must | UC-03 (AS-1) | NFR-P02, A04 |
| US-006 | Validação de Extração e Alterações | REQ-006 | 1 (MVP) | Must | UC-02, UC-03 | NFR-S03, P02, C02 |
| US-007 | Renderização de CCT em Markdown | REQ-007 | 1 (MVP) | Must | UC-02, UC-03 | NFR-U02, A04 |
| US-008 | Recuperação de Senha via E-mail | REQ-008 | 2 (Should) | Should | UC-01 (AS-1) | NFR-SEC01, SEC03, SEC04 |
| US-009 | Controle de Concorrência (`reservarConsolidacao`) | REQ-009 | 2 (Should) | Should | UC-02, UC-03 | NFR-P02, S03, O01 |
| US-010 | Cache de Consultas CNPJ com TTL | REQ-010 | 2 (Should) | Should | UC-03 | NFR-S02, P01 |
| US-011 | Alertas de Mudança de Layout | REQ-011 | 2 (Should) | Should | UC-02 (EX-1) | NFR-O02, O01, A01 |
| US-012 | Painel Monitoramento Tempo Real | REQ-012 | 3 (Could) | Could | UC-02 | NFR-U01, O01, A01 |
| US-013 | Auditoria Cadastro por Lotes | REQ-013 | 3 (Could) | Could | UC-03 | NFR-S02, P02, O01, C01 |
| US-014 | Histórico de Versões de CCTs | REQ-014 | 3 (Could) | Could | UC-02, UC-03 | NFR-A04, C02, U02 |

---

## Observações Finais

1. **Cobertura completa:** 14 User Stories mapeiam 1:1 os 14 REQ-xx do Story Map, distribuídos nos 3 Slices (7 Must, 4 Should, 3 Could).
2. **IDs sequenciais:** US-001 a US-014 sem saltos, conforme convenção obrigatória.
3. **Inferências marcadas:** Todos os story points, premissas de arquitetura (serviço CNPJ, formato legado, canais de alerta, frontend stack) e decisões de UX carregam `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`.
4. **Entradas humanas preservadas:** Seções de UI/UX (Wireframe/Mockup) mantêm `[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]` junto ao rótulo de inferência.
5. **Alinhamento de stack:** Zero menção a Postgres, Prisma, Tauri/Rust, Kubernetes, auto-scaling horizontal, ou qualquer tecnologia fora do JSON de Stack Real (better-sqlite3, Node.js monolítico, playwright, pdf-parse, word-extractor, nodemailer, zod, node-cron).
6. **Rastreabilidade bidirecional:** Cada story referencia NFRs (categoria + ID), Use Cases (UC-xx), e Riscos do Story Map; tabela final consolida visão executiva.