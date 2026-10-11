# Non-Functional Requirements (NFR) — mte-mediador-monitor-unificado

> **Versão:** 1.0 · **Status:** Draft | Aprovado · **Owner:** Engenharia/Arquitetura

## 1. Performance
* **NFR-P01:** Latência de requisições de leitura (consultas de CCT e cadastros) deve manter p95 < 300ms, considerando a natureza de arquivo único do `better-sqlite3`.
* **NFR-P02:** Operações de escrita (consolidação de CCTs) devem implementar estratégia de retry/backoff para mitigar o *single-writer lock* do SQLite, garantindo que a requisição não falhe por timeout de banco.
* **NFR-P03:** O tempo de extração de conteúdo via `pdf-parse` e `word-extractor` deve ser processado de forma assíncrona ou via scripts de background (`check:auto`) para não bloquear a thread principal do Node.js.
* **Método de medição:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Medição via logs de tempo de execução de funções críticas e monitoramento de locks do SQLite.

## 2. Escalabilidade
* **NFR-S01:** O sistema deve suportar a carga de trabalho de um nó único (monolítico), sem necessidade de escalonamento horizontal, conforme premissa de topologia do BRD.
* **NFR-S02:** O throughput de consultas de CNPJ deve ser otimizado via cache local (evitando buscas duplicadas em `criarConsultaCnpj`) para não saturar a dependência externa.
* **NFR-S03:** A concorrência de escrita deve ser limitada por mecanismos de reserva (ex: `reservarConsolidacao`) para evitar corrupção ou travamento do banco de dados.

## 3. Disponibilidade & Confiabilidade
* **NFR-A01:** Uptime mínimo de 99% para as rotinas de monitoramento automatizado (`node-cron`).
* **NFR-A02:** RTO (Recovery Time Objective) ≤ 4h, baseado na restauração de backup do arquivo `.sqlite` e variáveis de ambiente `.env`.
* **NFR-A03:** RPO (Recovery Point Objective) ≤ 24h, dependendo da frequência de backup do arquivo de banco de dados (estratégia a definir operacionalmente).
* **NFR-A04:** Integridade de dados garantida via `fingerprintDocumentos` para evitar duplicidade de CCTs e aditivos na base consolidada.

## 4. Segurança
* **NFR-SEC01:** Senhas de usuários devem ser armazenadas exclusivamente via hashes seguros (`criarHashSenha`), proibindo armazenamento em texto claro.
* **NFR-SEC02:** Todas as requisições sensíveis devem ser validadas por `exigirCsrf` e `exigirPermissao` para prevenir ataques de Cross-Site Request Forgery e escalada de privilégios.
* **NFR-SEC03:** Acesso administrativo deve ser controlado via `auth:bootstrap` e tokens de recuperação protegidos por `hashToken`.
* **NFR-SEC04:** Eliminação de todas as 26 chamadas `console.*` residuais identificadas no diagnóstico para evitar vazamento de informações sensíveis em logs de produção.

## 5. Usabilidade & Acessibilidade
* **NFR-U01:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Interface responsiva para visualização de painéis de controle em resoluções de 1366px a 1920px.
* **NFR-U02:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] O documento final gerado por `renderizarCctMarkdown` deve ser legível e formatado para exportação simples.

## 6. Observabilidade
* **NFR-O01:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Implementar logs estruturados para substituir as chamadas `console.log` atuais, permitindo rastrear falhas de extração de CCT.
* **NFR-O02:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Implementar sistema de alertas para falhas de coleta do `playwright` decorrentes de mudanças de layout em fontes externas.
* **NFR-O03:** [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Implementar endpoint de health-check para monitorar a conectividade com o arquivo `better-sqlite3` e o serviço SMTP.

## 7. Manutenibilidade & Qualidade de Código
* **NFR-M01:** Redução da complexidade ciclomática de funções críticas: `criarAcessoHttp` (atual 61), `criarAutenticacao` (atual 22) e `tratar` (atual 26) devem ser refatoradas em funções menores.
* **NFR-M02:** Cobertura de testes via `vitest` deve abranger obrigatoriamente os fluxos de `test:smoke`, `test:auth-ui` e `test:review`.
* **NFR-M03:** Tipagem estrita via TypeScript em todo o projeto, validada via script `typecheck`.

## 8. Compliance & Regulatório
* **NFR-C01:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Conformidade com a LGPD no tratamento de dados de contato de clientes e administradores.
* **NFR-C02:** Auditabilidade de extração: a função `validarExtracaoCct` não deve mascarar erros, garantindo que a fonte textual seja autêntica.

## 9. Portabilidade & Compatibilidade
* **NFR-PO01:** Compatibilidade de execução em ambiente Node.js via `tsx` e navegadores suportados pelo `playwright`.
* **NFR-PO02:** Independência de infraestrutura de banco de dados complexa, utilizando `better-sqlite3` para facilitar a portabilidade do nó único.

## 10. Custo (Cost Efficiency)
* **NFR-CO01:** [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código] [INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Manter custo de infraestrutura reduzido através de implantação em servidor de baixo recurso, coerente com a stack de banco de dados em arquivo.

## 11. Rastreabilidade

| ID | Requisito Relacionado (BRD) | Prioridade | Status de Validação |
| :--- | :--- | :--- | :--- |
| NFR-P02 | Premissa: persistência em better-sqlite3 | Must | Não validado |
| NFR-S01 | Premissa: implantação em nó único | Must | Não validado |
| NFR-SEC01 | Premissa: senhas protegidas por `criarHashSenha` | Must | Não validado |
| NFR-SEC02 | Premissa: `exigirCsrf` e `exigirPermissao` | Must | Não validado |
| NFR-SEC04 | Risco: Vazamento de informação em logs | Must | Não validado |
| NFR-A04 | Premissa: `fingerprintDocumentos` | Should | Não validado |
| NFR-M01 | Risco: Complexidade ciclomática alta em auth | Must | Não validado |
| NFR-O02 | Risco: Quebra do monitoramento (playwright) | Should | Não validado |
| NFR-C02 | Premissa: `validarExtracaoCct` auditável | Must | Não validado |