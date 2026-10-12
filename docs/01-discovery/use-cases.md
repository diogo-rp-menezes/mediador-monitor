# Use Case Specification: UC-01 — Cadastrar e Gerenciar Clientes

## 1. Characterization
* **Primary Actor:** Analista de Cadastros
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Sistema de Validação de CNPJ (via `cnpjValido`/`normalizarCnpj`), Banco de Dados (better-sqlite3)
* **Stakeholders & Interests:** Administrador do Escritório (controle de base cadastral), Auditor/Compliance (rastreabilidade via `auditarCadastro`), Analista de Documentos/Vínculos (clientes como base para vínculos)
* **Trigger:** Analista de Cadastros acessa a funcionalidade de cadastro de clientes e inicia inclusão, alteração, consulta ou exclusão
* **Preconditions:** 
  - Escritório cadastrado e ativo (`exigirCadastroEscritorio`)
  - Usuário autenticado com permissão de cadastro
  - Banco de dados operacional (better-sqlite3 em modo WAL)
* **Postconditions (Success Guarantee):** 
  - Cliente persistido com CNPJ validado e normalizado (`cnpjValido`, `normalizarCnpj`)
  - Textos normalizados (`normalizarTexto`)
  - Auditoria de cadastro registrada (`auditarCadastro`)
  - Isolamento por escritório garantido (`withPostgresOfficeTransaction` / equivalente SQLite)
* **Scope:** Subsistema de Cadastros — módulo de Clientes
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. Analista de Cadastros acessa a tela de listagem de clientes (`listarClientes`)
2. Analista seleciona "Novo Cliente" e preenche dados obrigatórios (CNPJ, razão social, nome fantasia, endereço, etc.)
3. Sistema valida CNPJ via `cnpjValido` e normaliza via `normalizarCnpj`; normaliza textos via `normalizarTexto`
4. Sistema verifica duplicidade de CNPJ normalizado no escopo do escritório
5. Sistema persiste cliente em transação (`withPostgresOfficeTransaction` / equivalente SQLite)
6. Sistema registra auditoria de cadastro (`auditarCadastro`) com `traceId`, `officeId`, `userId`, `action`
7. Sistema retorna confirmação e atualiza listagem (`listarClientes`)
8. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Consulta de detalhe do cliente
* **Ponto de extensão:** Passo 1 — Analista seleciona cliente na listagem
* **Passos:**
  1. Sistema executa `detalheCliente` com ID do cliente
  2. Sistema retorna dados completos do cliente (incluindo contatos via `listarContatos`)
  3. Analista visualiza detalhes
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Edição de cliente existente
* **Ponto de extensão:** Passo 1 — Analista seleciona "Editar" em cliente da listagem
* **Passos:**
  1. Sistema carrega dados atuais via `detalheCliente`
  2. Analista altera campos permitidos (não altera CNPJ)
  3. Sistema valida e normaliza textos alterados (`normalizarTexto`)
  4. Sistema persiste alterações em transação
  4. Sistema registra `auditarCadastro` (ação UPDATE)
  5. Sistema retorna confirmação
* **Retorno ao fluxo principal:** Não, encerra

### AS-3: Exclusão de cliente
* **Ponto de extensão:** Passo 1 — Analista seleciona "Excluir" em cliente da listagem
* **Passos:**
  1. Sistema exibe confirmação com aviso sobre vínculos históricos associados (BR-18)
  2. Analista confirma exclusão
  3. Sistema executa `excluirCadastro` em transação
  4. Sistema registra `auditarCadastro` (ação DELETE)
  5. Sistema remove cliente da listagem
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: CNPJ inválido ou mal formatado
* **Ponto de extensão:** Passo 3 do cenário principal
* **Condição de erro:** `cnpjValido` retorna falso
* **Tratamento:** Sistema exibe erro "CNPJ inválido — verifique o número informado"; não persiste; loga tentativa em `auditarSeguranca`; retorna ao passo 2

### EX-2: CNPJ duplicado no mesmo escritório
* **Ponto de extensão:** Passo 4 do cenário principal
* **Condição de erro:** CNPJ normalizado já existe para o `officeId` atual
* **Tratamento:** Sistema exibe "CNPJ já cadastrado neste escritório"; sugere abrir detalhe do cliente existente; loga em `auditarCadastro`; retorna ao passo 2

### EX-3: Falha de transação / banco indisponível
* **Ponto de extensão:** Passo 5 do cenário principal (ou passos de persistência nos cenários alternativos)
* **Condição de erro:** Erro de constraint, lock SQLite, ou conexão falha
* **Tratamento:** Sistema faz rollback automático (BR-16); exibe "Erro ao salvar — tente novamente"; registra erro em log estruturado (NFR-O01) com `error`; alerta se `sqlite_write_lock_wait_seconds` > 2s (NFR-O05)

### EX-4: Escritório não cadastrado
* **Ponto de extensão:** Pré-condição / Passo 3 (validação `exigirCadastroEscritorio`)
* **Condição de erro:** `exigirCadastroEscritorio` falha
* **Tratamento:** Sistema bloqueia operação; exibe "Escritório não cadastrado — contate o administrador"; redireciona para onboarding de escritório; loga em `auditarSeguranca`

## 5. Business Rules Envolvidas
* **BR-01:** Todo CNPJ informado deve ser validado (`cnpjValido`) e normalizado (`normalizarCnpj`) antes de ser persistido
* **BR-02:** Textos de cadastro (nomes, descrições) devem ser padronizados via `normalizarTexto`
* **BR-03:** Nenhuma operação protegida pode prosseguir sem que o escritório esteja devidamente cadastrado (`exigirCadastroEscritorio`)
* **BR-12:** Toda ação sensível de cadastro deve ser auditável (`auditarCadastro`)
* **BR-16:** Operações no banco são executadas de forma transacional — ou tudo confirma, ou nada é aplicado (`withPostgresTransaction` / equivalente SQLite); operações com escopo de escritório registram o escritório apenas durante a operação (`withPostgresOfficeTransaction`)
* **BR-18:** A exclusão de cadastro (`excluirCadastro`) é permanente; a decisão de excluir deve considerar os vínculos históricos associados [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA quanto ao tratamento de vínculos órfãos]

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Tempo de resposta da API (escrita: `salvarCliente`, `excluirCadastro`) ≤ 300 ms p95 / ≤ 800 ms p99
* **NFR-P01:** Tempo de resposta da API (leitura: `listarClientes`, `detalheCliente`) ≤ 200 ms p95 / ≤ 500 ms p99
* **NFR-S01:** Suportar até 50 usuários concorrentes por escritório com degradação ≤ 20%
* **NFR-S04:** Isolamento de carga entre escritórios via transações `withPostgresOfficeTransaction` — nenhuma query cross-tenant
* **NFR-SEC04:** Controle de acesso multi-tenant: isolamento por `exigirCadastroEscritorio` + `withPostgresOfficeTransaction`
* **NFR-SEC07:** Validação de entrada via Zod em todos os endpoints públicos; rejeição de payloads inválidos com 400
* **NFR-O01:** Logs estruturados (JSON) com `timestamp`, `level`, `traceId`, `officeId`, `userId`, `action`, `durationMs`, `error?`
* **NFR-O06:** Auditoria de cadastro (`auditarCadastro`) já implementada no domínio — logs devem seguir formato estruturado
* **NFR-C01:** LGPD/GDPR — "direito ao esquecimento": `excluirCadastro` remove dados pessoais e anonimiza vínculos/auditoria em ≤ 30 dias
* **NFR-C04:** Trilha de auditoria imutável: inserts only na tabela de auditoria; nenhum UPDATE/DELETE via conta de runtime

## 7. Frequency of Use
Alta frequência — usado múltiplas vezes por dia por Analistas de Cadastros ativos; pico no onboarding de novos escritórios (`indexarArquivosExistentes` pode gerar cadastros em lote)

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] CNPJ é identificador único por escritório; não há compartilhamento de clientes entre escritórios
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Edição de CNPJ não é permitida após criação (exclusão + novo cadastro se necessário)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `better-sqlite3` é o motor operacional; rotinas "Postgres" no glossário referem-se a migração/backup, não runtime

## 9. Open Issues
* Comportamento em cascata na exclusão: vínculos órfãos são mantidos, anonimizados ou removidos? (BR-18 pendente de validação)
* Existe limite de clientes por escritório? Impacta NFR-S01/S02
* Validação de CNPJ contra base externa (Receita Federal) ou apenas algoritmo? (BR-01 diz "validado" — `cnpjValido` pode ser só algoritmo)

## 10. Related Artifacts
* **User Stories:** US-001 (Cadastrar cliente), US-002 (Listar clientes), US-003 (Detalhar cliente), US-004 (Editar cliente), US-005 (Excluir cliente)
* **User Flow:** user-flows.md → Fluxo "Gestão de Cadastros > Clientes"
* **API envolvida:** api-specification.md → `POST /api/clientes`, `GET /api/clientes`, `GET /api/clientes/{id}`, `PUT /api/clientes/{id}`, `DELETE /api/clientes/{id}`

---

# Use Case Specification: UC-02 — Cadastrar e Gerenciar Contatos

## 1. Characterization
* **Primary Actor:** Analista de Cadastros
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Sistema de Validação de Texto (`normalizarTexto`), Banco de Dados (better-sqlite3)
* **Stakeholders & Interests:** Analista de Documentos/Vínculos (contatos vinculados a clientes para correspondência), Auditor/Compliance (rastreabilidade via `auditarCadastro`)
* **Trigger:** Analista de Cadastros acessa contatos de um cliente e inicia inclusão, alteração, consulta ou exclusão
* **Preconditions:** 
  - Cliente selecionado existe e pertence ao escritório atual (`exigirCadastroEscritorio`)
  - Usuário autenticado com permissão de cadastro
* **Postconditions (Success Guarantee):** 
  - Contato persistido com textos normalizados (`normalizarTexto`)
  - Vinculado ao cliente correto (FK `cliente_id` + `office_id`)
  - Auditoria de cadastro registrada (`auditarCadastro`)
* **Scope:** Subsistema de Cadastros — módulo de Contatos
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. Analista de Cadastros abre detalhe do cliente (`detalheCliente`) e acessa aba "Contatos"
2. Analista seleciona "Novo Contato" e preenche: nome, cargo, e-mail, telefone, observações
3. Sistema normaliza textos via `normalizarTexto` (nome, cargo, observações)
4. Sistema valida formato de e-mail (Zod) e telefone (máscara/regra de negócio)
5. Sistema persiste contato em transação (`withPostgresOfficeTransaction` / equivalente SQLite) com `cliente_id` e `office_id`
6. Sistema registra `auditarCadastro` (ação INSERT em contato)
7. Sistema retorna confirmação e atualiza listagem de contatos (`listarContatos`)
8. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Listagem de contatos do cliente
* **Ponto de extensão:** Passo 1 — Analista apenas visualiza contatos
* **Passos:**
  1. Sistema executa `listarContatos` filtrado por `cliente_id` e `office_id`
  2. Sistema retorna lista paginada/ordenada
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Edição de contato
* **Ponto de extensão:** Passo 1 — Analista seleciona "Editar" em contato da listagem
* **Passos:**
  1. Sistema carrega dados do contato
  2. Analista altera campos
  3. Sistema normaliza textos alterados (`normalizarTexto`)
  4. Sistema persiste em transação
  5. Sistema registra `auditarCadastro` (ação UPDATE)
  6. Sistema retorna confirmação
* **Retorno ao fluxo principal:** Não, encerra

### AS-3: Exclusão de contato
* **Ponto de extensão:** Passo 1 — Analista seleciona "Excluir" em contato
* **Passos:**
  1. Sistema confirma exclusão
  2. Analista confirma
  3. Sistema remove contato em transação
  4. Sistema registra `auditarCadastro` (ação DELETE)
  5. Sistema atualiza listagem
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Dados de contato inválidos (e-mail, telefone)
* **Ponto de extensão:** Passo 4 do cenário principal
* **Condição de erro:** Validação Zod falha
* **Tratamento:** Sistema exibe erros de campo específicos; não persiste; loga em `auditarSeguranca`; retorna ao passo 2

### EX-2: Cliente não encontrado ou de outro escritório
* **Ponto de extensão:** Pré-condição / Passo 5 (persistência)
* **Condição de erro:** `cliente_id` não existe ou `office_id` difere
* **Tratamento:** Sistema bloqueia; exibe "Cliente não encontrado"; loga em `auditarSeguranca` (tentativa de acesso cross-tenant); redireciona para listagem de clientes

### EX-3: Falha de transação / lock SQLite
* **Ponto de extensão:** Passo 5 do cenário principal
* **Condição de erro:** Erro de banco
* **Tratamento:** Rollback automático (BR-16); mensagem de retry; log estruturado (NFR-O01); alerta se lock > 2s (NFR-O05)

## 5. Business Rules Envolvidas
* **BR-02:** Textos de cadastro devem ser padronizados via `normalizarTexto`
* **BR-03:** Operação bloqueada sem escritório cadastrado (`exigirCadastroEscritorio`)
* **BR-12:** Auditoria obrigatória (`auditarCadastro`)
* **BR-16:** Transacionalidade e isolamento por escritório (`withPostgresOfficeTransaction`)

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Escrita (`salvarContato`) ≤ 300 ms p95 / ≤ 800 ms p99
* **NFR-P01:** Leitura (`listarContatos`) ≤ 200 ms p95 / ≤ 500 ms p99
* **NFR-SEC04:** Isolamento multi-tenant — contatos só visíveis/editáveis dentro do `office_id`
* **NFR-SEC07:** Validação Zod em payloads
* **NFR-O01/O06:** Logs estruturados + auditoria de cadastro
* **NFR-C01:** LGPD — exclusão de contatos junto com cliente ou sob demanda

## 7. Frequency of Use
Média-alta — contatos cadastrados/atualizados conforme rotatividade de pessoal nos clientes; consultados frequentemente para envio de documentos/notificações

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Um cliente pode ter múltiplos contatos; um contato pertence a um único cliente
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Contatos não são compartilhados entre clientes ou escritórios

## 9. Open Issues
* Validação de telefone: máscara brasileira fixa ou internacional?
* Contato "principal" por cliente? (flag `is_primary` não mencionado no glossário)

## 10. Related Artifacts
* **User Stories:** US-006 (Cadastrar contato), US-007 (Listar contatos), US-008 (Editar contato), US-009 (Excluir contato)
* **User Flow:** user-flows.md → Fluxo "Gestão de Cadastros > Contatos"
* **API envolvida:** api-specification.md → `POST /api/clientes/{id}/contatos`, `GET /api/clientes/{id}/contatos`, `PUT /api/contatos/{id}`, `DELETE /api/contatos/{id}`

---

# Use Case Specification: UC-03 — Indexar Documentos no Histórico

## 1. Characterization
* **Primary Actor:** Analista de Documentos/Vínculos
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Extrator de Conteúdo (`pdf-parse`, `word-extractor`), Validador de Arquivo (`arquivoPermitido`, `detectarFormato`), Banco de Dados (better-sqlite3), Sistema de Arquivos (armazenamento de blobs/arquivos)
* **Stakeholders & Interests:** Analista de Cadastros (documentos vinculados a clientes), Auditor/Compliance (integridade via `hashBytes`, trilha via `auditarSeguranca`/`auditarCadastro`), Administrador do Escritório (volume de documentos indexados)
* **Trigger:** Analista faz upload de arquivo(s) ou inicia indexação de arquivos existentes (`indexarArquivosExistentes`)
* **Preconditions:** 
  - Escritório cadastrado (`exigirCadastroEscritorio`)
  - Usuário autenticado com permissão de indexação
  - Arquivo atende critérios `arquivoPermitido` (formato, tamanho, tipo)
* **Postconditions (Success Guarantee):** 
  - Metadados do documento persistidos (`indexarMetaDocumento`) com `hashBytes` (SHA-256)
  - Cabeçalho extraído (`extrairCabecalho`) sem IA
  - Formato detectado (`detectarFormato`)
  - Auditoria registrada
  - Isolamento por escritório (`withPostgresOfficeTransaction`)
* **Scope:** Subsistema de Documentos — Indexação
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. Analista de Documentos/Vínculos acessa "Indexar Documento" e seleciona arquivo(s) local(is) ou aponta diretório para `indexarArquivosExistentes`
2. Para cada arquivo: sistema executa `detectarFormato` e `arquivoPermitido`
3. Sistema lê bytes do arquivo (`lerDocumentoBytes`) e calcula `hashBytes` (SHA-256)
4. Sistema verifica se `hashBytes` já existe no histórico do escritório (deduplicação)
5. Se novo: sistema extrai cabeçalho via `extrairCabecalho` (PDF via `pdf-parse`, DOCX via `word-extractor`) — **sem IA**
6. Sistema persiste metadados via `indexarMetaDocumento`: nome, formato, hash, cabeçalho, tamanho, data, `office_id`, `user_id`
7. Sistema registra `auditarCadastro` (ação INSERT em documento)
8. Sistema retorna resumo: indexados, duplicados ignorados, erros
9. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Indexação em lote de arquivos existentes (`indexarArquivosExistentes`)
* **Ponto de extensão:** Passo 1 — Analista seleciona "Indexar Arquivos Existentes" e informa caminho base
* **Passos:**
  1. Sistema varre diretório recursivamente
  2. Para cada arquivo: executa passos 2–7 do cenário principal
  3. Sistema gera relatório consolidado de migração
  4. Sistema registra `auditarSeguranca` (operação em lote)
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Re-indexação de documento (nova versão)
* **Ponto de extensão:** Passo 4 — Hash já existe mas arquivo foi alterado (hash diferente)
* **Passos:**
  1. Sistema detecta hash diferente para mesmo caminho/nome
  2. Sistema cria nova versão do documento (versionamento) ou atualiza metadados conforme regra
  3. Sistema registra `auditarCadastro` (ação UPDATE/NEW_VERSION)
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Arquivo não permitido (formato/tamanho/tipo)
* **Ponto de extensão:** Passo 2
* **Condição de erro:** `arquivoPermitido` retorna falso ou `detectarFormato` falha
* **Tratamento:** Sistema pula arquivo; registra no relatório "Formato não suportado / Arquivo não permitido"; loga em `auditarSeguranca`; continua próximo arquivo

### EX-2: Falha na extração de cabeçalho
* **Ponto de extensão:** Passo 5
* **Condição de erro:** `pdf-parse` ou `word-extractor` lança exceção (arquivo corrompido, senha, formato inesperado)
* **Tratamento:** Sistema persiste metadados básicos (sem cabeçalho); marca `extracao_falhada=true`; loga erro com `traceId`; alerta se taxa de falha > threshold (NFR-O05)

### EX-3: Duplicata exata (mesmo hash)
* **Ponto de extensão:** Passo 4
* **Condição de erro:** `hashBytes` já cadastrado no escritório
* **Tratamento:** Sistema ignora indexação; incrementa contador "duplicados"; não gera novo registro de auditoria para o duplicado

### EX-4: Erro de persistência / disco cheio
* **Ponto de extensão:** Passo 6
* **Condição de erro:** Erro SQLite, espaço em disco, permissão
* **Tratamento:** Rollback (BR-16); mensagem "Falha ao indexar — verifique armazenamento"; log estruturado (NFR-O01); alerta disco > 80% (NFR-O05)

## 5. Business Rules Envolvidas
* **BR-07:** Somente arquivos que atendam aos critérios da empresa (`arquivoPermitido`) podem ser incluídos; formato identificado por `detectarFormato` antes do processamento
* **BR-08:** Conteúdo processado deve corresponder ao verificado: leitura de bytes (`lerDocumentoBytes`) sobre documento conferido; integridade por `hashBytes`
* **BR-12:** Auditoria obrigatória (`auditarCadastro`, `auditarSeguranca`)
* **BR-16:** Transacionalidade e isolamento por escritório (`withPostgresOfficeTransaction`)
* **BR-17:** Migrações preservam dados — `indexarArquivosExistentes` não perde metadados anteriores

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Escrita (`indexarMetaDocumento`) ≤ 300 ms p95 / ≤ 800 ms p99
* **NFR-P04:** Extração de cabeçalho (`extrairCabecalho`) ≤ 2 s por documento (PDF/DOCX até 10 MB)
* **NFR-S01:** 50 usuários concorrentes/escritório com degradação ≤ 20%
* **NFR-S04:** Isolamento cross-tenant — documentos só indexados/visíveis no `office_id`
* **NFR-SEC01:** SQLite cifrado em repouso; `hashBytes` garante integridade
* **NFR-SEC04:** Isolamento multi-tenant via `office_id`
* **NFR-SEC07:** Validação Zod no upload (tamanho, tipo MIME)
* **NFR-C03:** Integridade via `hashBytes` (SHA-256) no indexamento e verificação na leitura
* **NFR-O01/O05/O06:** Logs estruturados, alertas, auditoria

## 7. Frequency of Use
Alta — indexação diária de novos documentos; `indexarArquivosExistentes` executado uma vez por escritório no onboarding e esporadicamente depois

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Armazenamento de blobs: arquivos salvos em sistema de arquivos (volume persistente) com caminho no metadado; não no SQLite como BLOB
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `indexarArquivosExistentes` é operação de migração única por escritório; não rotina diária
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Deduplicação por hash é global por escritório (não global cross-tenant)

## 9. Open Issues
* Versionamento de documentos: como tratar nova versão do mesmo arquivo? (novo registro vs. atualização)
* Limite de tamanho de arquivo para `extrairCabecalho` (NFR-P04 diz até 10 MB — validar)
* Quais formatos exatamente `arquivoPermitido` aceita? (PDF, DOCX, TXT? Outros?)

## 10. Related Artifacts
* **User Stories:** US-010 (Indexar documento único), US-011 (Indexar arquivos existentes em lote), US-012 (Ver relatório de indexação)
* **User Flow:** user-flows.md → Fluxo "Documentos > Indexação"
* **API envolvida:** api-specification.md → `POST /api/documentos/indexar`, `POST /api/documentos/indexar-lote`, `GET /api/documentos/relatorio-indexacao`

---

# Use Case Specification: UC-04 — Consultar e Ler Documentos

## 1. Characterization
* **Primary Actor:** Analista de Documentos/Vínculos, Analista de Cadastros, Auditor/Compliance
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Sistema de Arquivos (leitura de bytes), Validador de Integridade (`hashBytes`)
* **Stakeholders & Interests:** Todos os atores acima — acesso controlado e íntegro ao conteúdo
* **Trigger:** Usuário solicita visualização, download ou leitura programática de documento indexado
* **Preconditions:** 
  - Documento existe no histórico do escritório (`office_id`)
  - Usuário autenticado com permissão de leitura
* **Postconditions (Success Guarantee):** 
  - Conteúdo entregue (bytes ou texto) com integridade verificada (`hashBytes` confere)
  - Auditoria de acesso registrada (`auditarSeguranca`)
  - Isolamento por escritório mantido
* **Scope:** Subsistema de Documentos — Leitura/Consulta
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. Usuário acessa listagem de documentos (filtros: cliente, data, formato, texto no cabeçalho)
2. Sistema executa consulta filtrada por `office_id` (isolamento)
3. Usuário seleciona documento e escolhe "Visualizar" ou "Baixar"
4. Sistema executa `lerDocumentoBytes` (ou `lerDocumento` para texto)
5. Sistema recalcula `hashBytes` dos bytes lidos e compara com hash armazenado no metadado
6. Se hash confere: sistema entrega conteúdo (stream para download ou renderização)
7. Sistema registra `auditarSeguranca` (ação READ/DOWNLOAD) com `document_id`, `hash_verificado=true`
8. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Visualização de metadados apenas
* **Ponto de extensão:** Passo 2 — Usuário não abre o arquivo, só vê metadados na listagem
* **Passos:**
  1. Sistema retorna metadados (nome, formato, tamanho, data, cabeçalho, hash) sem ler bytes
  2. Auditoria registra ação LIST/VIEW_METADATA
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Extração de cabeçalho sob demanda
* **Ponto de extensão:** Passo 3 — Usuário solicita "Re-extrair cabeçalho" (ex.: falha anterior)
* **Passos:**
  1. Sistema executa `extrairCabecalho`2. Sistema atualiza metadado do documento com novo cabeçalho
3. Sistema registra `auditarCadastro` (ação UPDATE cabeçalho)
4. Retorna cabeçalho atualizado
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Hash divergente — integridade comprometida
* **Ponto de extensão:** Passo 5 do cenário principal
* **Condição de erro:** `hashBytes` recalculado ≠ hash armazenado
* **Tratamento:** Sistema bloqueia entrega; exibe "Integridade do arquivo comprometida — contate administrador"; registra `auditarSeguranca` com `hash_verificado=false`, `alerta=integridade`; gera alerta crítico (NFR-O05); não entrega conteúdo

### EX-2: Arquivo físico não encontrado no armazenamento
* **Ponto de extensão:** Passo 4 — `lerDocumentoBytes` falha (arquivo movido/excluído externamente)
* **Condição de erro:** ENOENT ou erro de leitura
* **Tratamento:** Sistema registra `auditarSeguranca` (ação READ_FAILED, `erro=arquivo_ausente`); exibe "Arquivo não encontrado no armazenamento"; alerta operacional (NFR-O05)

### EX-3: Acesso cross-tenant tentado
* **Ponto de extensão:** Passo 2 — Filtro `office_id` não corresponde ao documento
* **Condição de erro:** Usuário tenta acessar `document_id` de outro escritório (via manipulação de ID)
* **Tratamento:** Sistema retorna 404 (não 403, para não vazar existência); registra `auditarSeguranca` (ação ACCESS_DENIED, `tentativa_cross_tenant=true`); alerta segurança (NFR-O05)

## 5. Business Rules Envolvidas
* **BR-08:** Leitura de bytes (`lerDocumentoBytes`) sobre documento conferido; integridade por `hashBytes`
* **BR-12:** Auditoria de acesso (`auditarSeguranca`)
* **BR-16:** Isolamento por escritório (`withPostgresOfficeTransaction`) — consulta filtrada por `office_id`
* **BR-07:** `arquivoPermitido` e `detectarFormato` já validados no indexamento; leitura respeita formato detectado

## 6. Non-Functional Requirements Relevantes
* **NFR-P01:** Leitura (`lerDocumento`, `lerDocumentoBytes`) ≤ 200 ms p95 / ≤ 500 ms p99
* **NFR-SEC01:** Arquivo SQLite cifrado; integridade via `hashBytes` (SHA-256)
* **NFR-SEC04:** Isolamento multi-tenant — zero query cross-tenant
* **NFR-C03:** Verificação de `hashBytes` a cada leitura — divergência bloqueia uso e alerta
* **NFR-O01/O05/O06:** Logs estruturados, alertas em falha de integridade/acesso, auditoria

## 7. Frequency of Use
Muito alta — consultas frequentes durante revisão de vínculos, geração de relatórios, auditoria

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `lerDocumento` retorna texto extraído (para visualização HTML); `lerDocumentoBytes` retorna binário (para download/PDF)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Cache de arquivos lidos recentemente não implementado (arquitetura stateless)

## 9. Open Issues
* Tempo de retenção de arquivos físicos no armazenamento vs. metadados no SQLite
* Streaming de arquivos grandes (>100 MB) — impacto em NFR-P01

## 10. Related Artifacts
* **User Stories:** US-013 (Listar documentos), US-014 (Visualizar documento), US-015 (Baixar documento), US-016 (Verificar integridade)
* **User Flow:** user-flows.md → Fluxo "Documentos > Consulta e Leitura"
* **API envolvida:** api-specification.md → `GET /api/documentos`, `GET /api/documentos/{id}`, `GET /api/documentos/{id}/download`, `POST /api/documentos/{id}/verificar-integridade`

---

# Use Case Specification: UC-05 — Gerenciar Vínculos (Indexar, Definir, Rejeitar, Resolver Pendências)

## 1. Characterization
* **Primary Actor:** Analista de Documentos/Vínculos
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Motor de Vínculos Automáticos (`indexarVinculo`, `referenciasExplicitas`, `ehCct`, `ehAditivoCct`), Banco de Dados (better-sqlite3)
* **Stakeholders & Interests:** Analista de Cadastros (vínculos cliente-documento), Auditor/Compliance (rastreabilidade de decisões manuais vs. automáticas via `auditarCadastro`), Administrador (qualidade do histórico)
* **Trigger:** 
  - Automático: indexação de documento dispara `indexarVinculo` (tenta associar a CCT/aditivo/cliente)
  - Manual: Analista revisa vínculos pendentes (`resolverReferenciasPendentes`) e executa `definirVinculo` ou `rejeitarVinculo`
* **Preconditions:** 
  - Documento indexado no histórico do escritório
  - Para vínculos CCT/Aditivo: documento classificado via `ehCct` / `ehAditivoCct`
  - Usuário autenticado com permissão de vínculos
* **Postconditions (Success Guarantee):** 
  - Vínculo persistido com origem (automático/manual) e status (confirmado/pendente/rejeitado)
  - Prevalência do manual sobre automático (BR-04)
  - Aditivo só vinculado a CCT se `referenciasExplicitas` (BR-05)
  - Auditoria registrada (`auditarCadastro`)
  - Isolamento por escritório
* **Scope:** Subsistema de Vínculos — Gestão completa
* **Level:** User goal

## 2. Main Scenario (Happy Path — Vinculação Automática com Confirmação Explícita)
1. Sistema indexa documento (UC-03) e identifica como CCT (`ehCct`) ou Aditivo (`ehAditivoCct`)
2. Sistema executa `indexarVinculo`:
   - Se CCT: tenta associar a cliente via `descobrirDocumentosClientes` (CNPJ no cabeçalho)
   - Se Aditivo: busca CCT referenciada via `referenciasExplicitas` (número registro, data, sindicato)
3. Se `referenciasExplicitas` encontradas (aditivo → CCT) OU evidências suficientes (CCT → cliente): vínculo criado com status `confirmado_automatico`
4. Se evidências parciais: vínculo criado com status `pendente_revisao`
5. Sistema registra `auditarCadastro` (ação INSERT vínculo, `origem=automatico`, `status`)
6. Analista de Documentos/Vínculos acessa "Vínculos Pendentes" (`resolverReferenciasPendentes`)
7. Analista revisa cada vínculo `pendente_revisao`: visualiza documento, cabeçalho, evidências
8. Analista executa `definirVinculo` (confirma) ou `rejeitarVinculo` (descarta)
9. Sistema atualiza status para `confirmado_manual` ou `rejeitado`; registra `auditarCadastro` (ação UPDATE, `origem=manual`, `decisao_usuario`)
10. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Vinculação manual direta (sem automação prévia)
* **Ponto de extensão:** Passo 6 — Analista cria vínculo do zero
* **Passos:**
  1. Analista seleciona "Novo Vínculo", escolhe documento, tipo (CCT, Aditivo, Cliente, Sindicato), alvo
  2. Sistema valida compatibilidade (ex.: aditivo só vincula a CCT)
  3. Sistema persiste com status `confirmado_manual`, `origem=manual`
  4. Sistema registra `auditarCadastro`
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Invalidação de consolidação (`invalidarConsolidacao`)
* **Ponto de extensão:** Passo 9 — Após vínculo confirmado (manual ou automático)
* **Passos:**
  1. Analista identifica erro em consolidação anterior
  2. Executa `invalidarConsolidacao` no vínculo/consolidação
  3. Sistema reverte registros consolidados ao estado anterior ou marca `nao_valido` (BR-19)
  4. Sistema registra `auditarCadastro` (ação INVALIDATE, `motivo`)
  5. Vínculos afetados voltam a `pendente_revisao` ou `confirmado_manual` conforme regra
* **Retorno ao fluxo principal:** Não, encerra

### AS-3: Descoberta de documentos de cliente (`descobrirDocumentosClientes`)
* **Ponto de extensão:** Passo 2 — Para documentos não-CCT/aditivo (ex.: contratos, procurações)
* **Passos:**
  1. Sistema executa `descobrirDocumentosClientes` com CNPJ/texto normalizado
  2. Se evidências suficientes (BR-06): cria vínculo `confirmado_automatico`
  3. Se coincidências parciais: cria candidatos `pendente_revisao` para `decidirDocumentoCliente`
  4. Analista usa `contextoDocumentoCliente` e `decidirDocumentoCliente` para confirmar/rejeitar
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Aditivo sem referência explícita à CCT
* **Ponto de extensão:** Passo 2 — `referenciasExplicitas` retorna vazio
* **Condição de erro:** Aditivo não cita número/registro da CCT original
* **Tratamento:** Vínculo fica `pendente_revisao` obrigatoriamente; não pode ser `confirmado_automatico` (BR-05); Analista deve revisar manualmente

### EX-2: Conflito: automação tenta sobrescrever vínculo manual
* **Ponto de extensão:** Passo 3 — `indexarVinculo` encontra vínculo `confirmado_manual` existente
* **Condição de erro:** BR-04 — manual prevalece sobre automático
* **Tratamento:** Sistema **não** altera vínculo manual; loga `auditarCadastro` (ação AUTO_SKIPPED, `vinculo_manual_prevalece=true`); mantém status `confirmado_manual`

### EX-3: Múltiplos candidatos para mesmo documento (`descobrirDocumentosClientes`)
* **Ponto de extensão:** Passo 2/AS-3 — CNPJ/texto casa com múltiplos clientes
* **Condição de erro:** Ambiguidade — BR-06 proíbe confirmação automática
* **Tratamento:** Sistema cria múltiplos vínculos `pendente_revisao` (um por candidato); Analista usa `decidirDocumentoCliente` para escolher correto

### EX-4: Erro de validação de extração CCT (`validarExtracaoCct`)
* **Ponto de extensão:** Passo 2 — Documento classificado como CCT mas `validarExtracaoCct` falha
* **Condição de erro:** Conteúdo extraído incompleto/inconsistente
* **Tratamento:** Documento marcado `extracao_invalida=true`; vínculos não criados automaticamente; Analista notificado para revisão manual; `auditarSeguranca` registra falha

## 5. Business Rules Envolvidas
* **BR-04:** Vínculo manual (`definirVinculo`) prevalece sobre automático; automação não sobrescreve revisão manual
* **BR-05:** Aditivo só vincula a CCT se `referenciasExplicitas`; caso contrário, pendente até `resolverReferenciasPendentes`
* **BR-06:** Confirmação automática só com evidências suficientes; coincidências parciais → candidatos para revisão
* **BR-09:** Extração de CCT validada via `validarExtracaoCct` — nenhum conteúdo omitido
* **BR-10:** Documento formal CCT (`renderizarCctMarkdown`) contém apenas layout contratual; evidências/justificativas separadas
* **BR-12:** Auditoria obrigatória (`auditarCadastro`) em todas as ações de vínculo
* **BR-16:** Transacionalidade e isolamento por escritório
* **BR-19:** `invalidarConsolidacao` preserva rastreabilidade — volta ao estado anterior ou marca não válido

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Escrita (`indexarVinculo`, `definirVinculo`, `rejeitarVinculo`, `invalidarConsolidacao`) ≤ 300 ms p95 / ≤ 800 ms p99
* **NFR-P01:** Leitura (`resolverReferenciasPendentes`, `descobrirDocumentosClientes`, `contextoDocumentoCliente`) ≤ 200 ms p95 / ≤ 500 ms p99
* **NFR-SEC04:** Isolamento multi-tenant — vínculos só dentro do `office_id`
* **NFR-O01/O06:** Logs estruturados + auditoria de cada decisão (automática ou manual)
* **NFR-C04:** Auditoria imutável — inserts only; decisão manual registrada permanentemente

## 7. Frequency of Use
Alta — revisão diária de pendentes; automação roda a cada indexação; `invalidarConsolidacao` esporádico (correção)

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Tipos de vínculo: CCT↔Cliente, Aditivo↔CCT, Documento↔Cliente, Sindicato↔Documento (`registrarSindicatoDocumento`)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `referenciasExplicitas` extrai: número de registro CCT, data, sindicato — campos exatos a confirmar
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `invalidarConsolidacao` afeta apenas a consolidação lógica, não apaga documentos nem metadados

## 9. Open Issues
* Fluxo exato de `consolidacao` — o que é "consolidar" vs. "vincular"? (Glossário cita `invalidarConsolidacao` mas não `consolidar`)
* `registrarSindicatoDocumento` — é vínculo separado ou atributo do documento?
* Regras de `decidirDocumentoCliente` vs. `definirVinculo` — são a mesma operação com nomes diferentes?

## 10. Related Artifacts
* **User Stories:** US-017 (Revisar vínculos pendentes), US-018 (Confirmar vínculo manual), US-019 (Rejeitar vínculo), US-020 (Invalidar consolidação), US-021 (Descobrir documentos de cliente), US-022 (Registrar sindicato)
* **User Flow:** user-flows.md → Fluxo "Vínculos > Gestão Completa"
* **API envolvida:** api-specification.md → `GET /api/vinculos/pendentes`, `POST /api/vinculos`, `PUT /api/vinculos/{id}/confirmar`, `PUT /api/vinculos/{id}/rejeitar`, `POST /api/vinculos/{id}/invalidar`, `POST /api/documentos/{id}/descobrir-clientes`, `POST /api/documentos/{id}/decidir-cliente`

---

# Use Case Specification: UC-06 — Processar CCTs e Aditivos (Validação, Renderização, Sindicato)

## 1. Characterization
* **Primary Actor:** Analista de Documentos/Vínculos
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Validador de Extração (`validarExtracaoCct`), Renderizador Markdown (`renderizarCctMarkdown`), Registrador Sindical (`registrarSindicatoDocumento`), Banco de Dados
* **Stakeholders & Interests:** Auditor/Compliance (validação completa BR-09, layout formal BR-10), Administrador (qualidade dos registros CCT), Jurídico (documento formal para uso em processos)
* **Trigger:** Documento indexado classificado como CCT (`ehCct`) ou Aditivo (`ehAditivoCct`); ou Analista solicita validação/renderização/registro sindical
* **Preconditions:** 
  - Documento indexado com cabeçalho extraído
  - Classificação `ehCct` / `ehAditivoCct` confirmada
  - Usuário autenticado com permissão CCT
* **Postconditions (Success Guarantee):** 
  - Extração validada (`validarExtracaoCct`) — nenhum conteúdo omitido
  - Markdown formal gerado (`renderizarCctMarkdown`) — apenas layout contratual
  - Sindicato registrado (`registrarSindicatoDocumento`) se aplicável
  - Auditoria registrada
  - Isolamento por escritório
* **Scope:** Subsistema de CCT/Aditivo — Processamento Especializado
* **Level:** User goal

## 2. Main Scenario (Happy Path — CCT Completa)
1. Sistema detecta documento como CCT (`ehCct=true`) durante indexação (UC-03)
2. Sistema executa `validarExtracaoCct` — verifica se todos os campos obrigatórios (cláusulas, vigência, partes, sindicato) foram extraídos do cabeçalho/conteúdo
3. Se validação passa: sistema executa `renderizarCctMarkdown` gerando documento formal (apenas layout acordado, sem evidências/justificativas — BR-10)
4. Sistema executa `registrarSindicatoDocumento` vinculando CCT ao sindicato signatário
5. Sistema registra `auditarCadastro` (ações VALIDATE, RENDER, REGISTER_UNION)
6. Analista visualiza Markdown renderizado e registro sindical
7. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Processamento de Aditivo
* **Ponto de extensão:** Passo 1 — Documento classificado como `ehAditivoCct`
* **Passos:**
  1. Sistema valida extração do aditivo (`validarExtracaoCct` aplica-se também a aditivos)
  2. Sistema renderiza Markdown do aditivo (`renderizarCctMarkdown`)
  3. Sistema vincula aditivo à CCT base via `referenciasExplicitas` (UC-05)
  4. Sistema registra sindicato do aditivo (`registrarSindicatoDocumento`)
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Re-validação sob demanda
* **Ponto de extensão:** Passo 6 — Analista solicita "Re-validar extração"
* **Passos:**
  1. Sistema re-executa `validarExtracaoCct` no conteúdo atual
  2. Se falha: marca `extracao_invalida=true`; notifica Analista
  3. Se passa: atualiza status; re-renderiza Markdown se necessário
  4. Registra `auditarCadastro` (ação REVALIDATE)
* **Retorno ao fluxo principal:** Não, encerra

### AS-3: Registro de sindicato avulso
* **Ponto de extensão:** Passo 4 — Analista registra sindicato independentemente de CCT/Aditivo
* **Passos:**
  1. Analista acessa "Registrar Sindicato", informa documento, sindicato, papel (signatário, depositário, etc.)
  2. Sistema executa `registrarSindicatoDocumento`
  3. Registra `auditarCadastro`
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Falha na validação de extração (`validarExtracaoCct`)
* **Ponto de extensão:** Passo 2
* **Condição de erro:** Campos obrigatórios ausentes (vigência, partes, cláusulas, sindicato)
* **Tratamento:** Documento marcado `extracao_invalida=true`; não gera Markdown formal; não cria vínculos automáticos (UC-05); Analista notificado para correção manual ou re-indexação; `auditarSeguranca` registra falha

### EX-2: Erro na renderização Markdown
* **Ponto de extensão:** Passo 3
* **Condição de erro:** Template Markdown inválido, dados inconsistentes para renderização
* **Tratamento:** Sistema loga erro; mantém extração validada; exibe "Erro ao gerar documento formal — contate suporte"; `auditarSeguranca` com `erro=renderizacao`

### EX-3: Sindicato não encontrado / não cadastrado
* **Ponto de extensão:** Passo 4 / AS-3
* **Condição de erro:** `registrarSindicatoDocumento` recebe sindicato inexistente na base
* **Tratamento:** Sistema valida existência (cadastro de sindicatos — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] assume cadastro prévio); se não existe, bloqueia e exige cadastro prévio; loga em `auditarCadastro`

## 5. Business Rules Envolvidas
* **BR-09:** Extração de CCT validada (`validarExtracaoCct`) — nenhum conteúdo omitido
* **BR-10:** `renderizarCctMarkdown` contém apenas layout contratual; evidências/justificativas separadas
* **BR-12:** Auditoria (`auditarCadastro`) em validação, renderização, registro sindical
* **BR-16:** Transacionalidade e isolamento por escritório

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Validação/renderização/registro ≤ 300 ms p95 / ≤ 800 ms p99
* **NFR-P04:** Extração de cabeçalho (pré-requisito) ≤ 2 s por documento
* **NFR-SEC06:** Sanitização — Markdown gerado passa por `escaparHtml` se exibido em HTML (BR-11)
* **NFR-O01/O06:** Logs estruturados + auditoria

## 7. Frequency of Use
Média — executado uma vez por CCT/Aditivo indexado; re-validação esporádica

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Cadastro de sindicatos existe como entidade separada (tabela `sindicatos`) com CNPJ/nome normalizado
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `renderizarCctMarkdown` usa template fixo; não é editor WYSIWYG
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `validarExtracaoCct` verifica completude contra checklist regulatório (NR, cláusulas obrigatórias)

## 9. Open Issues
* Checklist exato de `validarExtracaoCct` — campos obrigatórios por tipo de CCT
* Template de `renderizarCctMarkdown` — versionamento de template?
* Sindicato: cadastro próprio ou apenas string no documento?

## 10. Related Artifacts
* **User Stories:** US-023 (Validar extração CCT), US-024 (Gerar Markdown formal CCT), US-025 (Registrar sindicato), US-026 (Processar aditivo)
* **User Flow:** user-flows.md → Fluxo "CCT/Aditivo > Processamento"
* **API envolvida:** api-specification.md → `POST /api/cct/{id}/validar`, `GET /api/cct/{id}/markdown`, `POST /api/documentos/{id}/sindicato`

---

# Use Case Specification: UC-07 — Gerar Relatórios (HTML e PDF)

## 1. Characterization
* **Primary Actor:** Analista de Documentos/Vínculos, Analista de Cadastros, Auditor/Compliance, Administrador do Escritório
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Gerador HTML (`renderizarRelatorioHtml`), Gerador PDF (`gerarPdfRelatorio`), Sanitizador (`escaparHtml`), Banco de Dados
* **Stakeholders & Interests:** Todos — relatórios para auditoria, compliance, gestão, envio a clientes/sindicatos
* **Trigger:** Usuário solicita relatório via interface (filtros: período, cliente, tipo documento, status vínculo, etc.)
* **Preconditions:** 
  - Dados filtrados existem no escritório (`office_id`)
  - Usuário autenticado com permissão de relatórios
* **Postconditions (Success Guarantee):** 
  - HTML gerado com dados já registrados (sem nova consulta IA — BR-11)
  - Textos escapados (`escaparHtml`) — prevenção XSS
  - PDF gerado a partir do HTML (`gerarPdfRelatorio`)
  - Auditoria registrada (`auditarSeguranca`)
  - Isolamento por escritório
* **Scope:** Subsistema de Relatórios — Geração HTML/PDF
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. Usuário acessa "Relatórios", define filtros (período, cliente, tipo, status, etc.)
2. Sistema executa consulta agregada filtrada por `office_id` (isolamento)
3. Sistema executa `renderizarRelatorioHtml` com dados retornados — **apenas dados já persistidos** (BR-11)
4. Sistema aplica `escaparHtml` em todos os campos de texto do template
5. Sistema entrega HTML para visualização no navegador
6. Usuário opcionalmente solicita "Gerar PDF"
7. Sistema executa `gerarPdfRelatorio` convertendo HTML → PDF
8. Sistema entrega PDF (download ou visualização)
9. Sistema registra `auditarSeguranca` (ação REPORT_GENERATE, `formato=html|pdf`, `filtros`, `registros_incluidos`)
10. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Relatório agendado/recorrente
* **Ponto de extensão:** Passo 1 — Administrador configura relatório recorrente via `node-cron` ([INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] agendamento não explicitado no glossário, mas `node-cron` existe na stack)
* **Passos:**
  1. Job agendado executa passos 2–9 automaticamente
  2. PDF salvo em armazenamento e/ou enviado por e-mail (`nodemailer`)
  3. `auditarSeguranca` registra `origem=agendado`
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Relatório de auditoria específico
* **Ponto de extensão:** Passo 1 — Auditor seleciona "Relatório de Auditoria"
* **Passos:**
  1. Filtros pré-definidos: ações sensíveis, período, usuário, escritório
  2. Consulta tabela `auditoria` (inserts only — NFR-C04)
  3. Gera HTML/PDF com trilha completa
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Conjunto de dados vazio
* **Ponto de extensão:** Passo 2
* **Condição de erro:** Filtros não retornam registros
* **Tratamento:** Sistema exibe "Nenhum registro encontrado para os filtros"; gera relatório vazio (cabeçalho + "Sem dados"); registra `auditarSeguranca` (ação REPORT_EMPTY)

### EX-2: Falha na geração PDF (`gerarPdfRelatorio`)
* **Ponto de extensão:** Passo 7
* **Condição de erro:** Timeout (>5s — NFR-P03), erro de renderização, memória insuficiente
* **Tratamento:** Sistema exibe "Falha ao gerar PDF — tente novamente ou use HTML"; HTML permanece disponível; loga erro com `traceId`; alerta se falha recorrente (NFR-O05)

### EX-3: XSS attempt via dados não escapados
* **Ponto de extensão:** Passo 4 — `escaparHtml` falha ou dado malicioso passa
* **Condição de erro:** Script tag ou evento HTML injetado no relatório
* **Tratamento:** `escaparHtml` (BR-11, NFR-SEC06) deve neutralizar; se falhar, é bug crítico — `auditarSeguranca` registra `alerta=xss_tentativa`; bloqueia geração; alerta segurança imediato

### EX-4: Consulta cross-tenant em relatório
* **Ponto de extensão:** Passo 2 — Filtro `office_id` ignorado ou manipulado
* **Condição de erro:** Tentativa de acessar dados de outro escritório
* **Tratamento:** Sistema força `office_id` do usuário logado; ignora filtro enviado; registra `auditarSeguranca` (ação REPORT_CROSS_TENANT_ATTEMPT); retorna 404 se `document_id` específico de outro tenant

## 5. Business Rules Envolvidas
* **BR-11:** Relatórios usam exclusivamente informações já registradas; sem nova consulta IA; textos passam por `escaparHtml`
* **BR-12:** Auditoria de geração de relatório (`auditarSeguranca`)
* **BR-16:** Isolamento por escritório (`withPostgresOfficeTransaction`) — consulta restrita ao `office_id`
* **BR-08:** Integridade — relatório reflete dados verificados (`hashBytes` conferido no indexamento)

## 6. Non-Functional Requirements Relevantes
* **NFR-P01:** Consulta de dados para relatório ≤ 200 ms p95 / ≤ 500 ms p99
* **NFR-P03:** Geração PDF (`gerarPdfRelatorio`) até 500 registros ≤ 5 s p95
* **NFR-SEC06:** `escaparHtml` em todos os textos renderizados — prevenção XSS
* **NFR-SEC04:** Isolamento multi-tenant — zero vazamento cross-tenant
* **NFR-O01/O05/O06:** Logs estruturados, alertas em falha PDF/XSS, auditoria

## 7. Frequency of Use
Média — relatórios gerados sob demanda (diário/semanal); agendados (se implementados) diários

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `gerarPdfRelatorio` usa headless Chrome (Playwright) ou biblioteca Node (pdfkit, puppeteer) — stack tem `playwright`
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Templates de relatório são fixos (HTML + CSS); não editor de template pelo usuário
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Limite de 500 registros no PDF (NFR-P03) — relatórios maiores só HTML ou paginados

## 9. Open Issues
* Playwright para PDF: já implementado ou a implementar? (stack tem `playwright` v1.48.0)
* Envio de relatório por e-mail (`nodemailer`) — fluxo confirmado?
* Permissão "relatórios" é papel separado ou incluso em Analista/Administrador?

## 10. Related Artifacts
* **User Stories:** US-027 (Gerar relatório HTML), US-028 (Gerar relatório PDF), US-029 (Agendar relatório), US-030 (Relatório de auditoria)
* **User Flow:** user-flows.md → Fluxo "Relatórios > Geração"
* **API envolvida:** api-specification.md → `POST /api/relatorios/html`, `POST /api/relatorios/pdf`, `POST /api/relatorios/agendar`

---

# Use Case Specification: UC-08 — Autenticação e Gestão de Acesso (Login, Recuperação, Admin Bootstrap)

## 1. Characterization
* **Primary Actor:** Todos os atores (Analista de Cadastros, Analista de Documentos/Vínculos, Auditor/Compliance, Administrador do Escritório)
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Provedor de E-mail (`nodemailer` via SMTP), Gerador/Validador de Hash (`hashToken`), Banco de Dados
* **Stakeholders & Interests:** Administrador (controle de acesso, bootstrap), Auditor (trilha de tentativas via `auditarSeguranca`), Segurança (tokens nunca em claro BR-13)
* **Trigger:** 
  - Usuário acessa tela de login
  - Usuário solicita recuperação de senha
  - Primeira execução do sistema (bootstrap administrador)
* **Preconditions:** 
  - Sistema inicializado (banco migrado)
  - Para bootstrap:* **Preconditions:** 
  - Sistema inicializado (banco migrado)
  - Para bootstrap: `possuiAdministrador` retorna falso (primeira execução)
  - Servidor SMTP configurado para recuperação (`nodemailer`)
* **Postconditions (Success Guarantee):** 
  - Sessão autenticada estabelecida (token/hash válido)
  - Tentativas de acesso auditadas (`auditarSeguranca`)
  - Tokens de recuperação hasheados (`hashToken`) — nunca em claro (BR-13)
  - Administrador provisionado na primeira execução (`bootstrapAdministrador`)
  - Conta de runtime com menor privilégio (BR-15, NFR-SEC05)
* **Scope:** Subsistema de Autenticação e Acesso
* **Level:** User goal

## 2. Main Scenario (Happy Path — Login)
1. Usuário acessa tela de login, informa credenciais (e-mail/usuário + senha)
2. Sistema valida credenciais via `login` (compara hash armazenado com `hashToken`)
3. Se válido: sistema cria sessão, registra `auditarSeguranca` (ação LOGIN_SUCCESS, `userId`, `officeId`)
4. Sistema redireciona para dashboard conforme papel/permissões
5. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Recuperação de senha (`solicitarRecuperacao` / `recuperar`)
* **Ponto de extensão:** Tela de login — link "Esqueci a senha"
* **Passos:**
  1. Usuário informa e-mail cadastrado
  2. Sistema executa `solicitarRecuperacao`: gera token aleatório, aplica `hashToken`, persiste hash com expiração, envia e-mail via `nodemailer` com link contendo token **em claro** (só no e-mail)
  3. Usuário clica link, acessa tela de redefinição com token
  4. Sistema valida token: compara `hashToken(token_recebido)` com hash armazenado, verifica expiração
  5. Se válido: usuário define nova senha; sistema executa `definirCredencial` (hash da nova senha), invalida token de recuperação
  6. Sistema registra `auditarSeguranca` (ações RECOVERY_REQUEST, RECOVERY_COMPLETE)
  7. Usuário redirecionado para login
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Bootstrap de administrador (`bootstrapAdministrador`)
* **Ponto de extensão:** Primeira execução do sistema — `possuiAdministrador` retorna falso
* **Passos:**
  1. Sistema detecta ausência de administrador (startup ou primeira acesso)
  2. Sistema executa `bootstrapAdministrador`: cria usuário admin com credencial padrão ou convida via e-mail ([INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] fluxo exato: credencial temporária exibida em console vs. e-mail)
  3. Sistema registra `auditarSeguranca` (ação BOOTSTRAP_ADMIN, `userId` do admin criado)
  4. Administrador faz primeiro login (AS-1 se credencial temporária) e define credencial definitiva (`definirCredencial`)
* **Retorno ao fluxo principal:** Não, encerra

### AS-3: Logout
* **Ponto de extensão:** Usuário autenticado seleciona "Sair"
* **Passos:**
  1. Sistema executa `logout`: invalida sessão/token
  2. Registra `auditarSeguranca` (ação LOGOUT, `userId`)
  3. Redireciona para login
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Credenciais inválidas
* **Ponto de extensão:** Passo 2 do cenário principal
* **Condição de erro:** `login` falha (usuário não existe ou hash não confere)
* **Tratamento:** Sistema registra `auditarSeguranca` (ação LOGIN_FAILED, `motivo=credenciais_invalidas`, `ip`, `userAgent`); exibe "Credenciais inválidas" (genérico, não vaza se usuário existe); incrementa contador de tentativas; alerta se > 5 tentativas em 15 min (NFR-O05)

### EX-2: Token de recuperação expirado ou inválido
* **Ponto de extensão:** Passo 4 do AS-1
* **Condição de erro:** Hash não confere ou expiração > 1h ([INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] TTL do token)
* **Tratamento:** Sistema invalida token; exibe "Link expirado ou inválido — solicite nova recuperação"; registra `auditarSeguranca` (ação RECOVERY_FAILED, `motivo=token_invalido_ou_expirado`)

### EX-3: Tentativa de bootstrap com admin já existente
* **Ponto de extensão:** AS-2 — `possuiAdministrador` retorna verdadeiro
* **Condição de erro:** Sistema já tem admin
* **Tratamento:** `bootstrapAdministrador` não executa; loga `auditarSeguranca` (ação BOOTSTRAP_SKIPPED, `motivo=admin_existente`)

### EX-4: Falha no envio de e-mail (SMTP)
* **Ponto de extensão:** Passo 2 do AS-1 — `nodemailer` falha
* **Condição de erro:** Servidor SMTP indisponível, credenciais inválidas, limite de envio
* **Tratamento:** Sistema **não** persiste token de recuperação (evita token órfão); exibe "Falha ao enviar e-mail — contate administrador"; registra `auditarSeguranca` (ação RECOVERY_EMAIL_FAILED, `erro`); alerta operacional (NFR-O05)

## 5. Business Rules Envolvidas
* **BR-13:** Tokens nunca em claro — `hashToken` antes de persistir; `definirCredencial` só após validação de identidade (`solicitarRecuperacao`/`recuperar`)
* **BR-14:** `possuiAdministrador` garante pelo menos um admin; `bootstrapAdministrador` provisiona na primeira execução
* **BR-15:** Conta de runtime com menor privilégio (`postgresRuntimeConfigFromEnv`, `validarPapelRuntimePostgres`) — nunca role admin/migração
* **BR-12:** Auditoria de segurança (`auditarSeguranca`) em login, logout, recuperação, bootstrap
* **BR-16:** Transacionalidade — operações de credencial em transação
* **BR-03:** `exigirCadastroEscritorio` — login bloqueado se escritório não cadastrado

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Login/escrita (`login`, `definirCredencial`, `solicitarRecuperacao`) ≤ 300 ms p95 / ≤ 800 ms p99
* **NFR-SEC02:** TLS 1.3 obrigatório — credenciais/tokens só em HTTPS (scripts `ui:https`, `test:https-local`)
* **NFR-SEC03:** Autenticação baseada em hash (`hashToken`); MFA não implementado (roadmap)
* **NFR-SEC05:** Conta runtime menor privilégio (BR-15)
* **NFR-SEC07:** Validação Zod em payloads de login/recuperação
* **NFR-SEC08:** OWASP Top 10 — proteção contra brute force, enumeração, session fixation
* **NFR-O01/O05/O06:** Logs estruturados, alertas em falhas repetidas, auditoria

## 7. Frequency of Use
Muito alta — login a cada sessão; recuperação esporádica; bootstrap uma vez

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Sessão via JWT stateless ou cookie com session ID? (Glossário não especifica — `hashToken` sugere hash de token, não necessariamente JWT)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `bootstrapAdministrador` cria admin com senha temporária exibida em logs/console ou envia e-mail?
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Papéis/permissões: apenas "admin" e "usuario" ou RBAC granular?

## 9. Open Issues
* Expiração de sessão e refresh token
* Bloqueio de conta após N tentativas (política de brute force)
* Rotação de segredos (NFR-SEC09) — como afeta tokens ativos?

## 10. Related Artifacts
* **User Stories:** US-031 (Login), US-032 (Logout), US-033 (Recuperar senha), US-034 (Bootstrap admin), US-035 (Definir credencial)
* **User Flow:** user-flows.md → Fluxo "Autenticação > Login/Recuperação/Admin"
* **API envolvida:** api-specification.md → `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/recuperar`, `POST /api/auth/redefinir`, `POST /api/auth/bootstrap-admin`

---

# Use Case Specification: UC-09 — Auditoria e Monitoramento (Segurança e Cadastro)

## 1. Characterization
* **Primary Actor:** Auditor/Compliance, Administrador do Escritório
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Coletor de Métricas (Prometheus/OpenTelemetry — NFR-O03/O04), Sistema de Alertas (Alertmanager/Grafana — NFR-O05)
* **Stakeholders & Interests:** Compliance (trilha completa BR-12, NFR-C02), Segurança (detecção de anomalias), Operações (health/metrics NFR-O01/O02/O03)
* **Trigger:** 
  - Consulta: Auditor acessa trilha de auditoria
  - Automático: Sistema gera alertas baseados em métricas/logs
  - Health check: Load balancer/monitoramento consulta `/health`, `/metrics`
* **Preconditions:** 
  - Logs de auditoria populados (`auditarSeguranca`, `auditarCadastro`) — inserts only (NFR-C04)
  - Métricas expostas em `/metrics` (Prometheus)
  - Health endpoint em `/health`
* **Postconditions (Success Guarantee):** 
  - Trilha de auditoria íntegra, imutável, retentida ≥ 5 anos (NFR-C02)
  - Métricas coletadas e alertas disparados conforme thresholds
  - Health/readiness refletem estado real (SQLite, migrações, disco)
* **Scope:** Subsistema Transversal — Auditoria e Observabilidade
* **Level:** Summary (agrega múltiplos user goals)

## 2. Main Scenario (Happy Path — Consulta de Auditoria)
1. Auditor/Administrador acessa "Auditoria" com filtros: período, usuário, ação, entidade, escritório
2. Sistema consulta tabela `auditoria` filtrada por `office_id` (isolamento — BR-16, NFR-SEC04)
3. Sistema retorna registros paginados: `timestamp`, `level`, `traceId`, `officeId`, `userId`, `action`, `entity`, `entityId`, `details`, `durationMs`, `error?` (NFR-O01)
4. Auditor exporta (CSV/PDF via UC-07) ou visualiza detalhes
5. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Monitoramento automático e alertas
* **Ponto de extensão:** Contínuo (background via coletor externo)
* **Passos:**
  1. Coletor (Prometheus) faz scrape em `/metrics` a cada 15s (NFR-O03)
  2. Regras de alerta avaliadas (NFR-O05): p95 > 500ms, error rate 5xx > 1%, `sqlite_write_lock_wait_seconds` > 2s, backup falho, disco > 80%
  3. Alerta disparado → notificação (e-mail, Slack, PagerDuty — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] canais)
  4. Operador investiga via logs (NFR-O01) e tracing (NFR-O04)
* **Retorno ao fluxo principal:** Não, processo contínuo

### AS-2: Health/Readiness check
* **Ponto de extensão:** Load balancer/k8s consulta `/health` (liveness) e `/health/ready` (readiness)
* **Passos:**
  1. `/health`: retorna `{status: "ok", uptime, version}` — processo vivo
  2. `/health/ready`: verifica SQLite conectado, migrações aplicadas, disco < 90%, escrita funcional; retorna 200 ou 503
* **Retorno ao fluxo principal:** Não, endpoint passivo

## 4. Exception Scenarios
### EX-1: Consulta de auditoria cross-tenant
* **Ponto de extensão:** Passo 2 — Filtro `office_id` manipulado
* **Condição de erro:** Tentativa de acessar auditoria de outro escritório
* **Tratamento:** Sistema força `office_id` do usuário; ignora filtro; registra `auditarSeguranca` (ação AUDIT_CROSS_TENANT_ATTEMPT); retorna 404

### EX-2: Falha na escrita de log de auditoria
* **Ponto de extensão:** Qualquer `auditarSeguranca`/`auditarCadastro` (chamados por todos os UCs)
* **Condição de erro:** Disco cheio, lock SQLite, erro de schema
* **Tratamento:** **Crítico** — auditoria não pode falhar silenciosamente (NFR-C04). Sistema: loga erro em stderr (fallback), incrementa contador `audit_write_failures` em `/metrics`, alerta imediato (NFR-O05), **não bloqueia operação principal** (auditoria é side-effect), mas marca `auditoria_incompleta=true` na resposta se possível

### EX-3: Métricas não disponíveis / `/metrics` falha
* **Ponto de extensão:** AS-1 — Scrape falha
* **Condição de erro:** Endpoint indisponível, formato inválido
* **Tratamento:** Coletor registra scrape failure; alerta "metrics_unavailable" após 3 falhas consecutivas; operador verifica `/health` e logs

## 5. Business Rules Envolvidas
* **BR-12:** `auditarSeguranca` e `auditarCadastro` obrigatórias em ações sensíveis
* **BR-15:** Conta runtime menor privilégio — **não pode** UPDATE/DELETE em tabela `auditoria` (NFR-C04)
* **BR-16:** Isolamento por escritório — auditoria filtrada por `office_id`
* **BR-17:** Migrações preservam auditoria — `migrarCadastros`/`migrarAutenticacao` não perdem logs

## 6. Non-Functional Requirements Relevantes
* **NFR-O01:** Logs estruturados JSON com campos padronizados
* **NFR-O02:** `/health` (liveness/readiness) com status SQLite, migrações, conexões, disco
* **NFR-O03:** `/metrics` Prometheus: `http_requests_total`, `http_request_duration_seconds`, `sqlite_write_lock_wait_seconds`, `db_size_bytes`, `backup_last_success_timestamp`, `audit_write_failures`
* **NFR-O04:** Tracing OpenTelemetry 100% requisições críticas — `traceparent` propagado para logs
* **NFR-O05:** Alertas configurados para thresholds definidos
* **NFR-O06:** Auditoria de domínio já implementada — logs seguem formato NFR-O01
* **NFR-C02:** Retenção auditoria ≥ 5 anos (política trabalhista)
* **NFR-C04:** Auditoria imutável — inserts only via conta runtime

## 7. Frequency of Use
Contínua (métricas/alertas/health); consulta de auditoria: média (semanal/por demanda)

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Nenhuma biblioteca de observabilidade detectada nas dependências (Winston, Pino, OpenTelemetry SDK, Prometheus client) — **itens NFR-O01..O06 são metas a implementar**
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Tabela `auditoria` no mesmo SQLite (arquivo cifrado NFR-SEC01) com backup cifrado
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `traceId` gerado no ingresso HTTP (middleware) e propagado

## 9. Open Issues
* Implementação completa de observabilidade (bibliotecas, instrumentação, dashboards)
* Correlação de `traceId` entre logs, métricas, tracing
* Políticas de retenção e arquivamento de logs antigos (particionamento?)

## 10. Related Artifacts
* **User Stories:** US-036 (Consultar auditoria), US-037 (Exportar auditoria), US-038 (Configurar alertas), US-039 (Health check), US-040 (Métricas Prometheus)
* **User Flow:** user-flows.md → Fluxo "Observabilidade > Auditoria e Monitoramento"
* **API envolvida:** api-specification.md → `GET /api/auditoria`, `GET /health`, `GET /health/ready`, `GET /metrics`

---

# Use Case Specification: UC-10 — Migração e Manutenção de Versão (Dados e Auth)

## 1. Characterization
* **Primary Actor:** Administrador do Escritório, Engenharia/DevOps
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Scripts de Migração (`migrarCadastros`, `migrarAutenticacao`, `db:migrate`), Backup/Recuperação (`backup:cifrar`, `postgres:backup:*`, `sqlite:recuperacao:*`), Banco de Dados
* **Stakeholders & Interests:** Todos — zero perda de dados (BR-17), continuidade do serviço, integridade histórica
* **Trigger:** 
  - Deploy de nova versão com migrações (`db:migrate`)
  - Recuperação de desastre (RTO ≤ 1h, RPO ≤ 15min — NFR-A02/A03)
  - Agendamento via `node-cron` (`postgres:agendar`)
* **Preconditions:** 
  - Backup recente válido (cifrado — `backup:cifrar`)
  - Janela de manutenção (se downtime necessário)
  - Usuário com papel admin/migração (não conta runtime — BR-15)
* **Postconditions (Success Guarantee):** 
  - Migrações executadas em transação atômica (`withPostgresTransaction` / equivalente SQLite) — rollback automático em falha (NFR-A05)
  - Zero perda de dados: registros, análises, configurações, vínculos preservados (BR-17)
  - Backup pós-migração criado e verificado
  - Auditoria de migração registrada (`auditarSeguranca`)
* **Scope:** Subsistema de Operação — Migração e Recuperação
* **Level:** Summary

## 2. Main Scenario (Happy Path — Migração de Versão)
1. Engenharia inicia deploy: `db:migrate` executa migrações pendentes em ordem
2. Cada migração roda em transação (`withPostgresTransaction` / equivalente SQLite)
3. Se migração falha: rollback automático; deploy abortado; alerta; `auditarSeguranca` (ação MIGRATION_FAILED)
4. Se todas passam: versão atualizada no schema; `auditarSeguranca` (ação MIGRATION_SUCCESS, `versao`, `duracaoMs`)
5. Backup pós-migração automático (`backup:cifrar`)
6. Sistema disponível para uso

## 3. Alternative Scenarios
### AS-1: Recuperação de desastre (Disaster Recovery)
* **Ponto de extensão:** Incidente — perda/corrupção de dados, falha de hardware
* **Passos:**
  1. Operador provisiona nova instância (Linux, Node.js ≥ 20 — NFR-PO02)
  2. Restaura backup cifrado mais recente (`backup:chaves` para descriptografar, `sqlite:recuperacao:inspecionar` para validar)
  3. Executa `test:postgres-recuperacao-limpa` ou `test:sqlite-recuperacao` para validar integridade
  4. Aplica migrações pendentes se backup for de versão anterior (`db:migrate`)
  5. Valida `hashBytes` de documentos amostrais (NFR-C03)
  6. Aponta DNS/load balancer para nova instância
  7. `auditarSeguranca` (ação DISASTER_RECOVERY, `rto_minutos`, `rpo_minutos`)
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Migração específica de cadastros/auth (`migrarCadastros`, `migrarAutenticacao`)
* **Ponto de extensão:** Passo 1 — Migrações especiais nomeadas no glossário
* **Passos:**
  1. Script dedicado executa transformação de dados legados (ex.: schema v1 → v2)
  2. Preserva integralmente: registros, análises, configurações, vínculos (BR-17)
  3. Valida contagens pré/pós; `auditarCadastro` para mudanças em massa
  4. Rollback automático se validação falhar
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: Falha de migração com rollback
* **Ponto de extensão:** Passo 3 do cenário principal
* **Condição de erro:** Constraint violation, timeout, erro de lógica na migração
* **Tratamento:** Rollback automático (NFR-A05); sistema permanece na versão anterior; alerta crítico; `auditarSeguranca` com detalhes do erro; engenharia investiga e corrige migração

### EX-2: Backup corrompido ou incompleto na recuperação
* **Ponto de extensão:** Passo 2 do AS-1
* **Condição de erro:** `sqlite:recuperacao:inspecionar` falha; hash do backup não confere
* **Tratamento:** Tenta backup anterior (RPO ≤ 15min — NFR-A03 garante frequência); se nenhum válido, escala para engenharia; `auditarSeguranca` (ação BACKUP_CORRUPTED)

### EX-3: Migração `migrarCadastros`/`migrarAutenticacao` perde dados
* **Ponto de extensão:** AS-2 — Validação pós-migração
* **Condição de erro:** Contagem de registros divergente; vínculos órfãos; configurações resetadas
* **Tratamento:** Rollback imediato; BR-17 violado — incidente crítico; `auditarSeguranca` (ação MIGRATION_DATA_LOSS); bloqueia deploy até correção

## 5. Business Rules Envolvidas
* **BR-16:** Transacionalidade — migrações em transação atômica
* **BR-17:** Preservação integral em migrações — zero perda
* **BR-15:** Conta de migração/admin separada de runtime (maior privilégio só para migração)
* **BR-12:** Auditoria de migração (`auditarSeguranca`)

## 6. Non-Functional Requirements Relevantes
* **NFR-A02:** RTO ≤ 1h (restauração a partir de backup cifrado)
* **NFR-A03:** RPO ≤ 15min (frequência backup via `node-cron`)
* **NFR-A04:** Single point of failure assumido — mitigação via backup automatizado cifrado + scripts de recuperação testados
* **NFR-A05:** Migrações atômicas com rollback automático; zero perda (BR-17)
* **NFR-SEC01:** Backup cifrado (`backup:cifrar`, `backup:chaves`)
* **NFR-O01/O05:** Logs estruturados de migração/backup; alertas em falha

## 7. Frequency of Use
Baixa — migrações a cada deploy (semanal/quinzenal); recuperação: rara (incidente)

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `better-sqlite3` suporta migrações transacionais (SQLite tem `BEGIN TRANSACTION` / `ROLLBACK` para DDL? — verificar; algumas DDLs não são transacionáveis em SQLite)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `pg` dependency usada apenas para scripts de backup/Postgres externo, não runtime operacional
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `node-cron` agenda backups a cada 15min (NFR-A03) — script `postgres:agendar` / `postgres:backup`

## 9. Open Issues
* DDL transacional em SQLite — limitações conhecidas (ALTER TABLE, etc.)
* Estratégia de backup: apenas arquivo `.sqlite` copiado + cifrado? Ou dump SQL?
* Testes de recuperação automatizados no CI/CD?

## 10. Related Artifacts
* **User Stories:** US-041 (Executar migração), US-042 (Backup automático), US-043 (Recuperar desastre), US-044 (Validar backup), US-045 (Migrar cadastros legados)
* **User Flow:** user-flows.md → Fluxo "Operação > Migração e Backup"
* **API envolvida:** api-specification.md → `POST /api/admin/migrar`, `POST /api/admin/backup`, `POST /api/admin/restaurar`, `GET /api/admin/status-migracao`

---

# Use Case Specification: UC-11 — Configuração de Escritório e Onboarding (Multi-tenant)

## 1. Characterization
* **Primary Actor:** Administrador do Escritório
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Validador de Escritório (`exigirCadastroEscritorio`), Bootstrap Admin (`bootstrapAdministrador`), Indexador de Arquivos Existentes (`indexarArquivosExistentes`), Banco de Dados
* **Stakeholders & Interests:** Sponsor/Produto (ativação de novo tenant), Engenharia (isolamento de dados), Compliance (auditoria desde o dia 1)
* **Trigger:** Nova instância para escritório (onboarding) ou primeira execução global
* **Preconditions:** 
  - Sistema implantado e acessível
  - Administrador designado para o escritório
* **Postconditions (Success Guarantee):** 
  - Escritório cadastrado (`exigirCadastroEscritorio` passa)
  - Administrador provisionado (`bootstrapAdministrador` / `possuiAdministrador`)
  - Acervo documental legado indexado (`indexarArquivosExistentes` — opcional)
  - Isolamento transacional ativo (`withPostgresOfficeTransaction`)
  - Auditoria de onboarding registrada
* **Scope:** Subsistema Multi-tenant — Onboarding de Escritório
* **Level:** User goal

## 2. Main Scenario (Happy Path — Onboarding de Novo Escritório)
1. Administrador acessa URL de onboarding (ou primeira execução aponta para setup)
2. Sistema verifica `possuiAdministrador`: se falso, executa `bootstrapAdministrador` (cria admin global/sistema)
3. Administrador preenche dados do escritório: nome, CNPJ, endereço, configurações (SMTP, caminhos de arquivo, etc.)
4. Sistema valida CNPJ (`cnpjValido`, `normalizarCnpj`) e normaliza textos (`normalizarTexto`)
5. Sistema persiste escritório; `exigirCadastroEscritorio` passa a retornar verdadeiro para este `office_id`
6. Sistema executa `bootstrapAdministrador` para o escritório (cria admin do tenant) ou vincula admin global
7. Administrador do escritório faz login (UC-08)
8. Opcional: Administrador executa `indexarArquivosExistentes` apontando para diretório legado — migra acervo (UC-03 AS-1)
9. `auditarCadastro` e `auditarSeguranca` registram todo onboarding
10. Caso de uso encerra com sucesso — escritório operacional

## 3. Alternative Scenarios
### AS-1: Onboarding sem acervo legado
* **Ponto de extensão:** Passo 8 — Administrador pula indexação legada
* **Passos:** Fluxo principal sem passo 8; escritório inicia vazio
* **Retorno ao fluxo principal:** Não, encerra

### AS-2: Reconfiguração de escritório existente
* **Ponto de extensão:** Passo 3 — Administrador edita configurações
* **Passos:**
  1. Administrador acessa "Configurações do Escritório"
  2. Altera: nome, SMTP, caminhos, parâmetros de watch (`loadWatchConfig`)
  3. Sistema valida e persiste em transação (`withPostgresOfficeTransaction`)
  4. `auditarCadastro` (ação UPDATE escritório)
* **Retorno ao fluxo principal:** Não, encerra

## 4. Exception Scenarios
### EX-1: CNPJ de escritório duplicado
* **Ponto de extensão:** Passo 4
* **Condição de erro:** CNPJ normalizado já cadastrado em outro escritório
* **Tratamento:** Sistema bloqueia; "CNPJ já registrado"; sugere recuperação de acesso; `auditarSeguranca` (ação OFFICE_DUPLICATE_CNPJ)

### EX-2: Falha no bootstrap de administrador do tenant
* **Ponto de extensão:** Passo 6
* **Condição de erro:** `bootstrapAdministrador` falha (constraint, e-mail duplicado, etc.)
* **Tratamento:** Rollback da criação do escritório (BR-16); exibe erro; `auditarSeguranca` (ação OFFICE_BOOTSTRAP_FAILED)

### EX-3: `indexarArquivosExistentes` falha parcialmente
* **Ponto de extensão:** Passo 8
* **Condição de erro:** Arquivos corrompidos, permissões, formato não suportado
* **Tratamento:** Relatório de falhas (UC-03 EX-1/EX-2); escritório permanece cadastrado; admin pode reexecutar indexação depois; `auditarSeguranca` (ação LEGACY_INDEX_PARTIAL)

## 5. Business Rules Envolvidas
* **BR-01:** CNPJ do escritório validado e normalizado
* **BR-02:** Textos do escritório normalizados
* **BR-03:** `exigirCadastroEscritorio` — operações bloqueadas sem cadastro
* **BR-14:** `possuiAdministrador` / `bootstrapAdministrador` — admin obrigatório
* **BR-16:** Isolamento por escritório (`withPostgresOfficeTransaction`) ativo desde o cadastro
* **BR-17:** `indexarArquivosExistentes` preserva dados — não sobrescreve vínculos manuais (BR-04)

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Cadastro de escritório ≤ 300 ms p95
* **NFR-S04:** Isolamento cross-tenant configurado desde a criação
* **NFR-SEC01:** Dados do escritório em SQLite cifrado
* **NFR-SEC04:** Isolamento multi-tenant efetivo
* **NFR-O01/O06:** Auditoria completa do onboarding

## 7. Frequency of Use
Muito baixa — uma vez por escritório (onboarding); reconfiguração esporádica

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Hierarquia: admin global (sistema) > admin de escritório (tenant) > analistas
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `loadWatchConfig` carrega configurações de monitoramento por escritório (caminhos vigiados, agendamentos)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Onboarding pode ser self-service (URL pública) ou assistido (engenharia)

## 9. Open Issues
* Fluxo de convite de admin do escritório vs. bootstrap automático
* Limite de escritórios por instância (NFR-S01: 50 usuários/escritório — quantos escritórios por instância?)
## 9. Open Issues
* Fluxo de convite de admin do escritório vs. bootstrap automático
* Limite de escritórios por instância (NFR-S01: 50 usuários/escritório — quantos escritórios por instância?)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Onboarding self-service exige validação de domínio/e-mail do escritório para evitar fraude?

## 10. Related Artifacts
* **User Stories:** US-046 (Cadastrar escritório), US-047 (Bootstrap admin do escritório), US-048 (Indexar acervo legado), US-049 (Configurar escritório), US-050 (Visualizar status onboarding)
* **User Flow:** user-flows.md → Fluxo "Multi-tenant > Onboarding de Escritório"
* **API envolvida:** api-specification.md → `POST /api/escritorios`, `GET /api/escritorios/{id}`, `PUT /api/escritorios/{id}`, `POST /api/escritorios/{id}/indexar-legado`

---

# Use Case Specification: UC-12 — Configuração de Monitoramento e Vigilância (`loadWatchConfig`)

## 1. Characterization
* **Primary Actor:** Administrador do Escritório
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Agendador (`node-cron`), Automação de Navegador (`playwright` — provável captura/download de documentos), Banco de Dados
* **Stakeholders & Interests:** Operações (automação de coleta), Analista de Documentos (documentos chegam automaticamente), Compliance (rastreabilidade de fontes)
* **Trigger:** Administrador acessa "Configuração de Vigilância" para definir fontes, agendamentos e parâmetros de captura
* **Preconditions:** 
  - Escritório cadastrado e ativo
  - Usuário com papel administrador do escritório
  - `playwright` disponível no runtime (dependência instalada)
* **Postconditions (Success Guarantee):** 
  - Configuração persistida (`loadWatchConfig` carrega/valida)
  - Agendamentos ativos no `node-cron`
  - Auditoria de configuração registrada
  - Isolamento por escritório
* **Scope:** Subsistema de Automação — Vigilância e Captura
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. Administrador acessa "Vigilância / Monitoramento"
2. Define uma ou mais "fontes de vigilância": 
   - URL alvo (portal sindical, sistema público, etc.)
   - Seletores/ações `playwright` (login, navegação, download)
   - Frequência (cron expression)
   - Pasta destino para arquivos baixados
3. Sistema valida: URL acessível, seletores sintaticamente corretos, cron expression válida
4. Sistema persiste configuração e registra/atualiza jobs no `node-cron`
5. Sistema executa `loadWatchConfig` na inicialização para carregar jobs ativos
6. `auditarCadastro` registra ação CONFIG_WATCH (CREATE/UPDATE)
7. Caso de uso encerra com sucesso

## 3. Alternative Scenarios
### AS-1: Teste de configuração antes de salvar
* **Ponto de extensão:** Passo 3 — Administrador clica "Testar"
* **Passos:**
  1. Sistema executa rotina `playwright` uma vez (modo headless)
  2. Tenta login, navegação, download de amostra
  3. Retorna: sucesso/falha, arquivos baixados, logs de execução, tempo decorrido
  4. Administrador ajusta se necessário
* **Retorno ao fluxo principal:** Sim, volta ao passo 2

### AS-2: Pausar/reativar vigilância
* **Ponto de extensão:** Lista de vigilâncias configuradas
* **Passos:**
  1. Administrador alterna status "Ativo/Pausado"
  2. Sistema para/reativa job no `node-cron` (não remove configuração)
  3. `auditarCadastro` (ação WATCH_PAUSE / WATCH_RESUME)
* **Retorno ao fluxo principal:** Não, encerra

### AS-3: Execução automática (background)
* **Ponto de extensão:** `node-cron` dispara job agendado
* **Passos:**
  1. Job acorda, executa script `playwright` configurado
  2. Arquivos baixados salvos na pasta destino do escritório
  3. Para cada arquivo: dispara indexação automática (UC-03) — `indexarMetaDocumento`, `extrairCabecalho`, etc.
  4. `auditarSeguranca` (ação WATCH_EXECUTION, `fonte`, `arquivos_baixados`, `sucesso`)
* **Retorno ao fluxo principal:** Não, processo contínuo

## 4. Exception Scenarios
### EX-1: Falha na automação `playwright` (login, seletor, download)
* **Ponto de extensão:** AS-3 passo 1-2
* **Condição de erro:** Site alterado, credenciais expiradas, seletor não encontrado, timeout
* **Tratamento:** Job registra falha; `auditarSeguranca` (ação WATCH_FAILED, `erro`, `traceId`); alerta se 3 falhas consecutivas (NFR-O05); não interrompe outros jobs

### EX-2: Arquivo baixado não passa em `arquivoPermitido`
* **Ponto de extensão:** AS-3 passo 3 — indexação automática
* **Condição de erro:** Formato/tamanho/tipo não permitido
* **Tratamento:** Arquivo quarentenado (pasta `quarentena/`); log em `auditarSeguranca` (ação WATCH_QUARANTINE); notifica administrador; não indexa no histórico

### EX-3: Conflito de agendamento / sobrecarga
* **Ponto de extensão:** Passo 4 — `node-cron` tenta iniciar job mas anterior ainda roda
* **Condição de erro:** Execução anterior > frequência agendada
* **Tratamento:** `node-cron` padrão: não inicia nova instância (skip); loga `auditarSeguranca` (ação WATCH_SKIPPED, `motivo=execucao_anterior_ativa`); métrica `watch_overlap_count` em `/metrics`

## 5. Business Rules Envolvidas
* **BR-07:** Arquivos capturados devem passar em `arquivoPermitido` e `detectarFormato` antes de indexar
* **BR-08:** Integridade via `hashBytes` aplicada na indexação automática
* **BR-12:** Auditoria de execuções de vigilância (`auditarSeguranca`)
* **BR-16:** Isolamento por escritório — jobs só acessam pastas/configs do seu `office_id`
* **BR-03:** `exigirCadastroEscritorio` — vigilância só roda se escritório ativo

## 6. Non-Functional Requirements Relevantes
* **NFR-P04:** Execução `playwright` + indexação por arquivo ≤ 2s (extração) + tempo de navegação/download
* **NFR-S03:** Escala vertical apenas — `playwright` headless consome CPU/RAM; múltiplos jobs concorrentes limitados pelo host
* **NFR-SEC01:** Arquivos baixados em volume persistente cifrado
* **NFR-SEC04:** Isolamento total — job do escritório A não acessa configs/pastas do B
* **NFR-O01/O05:** Logs estruturados de cada execução; alertas em falhas repetidas/quarentena

## 7. Frequency of Use
Configuração: rara (setup inicial, ajustes ocasionais). Execução: contínua (conforme cron — ex.: a cada 1h, 6h, diário)

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `playwright` usado para automação de navegador (login em portais, download de CCTs/aditivos) — stack tem `playwright` v1.48.0
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `loadWatchConfig` carrega configurações de vigilância por escritório na inicialização do processo
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Credenciais de portais externos armazenadas cifradas (variáveis de ambiente ou cofre — não no SQLite em claro)

## 9. Open Issues
* Interface para definir seletores `playwright` (code editor visual? JSON? DSL?)
* Gestão de credenciais de portais externos — rotação, armazenamento seguro
* Paralelismo: quantos jobs `playwright` simultâneos por instância? (memória/CPU)

## 10. Related Artifacts
* **User Stories:** US-051 (Configurar vigilância), US-052 (Testar vigilância), US-053 (Pausar/reativar), US-054 (Ver histórico de execuções)
* **User Flow:** user-flows.md → Fluxo "Automação > Vigilância e Captura"
* **API envolvida:** api-specification.md → `POST /api/vigilancias`, `GET /api/vigilancias`, `PUT /api/vigilancias/{id}`, `POST /api/vigilancias/{id}/testar`, `GET /api/vigilancias/{id}/execucoes`

---

# Use Case Specification: UC-13 — Sanitização e Utilitários de Texto (`escaparHtml`, `normalizarTexto`, `html-entities`)

## 1. Characterization
* **Primary Actor:** Sistema (invocado internamente por outros casos de uso)
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Biblioteca `html-entities` (decode/encode), Validador Zod
* **Stakeholders & Interests:** Segurança (prevenção XSS — NFR-SEC06), Qualidade de Dados (consistência — BR-02), Desenvolvedores (funções reutilizáveis)
* **Trigger:** 
  - Automático: antes de renderizar HTML/PDF (UC-07), exibir dados na UI, persistir textos (UC-01, UC-02)
  - Explícito: desenvolvedor chama utilitário em novo código
* **Preconditions:** Funções disponíveis no módulo utilitário compartilhado
* **Postconditions (Success Guarantee):** 
  - `escaparHtml`: string segura para contexto HTML (entidades codificadas)
  - `normalizarTexto`: string padronizada (trim, case, acentos, espaços — conforme regra de negócio)
  - `html-entities`: decode/encode de entidades HTML/XML
* **Scope:** Biblioteca Transversal — Utilitários de Texto
* **Level:** Subfunction

## 2. Main Scenario (Happy Path — Uso Interno)
1. Código chama `normalizarTexto(entrada)` antes de persistir/consultar (BR-02)
2. Função aplica: trim, upper/lower case conforme regra, remoção acentos (ou padronização NFD/NFC), colapso de espaços múltiplos
3. Retorna string normalizada — usada em `salvarCliente`, `salvarContato`, `indexarMetaDocumento`, buscas
4. Código chama `escaparHtml(entrada)` antes de interpolar em template HTML (BR-11, NFR-SEC06)
5. Função usa `html-entities` / regex para converter `<`, `>`, `&`, `"`, `'` em entidades (`&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#x27;`)
6. Retorna string segura — usada em `renderizarRelatorioHtml`, `renderizarCctMarkdown` (se exibido em HTML), UI Vue
7. `html-entities` decode usado ao ler dados de fontes externas que vêm com entidades codificadas

## 3. Alternative Scenarios
### AS-1: Normalização de CNPJ (caso especial)
* **Ponto de extensão:** `normalizarCnpj` (função dedicada, não `normalizarTexto`)
* **Passos:** Remove não-dígitos; valida comprimento (14); formata `XX.XXX.XXX/XXXX-XX` se necessário; `cnpjValido` valida dígitos verificadores
* **Retorno ao fluxo principal:** Não, função separada

## 4. Exception Scenarios
### EX-1: Entrada nula/undefined
* **Condição de erro:** Parâmetro não é string
* **Tratamento:** Retorna string vazia ou lança erro controlado (conforme design — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] preferência: string vazia para robustez)

### EX-2: String extremamente grande (DoS via regex)
* **Condição de erro:** Entrada > 1MB (ex.: payload malicioso)
* **Tratamento:** Limite de tamanho antes de processar (Zod `maxLength`); `escaparHtml`/`normalizarTexto` assumem entrada já validada

## 5. Business Rules Envolvidas
* **BR-02:** `normalizarTexto` obrigatório em `salvarCliente`, `salvarContato` (nomes, descrições)
* **BR-11:** `escaparHtml` obrigatório em `renderizarRelatorioHtml`, `gerarPdfRelatorio` (via HTML), qualquer saída HTML
* **BR-01:** `normalizarCnpj` + `cnpjValido` em `salvarCliente`, `descobrirDocumentosClientes`

## 6. Non-Functional Requirements Relevantes
* **NFR-SEC06:** `escaparHtml` previne XSS — deve cobrir todos vetores (atributos, texto, JS, CSS, URL)
* **NFR-M03:** TypeScript strict — tipagem forte nas assinaturas
* **NFR-M01:** Testes unitários ≥ 80% (Vitest) — casos de borda: XSS vectors, Unicode, strings vazias, nulos

## 7. Frequency of Use
Muito alta — invocado em praticamente toda escrita/leitura/renderização

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `normalizarTexto` remove acentos (ASCII-folding) ou preserva com NFC? Impacta busca e deduplicação
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `escaparHtml` usa `html-entities` `encode` (non-ASCII + special chars) ou `escape` (apenas `<>&"'`)

## 9. Open Issues
* Definição exata de `normalizarTexto` (regras de case, acentos, pontuação)
* Cobertura de `escaparHtml` para contextos: HTML body, attribute, JavaScript, CSS, URL

## 10. Related Artifacts
* **User Stories:** US-055 (Normalizar texto), US-056 (Escapar HTML), US-057 (Decode entities)
* **API envolvida:** Não exposto diretamente — funções internas (shared kernel)

---

# Use Case Specification: UC-14 — Hash e Integridade (`hashBytes`, `hashToken`, `backup:cifrar`)

## 1. Characterization
* **Primary Actor:** Sistema (invocado internamente)
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Crypto nativo do Node.js (`crypto` module), Algoritmos: SHA-256 (`hashBytes`), bcrypt/argon2/PBKDF2 (`hashToken` — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] qual algoritmo), AES-256-GCM (`backup:cifrar`)
* **Stakeholders & Interests:** Segurança (integridade, confidencialidade), Auditoria (comprovação), Compliance (LGPD, retenção)
* **Trigger:** 
  - `hashBytes`: indexação (UC-03), leitura (UC-04), validação de integridade
  - `hashToken`: criação/validação de credenciais, tokens de recuperação (UC-08)
  - `backup:cifrar`: backup agendado (UC-10), backup pós-migração
* **Preconditions:** Chaves de cifragem de backup disponíveis (`backup:chaves`), variáveis de ambiente carregadas (`dotenv`)
* **Postconditions (Success Guarantee):** 
  - `hashBytes`: SHA-256 hex string consistente para mesmos bytes
  - `hashToken`: hash irreversível, custo computacional adequado (work factor)
  - `backup:cifrar`: arquivo cifrado + autenticado (AEAD), só descriptografável com chave correta
* **Scope:** Biblioteca Transversal — Criptografia e Hash
* **Level:** Subfunction

## 2. Main Scenario (Happy Path)
### `hashBytes` (Integridade de Documentos)
1. `indexarMetaDocumento` ou `lerDocumentoBytes` chama `hashBytes(buffer)`
2. Função calcula `crypto.createHash('sha256').update(buffer).digest('hex')`
3. Retorna string hex 64 chars — armazenada no metadado / comparada na leitura

### `hashToken` (Credenciais/Tokens)
1. `criarAutenticacao`, `definirCredencial`, `solicitarRecuperacao` chamam `hashToken(valor)`
2. Função aplica algoritmo de hash lento (bcrypt cost 12 / argon2id / PBKDF2 100k iterações — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA])
3. Retorna hash + salt (formato padrão: `$alg$params$hash`) — armazenado no banco

### `backup:cifrar` (Backup Cifrado)
1. Script de backup lê arquivo SQLite, chama `backup:cifrar(buffer, chave)`
2. Função: gera IV aleatório (12 bytes), cifra com AES-256-GCM, retorna `IV + ciphertext + authTag`
3. Arquivo resultante salvo; `backup:chaves` gerencia rotação de chaves (NFR-SEC09)

## 3. Alternative Scenarios
### AS-1: Verificação de integridade sob demanda
* **Ponto de extensão:** UC-04 EX-1 / UC-10 AS-1 passo 5
* **Passos:** `hashBytes(arquivo_atual) === hash_armazenado` → true/false

## 4. Exception Scenarios
### EX-1: Falha na descriptografia de backup (`backup:cifrar` inverso)
* **Condição de erro:** Chave errada, arquivo corrompido, authTag inválido
* **Tratamento:** Erro explícito; não falha silenciosamente; `auditarSeguranca` (ação BACKUP_DECRYPT_FAILED); alerta crítico

### EX-2: Timing attack em comparação de hash
* **Condição de erro:** Comparação `===` em `hashToken` validation
* **Tratamento:** Usar `crypto.timingSafeEqual` ou biblioteca que faça comparação em tempo constante

## 5. Business Rules Envolvidas
* **BR-08:** `hashBytes` garante integridade documento (indexamento + leitura)
* **BR-13:** `hashToken` — tokens nunca em claro; `definirCredencial` só após validação identidade
* **BR-15:** Chaves de backup/cifragem separadas de credenciais runtime
* **NFR-C03:** `hashBytes` SHA-256 — divergência bloqueia uso e alerta

## 6. Non-Functional Requirements Relevantes
* **NFR-SEC01:** SQLite cifrado em repouso; backup cifrado (AES-256-GCM)
* **NFR-SEC03:** Hash de credenciais/tokens com work factor adequado
* **NFR-SEC09:** Rotação de chaves de backup a cada 90 dias
* **NFR-C03:** Verificação `hashBytes` a cada leitura

## 7. Frequency of Use
Muito alta — `hashBytes` a cada indexação/leitura; `hashToken` a cada login/recuperação; backup: agendado (15min)

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Algoritmo `hashToken`: bcrypt (comum, Node nativo via `bcrypt` ou `argon2` — dependência não listada, então provavelmente `crypto` nativo com PBKDF2 ou `bcryptjs` dev dependency não listada)
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] `backup:chaves` armazena chaves em arquivo separado (`.env.keys`?) ou HSM/KMS externo

## 9. Open Issues
* Algoritmo exato e work factor para `hashToken`
* Gestão de chaves de backup (`backup:chaves`) — rotação, armazenamento, recuperação
* `hashBytes` para arquivos grandes: streaming hash (não carregar todo em memória)

## 10. Related Artifacts
* **User Stories:** US-058 (Hash bytes documento), US-059 (Hash token credencial), US-060 (Cifrar backup), US-061 (Verificar integridade)
* **API envolvida:** Funções internas (shared kernel)

---

# Use Case Specification: UC-15 — Health Check e Métricas (`/health`, `/metrics`, OpenTelemetry)

## 1. Characterization
* **Primary Actor:** Sistema de Monitoramento Externo (Prometheus, Load Balancer, k8s, Grafana)
* **Secondary Actors:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Coletor OpenTelemetry, Cliente Prometheus, Alertmanager
* **Stakeholders & Interests:** Operações (uptime, SLA), Engenharia (debug, performance), Negócio (disponibilidade)
* **Trigger:** 
  - Polling: `/health` (liveness/readiness) a cada 10-30s
  - Scrape: `/metrics` a cada 15s (Prometheus)
  - Contínuo: traces OpenTelemetry em requisições
* **Preconditions:** Endpoints expostos (mesmo processo Node.js), instrumentação ativa
* **Postconditions (Success Guarantee):** 
  - `/health`: 200 OK com status do processo, SQLite, migrações, disco
  - `/metrics`: Formato Prometheus com métricas definidas (NFR-O03)
  - Traces: 100% requisições críticas com `traceparent` propagado (NFR-O04)
* **Scope:** Subsistema Transversal — Observabilidade (Endpoints Técnicos)
* **Level:** Subfunction

## 2. Main Scenario (Happy Path)
### `/health` (Liveness)
1. Monitor faz GET `/health`
2. Sistema retorna `{status: "ok", uptime: 3600, version: "1.2.3", timestamp: "..."}` — 200 OK

### `/health/ready` (Readiness)
1. Monitor faz GET `/health/ready`
2. Sistema verifica: SQLite conectado (query `SELECT 1`), migrações aplicadas (tabela `migrations`), disco < 90%, escrita funcional (test write)
3. Se tudo ok: 200 `{status: "ready", checks: {...}}`; senão: 503 `{status: "not_ready", failed: [...]}`

### `/metrics` (Prometheus)
1. Prometheus faz GET `/metrics`
2. Sistema expõe:
   - `http_requests_total{method,route,status}`
   - `http_request_duration_seconds{route,quantile}`
   - `sqlite_write_lock_wait_seconds`
   - `db_size_bytes`
   - `backup_last_success_timestamp`
   - `audit_write_failures`
   - `watch_execution_total{status}`
   - `watch_overlap_count`
3. Content-Type: `text/plain; version=0.0.4; charset=utf-8`

### OpenTelemetry Tracing
1. Middleware inicia span em cada request HTTP crítico (escrita, relatórios, auth)
2. Propaga `traceparent` header para logs (NFR-O01) e chamadas downstream
3. Exporta para collector (OTLP) — [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] endpoint collector

## 3. Alternative Scenarios
### AS-1: Métricas customizadas de domínio
* **Ponto de extensão:** Código de negócio incrementa contadores
* **Exemplos:** `documents_indexed_total{status}`, `vinculos_created_total{origem}`, `cct_validated_total{status}`

## 4. Exception Scenarios
### EX-1: SQLite indisponível em `/health/ready`
* **Tratamento:** Retorna 503 com `failed: ["sqlite"]`; load balancer remove instância do pool

### EX-2: Disco cheio (>90%)
* **Tratamento:** `/health/ready` retorna 503; alerta crítico (NFR-O05); escrita bloqueada

### EX-3: Métricas não disponíveis (endpoint falha)
* **Tratamento:** Prometheus registra scrape failure; alerta após 3 falhas

## 5. Business Rules Envolvidas
* **BR-16:** Health check verifica conectividade SQLite (transacionalidade pressupõe DB vivo)
* **BR-17:** Migrações aplicadas — health check valida versão schema

## 6. Non-Functional Requirements Relevantes
* **NFR-O01:** Logs estruturados com `traceId` correlacionado
* **NFR-O02:** `/health` liveness/readiness com checks definidos
* **NFR-O03:** `/metrics` Prometheus com métricas listadas
* **NFR-O04:** Tracing OpenTelemetry 100% requisições críticas
* **NFR-O05:** Alertas baseados em métricas (latência, erro, lock, backup, disco)
* **NFR-M03:** TypeScript strict — tipagem de métricas/labels

## 7. Frequency of Use
Contínua (polling/scraping/tracing)

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] **Nenhuma biblioteca de observabilidade detectada nas dependências** (Winston, Pino, OpenTelemetry SDK, Prometheus client) — **itens NFR-O01..O06 são metas a implementar**
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Instrumentação manual vs. auto-instrumentação (@opentelemetry/auto-instrumentations-node)

## 9. Open Issues
* Implementação completa: bibliotecas, middleware, dashboards Grafana, regras Alertmanager
* Correlação `traceId` entre logs, métricas, traces
* Custo de performance da instrumentação (overhead < 5%)

## 10. Related Artifacts
* **User Stories:** US-062 (Health endpoint), US-063 (Metrics endpoint), US-064 (Distributed tracing), US-065 (Alertas configurados)
* **API envolvida:** api-specification.md → `GET /health`, `GET /health/ready`, `GET /metrics`

---

# Catálogo Resumo de Casos de Uso

| Código | Nome | Ator Primário | Nível | Frequência |
|--------|------|---------------|-------|------------|
| UC-01 | Cadastrar e Gerenciar Clientes | Analista de Cadastros | User goal | Alta |
| UC-02 | Cadastrar e Gerenciar Contatos | Analista de Cadastros | User goal | Média-alta |
| UC-03 | Indexar Documentos no Histórico | Analista de Documentos/Vínculos | User goal | Alta |
| UC-04 | Consultar e Ler Documentos | Analista de Documentos/Vínculos, Auditor | User goal | Muito alta |
| UC-05 | Gerenciar Vínculos | Analista de Documentos/Vínculos | User goal | Alta |
| UC-06 | Processar CCTs e Aditivos | Analista de Documentos/Vínculos | User goal | Média |
| UC-07 | Gerar Relatórios (HTML/PDF) | Analista, Auditor, Admin | User goal | Média |
| UC-08 | Autenticação e Gestão de Acesso | Todos | User goal | Muito alta |
| UC-09 | Auditoria e Monitoramento | Auditor, Admin | Summary | Contínua |
| UC-10 | Migração e Manutenção de Versão | Admin, DevOps | Summary | Baixa |
| UC-11 | Configuração de Escritório (Onboarding) | Admin do Escritório | User goal | Muito baixa |
| UC-12 | Configuração de Monitoramento/Vigilância | Admin do Escritório | User goal | Baixa |
| UC-13 | Sanitização e Utilitários de Texto | Sistema (interno) | Subfunction | Muito alta |
| UC-14 | Hash e Integridade | Sistema (interno) | Subfunction | Muito alta |
| UC-15 | Health Check e Métricas | Monitoramento Externo | Subfunction | Contínua |

---

# Rastreabilidade Geral (Use Cases ↔ BRs ↔ NFRs)

| UC | BRs Principais | NFRs Principais |
|----|----------------|-----------------|
| UC-01 | BR-01, BR-02, BR-03, BR-12, BR-16, BR-18 | NFR-P01, P02, S01, S04, SEC04, SEC07, O01, O06, C01, C04 |
| UC-02 | BR-02, BR-03, BR-12, BR-16 | NFR-P01, P02, SEC04, SEC07, O01, O06, C01 |
| UC-03 | BR-07, BR-08, BR-12, BR-16, BR-17 | NFR-P02, P04, S01, S04, SEC01, SEC04, SEC07, C03, O01, O05, O06 |
| UC-04 | BR-08, BR-12, BR-16, BR-07 | NFR-P01, SEC01, SEC04, C03, O01, O05, O06 |
| UC-05 | BR-04, BR-05, BR-06, BR-09, BR-10, BR-12, BR-16, BR-19 | NFR-P01, P02, SEC04, O01, O06, C04 |
| UC-06 | BR-09, BR-10, BR-12, BR-16 | NFR-P02, P04, SEC06, O01, O06 |
| UC-07 | BR-11, BR-12, BR-16, BR-08 | NFR-P01, P03, SEC06, SEC04, O01, O05, O06 |
| UC-08 | BR-13, BR-14, BR-15, BR-12, BR-16, BR-03 | NFR-P02, SEC02, SEC03, SEC05, SEC07, SEC08, O01, O05, O06 |
| UC-09 | BR-12, BR-15, BR-16, BR-17 | NFR-O01..O06, C02, C04 |
| UC-10 | BR-16, BR-17, BR-15, BR-12 | NFR-A02, A03, A04, A05, SEC01, O01, O05 |
| UC-11 | BR-01, BR-02, BR-03, BR-14, BR-16, BR-17 | NFR-P02, S04, SEC01, SEC04, O01, O06 |
| UC-12 | BR-07, BR-08, BR-12, BR-16, BR-03 | NFR-P04, S03, SEC01, SEC04, O0| UC-12 | BR-07, BR-08, BR-12, BR-16, BR-03 | NFR-P04, S03, SEC01, SEC04, O01, O05 |
| UC-13 | BR-02, BR-11, BR-01 | NFR-SEC06, M03, M01 |
| UC-14 | BR-08, BR-13, BR-15, NFR-C03 | NFR-SEC01, SEC03, SEC09, C03 |
| UC-15 | BR-16, BR-17 | NFR-O01..O05, M03 |

---

# Notas Finais e Próximos Passos

1. **Validações Pendentes (Human-in-the-loop):** Todos os itens marcados com `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]` devem ser revisados por Product Owner, Engenharia e Compliance antes de baseline formal. Principais gaps:
   - Motor de banco operacional definitivo (better-sqlite3 vs. pg/Postgres)
   - Fluxo exato de `bootstrapAdministrador` (console vs. e-mail)
   - Algoritmo e work factor de `hashToken`
   - Regras de `normalizarTexto` (acentos, case, pontuação)
   - Versionamento de documentos (nova versão = novo registro ou update?)
   - Comportamento cascata em `excluirCadastro` (BR-18)
   - Implementação de observabilidade (bibliotecas, dashboards, alertas)
   - DDL transacional em SQLite para migrações

2. **Dependências de Downstream:** 
   - **User Stories** (US-001 a US-065) referenciam estes códigos UC-xx — não alterar numeração
   - **User Flows** (user-flows.md) mapeiam transições entre UCs
   - **API Specification** (api-specification.md) define contratos HTTP para cada UC
   - **Test Plans** baseiam cenários EX-x e AS-x para casos de teste

3. **Arquitetura de Referência:** 
   - Monolito Node.js (TypeScript strict) + Vue 3 (Vite) + better-sqlite3 (WAL) + SQLite cifrado
   - Single-instance, escala vertical, zero auto-scaling horizontal (NFR-S03)
   - Multi-tenant por `office_id` com isolamento transacional (`withPostgresOfficeTransaction` / equivalente SQLite)
   - Auditoria imutável (inserts only) + integridade SHA-256 (`hashBytes`) + tokens hasheados (`hashToken`)

4. **Riscos Técnicos Identificados:**
   - DDL não-transacional em SQLite pode violar BR-17/NFR-A05 em migrações complexas
   - `playwright` headless em produção consome recursos significativos (NFR-S03) — dimensionar host
   - Single point of failure (NFR-A04) — RTO/RPO dependem de backup/testes de recuperação rigorosos
   - Ausência de libs de observabilidade — esforço de implementação não trivial (NFR-O01..O06)

5. **Próximos Artefatos a Gerar:**
   - `user-stories.md` (referenciando UC-01 a UC-15)
   - `user-flows.md` (diagramas Mermaid/PlantUML)
   - `api-specification.md` (OpenAPI 3.1)
   - `test-plan.md` (cenários por UC, dados de teste, critérios de aceitação)

---

**Fim do Documento — Use Cases Specification (dist-historico v1.0)**