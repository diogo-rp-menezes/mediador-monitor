# UML & C4 Diagrams (Diagram as Code) — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Owner:** Arquitetura/Eng Lead · **Status:** Draft
> Este artefato segue a abordagem **Diagram as Code (DaC)**: os diagramas são texto versionado (Mermaid), nunca imagens estáticas coladas aqui. Toda alteração de arquitetura relevante deve atualizar este arquivo no mesmo PR que altera o código.
>
> **Fontes:** System Architecture Document (SAD), User Flows, State Machines (FSM), diagnóstico determinístico do workspace. Elementos não detectados diretamente no código estão marcados com **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**.

## 1. Diagrama de Containers (C4 Model — Nível 2)

A topologia real é um **monolito single-process Node.js/TypeScript**: um único processo hospeda o scheduler (`node-cron`), o scraper (`playwright`), o pipeline de extração (`pdf-parse`/`word-extractor`), o servidor HTTP próprio (`auth-http.ts`) e a persistência em arquivo SQLite (`better-sqlite3`, SQL cru, sem ORM). **Não há** API Gateway, load balancer, message broker, cache distribuído ou réplicas — nada disso existe na stack verificada.

```mermaid
C4Container
    title Diagrama de Containers - mte-mediador-monitor-unificado

    Person(operador, "Operador / Administrador", "Acessa a interface administrativa via navegador (HTTP local/VPN)")

    System_Boundary(c1, "Servidor Único — mte-mediador-monitor-unificado (processo Node.js único)") {
        Container(http, "Servidor HTTP Admin/UI", "HTTP nativo Node.js (src/auth-http.ts)", "Login, logout, recuperação de senha, painel de auditoria, CSRF e permissões")
        Container(scheduler, "Scheduler de Rotinas", "node-cron 4.2 (in-process)", "Dispara check:auto, seed:auto e consolidação periódica")
        Container(scraper, "Coletor / Scraper", "playwright 1.48 (Chromium headless)", "Navega portais oficiais e baixa PDFs/Word de CCTs")
        Container(extractor, "Extrator e Validador de CCT", "pdf-parse 1.1 + word-extractor 1.0 + zod 3.23", "Extrai texto bruto e valida via validarExtracaoCct")
        Container(core, "Núcleo de Domínio", "TypeScript 5.6", "fingerprintDocumentos, reservarConsolidacao, criarConsultaCnpj, renderizarCctMarkdown")
        Container(auth, "Autenticação e Autorização", "crypto nativo Node (src/autenticacao.ts)", "criarHashSenha, hashToken, exigirCsrf, exigirPermissao, sessões")
        ContainerDb(sqlite, "Banco de Dados SQLite", "better-sqlite3 11.5 (arquivo .sqlite, SQL cru)", "CCTs, aditivos, fingerprints, usuários, sessões, tokens, locks de consolidação, cache CNPJ")
    }

    System_Ext(portais, "Portais Oficiais de CCT", "Fontes web de convenções coletivas (HTML/JS pesado)")
    System_Ext(cnpj, "API Externa de CNPJ", "Consulta/enriquecimento de dados de empresas [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA: endpoint não documentado no código]")
    System_Ext(smtp, "Servidor SMTP", "Envio de e-mails de recuperação e alertas de falha de scraping")

    Rel(operador, http, "Usa", "HTTP/HTTPS (local ou VPN)")
    Rel(http, auth, "Valida sessão, CSRF e permissão", "chamada in-process")
    Rel(http, core, "Dispara auditoria/consolidação", "chamada in-process")
    Rel(scheduler, scraper, "Dispara coleta periódica", "chamada in-process")
    Rel(scraper, portais, "Navega e baixa documentos", "HTTPS/HTML via Chromium")
    Rel(scraper, extractor, "Entrega arquivos baixados", "FS local temporário")
    Rel(extractor, core, "Texto validado para consolidação", "chamada in-process")
    Rel(core, sqlite, "Lê/Escreve (transações, locks)", "better-sqlite3 / SQL cru")
    Rel(auth, sqlite, "Persiste usuários, sessões, tokens", "better-sqlite3 / SQL cru")
    Rel(core, cnpj, "Consulta com cache em memória", "HTTPS/REST")
    Rel(scheduler, smtp, "Alertas de falha consecutiva", "SMTP via nodemailer 6.9")
    Rel(auth, smtp, "E-mail de recuperação de senha", "SMTP via nodemailer 6.9")
```

**Notas de topologia:**
- Todos os containers dentro do boundary compartilham o **mesmo event loop e o mesmo arquivo `.sqlite`** — a comunicação é síncrona, in-process (chamadas de função TypeScript). Não há IPC, filas ou eventos distribuídos.
- O backup é cópia periódica do arquivo `.sqlite` para destino externo (NFR-A02/A03) — mecanismo de backup específico **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]**.
- Health-check (`/healthz`) e endpoint de métricas **não estão implementados** (NFR-O03) — omitidos do diagrama por não existirem no código.

## 2. Diagramas de Sequência (Fluxos Críticos)

Derivados dos fluxos reais documentados no artefato **User Flows** (Flows 1–3) e das FSMs do artefato **State Machines**. Como as FSMs são inferidas (não há colunas de estado detectadas no schema), os estados referenciados carregam a mesma ressalva de validação.

### 2.1 Autenticação e Recuperação de Acesso (Flow 1)

Referencia a FSM de Sessão (`ANONIMO → AUTENTICADO`, `RECUPERACAO_SOLICITADA`).

```mermaid
sequenceDiagram
    autonumber
    actor Usuario as Usuário Final / Administrador
    participant HTTP as Servidor HTTP (auth-http.ts)
    participant Auth as Autenticação (autenticacao.ts)
    participant DB as SQLite (better-sqlite3)
    participant SMTP as Servidor SMTP (nodemailer)

    Usuario->>HTTP: POST /login (usuário + senha)
    HTTP->>Auth: criarAutenticacao / validar credenciais
    Auth->>DB: Buscar usuário e hash (criarHashSenha)
    DB-->>Auth: Registro de usuário
    alt Credenciais válidas
        Auth->>DB: Criar sessão (cookieSessao)
        DB-->>Auth: Sessão persistida
        Auth-->>HTTP: Sessão ativa [estado: AUTENTICADO]
        HTTP-->>Usuario: 200 OK + cookie de sessão (redirect dashboard)
    else Credenciais inválidas
        Auth-->>HTTP: Falha de autenticação [estado: ANONIMO]
        HTTP-->>Usuario: Erro "Credenciais inválidas"
    end

    Usuario->>HTTP: solicitarRecuperacao (e-mail)
    HTTP->>Auth: Gerar token (hashToken com expiração)
    Auth->>DB: Persistir hashToken [estado: RECUPERACAO_SOLICITADA]
    Auth->>SMTP: Enviar e-mail com link de recuperação
    SMTP-->>Usuario: E-mail recebido
    Usuario->>HTTP: Acessa link /recuperar?token=...
    HTTP->>Auth: Validar token
    alt Token válido e não expirado
        Usuario->>HTTP: definirCredencial (nova senha)
        HTTP->>Auth: Atualizar hash, invalidar token e sessões antigas
        Auth->>DB: UPDATE senha + invalidar token
        HTTP-->>Usuario: Sucesso — redireciona para login [estado: ANONIMO]
    else Token expirado/inválido
        Auth-->>HTTP: Rejeição (NFR-SEC03)
        HTTP-->>Usuario: Erro "Token expirado/inválido"
    end
```

### 2.2 Monitoramento e Extração de CCTs (Flow 2)

Referencia a FSM do Documento CCT (`DETECTADO → BAIXADO → EXTRAIDO`) e a FSM do Job de Coleta (`AGENDADO → EM_EXECUCAO → SUCESSO/FALHA`).

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Scheduler (node-cron)
    participant Scraper as Coletor (playwright)
    participant Portal as Portal Oficial de CCT
    participant FS as FS Local (temporário)
    participant Extrator as Extrator (pdf-parse/word-extractor)
    participant Core as Núcleo (fingerprintDocumentos)
    participant DB as SQLite (better-sqlite3)
    participant SMTP as Servidor SMTP (nodemailer)

    Cron->>Cron: tick_cron [estado job: AGENDADO → EM_EXECUCAO]
    Cron->>Scraper: check:auto — carregar loadWatchConfig
    Scraper->>Portal: Navegar fonte (Chromium headless)
    alt Coleta bem-sucedida
        Portal-->>Scraper: Página/listagem de documentos
        Scraper->>FS: Download PDF/Word [estado doc: DETECTADO → BAIXADO]
        Scraper->>Extrator: Processar arquivo
        alt Extração bem-sucedida
            Extrator-->>Scraper: Texto bruto [estado doc: EXTRAIDO]
            Scraper->>Core: fingerprintDocumentos(texto/metadados)
            Core->>DB: Verificar fingerprint existente
            DB-->>Core: Resultado (inédito ou duplicado)
            Core->>DB: Persistir dados brutos para validarExtracaoCct
            Cron->>Cron: concluido [estado job: SUCESSO — zera contador de falhas]
        else Falha de extração
            Extrator-->>Scraper: Exceção/texto vazio [estado doc: FALHA_EXTRACAO]
            Scraper->>Cron: erro recuperável (retry no próximo ciclo)
        end
    else Falha de scraping (timeout / mudança de layout)
        Portal--xScraper: Erro de navegação/seletor [estado doc: FALHA_COLETA]
        Scraper->>Cron: erro — incrementa contador de falhas [estado job: FALHA]
        alt 3ª falha consecutiva (NFR-O02)
            Cron->>SMTP: Alerta "estrutura da fonte externa alterada" [estado job: FALHA_CONSECUTIVA_CRITICA]
        end
    end
```

### 2.3 Auditoria e Consolidação de Dados (Flow 3)

Referencia a FSM do Documento CCT (`EXTRAIDO → VALIDADO → CONSOLIDADO/DUPLICADO`) e a FSM da Reserva de Consolidação (`LIVRE → RESERVADO/AGUARDANDO → LIBERADO`).

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador de Cadastro / Analista Jurídico
    participant HTTP as Servidor HTTP (auth-http.ts)
    participant Auth as exigirCsrf + exigirPermissao
    participant Core as Núcleo de Domínio
    participant DB as SQLite (better-sqlite3)

    Operador->>HTTP: Acessar painel de auditoria
    HTTP->>Auth: Validar sessão (cookieSessao), CSRF e permissão
    alt Sessão válida e autorizada
        Auth-->>HTTP: OK [estado sessão: AUTENTICADO]
        Operador->>HTTP: Executar validarExtracaoCct(documento)
        HTTP->>Core: Validar schema (zod)
        alt Dados corretos
            Core-->>HTTP: Aprovado [estado doc: EXTRAIDO → VALIDADO]
            Operador->>HTTP: Executar validarAlteracoes (evidências)
            HTTP->>Core: reservarConsolidacao
            Core->>DB: Adquirir lock de escrita (tabela de locks)
            alt Lock disponível
                DB-->>Core: RESERVADO
                Core->>DB: Verificar fingerprintDocumentos
                alt Fingerprint inédito
                    Core->>DB: INSERT consolidação (transação) + commit
                    DB-->>Core: OK [estado doc: CONSOLIDADO; lock: LIBERADO]
                    HTTP-->>Operador: renderizarCctMarkdown — documento final
                else Fingerprint já existente
                    Core->>DB: rollback / sem escrita [estado doc: DUPLICADO — idempotência NFR-A04]
                    HTTP-->>Operador: "Documento já consolidado"
                end
            else Lock ocupado por outra rotina
                DB-->>Core: AGUARDANDO (retry com backoff — NFR-P02)
                alt Timeout de tentativas
                    Core-->>HTTP: Lock não obtido [lock: LIBERADO; doc permanece VALIDADO]
                    HTTP-->>Operador: "Documento está sendo consolidado por outro usuário"
                end
            end
        else Falha de validação
            Core-->>HTTP: Rejeitado [estado doc: FALHA_VALIDACAO — recuperável via CLI reanalisar]
            HTTP-->>Operador: "Falha ao processar arquivo. Verifique a integridade do documento fonte."
        end
    else Sessão expirada ou sem permissão
        Auth-->>HTTP: Rejeição (exigirPermissao / exigirCsrf)
        HTTP-->>Operador: Redirect login — "Sua sessão expirou"
    end
```

## 3. Diagrama de Componentes (visão estática)

Visão interna do processo único, útil porque o diagrama de containers não evidencia o acoplamento in-process entre módulos de `src/` e o acesso compartilhado ao SQLite.

```mermaid
graph TD
    subgraph "Processo Node.js único (src/)"
        CRON[node-cron<br/>check:auto / seed:auto]
        HTTP[auth-http.ts<br/>criarAcessoHttp / tratar / validarRequisicao]
        AUTH[autenticacao.ts<br/>criarAutenticacao / criarHashSenha / hashToken]
        CLI[auth-cli.ts + scripts<br/>auth:bootstrap / auth:redefinir / seed / importar-legado / reanalisar]
        SCRAPE[Scraper<br/>playwright]
        EXTR[Extrator<br/>pdf-parse / word-extractor]
        VALID[Validador<br/>validarExtracaoCct zod]
        CORE[Núcleo<br/>fingerprintDocumentos / reservarConsolidacao<br/>criarConsultaCnpj / renderizarCctMarkdown]
        MAIL[Notificações<br/>nodemailer]
    end

    DB[(SQLite — arquivo .sqlite<br/>better-sqlite3, SQL cru)]
    PORTAL[Portais oficiais de CCT]
    CNPJ[API externa de CNPJ]
    SMTP[Servidor SMTP]

    CRON --> SCRAPE
    SCRAPE --> PORTAL
    SCRAPE --> EXTR
    EXTR --> VALID
    VALID --> CORE
    HTTP --> AUTH
    HTTP --> CORE
    CLI --> AUTH
    CLI --> DB
    AUTH --> DB
    CORE --> DB
    CORE --> CNPJ
    CORE --> MAIL
    CRON --> MAIL
    MAIL --> SMTP
```

## 4. Diagrama de Casos de Uso / Atividade

Fluxo lógico consolidado do pipeline de documentos, alinhado à FSM principal do artefato State Machines **[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]** (estados não confirmados em colunas de schema, pois não há `schema.sql` versionado).

```mermaid
flowchart TD
    Start([Tick node-cron / disparo manual]) --> Load[Carregar loadWatchConfig]
    Load --> Nav[Navegar fonte via playwright]
    Nav --> ColetaOk{Download OK?}
    ColetaOk -- Não --> FalhaColeta[FALHA_COLETA<br/>retry no próximo ciclo]
    FalhaColeta --> TresFalhas{3 falhas consecutivas?}
    TresFalhas -- Sim --> Alerta[Alerta por e-mail via nodemailer]
    TresFalhas -- Não --> Start
    Alerta --> Start
    ColetaOk -- Sim --> Extrair[Extrair texto pdf-parse / word-extractor]
    Extrair --> ExtrOk{Extração OK?}
    ExtrOk -- Não --> FalhaExtr[FALHA_EXTRACAO<br/>retry / re-download]
    FalhaExtr --> Start
    ExtrOk -- Sim --> Validar[validarExtracaoCct - schema zod]
    Validar --> ValOk{Validação OK?}
    ValOk -- Não --> FalhaVal[FALHA_VALIDACAO<br/>recuperável via CLI reanalisar]
    FalhaVal --> Validar
    ValOk -- Sim --> Lock[reservarConsolidacao - lock SQLite]
    Lock --> LockOk{Lock obtido?}
    LockOk -- Não --> Aguarda[AGUARDANDO - retry com backoff]
    Aguarda --> Lock
    LockOk -- Sim --> Finger{fingerprintDocumentos inédito?}
    Finger -- Não --> Dup([DUPLICADO — sem escrita, idempotente])
    Finger -- Sim --> Commit[INSERT em transação + commit]
    Commit --> Fim([CONSOLIDADO — estado terminal])
```

## 5. Convenções de Manutenção

- **Fonte única da verdade:** este arquivo é gerado/atualizado pelo próprio fluxo de documentação — não editar diagramas fora deste artefato.
- **Sem binários:** nunca anexar `.png`/`.jpg`/`.drawio`; o diagrama é sempre o bloco Mermaid acima.
- **Atualização obrigatória:** qualquer PR que altere fluxos entre módulos de `src/`, contratos do servidor HTTP (`auth-http.ts`), integrações externas (portais, SMTP, CNPJ) ou a topologia de nó único deve atualizar a seção correspondente aqui.
- **Validações humanas pendentes:** (1) confirmar no código o endpoint real da API de CNPJ; (2) confirmar a existência da tabela de locks e das colunas de estado no SQLite antes de promover as FSMs a contrato; (3) confirmar o mecanismo de backup do arquivo `.sqlite`.