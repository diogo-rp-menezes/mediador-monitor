# Use Case Specification: UC-01 — Autenticação de Usuário e Acesso ao Sistema

## 1. Characterization
* **Primary Actor:** Administrador / Usuário do Sistema
* **Secondary Actors:** N/A
* **Stakeholders & Interests:** Equipe de Segurança (garantir que apenas usuários autorizados acessem dados sensíveis de CCTs).
* **Trigger:** Usuário tenta acessar a interface do sistema ou realizar uma requisição HTTP.
* **Preconditions:** O usuário deve possuir credenciais previamente cadastradas no banco de dados `better-sqlite3`.
* **Postconditions (Success Guarantee):** Uma sessão válida é estabelecida via `cookieSessao`, permitindo o acesso a funcionalidades protegidas por `exigirPermissao`.
* **Scope:** Módulo de Autenticação (`src/autenticacao.ts`, `src/auth-http.ts`).
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. O usuário fornece suas credenciais de acesso.
2. O sistema processa a autenticação através da função `criarAutenticacao`.
3. O sistema valida a senha utilizando a função `criarHashSenha` para comparação com o hash armazenado.
4. O sistema gera e associa um `cookieSessao` ao navegador do usuário.
5. O sistema valida a requisição via `validarRequisicao` e `exigirCsrf`.
6. O usuário é redirecionado para a página inicial do sistema com acesso concedido.

## 3. Alternative Scenarios
### AS-1: Recuperação de Senha
* **Ponto de extensão:** Passo 1 (Usuário esqueceu a senha).
* **Passos:**
  1. O usuário aciona o fluxo `solicitarRecuperacao`.
  2. O sistema gera um token protegido por `hashToken` e envia via `nodemailer`.
  3. O usuário utiliza a função `recuperar` para validar o token.
  4. O usuário define uma nova credencial via `definirCredencial`.
* **Retorno ao fluxo principal:** Sim, retorna ao passo 1 para login com a nova senha.

## 4. Exception Scenarios
### EX-1: Credenciais Inválidas
* **Ponto de extensão:** Passo 3.
* **Condição de erro:** Senha incorreta ou usuário inexistente.
* **Tratamento:** O sistema nega o acesso e exibe mensagem de erro de autenticação.

### EX-2: Falha de Validação CSRF
* **Ponto de extensão:** Passo 5.
* **Condição de erro:** Token CSRF ausente ou inválido na requisição.
* **Tratamento:** A função `exigirCsrf` bloqueia a requisição e retorna erro de segurança.

## 5. Business Rules Envolvidas
* **BR-AUTH-01:** Senhas devem ser obrigatoriamente protegidas por hash (`criarHashSenha`).
* **BR-AUTH-02:** Requisições sensíveis devem obrigatoriamente passar por `exigirCsrf` e `exigirPermissao`.

## 6. Non-Functional Requirements Relevantes
* **NFR-SEC01:** Armazenamento de senhas via hashes seguros.
* **NFR-SEC02:** Validação de CSRF e permissões em requisições sensíveis.
* **NFR-M01:** Necessidade de refatoração de `criarAutenticacao` (CC 22) e `criarAcessoHttp` (CC 61).

## 7. Frequency of Use
Alta frequência — realizado a cada novo acesso ou expiração de sessão.

## 8. Assumptions
* Assume-se que o serviço SMTP está configurado via `dotenv` para o fluxo de recuperação.

## 9. Open Issues
* Nenhuma identificada para este fluxo.

## 10. Related Artifacts
* **User Stories:** US-AUTH-01
* **API envolvida:** `src/auth-http.ts`

---

# Use Case Specification: UC-02 — Monitoramento e Extração de CCTs

## 1. Characterization
* **Primary Actor:** Sistema (Processo Automatizado)
* **Secondary Actors:** Fontes Externas de Documentos (Sindicatos/Órgãos Públicos)
* **Stakeholders & Interests:** Analistas Jurídicos (garantir que a base de CCTs esteja atualizada sem intervenção manual).
* **Trigger:** Agendamento do `node-cron` (scripts `check:auto` e `seed:auto`).
* **Preconditions:** Configurações de monitoramento carregadas via `loadWatchConfig`.
* **Postconditions (Success Guarantee):** Novos documentos são coletados, processados e armazenados no `better-sqlite3` com seus respectivos fingerprints.
* **Scope:** Módulo de Coleta e Extração (`playwright`, `pdf-parse`, `word-extractor`).
* **Level:** Summary

## 2. Main Scenario (Happy Path)
1. O `node-cron` dispara a rotina de verificação automática.
2. O sistema carrega as fontes de monitoramento via `loadWatchConfig`.
3. O `playwright` navega pelas fontes externas e identifica novos documentos.
4. O sistema baixa os arquivos (PDF ou DOC).
5. O sistema extrai o conteúdo textual utilizando `pdf-parse` ou `word-extractor`.
6. O sistema gera um `fingerprintDocumentos` para evitar duplicidade.
7. O sistema armazena o conteúdo bruto e a referência da fonte no banco de dados.

## 3. Alternative Scenarios
### AS-1: Reanálise Manual
* **Ponto de extensão:** Passo 1 (Disparo manual).
* **Passos:**
  1. O administrador executa o script `reanalisar`.
  2. O sistema força a varredura de todas as fontes configuradas, ignorando caches temporários.
* **Retorno ao fluxo principal:** Sim, segue a partir do passo 2.

## 4. Exception Scenarios
### EX-1: Mudança de Layout na Fonte Externa
* **Ponto de extensão:** Passo 3.
* **Condição de erro:** O `playwright` não encontra os seletores definidos no `loadWatchConfig`.
* **Tratamento:** O sistema gera um alerta de falha de coleta [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] e registra o erro nos logs.

### EX-2: Falha na Extração de Texto
* **Ponto de extensão:** Passo 5.
* **Condição de erro:** Arquivo corrompido ou formato não suportado.
* **Tratamento:** A função `validarExtracaoCct` identifica a falha e marca o documento como "Erro de Extração" para auditoria manual, sem mascarar o erro.

## 5. Business Rules Envolvidas
* **BR-EXT-01:** A extração deve ser auditável; `validarExtracaoCct` não deve mascarar falhas.
* **BR-EXT-02:** Documentos duplicados devem ser evitados via `fingerprintDocumentos`.

## 6. Non-Functional Requirements Relevantes
* **NFR-P03:** Extração via `pdf-parse` e `word-extractor` deve ser assíncrona/background.
* **NFR-A01:** Uptime de 99% para rotinas `node-cron`.
* **NFR-A04:** Integridade via `fingerprintDocumentos`.
* **NFR-O02:** Alertas para falhas de layout no `playwright`.

## 7. Frequency of Use
Média frequência — execuções periódicas via cron.

## 8. Assumptions
* Assume-se que os navegadores do `playwright` estão instalados via `playwright:install`.

## 9. Open Issues
* Dependência de fontes externas cujos layouts podem mudar sem aviso prévio.

## 10. Related Artifacts
* **User Stories:** US-MON-01
* **API envolvida:** `loadWatchConfig`, `fingerprintDocumentos`

---

# Use Case Specification: UC-03 — Consolidação e Auditoria de Cadastro de Empresas

## 1. Characterization
* **Primary Actor:** Administrador / Analista de Cadastro
* **Secondary Actors:** Serviço de Consulta de CNPJ [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]
* **Stakeholders & Interests:** Compliance/Jurídico (garantir que a empresa vinculada à CCT esteja corretamente cadastrada).
* **Trigger:** Necessidade de vincular um documento a uma empresa ou auditar cadastros existentes.
* **Preconditions:** O usuário deve ter permissão de administrador (`exigirPermissao`).
* **Postconditions (Success Guarantee):** Cadastro da empresa atualizado, validado e vinculado aos documentos correspondentes.
* **Scope:** Módulo de Cadastro e Consolidação (`src/index.ts`, `criarConsultaCnpj`).
* **Level:** User goal

## 2. Main Scenario (Happy Path)
1. O usuário inicia a auditoria de cadastro via `auditarCadastro`.
2. O sistema solicita ou valida o CNPJ da empresa.
3. O sistema utiliza `normalizarCnpj` e `cnpjValido` para sanitização.
4. O sistema executa `criarConsultaCnpj` para obter dados cadastrais atualizados.
5. O sistema verifica se a empresa já existe no cache local para evitar consultas duplicadas.
6. O sistema consolida as informações e vincula a empresa aos documentos de CCT via `reservarConsolidacao`.
7. O sistema confirma a atualização do cadastro.

## 3. Alternative Scenarios
### AS-1: Migração de Dados Legados
* **Ponto de extensão:** Passo 1 (Carga inicial).
* **Passos:**
  1. O administrador executa o script `importar-legado`.
  2. O sistema chama `migrarCadastros` e `migrarAutenticacao`.
  3. O sistema aplica `protegerLegado` para garantir retrocompatibilidade.
* **Retorno ao fluxo principal:** Sim, os dados migrados passam a ser auditáveis via `auditarCadastro`.

## 4. Exception Scenarios
### EX-1: CNPJ Inválido
* **Ponto de extensão:** Passo 3.
* **Condição de erro:** CNPJ não passa na validação de dígitos verificadores.
* **Tratamento:** O sistema interrompe o processo e solicita a correção do dado.

### EX-2: Concorrência de Escrita no Banco
* **Ponto de extensão:** Passo 6.
* **Condição de erro:** Outro processo está escrevendo no `better-sqlite3` (single-writer lock).
* **Tratamento:** O sistema utiliza `reservarConsolidacao` e implementa retry/backoff conforme NFR-P02.

## 5. Business Rules Envolvidas
* **BR-CAD-01:** Toda consulta de CNPJ deve ser normalizada e validada antes da requisição externa.
* **BR-CAD-02:** A migração de legado deve preservar integralmente vínculos históricos.

## 6. Non-Functional Requirements Relevantes
* **NFR-P02:** Estratégia de retry para mitigar lock do SQLite.
* **NFR-S02:** Otimização de throughput de CNPJ via cache local.
* **NFR-S03:** Limitação de concorrência via `reservarConsolidacao`.

## 7. Frequency of Use
Baixa/Média frequência — concentrada em períodos de atualização de base ou novos clientes.

## 8. Assumptions
* [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Assume-se que o serviço de consulta de CNPJ externo possui estabilidade e tempo de resposta compatível com o NFR-P01.

## 9. Open Issues
* Identificação do fornecedor real do serviço de consulta de CNPJ (item em aberto no BRD).

## 10. Related Artifacts
* **User Stories:** US-CAD-01
* **API envolvida:** `criarConsultaCnpj`, `normalizarCnpj`, `reservarConsolidacao`