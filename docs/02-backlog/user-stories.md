# User Stories Specification

> **Épico relacionado:** Sistema de Histórico e Gestão Documental (dist-historico) · **Sprint:** N/A · **Status geral:** Backlog

---

## US-001 — Onboarding Inicial do Escritório e Bootstrap de Administrador

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: fluxo completo de cadastro de escritório + criação de admin + validação CNPJ + isolamento transacional]
* **Épico:** Onboarding & Configuração do Escritório (Slice 1: MVP)
* **Labels:** backend, multi-tenant, security, onboarding
* **Story Map:** REQ-001

### 1. Description (INVEST)
* **As a** Administrador do Escritório
* **I want to** cadastrar um novo escritório com CNPJ validado, provisionar o primeiro administrador e definir credenciais iniciais
* **So that** o escritório fique operacional com isolamento multi-tenant ativo desde o primeiro acesso

*Checklist INVEST — a story deve ser: Independent, Negotiable, Valuable, Estimable, Small, Testable.*

### 2. Business Context
Primeira etapa da jornada do usuário (Story Map Etapa 1). Habilita todo o restante do sistema: sem escritório cadastrado, `exigirCadastroEscritorio` bloqueia todas as operações (BR-03). O bootstrap do administrador garante `possuiAdministrador` (BR-14) e permite o primeiro login (UC-08).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Onboarding completo com sucesso — caminho feliz
* **Given** o sistema está implantado e acessível via HTTPS (NFR-SEC02)
* **And** nenhum administrador existe (`possuiAdministrador` retorna falso)
* **When** o administrador acessa a URL de onboarding e preenche: nome do escritório, CNPJ válido, endereço, configurações SMTP e caminhos de arquivo
* **And** submete o formulário
* **Then** o sistema valida o CNPJ via `cnpjValido` e normaliza via `normalizarCnpj` (BR-01)
* **And** normaliza textos via `normalizarTexto` (BR-02)
* **And** persiste o escritório em transação com isolamento `withPostgresOfficeTransaction` / equivalente SQLite (BR-16)
* **And** executa `bootstrapAdministrador` criando o admin do tenant (BR-14)
* **And** registra auditoria completa via `auditarCadastro` e `auditarSeguranca` (BR-12)
* **And** `exigirCadastroEscritorio` passa a retornar verdadeiro para o `office_id` criado
* **And** o administrador é redirecionado para login (UC-08)

#### Scenario 2: CNPJ duplicado — caso de borda
* **Given** um escritório com CNPJ "12.345.678/0001-90" já cadastrado
* **When** outro administrador tenta cadastrar escritório com o mesmo CNPJ (mesmo normalizado)
* **Then** o sistema bloqueia a operação
* **And** exibe "CNPJ já registrado — contate o administrador"
* **And** registra `auditarSeguranca` com ação `OFFICE_DUPLICATE_CNPJ`
* **And** não cria novo escritório nem administrador

#### Scenario 3: Falha no bootstrap do administrador — caminho de erro
* **Given** dados do escritório válidos e persistidos
* **When** `bootstrapAdministrador` falha (ex.: constraint de e-mail duplicado, erro de hash de credencial)
* **Then** o sistema faz rollback da criação do escritório (BR-16)
* **And** exibe erro "Falha ao provisionar administrador — tente novamente"
* **And** registra `auditarSeguranca` com ação `OFFICE_BOOTSTRAP_FAILED`
* **And** nenhum dado parcial permanece

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Tela de Onboarding]
* **Estados da interface:** loading (validação CNPJ + persistência), empty (formulário inicial), error (CNPJ duplicado, falha bootstrap), success (redirecionamento para login)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo de onboarding (backend), `exigirCadastroEscritorio`, `bootstrapAdministrador`, `cnpjValido`, `normalizarCnpj`, `normalizarTexto`, `auditarCadastro`, `auditarSeguranca`, transação SQLite WAL
* **Dependências técnicas:** better-sqlite3 (motor operacional), zod (validação payload), dotenv (config SMTP/caminhos)
* **Considerações de performance/segurança:** NFR-P02 (≤300ms p95 escrita), NFR-SEC01 (SQLite cifrado), NFR-SEC04 (isolamento tenant desde criação), NFR-SEC07 (Zod validation), NFR-O01/O06 (logs estruturados + auditoria)

### 6. Out of Scope
* Convite de administrador por e-mail (fluxo self-service vs. assistido — open issue UC-11)
* Validação de CNPJ contra base externa Receita Federal (BR-01 usa `cnpjValido` — algoritmo apenas, confirmar)
* MFA no primeiro login (NFR-SEC03: MFA não implementado)

### 7. Definition of Ready
- [ ] Critérios de aceite definidos e validados com PO
- [ ] Dependências identificadas: `cnpjValido`, `normalizarCnpj`, `normalizarTexto`, `bootstrapAdministrador`, `auditarCadastro`, `auditarSeguranca` implementados
- [ ] Design/UX aprovado
- [ ] Estimativa de esforço realizada

### 8. Definition of Done
- [ ] Código implementado e revisado (PR aprovado)
- [ ] Testes unitários cobrindo cenários BDD (Vitest ≥80% — NFR-M01)
- [ ] Testes de integração: onboarding ponta-a-ponta com SQLite real
- [ ] Tipagem estrita TypeScript (NFR-M03)
- [ ] Lint/format ok
- [ ] Sem regressões de acessibilidade (NFR-U01/NFR-U02)
- [ ] Documentação/API docs atualizadas (OpenAPI 3.1 — NFR-M04)
- [ ] Feature testada em staging com dados representativos
- [ ] Métricas/observabilidade instrumentadas: `office_onboarding_total{status}`, `office_bootstrap_duration_seconds`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-S04, NFR-SEC01, NFR-SEC04, NFR-SEC07, NFR-O01, NFR-O06, NFR-C04
* **Use Cases relacionados:** UC-11 (Configuração de Escritório e Onboarding), UC-08 (Autenticação — bootstrap admin)
* **Riscos relacionados:** R1 (MVP sem contatos), R3 (Migração retroativa no Should), R7 (DDL não-transacional SQLite), R8 (Single point of failure)
* **Business Rules:** BR-01, BR-02, BR-03, BR-14, BR-16, BR-12

---

## US-002 — Login, Logout e Recuperação de Senha

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: autenticação baseada em hashToken (bcrypt/PBKDF2 via crypto nativo), sessão stateless ou cookie, recuperação via e-mail com nodemailer, tokens nunca em claro BR-13]
* **Épico:** Autenticação & Acesso (Slice 1: MVP)
* **Labels:** backend, security, auth, frontend
* **Story Map:** REQ-002

### 1. Description (INVEST)
* **As a** qualquer ator autenticado (Analista de Cadastros, Analista de Documentos/Vínculos, Auditor/Compliance, Administrador do Escritório)
* **I want to** fazer login com credenciais validadas por hash, recuperar senha via e-mail com token hasheado, e fazer logout seguro
* **So that** o acesso ao sistema seja controlado, auditado e resiliente a perda de credencial

### 2. Business Context
Etapa 8 do Story Map. Transversal a todos os fluxos — sem autenticação, nenhum caso de uso prossegue. Implementa BR-13 (tokens nunca em claro), BR-14 (admin obrigatório), BR-15 (menor privilégio runtime), NFR-SEC03 (hash credencial), NFR-SEC08 (OWASP Top 10).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Login bem-sucedido — caminho feliz
* **Given** usuário cadastrado com credencial hasheada via `hashToken` (BR-13)
* **And** escritório ativo (`exigirCadastroEscritorio` passa)
* **When** usuário informa e-mail/usuário e senha na tela de login
* **And** submete o formulário
* **Then** sistema valida credencial comparando hash armazenado com `hashToken(senha_informada)`
* **And** se válido: cria sessão, registra `auditarSeguranca` (ação `LOGIN_SUCCESS`, `userId`, `officeId`, `traceId`)
* **And** redireciona para dashboard conforme papel/permissões
* **And** resposta ≤ 300ms p95 (NFR-P02)

#### Scenario 2: Credenciais inválidas — caso de erro
* **Given** usuário informa credenciais incorretas
* **When** submete login
* **Then** sistema registra `auditarSeguranca` (ação `LOGIN_FAILED`, `motivo=credenciais_invalidas`, `ip`, `userAgent`)
* **And** exibe mensagem genérica "Credenciais inválidas" (não vaza se usuário existe)
* **And** incrementa contador de tentativas
* **And** alerta se >5 tentativas em 15min (NFR-O05)

#### Scenario 3: Recuperação de senha completa — caminho feliz
* **Given** usuário cadastrado com e-mail válido
* **When** clica "Esqueci a senha" e informa e-mail
* **Then** sistema executa `solicitarRecuperacao`: gera token aleatório, aplica `hashToken`, persiste hash com expiração (TTL 1h [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]), envia e-mail via `nodemailer` com link contendo token **em claro** (só no e-mail)
* **When** usuário clica link e acessa tela de redefinição com token
* **Then** sistema valida: `hashToken(token_recebido)` confere com hash armazenado e não expirou
* **And** usuário define nova senha; sistema executa `definirCredencial` (hash da nova senha), invalida token de recuperação
* **And** registra `auditarSeguranca` (ações `RECOVERY_REQUEST`, `RECOVERY_COMPLETE`)
* **And** redireciona para login

#### Scenario 4: Token de recuperação expirado/inválido — caso de erro
* **Given** token expirado (>1h) ou manipulado
* **When** usuário acessa link de redefinição
* **Then** sistema invalida token, exibe "Link expirado ou inválido — solicite nova recuperação"
* **And** registra `auditarSeguranca` (ação `RECOVERY_FAILED`, `motivo=token_invalido_ou_expirado`)

#### Scenario 5: Falha no envio de e-mail SMTP — caminho de erro
* **Given** `nodemailer` falha ao enviar e-mail de recuperação (SMTP indisponível, credenciais inválidas)
* **When** usuário solicita recuperação
* **Then** sistema **não** persiste token de recuperação (evita token órfão)
* **And** exibe "Falha ao enviar e-mail — contate administrador"
* **And** registra `auditarSeguranca` (ação `RECOVERY_EMAIL_FAILED`, `erro`)
* **And** alerta operacional (NFR-O05)

#### Scenario 6: Logout — caminho feliz
* **Given** usuário autenticado
* **When** seleciona "Sair"
* **Then** sistema executa `logout`: invalida sessão/token
* **And** registra `auditarSeguranca` (ação `LOGOUT`, `userId`)
* **And** redireciona para login

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Tela de Login, Recuperação, Redefinição]
* **Estados da interface:** loading (validação credencial, envio e-mail), error (credenciais inválidas, token expirado, falha SMTP), success (redirecionamento, e-mail enviado)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo auth (backend), `login`, `logout`, `solicitarRecuperacao`, `recuperar`, `definirCredencial`, `hashToken`, `nodemailer`, `auditarSeguranca`, middleware de sessão, Zod schemas
* **Dependências técnicas:** better-sqlite3, crypto nativo (hashToken), nodemailer, zod, dotenv (SMTP config)
* **Considerações de performance/segurança:** NFR-P02 (≤300ms p95), NFR-SEC02 (TLS 1.3 obrigatório), NFR-SEC03 (hash credencial, sem MFA), NFR-SEC05 (runtime menor privilégio), NFR-SEC07 (Zod validation), NFR-SEC08 (brute force protection, enumeração), NFR-O01/O05/O06 (logs, alertas, auditoria)

### 6. Out of Scope
* MFA (roadmap — NFR-SEC03)
* RBAC granular além de admin/usuario (UC-08 assume apenas dois papéis)
* Rotação de segredos automática (NFR-SEC09: procedimento operacional 90 dias)
* SSO/OIDC integração

### 7. Definition of Ready
- [ ] Critérios de aceite definidos e validados com PO
- [ ] Dependências: `hashToken`, `nodemailer` configurado, `auditarSeguranca`, Zod schemas prontos
- [ ] Design/UX aprovado
- [ ] Estimativa de esforço realizada

### 8. Definition of Done
- [ ] Código implementado e revisado (PR aprovado)
- [ ] Testes unitários: login, logout, recuperação (sucesso/falha), timing attack protection (`crypto.timingSafeEqual`)
- [ ] Testes de integração: fluxo completo recuperação com SMTP mock
- [ ] Tipagem estrita TypeScript
- [ ] Lint/format ok
- [ ] Acessibilidade: labels ARIA, ordem foco, contraste (NFR-U01/NFR-U02)
- [ ] Documentação OpenAPI atualizada (`POST /api/auth/login`, `/logout`, `/recuperar`, `/redefinir`)
- [ ] Feature testada em staging
- [ ] Métricas: `auth_login_total{status}`, `auth_recovery_total{status}`, `auth_failed_attempts`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-SEC02, NFR-SEC03, NFR-SEC05, NFR-SEC07, NFR-SEC08, NFR-O01, NFR-O05, NFR-O06
* **Use Cases relacionados:** UC-08 (Autenticação e Gestão de Acesso)
* **Riscos relacionados:** R8 (Single point of failure), R7 (DDL não-transacional)
* **Business Rules:** BR-13, BR-14, BR-15, BR-12, BR-03, BR-16

---

## US-003 — Cadastro e Consulta de Clientes

* **Priority:** Must
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: CRUD completo com validação CNPJ, normalização, deduplicação por escritório, auditoria, transacionalidade, listagem paginada]
* **Épico:** Gestão de Cadastros (Slice 1: MVP)
* **Labels:** backend, frontend, cadastros, multi-tenant
* **Story Map:** REQ-003

### 1. Description (INVEST)
* **As a** Analista de Cadastros
* **I want to** listar, criar, detalhar e editar clientes com CNPJ validado/normalizado, textos padronizados e isolamento por escritório
* **So that** a base de clientes sirva de fundação confiável para vínculos documentais e relatórios

### 2. Business Context
Etapa 2 do Story Map. Core do subsistema de cadastros (UC-01). Clientes são a entidade central para vínculos (UC-05) e indexação (UC-03). BR-01 (CNPJ validado/normalizado), BR-02 (textos normalizados), BR-03 (escritório obrigatório), BR-12 (auditoria), BR-16 (transacionalidade), BR-18 (exclusão considera vínculos).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Listar clientes com paginação e filtros — caminho feliz
* **Given** analista autenticado em escritório ativo
* **When** acessa a tela de listagem de clientes
* **Then** sistema executa `listarClientes` filtrado por `office_id` (isolamento NFR-SEC04)
* **And** retorna lista paginada/ordenada (nome, CNPJ, status)
* **And** tempo de resposta ≤ 200ms p95 / ≤ 500ms p99 (NFR-P01)
* **And** registra `auditarSeguranca` (ação `LIST_CLIENTES`)

#### Scenario 2: Cadastrar novo cliente — caminho feliz
* **Given** analista na listagem, seleciona "Novo Cliente"
* **When** preenche CNPJ, razão social, nome fantasia, endereço, etc. e submete
* **Then** sistema valida CNPJ via `cnpjValido` e normaliza via `normalizarCnpj` (BR-01)
* **And** normaliza textos via `normalizarTexto` (BR-02)
* **And** verifica duplicidade de CNPJ normalizado no `office_id` atual
* **And** persiste em transação `withPostgresOfficeTransaction` / equivalente SQLite (BR-16)
* **And** registra `auditarCadastro` (ação `INSERT`, `traceId`, `officeId`, `userId`)
* **And** retorna confirmação e atualiza listagem
* **And** tempo de resposta ≤ 300ms p95 / ≤ 800ms p99 (NFR-P02)

#### Scenario 3: CNPJ inválido — caso de erro
* **Given** analista informa CNPJ mal formatado ou dígitos verificadores incorretos
* **When** submete cadastro
* **Then** `cnpjValido` retorna falso
* **And** sistema exibe "CNPJ inválido — verifique o número informado"
* **And** não persiste
* **And** loga tentativa em `auditarSeguranca`
* **And** retorna ao formulário com erro de campo

#### Scenario 4: CNPJ duplicado no mesmo escritório — caso de erro
* **Given** CNPJ normalizado já existe para o `office_id` atual
* **When** analista tenta cadastrar
* **Then** sistema exibe "CNPJ já cadastrado neste escritório"
* **And** sugere abrir detalhe do cliente existente
* **And** loga em `auditarCadastro`
* **And** retorna ao formulário

#### Scenario 5: Detalhar cliente — cenário alternativo
* **Given** analista seleciona cliente na listagem
* **When** sistema executa `detalheCliente` com ID do cliente
* **Then** retorna dados completos (incluindo contatos via `listarContatos`)
* **And** tempo de resposta ≤ 200ms p95 (NFR-P01)

#### Scenario 6: Editar cliente existente — cenário alternativo
* **Given** analista seleciona "Editar" em cliente da listagem
* **When** altera campos permitidos (não altera CNPJ — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA])
* **Then** sistema valida e normaliza textos alterados (`normalizarTexto`)
* **And** persiste em transação
* **And** registra `auditarCadastro` (ação `UPDATE`)
* **And** retorna confirmação

#### Scenario 7: Excluir cliente — cenário alternativo
* **Given** analista seleciona "Excluir" em cliente da listagem
* **When** sistema exibe confirmação com aviso sobre vínculos históricos associados (BR-18)
* **And** analista confirma exclusão
* **Then** sistema executa `excluirCadastro` em transação
* **And** registra `auditarCadastro` (ação `DELETE`)
* **And** remove cliente da listagem
* **And** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] tratamento de vínculos órfãos: manter anonimizados / marcar `orfao=true` / bloquear exclusão — a validar com Compliance

#### Scenario 8: Falha de transação / banco indisponível — caminho de erro
* **Given** erro de constraint, lock SQLite, ou conexão falha na persistência
* **When** qualquer operação de escrita
* **Then** sistema faz rollback automático (BR-16)
* **And** exibe "Erro ao salvar — tente novamente"
* **And** registra erro em log estruturado (NFR-O01) com `error`
* **And** alerta se `sqlite_write_lock_wait_seconds` > 2s (NFR-O05)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Listagem, Formulário, Detalhe]
* **Estados da interface:** loading (listagem, salvamento), empty (sem clientes), error (validação, duplicidade, banco), success (toast confirmação)
* **Acessibilidade:** Tabela com headers scope, formulário com labels associados, mensagens de erro via `aria-live` (NFR-U01/NFR-U02)

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo clientes (backend), `listarClientes`, `detalheCliente`, `salvarCliente`, `excluirCadastro`, `cnpjValido`, `normalizarCnpj`, `normalizarTexto`, `auditarCadastro`, `auditarSeguranca`, transação SQLite, Zod schemas
* **Dependências técnicas:** better-sqlite3, zod, crypto (hashToken para auditoria)
* **Considerações de performance/segurança:** NFR-P01/P02, NFR-S01 (50 users/escritório), NFR-S04 (isolamento cross-tenant), NFR-SEC04, NFR-SEC07, NFR-O01/O05/O06, NFR-C01 (LGPD exclusão), NFR-C04 (auditoria imutável)

### 6. Out of Scope
* Importação em lote de clientes (fora do MVP)
* Validação CNPJ contra Receita Federal (apenas algoritmo `cnpjValido`)
* Compartilhamento de clientes entre escritórios ([INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] assume isolamento total)

### 7. Definition of Ready
- [ ] Critérios de aceite validados com PO
- [ ] Dependências: `cnpjValido`, `normalizarCnpj`, `normalizarTexto`, `auditarCadastro`, transação SQLite prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: validação CNPJ, normalização, deduplicação, transação rollback
- [ ] Testes integração: CRUD completo com SQLite real, concorrência (lock WAL)
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/clientes`, `GET /api/clientes`, `GET /api/clientes/{id}`, `PUT /api/clientes/{id}`, `DELETE /api/clientes/{id}`)
- [ ] Testado em staging
- [ ] Métricas: `clientes_crud_total{action,status}`, `clientes_cnpj_duplicate_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-P02, NFR-S01, NFR-S04, NFR-SEC04, NFR-SEC07, NFR-O01, NFR-O05, NFR-O06, NFR-C01, NFR-C04
* **Use Cases relacionados:** UC-01 (Cadastrar e Gerenciar Clientes)
* **Riscos relacionados:** R1 (MVP sem contatos), R7 (DDL SQLite), R8 (SPOF)
* **Business Rules:** BR-01, BR-02, BR-03, BR-12, BR-16, BR-18

---

## US-004 — Indexação de Documento no Histórico (Upload, Validação, Hash, Cabeçalho)

* **Priority:** Must
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: upload único, validação formato/tamanho, hash SHA-256, extração cabeçalho PDF/DOCX sem IA, deduplicação por hash, persistência metadados, auditoria]
* **Épico:** Gestão Documental & Indexação (Slice 1: MVP)
* **Labels:** backend, frontend, documents, security, integrity
* **Story Map:** REQ-004

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** fazer upload de um arquivo (PDF/DOCX), ter seu formato/tamanho validado, hash SHA-256 calculado, cabeçalho extraído sem IA, e metadados persistidos com integridade verificada
* **So that** o documento entre no histórico rastreável, deduplicado e pronto para vínculos e relatórios

### 2. Business Context
Etapa 4 do Story Map. Core do subsistema de documentos (UC-03). BR-07 (arquivoPermitido, detectarFormato), BR-08 (integridade hashBytes), BR-12 (auditoria), BR-16 (isolamento tenant), BR-17 (migração preserva dados). NFBR-07 (arquivoPermitido, detectarFormato), BR-08 (integridade hashBytes), BR-12 (auditoria), BR-16 (isolamento tenant), BR-17 (migração preserva dados). NFR-P02/P04, NFR-S01/S04, NFR-SEC01/SEC04/SEC07, NFR-C03, NFR-O01/O05/O06.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Indexação de documento único com sucesso — caminho feliz
* **Given** analista autenticado em escritório ativo
* **When** acessa "Indexar Documento", seleciona arquivo local (PDF ou DOCX ≤ 10MB) e submete
* **Then** sistema executa `detectarFormato` e `arquivoPermitido` (BR-07)
* **And** lê bytes do arquivo (`lerDocumentoBytes`) e calcula `hashBytes` SHA-256
* **And** verifica se `hashBytes` já existe no histórico do escritório (deduplicação)
* **And** se novo: extrai cabeçalho via `extrairCabecalho` (PDF via `pdf-parse`, DOCX via `word-extractor`) — **sem IA** (BR-11)
* **And** persiste metadados via `indexarMetaDocumento`: nome, formato, hash, cabeçalho, tamanho, data, `office_id`, `user_id`
* **And** registra `auditarCadastro` (ação `INSERT` documento)
* **And** retorna resumo: indexado com sucesso
* **And** tempo de extração ≤ 2s (NFR-P04), escrita ≤ 300ms p95 (NFR-P02)

#### Scenario 2: Arquivo não permitido — caso de erro
* **Given** analista seleciona arquivo com formato não suportado, tamanho > 10MB ou tipo MIME inválido
* **When** submete
* **Then** `arquivoPermitido` retorna falso ou `detectarFormato` falha
* **And** sistema pula arquivo, exibe "Formato não suportado / Arquivo não permitido"
* **And** loga em `auditarSeguranca`
* **And** não persiste metadados

#### Scenario 3: Duplicata exata (mesmo hash) — caso de borda
* **Given** arquivo com mesmo `hashBytes` já indexado no escritório
* **When** analista tenta indexar novamente
* **Then** sistema ignora indexação, incrementa contador "duplicados"
* **And** exibe "Documento já indexado (hash idêntico)"
* **And** não gera novo registro de auditoria para o duplicado

#### Scenario 4: Falha na extração de cabeçalho — caso de erro
* **Given** arquivo PDF/DOCX corrompido, com senha ou formato inesperado
* **When** `pdf-parse` ou `word-extractor` lança exceção
* **Then** sistema persiste metadados básicos (sem cabeçalho)
* **And** marca `extracao_falhada=true`
* **And** loga erro com `traceId`
* **And** alerta se taxa de falha > threshold (NFR-O05)

#### Scenario 5: Erro de persistência / disco cheio — caminho de erro
* **Given** erro SQLite, espaço em disco, permissão na escrita
* **When** `indexarMetaDocumento` falha
* **Then** rollback automático (BR-16)
* **And** exibe "Falha ao indexar — verifique armazenamento"
* **And** log estruturado (NFR-O01)
* **And** alerta disco > 80% (NFR-O05)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Tela de Upload, Progresso, Resultado]
* **Estados da interface:** loading (upload, extração, persistência), empty (dropzone), error (validação, extração, disco), success (resumo com hash, cabeçalho preview)
* **Feedback:** progress bar para arquivos grandes, toast com hash gerado

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo documentos (backend), `indexarMetaDocumento`, `detectarFormato`, `arquivoPermitido`, `lerDocumentoBytes`, `hashBytes`, `extrairCabecalho`, `pdf-parse`, `word-extractor`, `auditarCadastro`, `auditarSeguranca`, transação SQLite
* **Dependências técnicas:** better-sqlite3, pdf-parse, word-extractor, crypto (SHA-256), zod (validação upload)
* **Considerações de performance/segurança:** NFR-P02/P04, NFR-SEC01 (SQLite cifrado), NFR-SEC04 (isolamento), NFR-SEC07 (Zod), NFR-C03 (hashBytes integridade), NFR-O01/O05/O06

### 6. Out of Scope
* Indexação em lote de arquivos existentes (`indexarArquivosExistentes` — REQ-019, Should)
* Versionamento de documentos (nova versão = novo registro vs update — open issue UC-03)
* OCR ou IA para extração (explicitamente fora — BR-11)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `pdf-parse`, `word-extractor`, `hashBytes`, `extrairCabecalho`, `auditarCadastro` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: validação formato, hash SHA-256, deduplicação, extração PDF/DOCX, falhas
- [ ] Testes integração: upload ponta-a-ponta com arquivos reais, concorrência
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade: dropzone teclado, ARIA live para progresso
- [ ] OpenAPI atualizado (`POST /api/documentos/indexar`)
- [ ] Testado em staging
- [ ] Métricas: `documentos_indexados_total{status}`, `documentos_extracao_falha_total`, `documentos_duplicados_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-P04, NFR-S01, NFR-S04, NFR-SEC01, NFR-SEC04, NFR-SEC07, NFR-C03, NFR-O01, NFR-O05, NFR-O06
* **Use Cases relacionados:** UC-03 (Indexar Documentos no Histórico)
* **Riscos relacionados:** R3 (Migração retroativa), R4 (Vigilância Playwright recursos), R7 (DDL SQLite)
* **Business Rules:** BR-07, BR-08, BR-11, BR-12, BR-16, BR-17

---

## US-005 — Leitura e Verificação de Integridade de Documentos

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: listagem com filtros, visualização/download, verificação hashBytes a cada leitura, bloqueio se divergência, auditoria acesso]
* **Épico:** Gestão Documental & Indexação (Slice 1: MVP)
* **Labels:** backend, frontend, documents, security, integrity
* **Story Map:** REQ-005

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos, Analista de Cadastros ou Auditor/Compliance
* **I want to** listar documentos com filtros, visualizar metadados, baixar ou visualizar conteúdo, e ter a integridade verificada automaticamente via hash SHA-256 a cada leitura
* **So that** o acesso ao conteúdo seja controlado, íntegro e auditado

### 2. Business Context
Etapa 4 do Story Map (continuação). UC-04. BR-08 (leitura bytes + hashBytes), BR-12 (auditoria acesso), BR-16 (isolamento tenant). NFR-P01 (leitura ≤200ms p95), NFR-SEC01/SEC04/C03 (integridade + isolamento).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Listar documentos com filtros — caminho feliz
* **Given** usuário autenticado em escritório ativo
* **When** acessa listagem de documentos e aplica filtros (cliente, data, formato, texto no cabeçalho)
* **Then** sistema executa consulta filtrada por `office_id` (isolamento NFR-SEC04)
* **And** retorna metadados paginados: nome, formato, tamanho, data, cabeçalho, hash
* **And** tempo de resposta ≤ 200ms p95 / ≤ 500ms p99 (NFR-P01)
* **And** registra `auditarSeguranca` (ação `LIST_DOCUMENTOS`)

#### Scenario 2: Visualizar metadados apenas — cenário alternativo
* **Given** usuário não abre o arquivo, só vê metadados na listagem
* **When** seleciona documento
* **Then** sistema retorna metadados sem ler bytes do armazenamento
* **And** registra `auditarSeguranca` (ação `VIEW_METADATA`)

#### Scenario 3: Baixar documento com verificação de integridade — caminho feliz
* **Given** usuário seleciona "Baixar" em documento
* **When** sistema executa `lerDocumentoBytes`
* **Then** recalcula `hashBytes` dos bytes lidos e compara com hash armazenado
* **And** se hash confere: entrega stream para download
* **And** registra `auditarSeguranca` (ação `DOWNLOAD`, `hash_verificado=true`)
* **And** tempo de resposta ≤ 200ms p95 (NFR-P01)

#### Scenario 4: Hash divergente — integridade comprometida — caso de erro crítico
* **Given** `hashBytes` recalculado ≠ hash armazenado
* **When** usuário tenta baixar/visualizar
* **Then** sistema **bloqueia entrega** imediatamente
* **And** exibe "Integridade do arquivo comprometida — contate administrador"
* **And** registra `auditarSeguranca` com `hash_verificado=false`, `alerta=integridade`
* **And** gera alerta crítico (NFR-O05)
* **And** não entrega conteúdo

#### Scenario 5: Arquivo físico não encontrado — caso de erro
* **Given** `lerDocumentoBytes` falha (arquivo movido/excluído externamente)
* **When** usuário tenta acessar
* **Then** registra `auditarSeguranca` (ação `READ_FAILED`, `erro=arquivo_ausente`)
* **And** exibe "Arquivo não encontrado no armazenamento"
* **And** alerta operacional (NFR-O05)

#### Scenario 6: Tentativa de acesso cross-tenant — caso de erro de segurança
* **Given** usuário manipula `document_id` de outro escritório
* **When** tenta acessar
* **Then** sistema retorna 404 (não 403, para não vazar existência)
* **And** registra `auditarSeguranca` (ação `ACCESS_DENIED`, `tentativa_cross_tenant=true`)
* **And** alerta segurança (NFR-O05)

#### Scenario 7: Re-extrair cabeçalho sob demanda — cenário alternativo
* **Given** usuário solicita "Re-extrair cabeçalho" (ex.: falha anterior)
* **When** sistema executa `extrairCabecalho` novamente
* **Then** atualiza metadado com novo cabeçalho
* **And** registra `auditarCadastro` (ação `UPDATE` cabeçalho)
* **And** retorna cabeçalho atualizado

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Listagem, Detalhe, Visualizador PDF]
* **Estados da interface:** loading (stream download), error (integridade, arquivo ausente, acesso negado), success (download inicia)
* **Acessibilidade:** botões com labels claros, mensagens de erro via `aria-live`, visualizador PDF com fallback de download

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo documentos (backend), `listarDocumentos`, `lerDocumento`, `lerDocumentoBytes`, `hashBytes`, `extrairCabecalho`, `auditarSeguranca`, `auditarCadastro`, storage filesystem
* **Dependências técnicas:** better-sqlite3, pdf-parse/word-extractor (re-extração), crypto (SHA-256)
* **Considerações de performance/segurança:** NFR-P01, NFR-SEC01/SEC04/C03/C04, NFR-O01/O05/O06

### 6. Out of Scope
* Streaming de arquivos >100MB (open issue UC-04)
* Cache de arquivos lidos (arquitetura stateless assumida)
* Visualização inline de DOCX (apenas PDF via browser)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `lerDocumentoBytes`, `hashBytes`, `extrairCabecalho`, `auditarSeguranca` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: verificação hash match/mismatch, listagem filtros, cross-tenant block
- [ ] Testes integração: download com arquivo corrompido (hash mismatch), arquivo ausente
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`GET /api/documentos`, `GET /api/documentos/{id}`, `GET /api/documentos/{id}/download`, `POST /api/documentos/{id}/verificar-integridade`)
- [ ] Testado em staging
- [ ] Métricas: `documentos_leitura_total{status}`, `documentos_integridade_falha_total`, `documentos_cross_tenant_attempt_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-SEC01, NFR-SEC04, NFR-C03, NFR-O01, NFR-O05, NFR-O06
* **Use Cases relacionados:** UC-04 (Consultar e Ler Documentos)
* **Riscos relacionados:** R7 (DDL SQLite), R8 (SPOF)
* **Business Rules:** BR-08, BR-12, BR-16, BR-07

---

## US-006 — Gestão Manual de Vínculos (Definir, Rejeitar, Resolver Pendências)

* **Priority:** Must
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: listagem pendentes, revisão manual com evidências, confirmar/rejeitar, prevalência manual sobre automático, invalidação consolidação, auditoria completa]
* **Épico:** Gestão de Vínculos & CCTs/Aditivos (Slice 1: MVP)
* **Labels:** backend, frontend, vinculos, business-rules
* **Story Map:** REQ-006

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** revisar vínculos pendentes, confirmar ou rejeitar associações documento-cliente/CCT-aditivo, criar vínculos manuais do zero, e invalidar consolidações erradas
* **So that** o histórico tenha rastreabilidade completa com prevalência da decisão manual sobre automação (BR-04)

### 2. Business Context
Etapa 5 do Story Map. Core do UC-05. BR-04 (manual prevalece sobre automático), BR-05 (aditivo só vincula a CCT se `referenciasExplicitas`), BR-06 (confirmação automática só com evidências suficientes), BR-12 (auditoria), BR-16 (isolamento), BR-19 (`invalidarConsolidacao` preserva rastreabilidade).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Revisar vínculos pendentes e confirmar — caminho feliz
* **Given** analista autenticado acessa "Vínculos Pendentes" (`resolverReferenciasPendentes`)
* **When** visualiza lista de vínculos com status `pendente_revisao` (documento, tipo, evidências, alvo sugerido)
* **And** seleciona um vínculo, revisa documento, cabeçalho, evidências
* **And** clica "Confirmar" (`definirVinculo`)
* **Then** sistema atualiza status para `confirmado_manual`, `origem=manual`
* **And** registra `auditarCadastro` (ação `UPDATE`, `origem=manual`, `decisao_usuario=confirmar`, `traceId`)
* **And** vínculo sai da lista de pendentes

#### Scenario 2: Rejeitar vínculo pendente — caminho feliz
* **Given** analista revisa vínculo `pendente_revisao` e decide que é incorreto
* **When** clica "Rejeitar" (`rejeitarVinculo`)
* **Then** sistema atualiza status para `rejeitado`, `origem=manual`
* **And** registra `auditarCadastro` (ação `UPDATE`, `decisao_usuario=rejeitar`)
* **And** vínculo sai da lista de pendentes

#### Scenario 3: Criar vínculo manual do zero — cenário alternativo
* **Given** analista seleciona "Novo Vínculo"
* **When** escolhe documento, tipo (CCT, Aditivo, Cliente, Sindicato), alvo
* **Then** sistema valida compatibilidade (ex.: aditivo só vincula a CCT)
* **And** persiste com status `confirmado_manual`, `origem=manual`
* **And** registra `auditarCadastro` (ação `INSERT`, `origem=manual`)

#### Scenario 4: Automação tenta sobrescrever vínculo manual — caso de borda (BR-04)
* **Given** vínculo `confirmado_manual` existente para documento
* **When** indexação automática (`indexarVinculo`) roda e encontra o mesmo documento
* **Then** sistema **não** altera vínculo manual
* **And** loga `auditarCadastro` (ação `AUTO_SKIPPED`, `vinculo_manual_prevalece=true`)
* **And** mantém status `confirmado_manual`

#### Scenario 5: Aditivo sem referência explícita à CCT — caso de borda (BR-05)
* **Given** aditivo indexado, `referenciasExplicitas` retorna vazio
* **When** automação tenta vincular
* **Then** vínculo fica `pendente_revisao` obrigatoriamente
* **And** não pode ser `confirmado_automatico`
* **And** analista deve revisar manualmente

#### Scenario 6: Múltiplos candidatos para mesmo documento — caso de borda (BR-06)
* **Given** `descobrirDocumentosClientes` encontra múltiplos clientes com CNPJ/texto similar
* **When** automação processa
* **Then** sistema cria múltiplos vínculos `pendente_revisao` (um por candidato)
* **And** analista usa `decidirDocumentoCliente` para escolher correto

#### Scenario 7: Invalidação de consolidação — cenário alternativo (BR-19)
* **Given** analista identifica erro em consolidação anterior
* **When** executa `invalidarConsolidacao` no vínculo/consolidação
* **Then** sistema reverte registros consolidados ao estado anterior ou marca `nao_valido`
* **And** registra `auditarCadastro` (ação `INVALIDATE`, `motivo`)
* **And** vínculos afetados voltam a `pendente_revisao` ou `confirmado_manual` conforme regra

#### Scenario 8: Falha de validação extração CCT — caso de erro
* **Given** documento classificado como CCT mas `validarExtracaoCct` falha
* **When** automação processa
* **Then** documento marcado `extracao_invalida=true`
* **And** vínculos não criados automaticamente
* **And** analista notificado para revisão manual
* **And** `auditarSeguranca` registra falha

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Lista Pendentes, Detalhe Vínculo, Modal Confirmar/Rejeitar]
* **Estados da interface:** loading (carregando pendentes), empty (sem pendentes), error (validação, falha automação), success (toast confirmação/rejeição)
* **Acessibilidade:** tabela pendentes com headers, ações por teclado, modal com focus trap, ARIA live para status

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo vínculos (backend), `resolverReferenciasPendentes`, `definirVinculo`, `rejeitarVinculo`, `invalidarConsolidacao`, `indexarVinculo`, `referenciasExplicitas`, `descobrirDocumentosClientes`, `decidirDocumentoCliente`, `auditarCadastro`, `auditarSeguranca`, transação SQLite
* **Dependências técnicas:** better-sqlite3, zod (validação tipos vínculo)
* **Considerações de performance/segurança:** NFR-P01/P02, NFR-SEC04 (isolamento), NFR-O01/O06 (auditoria imutável), NFR-C04

### 6. Out of Scope
* Indexação automática com `referenciasExplicitas` (REQ-015, Should)
* Descoberta automática de documentos de clientes (REQ-014, Should)
* Processamento CCT/Aditivo especializado (REQ-016/017, Should)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `definirVinculo`, `rejeitarVinculo`, `invalidarConsolidacao`, `resolverReferenciasPendentes`, `auditarCadastro` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: prevalência manual, aditivo sem referência, múltiplos candidatos, invalidação
- [ ] Testes integração: fluxo completo pendente → confirmado/rejeitado, automação skip manual
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`GET /api/vinculos/pendentes`, `POST /api/vinculos`, `PUT /api/vinculos/{id}/confirmar`, `PUT /api/vinculos/{id}/rejeitar`, `POST /api/vinculos/{id}/invalidar`)
- [ ] Testado em staging
- [ ] Métricas: `vinculos_pendentes_total`, `vinculos_confirmados_total{origem}`, `vinculos_rejeitados_total`, `vinculos_invalidados_total`, `vinculos_auto_skipped_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-P02, NFR-SEC04, NFR-O01, NFR-O06, NFR-C04
* **Use Cases relacionados:** UC-05 (Gerenciar Vínculos)
* **Riscos relacionados:** R2 (MVP sem automação vínculos), R6 (Exclusão vínculos órfãos)
* **Business Rules:** BR-04, BR-05, BR-06, BR-09, BR-10, BR-12, BR-16, BR-19

---

## US-007 — Geração de Relatórios HTML do Histórico

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: filtros múltiplos, consulta isolada por escritório, renderização HTML com dados já persistidos, escape HTML, auditoria geração]
* **Épico:** Relatórios & Auditoria (Slice 1: MVP)
* **Labels:** backend, frontend, reports, security
* **Story Map:** REQ-007

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos, Analista de Cadastros, Auditor/Compliance ou Administrador do Escritório
* **I want to** gerar relatórios HTML do histórico com filtros (período, cliente, tipo documento, status vínculo), textos sanitizados contra XSS, e dados íntegros já registrados
* **So that** possa analisar, compartilhar e auditar o histórico sem risco de injeção de código

### 2. Business Context
Etapa 7 do Story Map. UC-07. BR-11 (relatórios usam só dados registrados, `escaparHtml`), BR-12 (auditoria geração), BR-16 (isolamento tenant), BR-08 (integridade hashBytes). NFR-P01 (consulta ≤200ms), NFR-SEC06 (escape HTML), NFR-SEC04 (isolamento).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Gerar relatório HTML com filtros — caminho feliz
* **Given** usuário autenticado acessa "Relatórios"
* **When** define filtros: período, cliente, tipo documento, status vínculo, etc.
* **And** solicita "Gerar HTML"
* **Then** sistema executa consulta agregada filtrada por `office_id`
* **And** executa `renderizarRelatorioHtml` com dados retornados — **apenas dados já persistidos** (BR-11)
* **And** aplica `escaparHtml` em todos os campos de texto do template (BR-11, NFR-SEC06)
* **And** entrega HTML para visualização no navegador
* **And** registra `auditarSeguranca` (ação `REPORT_GENERATE`, `formato=html`, `filtros`, `registros_incluidos`)
* **And** tempo de consulta ≤ 200ms p95 (NFR-P01)

#### Scenario 2: Conjunto de dados vazio — caso de borda
* **Given** filtros não retornam registros
* **When** usuário gera relatório
* **Then** sistema exibe "Nenhum registro encontrado para os filtros"
* **And** gera relatório vazio (cabeçalho + "Sem dados")
* **And** registra `auditarSeguranca` (ação `REPORT_EMPTY`)

#### Scenario 3: Tentativa de XSS via dados — caso de erro de segurança
* **Given** dados maliciosos com `<script>alert(1)</script>` em campos de texto (ex.: nome cliente, observações)
* **When** relatório é renderizado
* **Then** `escaparHtml` neutraliza: converte para `&lt;script&gt;alert(1)&lt;/script&gt;`
* **And** HTML renderizado é seguro
* **And** se `escaparHtml` falhar: bug crítico — `auditarSeguranca` registra `alerta=xss_tentativa`, bloqueia geração, alerta segurança imediato

#### Scenario 4: Tentativa de acesso cross-tenant em relatório — caso de erro
* **Given** usuário manipula filtro `office_id` ou `document_id` de outro escritório
* **When** gera relatório
* **Then** sistema força `office_id` do usuário logado, ignora filtro enviado
* **And** registra `auditarSeguranca` (ação `REPORT_CROSS_TENANT_ATTEMPT`)
* **And** retorna 404 se `document_id` específico de outro tenant

#### Scenario 5: Relatório de auditoria específico — cenário alternativo
* **Given** auditor seleciona "Relatório de Auditoria"
* **When** sistema aplica filtros pré-definidos: ações sensíveis, período, usuário, escritório
* **Then** consulta tabela `auditoria` (inserts only — NFR-C04)
* **And** gera HTML com trilha completa
* **And** registra `auditarSeguranca` (ação `AUDIT_REPORT_GENERATE`)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Filtros, Preview HTML, Botão PDF]
* **Estados da interface:** loading (consulta + renderização), empty (sem dados), error (falha consulta, XSS detectado), success (HTML renderizado com botão "Gerar PDF")
* **Acessibilidade:** formulário filtros com labels, tabela relatório com headers, botões com aria-label

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo relatórios (backend), `renderizarRelatorioHtml`, `escaparHtml`, `html-entities`, `auditarSeguranca`, consulta SQLite filtrada por `office_id`, templates HTML fixos
* **Dependências técnicas:** better-sqlite3, html-entities, zod (validação filtros)
* **Considerações de performance/segurança:** NFR-P01, NFR-SEC06 (escape HTML obrigatório), NFR-SEC04 (isolamento), NFR-O01/O05/O06

### 6. Out of Scope
* Geração PDF (US-008)
* Relatórios agendados/recorrentes (REQ-023, Could)
* Editor de templates pelo usuário (templates fixos assumidos)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `renderizarRelatorioHtml`, `escaparHtml`, `auditarSeguranca` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: escape HTML (vetores XSS: atributo, texto, JS, CSS, URL), filtros, cross-tenant block
- [ ] Testes integração: geração HTML com dados reais, auditoria registrada
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/relatorios/html`)
- [ ] Testado em staging
- [ ] Métricas: `relatorios_gerados_total{formato,status}`, `relatorios_xss_blocked_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-SEC06, NFR-SEC04, NFR-O01, NFR-O05, NFR-O06
* **Use Cases relacionados:** UC-07 (Gerar Relatórios HTML e PDF)
* **Riscos relacionados:** R5 (Observabilidade MVP), R7 (DDL SQLite)
* **Business Rules:** BR-11, BR-12, BR-16, BR-08

---

## US-008 — Geração de Relatórios PDF do Histórico

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: usa Playwright headless (já na stack)* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: usa Playwright headless (já na stack v1.48.0) para converter HTML → PDF, limite 500 registros ≤ 5s p95, auditoria geração]
* **Épico:** Relatórios & Auditoria (Slice 1: MVP)
* **Labels:** backend, frontend, reports, playwright
* **Story Map:** REQ-008

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos, Analista de Cadastros, Auditor/Compliance ou Administrador do Escritório
* **I want to** gerar relatórios PDF a partir do HTML já renderizado, com limite de 500 registros e tempo ≤ 5s p95
* **So that** possa baixar, arquivar ou enviar relatórios formais em formato portátil

### 2. Business Context
Etapa 7 do Story Map (continuação). UC-07. BR-11 (dados registrados + escape HTML), BR-12 (auditoria), BR-16 (isolamento). NFR-P03 (PDF ≤ 5s p95 para 500 regs), NFR-SEC06 (escape HTML herdado do HTML). Stack tem `playwright` v1.48.0.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Gerar PDF a partir de relatório HTML — caminho feliz
* **Given** usuário visualizou relatório HTML (US-007) e clica "Gerar PDF"
* **When** sistema executa `gerarPdfRelatorio` convertendo HTML → PDF via Playwright headless
* **Then** PDF gerado com mesmo conteúdo do HTML (textos já escapados)
* **And** entrega PDF para download ou visualização
* **And** registra `auditarSeguranca` (ação `REPORT_GENERATE`, `formato=pdf`, `filtros`, `registros_incluidos`)
* **And** tempo de geração ≤ 5s p95 para até 500 registros (NFR-P03)

#### Scenario 2: Relatório com > 500 registros — caso de borda
* **Given** filtros retornam 1.200 registros
* **When** usuário solicita PDF
* **Then** sistema exibe aviso: "PDF limitado a 500 registros — use HTML para relatório completo ou refine filtros"
* **And** gera PDF com primeiros 500 registros (ordenados por data decrescente)
* **And** registra `auditarSeguranca` (ação `REPORT_PDF_TRUNCATED`, `total_registros=1200`, `incluidos=500`)

#### Scenario 3: Falha na geração PDF — caso de erro
* **Given** Playwright falha (timeout > 5s, erro renderização, memória insuficiente)
* **When** usuário solicita PDF
* **Then** sistema exibe "Falha ao gerar PDF — tente novamente ou use HTML"
* **And** HTML permanece disponível
* **And** loga erro com `traceId`
* **And** alerta se falha recorrente (NFR-O05)

#### Scenario 4: Relatório agendado (preparação para Should) — cenário alternativo
* **Given** administrador configura relatório recorrente (via `node-cron` — REQ-023)
* **When** job agendado executa
* **Then** gera PDF, salva em armazenamento e/ou envia por e-mail (`nodemailer`)
* **And** `auditarSeguranca` registra `origem=agendado`

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Botão "Gerar PDF" no preview HTML, modal progresso, download]
* **Estados da interface:** loading (gerando PDF com spinner), error (falha Playwright), success (download inicia automaticamente)
* **Acessibilidade:** botão com `aria-label="Gerar PDF do relatório"`, anúncio de conclusão via `aria-live`

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo relatórios (backend), `gerarPdfRelatorio`, Playwright (headless Chromium), `auditarSeguranca`, storage para PDFs gerados
* **Dependências técnicas:** playwright v1.48.0, better-sqlite3, nodemailer (para agendados futuros)
* **Considerações de performance/segurança:** NFR-P03, NFR-SEC06 (herdado), NFR-O01/O05/O06, NFR-S03 (Playwright consome CPU/RAM — limitar concorrência)

### 6. Out of Scope
* Relatórios agendados/recorrentes (REQ-023, Could)
* PDFs > 500 registros (apenas HTML ou paginação futura)
* Assinatura digital no PDF

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `gerarPdfRelatorio` com Playwright, `auditarSeguranca` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: conversão HTML→PDF, truncamento 500 regs, falha Playwright mock
- [ ] Testes integração: geração PDF ponta-a-ponta, download, auditoria
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/relatorios/pdf`)
- [ ] Testado em staging com 500+ registros
- [ ] Métricas: `relatorios_pdf_gerados_total{status}`, `relatorios_pdf_duration_seconds`, `relatorios_pdf_truncated_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P03, NFR-SEC06, NFR-SEC04, NFR-O01, NFR-O05, NFR-O06, NFR-S03
* **Use Cases relacionados:** UC-07 (Gerar Relatórios HTML e PDF)
* **Riscos relacionados:** R4 (Vigilância Playwright recursos), R5 (Observabilidade)
* **Business Rules:** BR-11, BR-12, BR-16, BR-08

---

## US-009 — Auditoria de Segurança e Cadastro (Trilha Imutável)

* **Priority:** Must
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: abas segurança/cadastros, filtros, paginação, detalhe expandido, export CSV/PDF, auto-auditoria de acesso]
* **Épico:** Relatórios & Auditoria (Slice 1: MVP)
* **Labels:** backend, frontend, audit, security, compliance
* **Story Map:** REQ-009

### 1. Description (INVEST)
* **As a** Auditor/Compliance ou Administrador do Escritório
* **I want to** consultar a trilha imutável de auditoria (segurança e cadastros) com filtros, paginação, detalhe expandido e exportação
* **So that** possa investigar incidentes, comprovar conformidade e rastrear todas as ações sensíveis

### 2. Business Context
Etapa 9 do Story Map. UC-09. BR-12 (auditoria obrigatória), BR-15 (runtime menor privilégio — sem UPDATE/DELETE em auditoria), BR-16 (isolamento tenant), BR-17 (migrações preservam auditoria). NFR-C02 (retenção ≥ 5 anos), NFR-C04 (inserts only), NFR-O01 (logs estruturados), NFR-O06 (auditoria domínio já implementada).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Consultar auditoria com filtros — caminho feliz
* **Given** auditor autenticado acessa "Auditoria"
* **When** aplica filtros: período, usuário, ação, entidade, escritório (se admin global)
* **And** submete
* **Then** sistema consulta tabela `auditoria` filtrada por `office_id` (isolamento NFR-SEC04)
* **And** retorna registros paginados: `timestamp`, `level`, `traceId`, `officeId`, `userId`, `action`, `entity`, `entityId`, `details`, `durationMs`, `error?` (NFR-O01)
* **And** tempo de resposta ≤ 200ms p95 (NFR-P01)

#### Scenario 2: Detalhe expandido de registro — cenário alternativo
* **Given** auditor seleciona registro na listagem
* **When** sistema exibe detalhe expandido
* **Then** mostra todos os campos JSON do registro, incluindo `details` completo
* **And** registra `auditarSeguranca` (ação `AUDIT_VIEW_DETAIL`, `audit_id`)

#### Scenario 3: Exportar auditoria (CSV/PDF) — cenário alternativo
* **Given** auditor define filtros e clica "Exportar CSV" ou "Exportar PDF"
* **When** sistema gera exportação
* **Then** CSV: colunas correspondentes aos campos da tabela `auditoria`
* **And** PDF: usa `renderizarRelatorioHtml` + `gerarPdfRelatorio` (US-007/008)
* **And** registra `auditarSeguranca` (ação `AUDIT_EXPORT`, `formato`, `registros_exportados`)

#### Scenario 4: Auto-auditoria de acesso à auditoria — caso de borda
* **Given** auditor acessa a tela de auditoria
* **When** qualquer ação (listar, detalhar, exportar)
* **Then** sistema registra `auditarSeguranca` para a própria ação de auditoria
* **And** cria rastreabilidade recursiva (quem auditou a auditoria)

#### Scenario 5: Tentativa de acesso cross-tenant — caso de erro
* **Given** auditor manipula filtro `office_id` para outro escritório
* **When** consulta
* **Then** sistema força `office_id` do usuário, ignora filtro
* **And** registra `auditarSeguranca` (ação `AUDIT_CROSS_TENANT_ATTEMPT`)
* **And** retorna 404

#### Scenario 6: Falha na escrita de log de auditoria — caso de erro crítico
* **Given** qualquer `auditarSeguranca`/`auditarCadastro` falha (disco cheio, lock SQLite)
* **When** operação principal tenta auditar
* **Then** sistema: loga erro em stderr (fallback), incrementa `audit_write_failures` em `/metrics`, alerta imediato (NFR-O05)
* **And** **não bloqueia operação principal** (auditoria é side-effect)
* **And** marca `auditoria_incompleta=true` na resposta se possível

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Abas Segurança/Cadastros, Filtros Avançados, Tabela Detalhada, Botões Export]
* **Estados da interface:** loading (consulta), empty (sem registros no período), error (falha consulta), success (tabela com paginação)
* **Acessibilidade:** tabela com headers complexos (scope), filtros em formulário acessível, export com labels claros

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo auditoria (backend), `auditarSeguranca`, `auditarCadastro`, tabela `auditoria` (inserts only), consulta filtrada por `office_id`, export CSV/PDF
* **Dependências técnicas:** better-sqlite3, zod (validação filtros), html-entities (escape no PDF)
* **Considerações de performance/segurança:** NFR-C02/C04 (imutabilidade + retenção), NFR-SEC04/SEC05 (isolamento + menor privilégio), NFR-O01/O06 (formato estruturado)

### 6. Out of Scope
* Dashboards Grafana / Alertmanager (observabilidade infra — NFR-O03/O04/O05, Should/Could)
* Tracing OpenTelemetry 100% (NFR-O04, Should)
* Arquivamento/particionamento de logs antigos (open issue UC-09)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: tabela `auditoria`, `auditarSeguranca`, `auditarCadastro`, export CSV/PDF prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: filtros, paginação, cross-tenant block, export CSV/PDF, auto-auditoria
- [ ] Testes integração: consulta com 10k+ registros, performance, falha escrita auditoria (mock)
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`GET /api/auditoria`, `GET /api/auditoria/export`)
- [ ] Testado em staging
- [ ] Métricas: `auditoria_consultas_total`, `auditoria_export_total{formato}`, `auditoria_write_failures_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-C02, NFR-C04, NFR-O01, NFR-O06, NFR-SEC04, NFR-SEC05
* **Use Cases relacionados:** UC-09 (Auditoria e Monitoramento)
* **Riscos relacionados:** R5 (Observabilidade MVP), R7 (DDL SQLite), R8 (SPOF)
* **Business Rules:** BR-12, BR-15, BR-16, BR-17

---

## US-010 — Health Check e Métricas Básicas

* **Priority:** Must
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: endpoints `/health` (liveness) e `/health/ready` (readiness) com checks SQLite, migrações, disco; `/metrics` Prometheus com contadores básicos; instrumentação manual mínima]
* **Épico:** Operação & Manutenção (Slice 1: MVP)
* **Labels:** backend, infra, observability, devops
* **Story Map:** REQ-010

### 1. Description (INVEST)
* **As a** Sistema de Monitoramento Externo (Prometheus, Load Balancer, k8s)
* **I want to** consultar `/health` (liveness/readiness) e `/metrics` (Prometheus) para saber se a instância está viva, pronta para tráfego, e coletar métricas básicas
* **So that** o orquestrador possa rotear tráfego, alertar em falhas e escalar verticalmente

### 2. Business Context
Etapa 10 do Story Map. UC-15. BR-16 (health verifica SQLite), BR-17 (migrações aplicadas). NFR-O01 (logs estruturados), NFR-O02 (health endpoints), NFR-O03 (metrics Prometheus), NFR-O04 (tracing — meta futura), NFR-O05 (alertas baseados em métricas). **Nenhuma lib de observabilidade detectada na stack** — implementação manual.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Liveness check — caminho feliz
* **Given** processo Node.js rodando
* **When** load balancer faz GET `/health`
* **Then** retorna 200 `{status: "ok", uptime: 3600, version: "1.2.3", timestamp: "..."}`

#### Scenario 2: Readiness check — sucesso
* **Given** SQLite conectado, migrações aplicadas, disco < 90%, escrita funcional
* **When** k8s faz GET `/health/ready`
* **Then** retorna 200 `{status: "ready", checks: {sqlite: "ok", migrations: "ok", disk: "ok", write: "ok"}}`

#### Scenario 3: Readiness check — falha SQLite
* **Given** SQLite indisponível (arquivo corrompido, lock permanente, permissão)
* **When** GET `/health/ready`
* **Then** retorna 503 `{status: "not_ready", failed: ["sqlite"]}`
* **And** load balancer remove instância do pool

#### Scenario 4: Readiness check — disco cheio
* **Given** uso de disco > 90%
* **When** GET `/health/ready`
* **Then** retorna 503 `{status: "not_ready", failed: ["disk"]}`
* **And** alerta crítico (NFR-O05)

#### Scenario 5: Métricas Prometheus — caminho feliz
* **Given** Prometheus faz GET `/metrics` a cada 15s
* **Then** expõe formato Prometheus com:
  - `http_requests_total{method,route,status}`
  - `http_request_duration_seconds{route,quantile}`
  - `sqlite_write_lock_wait_seconds`
  - `db_size_bytes`
  - `backup_last_success_timestamp`
  - `audit_write_failures`
* **And** Content-Type: `text/plain; version=0.0.4; charset=utf-8`

#### Scenario 6: Métricas customizadas de domínio — cenário alternativo
* **Given** código de negócio incrementa contadores
* **When** operações críticas ocorrem
* **Then** métricas expostas: `documents_indexed_total{status}`, `vinculos_created_total{origem}`, `cct_validated_total{status}`, `auth_login_total{status}`

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A (endpoints técnicos)
* **Estados da interface:** N/A

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Middleware HTTP (instrumentação), endpoints `/health`, `/health/ready`, `/metrics`, coletores manuais (contadores, histogramas), SQLite `PRAGMA` checks
* **Dependências técnicas:** better-sqlite3 (para checks), crypto (traceId), sem libs externas (implementação manual)
* **Considerações de performance/segurança:** NFR-O01/O02/O03, overhead < 5% (NFR-M03), TLS 1.3 (NFR-SEC02)

### 6. Out of Scope
* Tracing distribuído OpenTelemetry 100% (NFR-O04, Should)
* Dashboards Grafana / Alertmanager (Should/Could)
* Auto-instrumentação `@opentelemetry/auto-instrumentations-node`

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: middleware instrumentação, checks SQLite, formato Prometheus definidos
- [ ] Design/UX N/A
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: health checks (sucesso/falha), formato métricas Prometheus válido
- [ ] Testes integração: scrape Prometheus real, load balancer health check
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] OpenAPI atualizado (`GET /health`, `GET /health/ready`, `GET /metrics`)
- [ ] Testado em staging
- [ ] Métricas: todas as listadas expostas e validadas

### 9. Traceability
* **NFRs relacionadas:** NFR-O01, NFR-O02, NFR-O03, NFR-O04, NFR-O05, NFR-M03
* **Use Cases relacionados:** UC-15 (Health Check e Métricas)
* **Riscos relacionados:** R5 (Observabilidade MVP), R7 (DDL SQLite), R8 (SPOF)
* **Business Rules:** BR-16, BR-17

---

## US-011 — Sanitização de Textos (escaparHtml, normalizarTexto)

* **Priority:** Must
* **Complexity:** 2 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: funções utilitárias reutilizáveis, escape HTML completo (atributo, texto, JS, CSS, URL), normalização CNPJ/texto dedicada]
* **Épico:** Utilitários Transversais (Slice 1: MVP)
* **Labels:** backend, frontend, security, utils
* **Story Map:** REQ-011

### 1. Description (INVEST)
* **As a** Sistema (invocado internamente por outros casos de uso)
* **I want to** funções `escaparHtml` (prevenção XSS em todos contextos) e `normalizarTexto` (padronização: trim, case, acentos, espaços) disponíveis como shared kernel
* **So that** todos os módulos usem a mesma implementação testada e auditada

### 2. Business Context
Funções transversais (UC-13). BR-02 (`normalizarTexto` obrigatório em `salvarCliente`, `salvarContato`), BR-11 (`escaparHtml` obrigatório em `renderizarRelatorioHtml`, `gerarPdfRelatorio`, qualquer saída HTML), BR-01 (`normalizarCnpj` + `cnpjValido`). NFR-SEC06 (XSS prevention), NFR-M03 (TypeScript strict), NFR-M01 (testes ≥ 80%).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Escape HTML — vetores XSS cobertos
* **Given** strings maliciosas em diferentes contextos
* **When** `escaparHtml` processa
* **Then** contexto texto: `<script>alert(1)</script>` → `&lt;script&gt;alert(1)&lt;/script&gt;`
* **And** contexto atributo: `"><img src=x onerror=alert(1)>` → `&quot;&gt;&lt;img src=x onerror=alert(1)&gt;`
* **And** contexto JavaScript: `</script><script>alert(1)</script>` → escapado para uso seguro em JS string
* **And** contexto CSS: `expression(alert(1))` → escapado
* **And** contexto URL: `javascript:alert(1)` → escapado
* **And** usa `html-entities` `encode` (non-ASCII + special chars) [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

#### Scenario 2: Normalizar texto — regras de negócio
* **Given** entradas variadas
* **When** `normalizarTexto` processa
* **Then** trim leading/trailing whitespace
* **And** colapso espaços múltiplos → único
* **And** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] case: UPPERCASE para nomes/razão social? lowercase para e-mail? a confirmar
* **And** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] acentos: remover (ASCII-folding) ou preservar NFC? impacta busca/deduplicação
* **And** pontuação: padronizar (ex.: múltiplos pontos → único)

#### Scenario 3: Normalizar CNPJ — caso especial
* **Given** `normalizarCnpj` (função dedicada)
* **When** processa CNPJ
* **Then** remove não-dígitos, valida comprimento 14, formata `XX.XXX.XXX/XXXX-XX` se necessário
* **And** `cnpjValido` valida dígitos verificadores

#### Scenario 4: Entrada nula/undefined — caso de borda
* **Given** parâmetro não é string
* **When** funções chamadas
* **Then** retorna string vazia (robustez) [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]

#### Scenario 5: String extremamente grande — caso de erro (DoS via regex)
* **Given** entrada > 1MB
* **When** funções chamadas
* **Then** limite de tamanho antes de processar (Zod `maxLength` na camada de entrada)
* **And** funções assumem entrada já validada

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A (funções internas)
* **Estados da interface:** N/A

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo `utils/text.ts` (shared kernel), `escaparHtml`, `normalizarTexto`, `normalizarCnpj`, `cnpjValido`, `html-entities` (decode/encode)
* **Dependências técnicas:** html-entities v2.6.0, zod (validação entrada), crypto (hashToken não usado aqui)
* **Considerações de performance/segurança:** NFR-SEC06 (XSS coverage completo), NFR-M01 (testes unitários exaustivos), NFR-M03 (tipagem estrita)

### 6. Out of Scope
* Sanitização server-side de HTML rico (ex.: DOMPurify) — não necessário, só escape
* Normalização de telefone (máscara brasileira vs internacional — open issue UC-02)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `html-entities` instalado, regras de normalização definidas
- [ ] Design/UX N/A
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: ≥ 80% cobertura, vetores XSS (OWASP cheat sheet), Unicode, bordas (nulo, vazio, gigante)
- [ ] Testes integração: uso real em `salvarCliente`, `renderizarRelatorioHtml`
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Documentação JSDoc completa
- [ ] Testado em staging

### 9. Traceability
* **NFRs relacionadas:** NFR-SEC06, NFR-M01, NFR-M03
* **Use Cases relacionados:** UC-13 (Sanitização e Utilitários de Texto)
* **Riscos relacionados:** R5 (Observabilidade)
* **Business Rules:** BR-01, BR-02, BR-11

---

## US-012 — Hash de Integridade (hashBytes) e Hash de Tokens (hashToken)

* **Priority:** Must
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: SHA-256 para documentos, bcrypt/PBKDF2 via crypto nativo para tokens, timing-safe comparison, backup cifrado AES-256-GCM]
* **Épico:** Utilitários Transversais (Slice 1: MVP)
* **Labels:** backend, security, crypto, integrity
* **Story Map:** REQ-012

### 1. Description (INVEST)
* **As a** Sistema (invocado internamente)
* **I want to** `hashBytes` (SHA-256 streaming para arquivos grandes), `hashToken` (hash lento irreversível para credenciais/tokens), e `backup:cifrar` (AES-256-GCM para backups)
* **So that** integridade de documentos, confidencialidade de credenciais e backups sejam garantidos criptograficamente

### 2. Business Context
Funções transversais (UC-14). BR-08 (`hashBytes` integridade documento), BR-13 (`hashToken` tokens nunca em claro), BR-15 (chaves backup separadas). NFR-SEC01 (SQLite cifrado, backup cifrado), NFR-SEC03 (work factor adequado), NFR-SEC09 (rotação chaves 90 dias), NFR-C03 (verificação hashBytes a cada leitura).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Hash bytes documento (SHA-256) — caminho feliz
* **Given** `indexarMetaDocumento` ou `lerDocumentoBytes` chama `hashBytes(buffer)`
* **When** função calcula `crypto.createHash('sha256').update(buffer).digest('hex')`
* **Then** retorna string hex 64 chars consistente para mesmos bytes
* **And** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] para arquivos grandes: streaming hash (não carregar todo em memória)

#### Scenario 2: Hash token credencial — caminho feliz
* **Given** `criarAutenticacao`, `definirCredencial`, `solicitarRecuperacao` chamam `hashToken(valor)`
* **When** função aplica algoritmo lento: [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] bcrypt cost 12 / argon2id / PBKDF2 100k iterações via crypto nativo
* **Then** retorna hash + salt (formato padrão: `$alg$params$hash`) — armazenado no banco
* **And** validação usa comparação em tempo constante (`crypto.timingSafeEqual`)

#### Scenario 3: Backup cifrado (AES-256-GCM) — caminho feliz
* **Given** script backup lê arquivo SQLite, chama `backup:cifrar(buffer, chave)`
* **When** função: gera IV aleatório (12 bytes), cifra com AES-256-GCM, retorna `IV + ciphertext + authTag`
* **Then** arquivo resultante salvo; `backup:chaves` gerencia rotação (NFR-SEC09)

#### Scenario 4: Verificação integridade sob demanda — cenário alternativo
* **Given** UC-04 EX-1 / UC-10 AS-1 passo 5
* **When** `hashBytes(arquivo_atual) === hash_armazenado`
* **Then** true/false — se false: bloqueia uso, alerta crítico

#### Scenario 5: Falha descriptografia backup — caso de erro
* **Given** chave errada, arquivo corrompido, authTag inválido
* **When** `backup:cifrar` inverso
* **Then** erro explícito, não falha silenciosamente
* **And** `auditarSeguranca` (ação `BACKUP_DECRYPT_FAILED`)
* **And** alerta crítico

#### Scenario 6: Timing attack em comparação hash — caso de erro
* **Given** comparação `===` em validação `hashToken`
* **When** atacante mede tempo
* **Then** usa `crypto.timingSafeEqual` ou biblioteca com comparação tempo constante

### 4. UI/UX Notes
* **Wireframe/Mockup:** N/A (funções internas)
* **Estados da interface:** N/A

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo `utils/crypto.ts` (shared kernel), `hashBytes`, `hashToken`, `backup:cifrar`, `backup:chaves`, `crypto` nativo Node.js
* **Dependências técnicas:** crypto (built-in), better-sqlite3 (armazenamento hashes), dotenv (chaves backup)
* **Considerações de performance/segurança:** NFR-SEC01/SEC03/SEC09, NFR-C03, streaming para arquivos grandes, work factor calibrado

### 6. Out of Scope
* HSM/KMS externo para chaves backup (assume arquivo `.env.keys` ou variáveis — open issue UC-14)
* Rotação automática de chaves (procedimento operacional 90 dias — NFR-SEC09)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: algoritmo `hashToken` definido, `backup:chaves` strategy definida
- [ ] Design/UX N/A
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: SHA-256 consistência, hashToken work factor, timing-safe comparison, AES-256-GCM encrypt/decrypt, streaming hash
- [ ] Testes integração: indexação+leitura integridade, login+recuperação tokens, backup+restauração
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Documentação JSDoc completa
- [ ] Testado em staging

### 9. Traceability
* **NFRs relacionadas:** NFR-SEC01, NFR-SEC03, NFR-SEC09, NFR-C03
* **Use Cases relacionados:** UC-14 (Hash e Integridade)
* **Riscos relacionados:** R7 (DDL SQLite), R8 (SPOF)
* **Business Rules:** BR-08, BR-13, BR-15

---

## US-013 — Cadastro e Consulta de Contatos

* **Priority:** Should
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: CRUD contatos vinculados a cliente, normalização textos, validação e-mail/telefone, isolamento por escritório via cliente]
* **Épico:** Gestão de Cadastros (Slice 2: Should)
* **Labels:** backend, frontend, cadastros, multi-tenant
* **Story Map:** REQ-013

### 1. Description (INVEST)
* **As a** Analista de Cadastros
* **I want to** listar, criar, editar e excluir contatos vinculados a um cliente, com textos normalizados e validação de e-mail/telefone
* **So that** a base de contatos suporte correspondências e notificações contextuais

### 2. Business Context
Etapa 3 do Story Map. UC-02. BR-02 (normalizarTexto), BR-03 (escritório obrigatório via cliente), BR-12 (auditoria), BR-16 (transacionalidade isolamento). NFR-P01/P02, NFR-SEC04 (isolamento cross-tenant), NFR-C01 (LGPD exclusão contatos).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: List#### Scenario 1: Listar contatos do cliente — caminho feliz
* **Given** analista autenticado abre detalhe do cliente (`detalheCliente`) e acessa aba "Contatos"
* **When** sistema executa `listarContatos` filtrado por `cliente_id` e `office_id`
* **Then** retorna lista paginada/ordenada (nome, cargo, e-mail, telefone)
* **And** tempo de resposta ≤ 200ms p95 / ≤ 500ms p99 (NFR-P01)
* **And** registra `auditarSeguranca` (ação `LIST_CONTATOS`)

#### Scenario 2: Cadastrar novo contato — caminho feliz
* **Given** analista na aba contatos, seleciona "Novo Contato"
* **When** preenche: nome, cargo, e-mail, telefone, observações e submete
* **Then** sistema normaliza textos via `normalizarTexto` (nome, cargo, observações) (BR-02)
* **And** valida formato de e-mail (Zod) e telefone (máscara/regra de negócio)
* **And** persiste contato em transação com `cliente_id` e `office_id` (BR-16)
* **And** registra `auditarCadastro` (ação `INSERT` contato)
* **And** retorna confirmação e atualiza listagem
* **And** tempo de resposta ≤ 300ms p95 / ≤ 800ms p99 (NFR-P02)

#### Scenario 3: Dados de contato inválidos (e-mail, telefone) — caso de erro
* **Given** analista informa e-mail mal formatado ou telefone inválido
* **When** submete
* **Then** validação Zod falha
* **And** sistema exibe erros de campo específicos
* **And** não persiste
* **And** loga em `auditarSeguranca`
* **And** retorna ao formulário

#### Scenario 4: Cliente não encontrado ou de outro escritório — caso de erro
* **Given** `cliente_id` não existe ou `office_id` difere do usuário logado
* **When** tenta cadastrar/editar contato
* **Then** sistema bloqueia, exibe "Cliente não encontrado"
* **And** loga em `auditarSeguranca` (tentativa cross-tenant)
* **And** redireciona para listagem de clientes

#### Scenario 5: Editar contato — cenário alternativo
* **Given** analista seleciona "Editar" em contato da listagem
* **When** altera campos
* **Then** sistema normaliza textos alterados (`normalizarTexto`)
* **And** persiste em transação
* **And** registra `auditarCadastro` (ação `UPDATE`)
* **And** retorna confirmação

#### Scenario 6: Excluir contato — cenário alternativo
* **Given** analista seleciona "Excluir" em contato
* **When** confirma exclusão
* **Then** sistema remove contato em transação
* **And** registra `auditarCadastro` (ação `DELETE`)
* **And** atualiza listagem

#### Scenario 7: Falha de transação / lock SQLite — caminho de erro
* **Given** erro de banco na persistência
* **When** qualquer operação de escrita
* **Then** rollback automático (BR-16)
* **And** mensagem de retry
* **And** log estruturado (NFR-O01)
* **And** alerta se lock > 2s (NFR-O05)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Aba Contatos no Detalhe Cliente, Modal Formulário]
* **Estados da interface:** loading (listagem, salvamento), empty (sem contatos), error (validação, cliente não encontrado), success (toast)
* **Acessibilidade:** tabela com headers, formulário com labels, máscara telefone acessível

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo contatos (backend), `listarContatos`, `salvarContato`, `excluirContato`, `normalizarTexto`, `auditarCadastro`, `auditarSeguranca`, transação SQLite, Zod schemas
* **Dependências técnicas:** better-sqlite3, zod
* **Considerações de performance/segurança:** NFR-P01/P02, NFR-SEC04 (isolamento via cliente), NFR-SEC07 (Zod), NFR-O01/O05/O06, NFR-C01 (LGPD)

### 6. Out of Scope
* Contato "principal" por cliente (flag `is_primary` — open issue UC-02)
* Compartilhamento de contatos entre clientes/escritórios ([INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] assume isolamento)
* Validação telefone internacional (máscara brasileira fixa assumida — open issue UC-02)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `normalizarTexto`, `auditarCadastro`, transação SQLite prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: validação e-mail/telefone, normalização, cross-tenant block via cliente
- [ ] Testes integração: CRUD completo com cliente real, concorrência
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/clientes/{id}/contatos`, `GET /api/clientes/{id}/contatos`, `PUT /api/contatos/{id}`, `DELETE /api/contatos/{id}`)
- [ ] Testado em staging
- [ ] Métricas: `contatos_crud_total{action,status}`, `contatos_validation_error_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-P02, NFR-SEC04, NFR-SEC07, NFR-O01, NFR-O05, NFR-O06, NFR-C01
* **Use Cases relacionados:** UC-02 (Cadastrar e Gerenciar Contatos)
* **Riscos relacionados:** R1 (MVP sem contatos — resolvido no Should), R7 (DDL SQLite)
* **Business Rules:** BR-02, BR-03, BR-12, BR-16

---

## US-014 — Descoberta Automática de Documentos de Clientes (Candidatos para Revisão)

* **Priority:** Should
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: `descobrirDocumentosClientes` usa CNPJ/texto normalizado, cria candidatos `pendente_revisao` para evidências parciais, `confirmado_automatico` só com evidências suficientes]
* **Épico:** Gestão de Vínculos & CCTs/Aditivos (Slice 2: Should)
* **Labels:** backend, frontend, vinculos, automation
* **Story Map:** REQ-014

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** o sistema descobrir automaticamente documentos de clientes (contratos, procurações, etc.) via CNPJ/texto normalizado, criando vínculos confirmados quando há evidências suficientes ou candidatos pendentes para revisão manual
* **So that** reduza esforço manual de vinculação de documentos não-CCT/aditivo

### 2. Business Context
Etapa 5 do Story Map (automação). UC-05 AS-3. BR-06 (confirmação automática só com evidências suficientes; coincidências parciais → candidatos), BR-12 (auditoria), BR-16 (isolamento). NFR-P01/P02, NFR-SEC04.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Descoberta com evidências suficientes — confirmação automática
* **Given** documento indexado (não CCT/aditivo) com CNPJ claro no cabeçalho/texto
* **When** sistema executa `descobrirDocumentosClientes` (trigger: indexação ou sob demanda)
* **And** CNPJ normalizado casa com exatamente 1 cliente do escritório
* **And** textos normalizados têm alta similaridade (threshold configurável [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA])
* **Then** cria vínculo `confirmado_automatico`, `origem=automatico`
* **And** registra `auditarCadastro` (ação `INSERT` vínculo, `origem=automatico`, `evidencias`)

#### Scenario 2: Descoberta com coincidências parciais — candidatos pendentes
* **Given** documento com CNPJ/texto que casa com múltiplos clientes ou similaridade média
* **When** `descobrirDocumentosClientes` processa
* **Then** cria múltiplos vínculos `pendente_revisao` (um por candidato)
* **And** analista usa `contextoDocumentoCliente` e `decidirDocumentoCliente` para confirmar/rejeitar
* **And** registra `auditarCadastro` (ação `INSERT` vínculo, `origem=automatico`, `status=pendente_revisao`)

#### Scenario 3: Descoberta sob demanda — cenário alternativo
* **Given** analista seleciona documento e clica "Descobrir Cliente"
* **When** sistema executa `descobrirDocumentosClientes` para aquele documento
* **Then** retorna candidatos encontrados (confirmados + pendentes)
* **And** analista decide via `decidirDocumentoCliente`

#### Scenario 4: Nenhum candidato encontrado — caso de borda
* **Given** documento sem CNPJ/texto reconhecível
* **When** descoberta roda
* **Then** retorna vazio, sem criar vínculos
* **And** loga `auditarSeguranca` (ação `DISCOVERY_NO_CANDIDATES`)

#### Scenario 5: Ambiguidade — múltiplos clientes mesmo CNPJ — caso de erro
* **Given** CNPJ normalizado casa com múltiplos clientes (dados sujos)
* **When** descoberta processa
* **Then** cria múltiplos `pendente_revisao` (BR-06 proíbe confirmação automática)
* **And** alerta `auditarSeguranca` (ação `DISCOVERY_AMBIGUOUS_CNPJ`)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Botão "Descobrir Cliente" no Detalhe Documento, Lista Candidatos com Scores]
* **Estados da interface:** loading (processando descoberta), empty (nenhum candidato), success (candidatos listados com score/evidências)
* **Acessibilidade:** scores anunciados via ARIA, ações por teclado

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo vínculos (backend), `descobrirDocumentosClientes`, `decidirDocumentoCliente`, `contextoDocumentoCliente`, `normalizarTexto`, `normalizarCnpj`, `auditarCadastro`, `auditarSeguranca`
* **Dependências técnicas:** better-sqlite3, algoritmos similaridade texto (ex.: Levenshtein, Jaro-Winkler — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] biblioteca a escolher)
* **Considerações de performance/segurança:** NFR-P01/P02, NFR-SEC04, NFR-O01/O06

### 6. Out of Scope
* Descoberta de CCT/Aditivo (REQ-015, separado)
* IA/ML para matching (fora de escopo — BR-11)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `descobrirDocumentosClientes`, `decidirDocumentoCliente`, similaridade texto definidos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: matching CNPJ exato, similaridade textual, ambiguidade, threshold
- [ ] Testes integração: descoberta automática na indexação, sob demanda, decisão manual
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/documentos/{id}/descobrir-clientes`, `POST /api/documentos/{id}/decidir-cliente`)
- [ ] Testado em staging
- [ ] Métricas: `documentos_descobertos_total{status}`, `documentos_candidatos_pendentes_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-P02, NFR-SEC04, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-05 (Gerenciar Vínculos — AS-3)
* **Riscos relacionados:** R2 (MVP sem automação — resolvido no Should)
* **Business Rules:** BR-06, BR-12, BR-16

---

## US-015 — Indexação Automática de Vínculos com Referências Explícitas (CCT/Aditivo)

* **Priority:** Should
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: `indexarVinculo` + `referenciasExplicitas` extrai número registro, data, sindicato da CCT original; aditivo só vincula se referência explícita; CCT vincula a cliente via CNPJ]
* **Épico:** Gestão de Vínculos & CCTs/Aditivos (Slice 2: Should)
* **Labels:** backend, frontend, vinculos, automation, cct
* **Story Map:** REQ-015

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** o sistema indexar automaticamente vínculos CCT↔Cliente (via CNPJ) e Aditivo↔CCT (via `referenciasExplicitas`: número registro, data, sindicato), criando vínculos `confirmado_automatico` quando referências explícitas existem, ou `pendente_revisao` caso contrário
* **So that** a automação reduza drasticamente revisão manual de CCTs/aditivos com referências claras

### 2. Business Context
Etapa 5 do Story Map (automação CCT/Aditivo). UC-05 passo 2. BR-04 (manual prevalece), BR-05 (aditivo só vincula a CCT se `referenciasExplicitas`), BR-12 (auditoria), BR-16 (isolamento). NFR-P01/P02.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: CCT indexada — vinculação automática a cliente
* **Given** documento indexado classificado como CCT (`ehCct=true`)
* **When** `indexarVinculo` roda: tenta associar a cliente via `descobrirDocumentosClientes` (CNPJ no cabeçalho)
* **And** CNPJ casa com exatamente 1 cliente
* **Then** cria vínculo `confirmado_automatico` CCT↔Cliente
* **And** registra `auditarCadastro` (ação `INSERT` vínculo, `origem=automatico`, `tipo=CCT_CLIENTE`)

#### Scenario 2: Aditivo indexado — referência explícita encontrada
* **Given** documento classificado como Aditivo (`ehAditivoCct=true`)
* **When** `indexarVinculo` roda: busca CCT referenciada via `referenciasExplicitas` (número registro, data, sindicato)
* **And** encontra exatamente 1 CCT no escritório com esses dados
* **Then** cria vínculo `confirmado_automatico` Aditivo↔CCT
* **And** registra `auditarCadastro` (ação `INSERT` vínculo, `origem=automatico`, `tipo=ADITIVO_CCT`, `referencias`)

#### Scenario 3: Aditivo sem referência explícita — pendente obrigatório (BR-05)
* **Given** aditivo indexado, `referenciasExplicitas` retorna vazio
* **When** automação processa
* **Then** vínculo fica `pendente_revisao` obrigatoriamente
* **And** **não** pode ser `confirmado_automatico`
* **And** analista deve revisar manualmente (US-006)

#### Scenario 4: Múltiplas CCTs casam com referência — ambiguidade
* **Given** aditivo referencia número/registro que casa com múltiplas CCTs
* **When** `referenciasExplicitas` encontra múltiplos
* **Then** cria múltiplos vínculos `pendente_revisao` (um por CCT candidata)
* **And** analista escolhe correta

#### Scenario 5: Vínculo manual já existe — automação skip (BR-04)
* **Given** vínculo `confirmado_manual` existente para o documento
* **When** `indexarVinculo` roda
* **Then** sistema **não** altera vínculo manual
* **And** loga `auditarCadastro` (ação `AUTO_SKIPPED`, `vinculo_manual_prevalece=true`)

#### Scenario 6: Falha validação extração CCT — bloqueio automação
* **Given** documento CCT mas `validarExtracaoCct` falha
* **When** automação tenta indexar vínculo
* **Then** documento marcado `extracao_invalida=true`
* **And** vínculos não criados automaticamente
* **And** `auditarSeguranca` registra falha

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Indicador visual "Vínculo Automático" vs "Manual", Detalhe Referências Explícitas]
* **Estados da interface:** loading (indexando vínculos), success (vínculos criados com badge origem), warning (pendentes)
* **Acessibilidade:** badges com ARIA labels, anúncio de vínculos criados

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo vínculos (backend), `indexarVinculo`, `referenciasExplicitas`, `ehCct`, `ehAditivoCct`, `descobrirDocumentosClientes`, `auditarCadastro`, `auditarSeguranca`
* **Dependências técnicas:** better-sqlite3, regex/parser para `referenciasExplicitas` (campos exatos: número registro, data, sindicato — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA])
* **Considerações de performance/segurança:** NFR-P01/P02, NFR-SEC04, NFR-O01/O06

### 6. Out of Scope
* Processamento CCT/Aditivo especializado (validação extração, renderização Markdown, sindicato — REQ-016/017/018)
* Descoberta documentos clientes genéricos (REQ-014)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `referenciasExplicitas` parser, `ehCct`/`ehAditivoCct` classificadores, `validarExtracaoCct` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: parser referências (número, data, sindicato), CCT→cliente, aditivo→CCT, ambiguidade, skip manual
- [ ] Testes integração: indexação CCT/aditivo ponta-a-ponta, automação + revisão manual
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (trigger interno na indexação, não endpoint público direto)
- [ ] Testado em staging
- [ ] Métricas: `vinculos_auto_criados_total{tipo,status}`, `vinculos_auto_skipped_manual_total`, `vinculos_aditivo_sem_referencia_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-P02, NFR-SEC04, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-05 (Gerenciar Vínculos — passo 2)
* **Riscos relacionados:** R2 (MVP sem automação — resolvido no Should)
* **Business Rules:** BR-04, BR-05, BR-12, BR-16

---

## US-016 — Processamento de CCTs (Validação Extração, Renderização Markdown)

* **Priority:** Should
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: `validarExtracaoCct` checklist regulatório (NR, cláusulas obrigatórias), `renderizarCctMarkdown` template fixo apenas layout contratual, auditoria completa]
* **Épico:** Gestão de Vínculos & CCTs/Aditivos (Slice 2: Should)
* **Labels:** backend, frontend, cct, markdown, validation
* **Story Map:** REQ-016

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** validar extração completa de CCT (nenhum conteúdo omitido — BR-09), gerar documento formal Markdown apenas com layout acordado (BR-10), e ter auditoria de ambas operações
* **So that** CCTs tenham qualidade garantida e documento formal para uso em processos jurídicos

### 2. Business Context
Etapa 6 do Story Map. UC-06. BR-09 (validação extração completa), BR-10 (Markdown apenas layout contratual; evidências/justificativas separadas), BR-12 (auditoria), BR-16 (isolamento). NFR-P02/P04, NFR-SEC06 (sanitização Markdown se exibido em HTML).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Validação extração CCT passa — caminho feliz
* **Given** documento indexado classificado como CCT (`ehCct=true`) com cabeçalho extraído
* **When** analista solicita "Validar Extração" ou automação roda pós-indexação
* **Then** sistema executa `validarExtracaoCct`: verifica campos obrigatórios (vigência, partes, cláusulas, sindicato, NR — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] checklist exato a definir)
* **And** se passa: marca `extracao_validada=true`, registra `auditarCadastro` (ação `VALIDATE`, `status=passed`)
* **And** analista visualiza checklist de validação (itens OK/pendentes)

#### Scenario 2: Validação extração falha — caso de erro
* **Given** CCT com campos obrigatórios ausentes
* **When** `validarExtracaoCct` executa
* **Then** marca `extracao_invalida=true`
* **And** **não** gera Markdown formal
* **And** **não** cria vínculos automáticos (UC-05)
* **And** notifica analista para correção manual ou re-indexação
* **And** `auditarSeguranca` registra falha (ação `VALIDATE`, `status=failed`, `campos_faltantes`)

#### Scenario 3: Renderização Markdown formal — caminho feliz
* **Given** CCT com `extracao_validada=true`
* **When** analista solicita "Gerar Markdown" ou automação pós-validação
* **Then** sistema executa `renderizarCctMarkdown` com template fixo
* **And** Markdown contém **apenas layout contratual** (partes, cláusulas, vigência, assinaturas) — **sem evidências/justificativas** (BR-10)
* **And** textos passam por `escaparHtml` se exibidos em HTML (NFR-SEC06)
* **And** registra `auditarCadastro` (ação `RENDER`, `template_version`)
* **And** analista visualiza/download Markdown

#### Scenario 4: Erro na renderização Markdown — caso de erro
* **Given** template Markdown inválido ou dados inconsistentes
* **When** `renderizarCctMarkdown` falha
* **Then** sistema loga erro, mantém extração validada
* **And** exibe "Erro ao gerar documento formal — contate suporte"
* **And** `auditarSeguranca` com `erro=renderizacao`

#### Scenario 5: Re-validação sob demanda — cenário alternativo
* **Given** analista solicita "Re-validar extração"
* **When** sistema re-executa `validarExtracaoCct` no conteúdo atual
* **Then** se falha: marca `extracao_invalida=true`, notifica
* **And** se passa: atualiza status, re-renderiza Markdown se necessário
* **And** registra `auditarCadastro` (ação `REVALIDATE`)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Checklist Validação, Visualizador Markdown Side-by-side, Botões Ações]
* **Estados da interface:** loading (validando/renderizando), error (checklist com itens vermelhos), success (Markdown renderizado)
* **Acessibilidade:** checklist com ARIA, Markdown com copy-to-clipboard acessível

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo CCT (backend), `validarExtracaoCct`, `renderizarCctMarkdown`, `ehCct`, `auditarCadastro`, `auditarSeguranca`, template Markdown versionado
* **Dependências técnicas:** better-sqlite3, template engine (ex.: Handlebars, Nunjucks — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] não detectado na stack, implementação nativa ou dependência a adicionar)
* **Considerações de performance/segurança:** NFR-P02/P04, NFR-SEC06, NFR-O01/O06

### 6. Out of Scope
* Editor WYSIWYG para Markdown (template fixo assumido)
* Versionamento de template (open issue UC-06)
* Processamento Aditivo (REQ-017, separado)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: checklist `validarExtracaoCct` definido, template `renderizarCctMarkdown` aprovado
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: checklist validação (passa/falha itens), renderização template, escape HTML no Markdown
- [ ] Testes integração: CCT completa → validação → Markdown → auditoria
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/cct/{id}/validar`, `GET /api/cct/{id}/markdown`)
- [ ] Testado em staging
- [ ] Métricas: `cct_validados_total{status}`, `cct_markdown_gerados_total`, `cct_extracao_invalida_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-P04, NFR-SEC06, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-06 (Processar CCTs e Aditivos)
* **Riscos relacionados:** R4 (Vigilância Playwright), R7 (DDL SQLite)
* **Business Rules:** BR-09, BR-10, BR-12, BR-16

---

## US-017 — Processamento de Aditivos (Validação, Renderização, Vinculação a CCT)

* **Priority:** Should
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: similar a CCT mas vinculação obrigatória a CCT base via `referenciasExplicitas`, mesmo template Markdown adaptado]
* **Épico:** Gestão de Vínculos & CCTs/Aditivos (Slice 2: Should)
* **Labels:** backend, frontend, cct, aditivo
* **Story Map:** REQ-017

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** processar aditivos com validação de extração, renderização Markdown formal, e vinculação obrigatória à CCT base (via `referenciasExplicitas` ou revisão manual)
* **So that** aditivos tenham mesma qualidade e rastreabilidade das CCTs

### 2. Business Context
Etapa 6 do Story Map. UC-06 AS-1. BR-05 (aditivo só vincula a CCT se `referenciasExplicitas`), BR-09 (validação extração), BR-10 (Markdown layout contratual), BR-12 (auditoria), BR-16 (isolamento).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Aditivo com referência explícita — processamento completo automático
* **Given** documento classificado como Aditivo (`ehAditivoCct=true`)
* **When** `validarExtracaoCct` passa (aplica-se a aditivos)
* **And** `referenciasExplicitas` encontra CCT base única
* **Then** sistema renderiza Markdown do aditivo (`renderizarCctMarkdown` adaptado)
* **And** cria vínculo `confirmado_automatico` Aditivo↔CCT
* **And** registra `auditarCadastro` (ações `VALIDATE`, `RENDER`, `LINK_CCT`)

#### Scenario 2: Aditivo sem referência explícita — validação + renderização, vínculo pendente
* **Given** aditivo indexado, `referenciasExplicitas` vazio
* **When** validação passa
* **Then** renderiza Markdown
* **And** vínculo CCT fica `pendente_revisao` (BR-05)
* **And** analista vincula manualmente (US-006)

#### Scenario 3: Falha validação aditivo — caso de erro
* **Given** aditivo com extração incompleta
* **When** `validarExtracaoCct` falha
* **Then** marca `extracao_invalida=true`, não renderiza, não vincula
* **And** `auditarSeguranca` registra falha

#### Scenario 4: Registro sindicato aditivo — cenário alternativo
* **Given** aditivo processado
* **When** analista solicita "Registrar Sindicato"
* **Then** sistema executa `registrarSindicatoDocumento` (REQ-018)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Detalhe Aditivo com Link CCT Base, Badge "Pendente Vinculação"]
* **Estados da interface:** loading, error (validação), warning (sem referência CCT), success

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo CCT/Aditivo (backend), `validarExtracaoCct`, `renderizarCctMarkdown`, `referenciasExplicitas`, `registrarSindicatoDocumento`, `auditarCadastro`
* **Dependências técnicas:** better-sqlite3, template Markdown aditivo
* **Considerações de performance/segurança:** NFR-P02/P04, NFR-SEC06, NFR-O01/O06

### 6. Out of Scope
* Criação de CCT base (REQ-016)
* Sindicato (REQ-018, separado)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `validarExtracaoCct` (aditivo), `renderizarCctMarkdown` (aditivo), `referenciasExplicitas` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: validação aditivo, renderização, vinculação CCT automática/manual
- [ ] Testes integração: aditivo completo → validação → Markdown → link CCT
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (endpoints compartilhados com CCT + vínculo)
- [ ] Testado em staging
- [ ] Métricas: `aditivos_processados_total{status}`, `aditivos_vinculados_cct_auto_total`, `aditivos_pendentes_vinculacao_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-P04, NFR-SEC06, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-06 (Processar CCTs e Aditivos — AS-1)
* **Riscos relacionados:** R2 (automação vínculos), R7 (DDL SQLite)
* **Business Rules:** BR-05, BR-09, BR-10, BR-12, BR-16

---

#### US-018 — Registro de Sindicato em Documentos

* **Priority:** Should
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: cadastro de sindicatos existe como entidade separada (tabela `sindicatos`) com CNPJ/nome normalizado; vínculo documento↔sindicato com papel (signatário, depositário)]
* **Épico:** Gestão de Vínculos & CCTs/Aditivos (Slice 2: Should)
* **Labels:** backend, frontend, cct, sindicato
* **Story Map:** REQ-018

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** registrar sindicato(s) associado(s) a um documento (CCT, Aditivo, outro), informando papel (signatário, depositário, interveniente)
* **So that** a rastreabilidade sindical esteja completa nos documentos formais

### 2. Business Context
Etapa 6 do Story Map. UC-06 passo 4 / AS-3. BR-12 (auditoria), BR-16 (isolamento). NFR-P02, NFR-SEC04.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Registrar sindicato signatário — caminho feliz
* **Given** analista abre detalhe de CCT/Aditivo processado
* **When** clica "Registrar Sindicato", seleciona sindicato cadastrado (ou cadastra novo: CNPJ, nome, `normalizarTexto`, `cnpjValido`), define papel "signatário"
* **And** submete
* **Then** sistema executa `registrarSindicatoDocumento` criando vínculo documento↔sindicato com papel
* **And** registra `auditarCadastro` (ação `INSERT` sindicato_documento, `papel=signatario`)
* **And** sindicato aparece no detalhe do documento e no Markdown formal (se aplicável)

#### Scenario 2: Registrar múltiplos papéis — cenário alternativo
* **Given** documento com múltiplos sindicatos (ex.: signatário + depositário)
* **When** analista registra cada um com papel distinto
* **Then** sistema permite múltiplos vínculos mesmo documento, papéis diferentes
* **And** valida unicidade: mesmo sindicato + mesmo papel + mesmo documento = único

#### Scenario 3: Sindicato não cadastrado — caso de erro
* **Given** analista informa CNPJ de sindicato inexistente
* **When** tenta registrar
* **Then** sistema valida existência (cadastro prévio obrigatório)
* **And** bloqueia e exige cadastro prévio do sindicato
* **And** loga em `auditarCadastro`

#### Scenario 4: Registro avulso (independente de CCT/Aditivo) — cenário alternativo
* **Given** analista acessa "Registrar Sindicato" menu geral
* **When** informa documento, sindicato, papel
* **Then** mesmo fluxo de validação e persistência

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Seção Sindicatos no Detalhe Documento, Modal Seleção/ Cadastro Sindicato]
* **Estados da interface:** loading (busca sindicatos), error (não cadastrado), success (badge papel)
* **Acessibilidade:** autocomplete sindicato acessível, roles anunciados

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo sindicatos (backend), `registrarSindicatoDocumento`, cadastro sindicatos (CRUD básico), `normalizarTexto`, `cnpjValido`, `auditarCadastro`
* **Dependências técnicas:** better-sqlite3, tabela `sindicatos` (CNPJ unique por escritório? [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] assume global ou por tenant)
* **Considerações de performance/segurança:** NFR-P02, NFR-SEC04, NFR-O01/O06

### 6. Out of Scope
* Cadastro completo de sindicatos (CRUD separado — assumido pré-existente)
* Integração com bases externas de sindicatos

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: tabela `sindicatos`, `registrarSindicatoDocumento`, `auditarCadastro` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: registro papel único, múltiplos papéis, validação existência, unicidade
- [ ] Testes integração: CCT → sindicato signatário → Markdown inclui sindicato
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/documentos/{id}/sindicato`, `GET /api/sindicatos`)
- [ ] Testado em staging
- [ ] Métricas: `sindicatos_registrados_total{papel}`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-SEC04, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-06 (Processar CCTs e Aditivos — passo 4 / AS-3)
* **Riscos relacionados:** R7 (DDL SQLite)
* **Business Rules:** BR-12, BR-16

---

## US-019 — Migração Retroativa de Arquivos Existentes (indexarArquivosExistentes)

* **Priority:** Should
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: job `node-cron` de longa duração, varredura recursiva, progresso via polling/WebSocket, relatório consolidado, preserva dados anteriores (BR-17), não sobrescreve vínculos manuais (BR-04)]
* **Épico:** Operação & Manutenção (Slice 2: Should)
* **Labels:** backend, frontend, migration, batch, playwright
* **Story Map:** REQ-019

### 1. Description (INVEST)
* **As a** Administrador do Escritório
* **I want to** executar migração retroativa de acervo legado apontando diretório base, com varredura recursiva, indexação em lote (reuso US-004), relatório de progresso e falhas, sem bloquear operação normal
* **So that** escritórios com grande volume histórico possam onboarding completo sem perda de dados

### 2. Business Context
Etapa 10 do Story Map. UC-03 AS-1 / UC-11 passo 8. BR-07/08 (validação + hash), BR-12 (auditoria lote), BR-16 (isolamento), BR-17 (preserva dados), BR-04 (manual prevalece). NFR-P02/P04, NFR-S03 (Playwright não usado aqui, mas job longo consome recursos), NFR-O01/O05/O06.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Migração retroativa completa — caminho feliz
* **Given** admin autenticado acessa "Migração Legado" no onboarding ou configurações
* **When** informa caminho base do diretório legado e inicia migração
* **Then** sistema inicia job `node-cron` (ou background worker) `indexarArquivosExistentes`
* **And** varre diretório recursivamente, para cada arquivo: `detectarFormato`, `arquivoPermitido`, `hashBytes`, deduplicação, `extrairCabecalho`, `indexarMetaDocumento`
* **And** progresso exposto via endpoint de status (polling) ou WebSocket: `processados`, `duplicados`, `falhas`, `arquivo_atual`
* **And** ao final: gera relatório consolidado (indexados, duplicados ignorados, erros por arquivo)
* **And** registra `auditarSeguranca` (ação `LEGACY_INDEX_COMPLETE`, `estatisticas`)
* **And** não bloqueia operações normais do escritório

#### Scenario 2: Arquivos com falha — relatório detalhado
* **Given** migração processa arquivo corrompido, formato não suportado, permissão negada
* **When** falha ocorre
* **Then** arquivo quarentenado (pasta `quarentena/`), log detalhado no relatório
* **And** migração continua próximo arquivo
* **And** relatório final inclui: caminho, erro, timestamp

#### Scenario 3: Duplicatas com hash existente — deduplicação
* **Given** arquivo legado já indexado anteriormente (mesmo hash)
* **When** migração processa
* **Then** ignora, incrementa contador duplicados, não gera nova auditoria

#### Scenario 4: Preservação de vínculos manuais (BR-04/BR-17) — caso de borda
* **Given** documento legado já indexado e com vínculos `confirmado_manual`
* **When** migração re-processa mesmo arquivo (hash idêntico)
* **Then** metadados básicos atualizados (se mudou), **vínculos manuais preservados intactos**
* **And** `auditarCadastro` registra `LEGACY_REINDEX_MANUAL_PRESERVED`

#### Scenario 5: Cancelamento de migração — cenário alternativo
* **Given** migração em andamento
* **When** admin clica "Cancelar"
* **Then** job para graciosamente (termina arquivo atual), salva progresso
* **And** relatório parcial gerado
* **And** pode ser retomado depois

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Tela Migração com Barra Progresso, Log Tempo Real, Relatório Final]
* **Estados da interface:** loading (varrendo), progress (contadores tempo real), success (relatório), error (falha crítica job)
* **Acessibilidade:** progresso anunciado via ARIA live, relatório tabelado acessível

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo migração (backend), `indexarArquivosExistentes`, `node-cron` (agendamento/background), `fs` (varredura), reuso `indexarMetaDocumento`, `extrairCabecalho`, `hashBytes`, `auditarSeguranca`, `auditarCadastro`
* **Dependências técnicas:** better-sqlite3, node-cron v4.2.1, fs/promises nativo
* **Considerações de performance/segurança:** NFR-S03 (job longo single-thread), NFR-O05 (alerta se job > tempo esperado), NFR-SEC04 (isolamento tenant), NFR-C03 (hash integridade)

### 6. Out of Scope
* Migração de dados de outros sistemas (apenas arquivos filesystem)
* Paralelismo de indexação (single-thread por design SQLite)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `indexarArquivosExistentes` core, progresso endpoint, relatório generator prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: varredura recursiva, deduplicação, quarentena, preservação vínculos manuais
- [ ] Testes integração: migração 1k+ arquivos mistos (PDF/DOCX/corrompidos), cancelamento/retomada
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/migracao/legado`, `GET /api/migracao/legado/status`, `GET /api/migracao/legado/relatorio`)
- [ ] Testado em staging com acervo real
- [ ] Métricas: `migracao_legado_duration_seconds`, `migracao_legado_arquivos_total{status}`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-P04, NFR-S03, NFR-SEC04, NFR-O01, NFR-O05, NFR-O06, NFR-C03
* **Use Cases relacionados:** UC-03 (Indexar Documentos — AS-1), UC-11 (Onboarding — passo 8)
* **Riscos relacionados:** R3 (Migração retroativa atrasa onboarding), R7 (DDL SQLite)
* **Business Rules:** BR-04, BR-07, BR-08, BR-12, BR-16, BR-17

---

## US-020 — Configuração de Vigilância/Monitoramento Automático (Playwright + node-cron)

* **Priority:** Should
* **Complexity:** 13 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: `playwright` para automação navegador (login portais, download CCTs/aditivos), `node-cron` agendamento, configuração por escritório (URL, seletores, frequência, pasta destino), credenciais externas cifradas]
* **Épico:** Automação & Vigilância (Slice 2: Should)
* **Labels:** backend, frontend, automation, playwright, cron, security
* **Story Map:** REQ-020

### 1. Description (INVEST)
* **As a** Administrador do Escritório
* **I want to** configurar fontes de vigilância automática (URLs de portais sindicais, seletores Playwright, frequência cron, pasta download), testar antes de salvar, e ter jobs `node-cron` que executam download e indexação automática
* **So that** documentos cheguem ao histórico sem intervenção manual contínua

### 2. Business Context
Etapa 10 do Story Map. UC-12. BR-07 (arquivos capturados passam `arquivoPermitido`/`detectarFormato`), BR-08 (integridade `hashBytes`), BR-12 (auditoria execuções), BR-16 (isolamento total), BR-03 (escritório ativo). NFR-P04 (Playwright + indexação), NFR-S03 (escala vertical, Playwright consome CPU/RAM), NFR-SEC01 (arquivos volume cifrado), NFR-SEC04 (isolamento jobs), NFR-O01/O05.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Configurar vigilância — caminho feliz
* **Given** admin acessa "Vigilância / Monitoramento"
* **When** define fonte: URL alvo, seletores/ações Playwright (login, navegação, download), frequência (cron expression), pasta destino
* **And** valida: URL acessível, seletores sintaticamente corretos, cron válida
* **And** salva configuração
* **Then** sistema persiste, registra/atualiza job no `node-cron`
* **And** `loadWatchConfig` carrega jobs ativos na inicialização
* **And** registra `auditarCadastro` (ação `CONFIG_WATCH`, `CREATE`)

#### Scenario 2: Testar configuração antes de salvar — cenário alternativo
* **Given** admin preenche configuração, clica "Testar"
* **When** sistema executa rotina Playwright uma vez (headless)
* **Then** tenta login, navegação, download amostra
* **And** retorna: sucesso/falha, arquivos baixados, logs execução, tempo decorrido
* **And** admin ajusta se necessário

#### Scenario 3: Execução automática (background) — fluxo contínuo
* **Given** `node-cron` dispara job agendado
* **When** job acorda, executa script Playwright configurado
* **Then** arquivos baixados salvos na pasta destino do escritório
* **And** para cada arquivo: dispara indexação automática (US-004) — `indexarMetaDocumento`, `extrairCabecalho`, etc.
* **And** `auditarSeguranca` (ação `WATCH_EXECUTION`, `fonte`, `arquivos_baixados`, `sucesso`)

#### Scenario 4: Pausar/reativar vigilância — cenário alternativo
* **Given** lista de vigilâncias configuradas
* **When** admin alterna status "Ativo/Pausado"
* **Then** sistema para/reativa job no `node-cron` (não remove configuração)
* **And** `auditarCadastro` (ação `WATCH_PAUSE` / `WATCH_RESUME`)

#### Scenario 5: Falha automação Playwright — caso de erro
* **Given** site alterado, credenciais expiradas, seletor não encontrado, timeout
* **When** job executa
* **Then** registra falha, `auditarSeguranca` (ação `WATCH_FAILED`, `erro`, `traceId`)
* **And** alerta se 3 falhas consecutivas (NFR-O05)
* **And** não interrompe outros jobs

#### Scenario 6: Arquivo baixado não permitido — quarentena
* **Given** arquivo baixado falha em `arquivoPermitido`
* **When** indexação automática processa
* **Then** arquivo movido para `quarentena/`
* **And** log `auditarSeguranca` (ação `WATCH_QUARANTINE`)
* **And** notifica admin, não indexa no histórico

#### Scenario 7: Conflito agendamento / sobrecarga — caso de borda
* **Given** execução anterior > frequência agendada
* **When** `node-cron` tenta iniciar nova instância
* **Then** skip (não inicia nova), loga `auditarSeguranca` (ação `WATCH_SKIPPED`, `motivo=execucao_anterior_ativa`)
* **And** métrica `watch_overlap_count` em `/metrics`

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Editor Configuração Vigilância (JSON/DSL/Visual?), Lista Jobs com Status, Botão Testar, Histórico Execuções]
* **Estados da interface:** loading (testando), success (teste passou), error (seletor inválido, login falhou), active/paused badges
* **Acessibilidade:** editor seletores acessível (code editor com ARIA), logs expansíveis

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo vigilância (backend), `loadWatchConfig`, configuração Playwright por fonte, `node-cron` jobs dinâmicos, indexação automática (reuso US-004), `auditarSeguranca`, `auditarCadastro`, storage cifrado credenciais portais
* **Dependências técnicas:** playwright v1.48.0, node-cron v4.2.1, better-sqlite3, crypto (cifragem credenciais)
* **Considerações de performance/segurança:** NFR-S03 (limitar jobs Playwright concorrentes por instância — memória/CPU), NFR-SEC01 (credenciais portais cifradas — variáveis ambiente/cofre), NFR-O01/O05

### 6. Out of Scope
* Interface visual para definir seletores (code editor vs JSON vs DSL — open issue UC-12)
* Rotação automática credenciais portais (procedimento operacional)
* Orquestração distribuída (single-instance only)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `loadWatchConfig`, Playwright runner, `node-cron` dynamic jobs, cifragem credenciais prontos
- [ ] Design/UX aprovado (definir formato configuração seletores)
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: parser config, validação seletores, cron expression, cifragem credenciais
- [ ] Testes integração: job completo Playwright→download→indexação (mock portal), pausa/reativa, falhas
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/vigilancias`, `GET /api/vigilancias`, `PUT /api/vigilancias/{id}`, `POST /api/vigilancias/{id}/testar`, `GET /api/vigilancias/{id}/execucoes`)
- [ ] Testado em staging com portal real/teste
- [ ] Métricas: `watch_execucoes_total{status}`, `watch_overlap_count`, `watch_arquivos_baixados_total`, `watch_quarentena_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P04, NFR-S03, NFR-SEC01, NFR-SEC04, NFR-O01, NFR-O05
* **Use Cases relacionados:** UC-12 (Configuração de Monitoramento e Vigilância)
* **Riscos relacionados:** R4 (Vigilância Playwright recursos), R7 (DDL SQLite)
* **Business Rules:** BR-03, BR-07, BR-08, BR-12, BR-16

---

## US-021 — Exclusão de Cadastro com Tratamento de Vínculos Órfãos

* **Priority:** Could
* **Complexity:** 8 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: política de vínculos órfãos a definir com Compliance/Jurídico: (a) manter vínculos com `cliente_id` anulado + anonimização LGPD, (b) marcar `orfao=true` e excluir de relatórios padrão, (c) bloquear exclusão se houver vínculos confirmados]
* **Épico:** Gestão de Cadastros (Slice 3: Could)
* **Labels:** backend, frontend, cadastros, compliance, lgpd
* **Story Map:** REQ-021

### 1. Description (INVEST)
* **As a** Analista de Cadastros
* **I want to** excluir permanentemente um cliente/contato com tratamento transparente dos vínculos históricos associados, conforme política definida (LGPD + integridade histórica)
* **So that** o "direito ao esquecimento" (NFR-C01) seja atendido sem comprometer a rastreabilidade do histórico

### 2. Business Context
Etapa 11 do Story Map. UC-01 AS-3 / UC-02 AS-3. BR-18 (exclusão permanente considera vínculos), NFR-C01 (LGPD ≤ 30 dias), NFR-C04 (auditoria imutável). BR-16 (transacionalidade).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Exclusão cliente com política "anonimizar vínculos" — caminho feliz
* **Given** política definida: vínculos órfãos mantidos com `cliente_id=NULL`, dados pessoais anonimizados (LGPD)
* **When** analista confirma exclusão cliente (digita nome para confirmar)
* **Then** sistema: em transação, anonimiza dados pessoais do cliente (nome→"CLIENTE_REMOVIDO_<id>", CNPJ→hash, etc.), define `cliente_id=NULL` nos vínculos associados, marca `orfao=true`
* **And** registra `auditarCadastro` (ação `DELETE` cliente, `vinculos_anonimizados=N`)
* **And** `auditarSeguranca` registra `LGPD_ERASURE_REQUEST`
* **And** relatórios padrão excluem vínculos `orfao=true` (filtro padrão)

#### Scenario 2: Exclusão cliente com política "bloquear se vínculos confirmados" — caso de borda
* **Given** política definida: bloquear exclusão se houver vínculos `confirmado_manual` ou `confirmado_automatico`
* **When** analista tenta excluir cliente com vínculos confirmados
* **Then** sistema bloqueia, exibe "Cliente possui vínculos confirmados — invalide ou rejeite vínculos antes de excluir"
* **And** lista vínculos bloqueantes

#### Scenario 3: Exclusão contato — similar
* **Given** contato com vínculos (se aplicável) ou apenas cadastro
* **When** exclui
* **Then** anonimiza dados pessoais do contato, mantém vínculos se existirem (ajuste `contato_id=NULL`)

#### Scenario 4: Auditoria imutável preservada — caso de borda
* **Given** exclusão processada
* **When** auditor consulta trilha
* **Then** registros de auditoria do cliente/contato **permanecem intactos** (NFR-C04: inserts only)
* **And** `entityId` aponta para ID original (agora anonimizado), `details` mostra estado pré-exclusão

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Modal Confirmação Exclusão com Digitação Nome, Aviso Vínculos, Opção Política]
* **Estados da interface:** loading (processando anonimização), success (toast "Cliente removido, vínculos anonimizados"), error (bloqueado por vínculos)
* **Acessibilidade:** digitação nome com ARIA, aviso vínculos em alert role

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo clientes/contatos (backend), `excluirCadastro` estendido, anonimização LGPD (função dedicada), update vínculos `cliente_id=NULL`, `auditarCadastro`, `auditarSeguranca`, transação SQLite
* **Dependências técnicas:** better-sqlite3, crypto (hash para anonimização CNPJ)
* **Considerações de performance/segurança:** NFR-C01 (≤30 dias), NFR-C04 (auditoria imutável), NFR-O01/O06, transação atômica

### 6. Out of Scope
* Exclusão em lote
* Recuperação pós-exclusão (backup only)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] **Política de vínculos órfãos definida e aprovada por Compliance/Jurídico** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]
- [ ] Dependências: `excluirCadastro` base, anonimização function, update vínculos prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: anonimização campos, update vínculos, bloqueio por política, auditoria preservada
- [ ] Testes integração: exclusão cliente com 50+ vínculos mistos (confirmados/pendentes/rejeitados)
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`DELETE /api/clientes/{id}` estendido, `DELETE /api/contatos/{id}` estendido)
- [ ] Testado em staging
- [ ] Métricas: `clientes_excluidos_total`, `vinculos_anonimizados_total`, `exclusao_bloqueada_vinculos_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-C01, NFR-C04, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-01 (AS-3), UC-02 (AS-3)
* **Riscos relacionados:** R6 (Exclusão vínculos órfãos — política undefined), R7 (DDL SQLite)
* **Business Rules:** BR-18, BR-12, BR-16, NFR-C01, NFR-C04

---

## US-022 — Invalidação de Consolidação de Vínculos

* **Priority:** Could
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: `invalidarConsolidacao` afeta apenas consolidação lógica, não apaga documentos/metadados; vínculos afetados voltam a `pendente_revisao` ou `confirmado_manual`]
* **Épico:** Gestão de Vínculos & CCTs/Aditivos (Slice 3: Could)
* **Labels:** backend, frontend, vinculos, business-rules
* **Story Map:** REQ-022

### 1. Description (INVEST)
* **As a** Analista de Documentos/Vínculos
* **I want to** invalidar uma consolidação de vínculos anterior (reverter ao estado anterior ou marcar como inválido), com rastreabilidade completa da invalidação
* **So that** erros de consolidação possam ser corrigidos sem perder histórico

### 2. Business Context
Etapa 5 do Story Map (correção). UC-05 AS-2. BR-19 (`invalidarConsolidacao` preserva rastreabilidade), BR-12 (auditoria), BR-16 (transacionalidade).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Invalidar consolidação — caminho feliz
* **Given** analista identifica erro em consolidação anterior (vínculos incorretos confirmados)
* **When** executa `invalidarConsolidacao` no vínculo/consolidação, informa motivo
* **Then** sistema: reverte registros consolidados ao estado anterior OU marca `nao_valido=true` (conforme regra [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA])
* **And** vínculos afetados: se eram `confirmado_manual` → voltam a `confirmado_manual` (manual prevalece); se `confirmado_automatico` → voltam a `pendente_revisao`
* **And** registra `auditarCadastro` (ação `INVALIDATE`, `motivo`, `vinculos_afetados`, `estado_anterior`)
* **And** analista pode reprocessar/revisar vínculos pendentes

#### Scenario 2: Invalidação em cascata — caso de borda
* **Given** consolidação envolve múltiplos vínculos encadeados (CCT→Aditivo→Cliente)
* **When** invalida consolidação raiz
* **Then** propaga invalidação aos dependentes (marca `nao_valido` ou reverte)
* **And** registra cada vínculo afetado na auditoria

#### Scenario 3: Tentativa invalidação já invalidada — caso de erro
* **Given** consolidação já marcada `nao_valido=true`
* **When** analista tenta invalidar novamente
* **Then** sistema bloqueia, exibe "Consolidação já invalidada"
* **And** loga `auditarSeguranca` (ação `INVALIDATE_DUPLICATE`)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Botão "Invalidar Consolidação" no Detalhe Vínculo/Consolidação, Modal Motivo, Preview Impacto]
* **Estados da interface:** loading, success (toast "Consolidação invalidada, vínculos revertidos"), error (já invalidada)
* **Acessibilidade:** preview impacto em tabela acessível, motivo required

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo vínculos (backend), `invalidarConsolidacao`, lógica reversão/propagação, `auditarCadastro`, transação SQLite
* **Dependências técnicas:** better-sqlite3
* **Considerações de performance/segurança:** NFR-P02, NFR-O01/O06, NFR-C04 (auditoria imutável da invalidação)

### 6. Out of Scope
* Desfazer invalidação (não suportado — nova consolidação manual)
* Invalidação em lote

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] **Regra exata de reversão vs marcação `nao_valido` definida** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]
- [ ] Dependências: `invalidarConsolidacao`, `auditarCadastro` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: reversão estado anterior, propagação cascata, manual prevalece, auditoria completa
- [ ] Testes integração: invalidação consolidação complexa (CCT+Aditivo+Cliente)
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/vinculos/{id}/invalidar`)
- [ ] Testado em staging
- [ ] Métricas: `consolidacoes_invalidadas_total`, `vinculos_revertidos_invalidacao_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-O01, NFR-O06, NFR-C04
* **Use Cases### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-O01, NFR-O06, NFR-C04
* **Use Cases relacionados:** UC-05 (Gerenciar Vínculos — AS-2)
* **Riscos relacionados:** R7 (DDL SQLite)
* **Business Rules:** BR-19, BR-12, BR-16

---

## US-023 — Relatórios Agendados/Recorrentes (Entrega por E-mail via nodemailer)

* **Priority:** Could
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: reuso `renderizarRelatorioHtml` + `gerarPdfRelatorio` + `nodemailer`, agendamento via `node-cron`, configuração por escritório (filtros, frequência, destinatários)]
* **Épico:** Relatórios & Auditoria (Slice 3: Could)
* **Labels:** backend, frontend, reports, scheduling, email
* **Story Map:** REQ-023

### 1. Description (INVEST)
* **As a** Administrador do Escritório
* **I want to** configurar relatórios recorrentes (diários, semanais, mensais) com filtros pré-definidos, geração automática PDF/HTML, e envio por e-mail para destinatários autorizados
* **So that** stakeholders recebam relatórios periódicos sem intervenção manual

### 2. Business Context
Etapa 7 do Story Map (extensão). UC-07 AS-1. BR-11 (dados registrados + escape), BR-12 (auditoria), BR-16 (isolamento). NFR-P03 (PDF ≤5s), NFR-O01/O06.

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Configurar relatório agendado — caminho feliz
* **Given** admin acessa "Relatórios Agendados", clica "Novo Agendamento"
* **When** define: nome, filtros (período relativo: "último mês", "última semana"), formato (PDF/HTML), frequência (cron expression), destinatários (e-mails), assunto/template e-mail
* **And** salva
* **Then** sistema registra job no `node-cron` com configuração
* **And** `auditarCadastro` (ação `SCHEDULE_REPORT_CREATE`, `config`)

#### Scenario 2: Execução automática — fluxo contínuo
* **Given** `node-cron` dispara job agendado
* **When** job executa: aplica filtros resolvendo período relativo, gera relatório (HTML/PDF), envia e-mail via `nodemailer` com anexo/links
* **Then** `auditarSeguranca` (ação `SCHEDULE_REPORT_EXEC`, `status=success|failed`, `destinatarios`, `arquivo_tamanho`)
* **And** se falha envio: retry 3x com backoff, alerta se persistir (NFR-O05)

#### Scenario 3: Pausar/reativar/editar agendamento — cenários alternativos
* **Given** lista de agendamentos
* **When** admin alterna ativo/pausado, edita filtros/destinatários, ou exclui
* **Then** job `node-cron` atualizado/removido, `auditarCadastro` registra mudança

#### Scenario 4: Falha geração/envio — caso de erro
* **Given** job executa mas geração PDF falha ou SMTP indisponível
* **Then** `auditarSeguranca` registra falha detalhada, alerta admin
* **And** não remove agendamento (tenta próxima execução)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Lista Agendamentos, Formulário Configuração (Editor Cron Visual), Histórico Execuções]
* **Estados da interface:** active/paused badges, última execução status, próxima execução countdown
* **Acessibilidade:** editor cron com descrição textual, destinatários com autocomplete acessível

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo relatórios (backend), `node-cron` jobs dinâmicos, `renderizarRelatorioHtml`, `gerarPdfRelatorio`, `nodemailer`, `auditarCadastro`, `auditarSeguranca`
* **Dependências técnicas:** node-cron v4.2.1, nodemailer v10.0.16, playwright (PDF), better-sqlite3
* **Considerações de performance/segurança:** NFR-P03, NFR-SEC04 (isolamento tenant no job), NFR-O01/O05, credenciais SMTP por tenant (cifradas)

### 6. Out of Scope
* Relatórios condicionais (só envia se houver dados novos)
* Anexos múltiplos / zip
* Integração Slack/Teams (apenas e-mail)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `node-cron` dynamic jobs, `nodemailer` multi-tenant, geração relatório prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: parser cron, resolução período relativo, geração+envio mock SMTP
- [ ] Testes integração: agendamento diário/semanal, pausa/reativa, falha retry
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/relatorios/agendados`, `GET /api/relatorios/agendados`, `PUT /api/relatorios/agendados/{id}`, `DELETE /api/relatorios/agendados/{id}`)
- [ ] Testado em staging
- [ ] Métricas: `relatorios_agendados_execucoes_total{status}`, `relatorios_agendados_email_falhas_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-P03, NFR-SEC04, NFR-O01, NFR-O05, NFR-O06
* **Use Cases relacionados:** UC-07 (Gerar Relatórios — AS-1)
* **Riscos relacionados:** R4 (Playwright recursos), R5 (Observabilidade)
* **Business Rules:** BR-11, BR-12, BR-16

---

## US-024 — Relatórios de Auditoria Específicos (Filtros Pré-definidos de Ações Sensíveis)

* **Priority:** Could
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: endpoints dedicados com filtros fixos para compliance (ex.: "Acessos falhos última semana", "Exclusões de cadastro", "Mudanças de credencial"), reuso US-009 export]
* **Épico:** Relatórios & Auditoria (Slice 3: Could)
* **Labels:** backend, frontend, audit, compliance
* **Story Map:** REQ-024

### 1. Description (INVEST)
* **As a** Auditor/Compliance
* **I want to** acessar relatórios de auditoria com filtros pré-definidos para cenários comuns de compliance (LGPD, segurança, integridade), sem precisar montar filtros complexos manualmente
* **So that** auditorias recorrentes sejam rápidas, padronizadas e reprodutíveis

### 2. Business Context
Etapa 9 do Story Map (especialização). UC-09. BR-12 (auditoria), NFR-C02 (retenção 5 anos), NFR-C04 (imutabilidade).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Acessar relatório pré-definido — caminho feliz
* **Given** auditor acessa "Relatórios de Auditoria" aba "Modelos Prontos"
* **When** seleciona "Tentativas de Acesso Falhas (últimos 7 dias)"
* **Then** sistema executa query com filtros fixos: `action IN ('LOGIN_FAILED','RECOVERY_FAILED')`, `timestamp >= now()-7d`, `office_id` do usuário
* **And** retorna tabela paginada + botões Export CSV/PDF (reuso US-009)
* **And** registra `auditarSeguranca` (ação `AUDIT_REPORT_TEMPLATE`, `template=failed_access_7d`)

#### Scenario 2: Lista de modelos pré-definidos — exemplos
* **Given** auditor visualiza modelos
* **Then** modelos disponíveis:
  - "Acessos Falhos (7d/30d)"
  - "Exclusões de Cadastro (período)"
  - "Mudanças de Credencial/Recuperação (período)"
  - "Acessos Cross-Tenant Tentados (período)"
  - "Falhas de Integridade Documento (período)"
  - "Operações de Backup/Restauração (período)"
  - "Migrações de Versão (período)"
  - "LGPD: Solicitações Exclusão (período)"

#### Scenario 3: Parâmetros mínimos — apenas período
* **Given** modelo selecionado
* **When** auditor ajusta apenas "Período" (início/fim) — demais filtros fixos
* **Then** relatório gerado com performance otimizada (índices adequados)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Cards Modelos Auditoria, Seletor Período Simples, Botão Gerar/Exportar]
* **Estados da interface:** loading, success (tabela + export), empty (nenhum registro no período)
* **Acessibilidade:** cards com ARIA labels, período com date picker acessível

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo auditoria (backend), queries otimizadas com índices compostos (`office_id, action, timestamp`), reuso export CSV/PDF
* **Dependências técnicas:** better-sqlite3 (índices), zod (validação período)
* **Considerações de performance/segurança:** NFR-P01 (consulta ≤200ms), NFR-SEC04/SEC05, NFR-C02/C04

### 6. Out of Scope
* Builder de relatórios customizados pelo usuário
* Dashboards visuais (Grafana — infra separada)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: índices auditoria, export CSV/PDF prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: cada modelo com query correta, parâmetros período
- [ ] Testes integração: export CSV/PDF modelos, performance 100k+ registros
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`GET /api/auditoria/modelos`, `POST /api/auditoria/modelos/{template}/gerar`)
- [ ] Testado em staging
- [ ] Métricas: `auditoria_modelos_gerados_total{template}`

### 9. Traceability
* **NFRs relacionadas:** NFR-P01, NFR-C02, NFR-C04, NFR-O01, NFR-O06, NFR-SEC04
* **Use Cases relacionados:** UC-09 (Auditoria e Monitoramento)
* **Riscos relacionados:** R5 (Observabilidade)
* **Business Rules:** BR-12, BR-15, BR-16, BR-17

---

## US-025 — Reconfiguração de Escritório Existente (SMTP, Caminhos, Parâmetros Watch)

* **Priority:** Could
* **Complexity:** 3 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: admin do escritório edita configurações próprias (não admin global), validação SMTP teste conexão, `loadWatchConfig` recarrega jobs vigilância]
* **Épico:** Onboarding & Configuração do Escritório (Slice 3: Could)
* **Labels:** backend, frontend, config, multi-tenant
* **Story Map:** REQ-025

### 1. Description (INVEST)
* **As a** Administrador do Escritório
* **I want to** alterar configurações do meu escritório (nome, SMTP, caminhos de arquivo, parâmetros de vigilância `loadWatchConfig`) com validação e auditoria
* **So that** o escritório possa adaptar-se a mudanças de infraestrutura sem suporte técnico

### 2. Business Context
Etapa 1 do Story Map (pós-onboarding). UC-11 AS-2. BR-01/02 (validação CNPJ/texto se alterado), BR-12 (auditoria), BR-16 (transacionalidade isolamento).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Editar configurações — caminho feliz
* **Given** admin do escritório acessa "Configurações do Escritório"
* **When** altera: nome, host/porta/credenciais SMTP, caminhos base (arquivos, quarentena, backup), parâmetros watch (limite concorrência Playwright, timeout)
* **And** clica "Testar SMTP" — sistema envia e-mail teste via `nodemailer`
* **And** salva
* **Then** sistema valida, persiste em transação `withPostgresOfficeTransaction`
* **And** `loadWatchConfig` recarrega jobs vigilância ativos (aplica novos parâmetros)
* **And** `auditarCadastro` (ação `UPDATE` escritório, `campos_alterados`)
* **And** exibe confirmação

#### Scenario 2: Teste SMTP falha — caso de erro
* **Given** admin informa SMTP inválido, clica "Testar"
* **When** `nodemailer` falha conexão/autenticação
* **Then** exibe erro detalhado, **não** salva configuração
* **And** loga `auditarSeguranca` (ação `OFFICE_CONFIG_SMTP_TEST_FAILED`)

#### Scenario 3: Alteração CNPJ escritório — caso de borda
* **Given** admin tenta alterar CNPJ do escritório
* **When** submete
* **Then** sistema valida `cnpjValido`, `normalizarCnpj`, verifica duplicidade global
* **And** se OK: atualiza, `auditarCadastro` (ação `UPDATE` escritório, `cnpj_alterado=true`)
* **And** se duplicado: bloqueia "CNPJ já registrado em outro escritório"

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Abas: Geral, SMTP, Caminhos, Vigilância, Botão Testar SMTP]
* **Estados da interface:** loading (salvando/testando), success (toast), error (validação, SMTP)
* **Acessibilidade:** formulário com fieldset/legend por aba, teste SMTP com status anunciado

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo escritório (backend), `exigirCadastroEscritorio` (validação ativa), `loadWatchConfig` (recarga dinâmica), `nodemailer` (teste SMTP), `auditarCadastro`, transação SQLite
* **Dependências técnicas:** better-sqlite3, nodemailer, node-cron (recarga jobs)
* **Considerações de performance/segurança:** NFR-P02, NFR-SEC01 (credenciais SMTP cifradas), NFR-SEC04, NFR-O01/O06

### 6. Out of Scope
* Reconfiguração multi-tenant por admin global (fora escopo admin escritório)
* Migração de dados entre escritórios

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `loadWatchConfig` recarga dinâmica, teste SMTP, cifragem credenciais prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: validação campos, teste SMTP mock, recarga watch config
- [ ] Testes integração: alteração SMTP → jobs vigilância usam nova config
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`GET /api/escritorios/{id}/config`, `PUT /api/escritorios/{id}/config`, `POST /api/escritorios/{id}/config/test-smtp`)
- [ ] Testado em staging
- [ ] Métricas: `escritorio_config_atualizada_total`, `escritorio_smtp_test_total{status}`

### 9. Traceability
* **NFRs relacionadas:** NFR-P02, NFR-SEC01, NFR-SEC04, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-11 (Configuração de Escritório — AS-2)
* **Riscos relacionados:** R7 (DDL SQLite)
* **Business Rules:** BR-01, BR-02, BR-12, BR-16

---

## US-026 — Teste de Configuração de Vigilância Antes de Salvar (Execução Única Playwright)

* **Priority:** Could
* **Complexity:** 5 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: execução síncrona/assíncrona com timeout, retorno logs + screenshots Playwright, não persiste config se teste falha]
* **Épico:** Automação & Vigilância (Slice 3: Could)
* **Labels:** backend, frontend, automation, playwright, testing
* **Story Map:** REQ-026

### 1. Description (INVEST)
* **As a** Administrador do Escritório
* **I want to** testar a configuração de vigilância (Playwright) antes de salvar, vendo logs de execução, screenshots de passos, e arquivos baixados de amostra
* **So that** evite salvar configurações quebradas que gerariam falhas silenciosas nos jobs agendados

### 2. Business Context
Etapa 10 do Story Map. UC-12 AS-1. BR-07/08 (validação arquivos baixados), BR-12 (auditoria teste), NFR-P04 (Playwright ≤2s + indexação), NFR-S03 (recursos).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Teste bem-sucedido — caminho feliz
* **Given** admin preenche configuração vigilância (URL, seletores, credenciais, pasta destino)
* **When** clica "Testar Configuração"
* **Then** sistema executa Playwright **uma vez** (headless, timeout 60s [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA])
* **And** retorna: status sucesso/falha, tempo total, logs passo-a-passo (navegação, cliques, downloads), screenshots opcionais (passo falha), lista arquivos baixados (nome, tamanho, hash)
* **And** se arquivos baixados: valida `arquivoPermitido`, `detectarFormato`, mostra preview cabeçalho
* **And** **não** persiste configuração nem agenda job
* **And** `auditarSeguranca` (ação `WATCH_TEST`, `status=success`, `duracao_ms`)

#### Scenario 2: Teste falha (seletor, login, timeout) — caso de erro
* **Given** configuração com seletor inválido ou credenciais erradas
* **When** executa teste
* **Then** retorna: falha no passo X, erro Playwright, screenshot do momento, logs até falha
* **And** admin corrige e re-testa
* **And** `auditarSeguranca` (ação `WATCH_TEST`, `status=failed`, `erro`, `passo_falha`)

#### Scenario 3: Teste com arquivos não permitidos — caso de borda
* **Given** portal baixa arquivo formato não suportado
* **When** teste executa
* **Then** mostra arquivo em "quarentena" no resultado, não indexa
* **And** alerta: "Arquivo baixado não permitido — ajuste seletores ou `arquivoPermitido`"

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Modal Teste com Progresso Passos, Logs Expansíveis, Screenshots Carrossel, Resultado Arquivos]
* **Estados da interface:** running (spinner + passo atual), success (verde + detalhes), error (vermelho + screenshot + erro)
* **Acessibilidade:** logs com ARIA live, screenshots com alt text descritivo

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo vigilância (backend), Playwright runner isolado (teste), `arquivoPermitido`, `detectarFormato`, `extrairCabecalho`, `hashBytes`, `auditarSeguranca`
* **Dependências técnicas:** playwright v1.48.0, better-sqlite3, storage temporário screenshots/arquivos teste
* **Considerações de performance/segurança:** NFR-P04 (timeout teste), NFR-S03 (isolamento recursos teste), NFR-SEC01 (credenciais teste cifradas), NFR-O01

### 6. Out of Scope
* Teste agendado recorrente (apenas sob demanda)
* Gravação vídeo completa (apenas screenshots passos)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: Playwright runner teste, validação arquivos, storage temp prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: runner teste timeout, captura logs/screenshots, validação arquivos
- [ ] Testes integração: teste config completa → sucesso → salva → job agendado funciona
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`POST /api/vigilancias/{id}/testar`)
- [ ] Testado em staging com portal real
- [ ] Métricas: `vigilancia_testes_total{status}`, `vigilancia_teste_duration_seconds`

### 9. Traceability
* **NFRs relacionadas:** NFR-P04, NFR-S03, NFR-SEC01, NFR-O01
* **Use Cases relacionados:** UC-12 (Configuração de Monitoramento — AS-1)
* **Riscos relacionados:** R4 (Vigilância Playwright recursos)
* **Business Rules:** BR-07, BR-08, BR-12

---

## US-027 — Pausar/Reativar Vigilância (Manter Configuração, Parar Job no node-cron)

* **Priority:** Could
* **Complexity:** 2 [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA — Premissa: toggle status ativo/inativo, `node-cron` para/reativa job, configuração preservada, auditoria]
* **Épico:** Automação & Vigilância (Slice 3: Could)
* **Labels:** backend, frontend, automation, cron
* **Story Map:** REQ-027

### 1. Description (INVEST)
* **As a** Administrador do Escritório
* **I want to** pausar e reativar uma vigilância configurada sem perdê-la, parando o job no `node-cron` mantendo toda a configuração
* **So that** possa suspender temporariamente coletas (ex.: portal em manutenção, feriado) e retomar depois

### 2. Business Context
Etapa 10 do Story Map. UC-12 AS-2. BR-12 (auditoria), BR-16 (isolamento).

### 3. Acceptance Criteria (BDD/Gherkin)
#### Scenario 1: Pausar vigilância ativa — caminho feliz
* **Given** admin visualiza lista de vigilâncias, uma com status "Ativo"
* **When** clica toggle "Pausar"
* **Then** sistema: para job no `node-cron` (remove job, mantém config no banco), atualiza status "Pausado"
* **And** `auditarCadastro` (ação `WATCH_PAUSE`, `vigilancia_id`)
* **And** badge UI muda para "Pausado" (amarelo)

#### Scenario 2: Reativar vigilância pausada — caminho feliz
* **Given** vigilância com status "Pausado"
* **When** clica toggle "Reativar"
* **Then** sistema: registra job no `node-cron` com configuração salva, atualiza status "Ativo"
* **And** `auditarCadastro` (ação `WATCH_RESUME`, `vigilancia_id`)
* **And** badge UI muda para "Ativo" (verde)

#### Scenario 3: Vigilância com execução em andamento — caso de borda
* **Given** vigilância "Ativa" com job rodando no momento do pause
* **When** admin pausa
* **Then** sistema: marca `pause_requested=true`, job atual termina graciosamente, **não** inicia nova execução
* **And** status muda para "Pausado" após término execução atual
* **And** `auditarSeguranca` (ação `WATCH_PAUSE_DEFERRED`)

### 4. UI/UX Notes
* **Wireframe/Mockup:** [Link para Figma/design — Toggle Switch na Lista Vigilâncias, Tooltip "Pausar/Reativar", Status Badge]
* **Estados da interface:** active (verde), paused (amarelo), pausing (cinza - aguardando término)
* **Acessibilidade:** toggle com `aria-pressed`, status anunciado via ARIA live

### 5. Technical Implementation Notes
* **Componentes/serviços afetados:** Módulo vigilância (backend), `node-cron` job management (stop/start by name/id), `auditarCadastro`, `auditarSeguranca`
* **Dependências técnicas:** node-cron v4.2.1 (API stop/start job), better-sqlite3
* **Considerações de performance/segurança:** NFR-SEC04, NFR-O01/O06

### 6. Out of Scope
* Pausa agendada (ex.: pausar de X a Y data)
* Pausa por condição (ex.: se 3 falhas seguidas auto-pausa — Could futuro)

### 7. Definition of Ready
- [ ] Critérios validados com PO
- [ ] Dependências: `node-cron` stop/start job, `auditarCadastro` prontos
- [ ] Design/UX aprovado
- [ ] Estimativa realizada

### 8. Definition of Done
- [ ] Código implementado e revisado
- [ ] Testes unitários: pause/resume job, execução em andamento deferida
- [ ] Testes integração: pause → job não roda → resume → job roda no próximo cron
- [ ] Tipagem estrita
- [ ] Lint/format ok
- [ ] Acessibilidade validada
- [ ] OpenAPI atualizado (`PUT /api/vigilancias/{id}/pause`, `PUT /api/vigilancias/{id}/resume`)
- [ ] Testado em staging
- [ ] Métricas: `vigilancia_pause_total`, `vigilancia_resume_total`, `vigilancia_pause_deferred_total`

### 9. Traceability
* **NFRs relacionadas:** NFR-SEC04, NFR-O01, NFR-O06
* **Use Cases relacionados:** UC-12 (Configuração de Monitoramento — AS-2)
* **Riscos relacionados:** R4 (Vigilância Playwright)
* **Business Rules:** BR-12, BR-16

---

**Fim do Documento — User Stories Specification (dist-historico v1.0)**

Total de User Stories: **27** (US-001 a US-027), alinhadas 1:1 com REQ-001 a REQ-027 do Story Map.

### Resumo de Rastreabilidade US ↔ REQ (Story Map)

| US | REQ | Slice | Épico | Prioridade |
|----|-----|-------|-------|------------|
| US-001 | REQ-001 | 1 (MVP) | Onboarding | Must |
| US-002 | REQ-002 | 1 (MVP) | Auth | Must |
| US-003 | REQ-003 | 1 (MVP) | Cadastros | Must |
| US-004 | REQ-004 | 1 (MVP) | Documentos | Must |
| US-005 | REQ-005 | 1 (MVP) | Documentos | Must |
| US-006 | REQ-006 | 1 (MVP) | Vínculos | Must |
| US-007 | REQ-007 | 1 (MVP) | Relatórios | Must |
| US-008 | REQ-008 | 1 (MVP) | Relatórios | Must |
| US-009 | REQ-009 | 1 (MVP) | Auditoria | Must |
| US-010 | REQ-010 | 1 (MVP) | Operação | Must |
| US-011 | REQ-011 | 1 (MVP) | Utilitários | Must |
| US-012 | REQ-012 | 1 (MVP) | Utilitários | Must |
| US-013 | REQ-013 | 2 (Should) | Cadastros | Should |
| US-014 | REQ-014 | 2 (Should) | Vínculos | Should |
| US-015 | REQ-015 | 2 (Should) | Vínculos | Should |
| US-016 | REQ-016 | 2 (Should) | CCTs | Should |
| US-017 | REQ-017 | 2 (Should) | CCTs | Should |
| US-018 | REQ-018 | 2 (Should) | CCTs | Should |
| US-019 | REQ-019 | 2 (Should) | Operação | Should |
| US-020 | REQ-020 | 2 (Should) | Automação | Should |
| US-021 | REQ-021 | 3 (Could) | Cadastros | Could |
| US-022 | REQ-022 | 3 (Could) | Vínculos | Could |
| US-023 | REQ-023 | 3 (Could) | Relatórios | Could |
| US-024 | REQ-024 | 3 (Could) | Auditoria | Could |
| US-025 | REQ-025 | 3 (Could) | Onboarding | Could |
| US-026 | REQ-026 | 3 (Could) | Automação | Could |
| US-027 | REQ-027 | 3 (Could) | Automação | Could |

### Pendências de Validação Humana (Resumo)

Todos os itens marcados com **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** devem ser revisados por Product Owner, Engenharia e Compliance antes do baseline formal. Principais decisões pendentes:

1. **Motor de banco operacional definitivo** (better-sqlite3 confirmado vs pg/Postgres para migração/backup)
2. **Fluxo `bootstrapAdministrador`** (console vs e-mail)
3. **Algoritmo `hashToken`** (bcrypt/PBKDF2/argon2 via crypto nativo)
4. **Regras `normalizarTexto`** (case, acentos, pontuação)
5. **Versionamento documentos** (novo registro vs update)
6. **Política vínculos órfãos em exclusão** (BR-18: anonimizar/marcar/bloquear)
7. **Checklist `validarExtracaoCct`** (campos obrigatórios regulatórios)
8. **Template `renderizarCctMarkdown`** (versionamento, engine)
9. **Parser `referenciasExplicitas`** (campos exatos: número registro, data, sindicato)
10. **Implementação observabilidade** (libs, dashboards, alertas — nenhuma detectada na stack)
11. **DDL transacional SQLite** (limitações ALTER TABLE etc.)
12. **Single point of failure** (RTO/RPO dependem de backup/testes rigorosos)
13. **Política `invalidarConsolidacao`** (reverter vs marcar `nao_valido`)
14. **Cadastro sindicatos** (entidade separada, CNPJ global/tenant)
15. **Formato configuração vigilância** (JSON/DSL/visual editor para seletores Playwright)
16. **Credenciais portais externos** (armazenamento/rotação)
17. **Onboarding self-service** (validação domínio/e-mail anti-fraude)

### Próximos Artefatos a Gerar (Downstream)

1. **user-flows.md** — Diagramas Mermaid/PlantUML dos fluxos (baseado nos cenários BDD acima)
2. **api-specification.md** — OpenAPI 3.1 com todos endpoints referenciados nas US
3. **test-plan.md** — Cenários de teste por US, dados de teste, critérios de aceitação automatizáveis
4. **database-schema.md** — Schema SQLite detalhado (tabelas, índices, constraints) inferido das US
5. **architecture-decision-log.md** — ADRs para decisões pendentes acima