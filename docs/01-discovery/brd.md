# Business Requirements Document (BRD) — Sistema de Gestão de Documentos e Autenticação

> **Versão:** 1.0 · **Status:** Draft | Em Revisão | Aprovado · **Owner:** Product Lead · **Última atualização:** 02/11/2025  
> **Stakeholders:** Sponsor, Product, Engenharia, Design, Compliance  

## 1. Executive Summary & Vision
O sistema proposto visa centralizar a autenticação de usuários, o gerenciamento de documentos de clientes e o processamento de convenções coletivas de trabalho (CCT) em uma aplicação web/server‑side. Atualmente, as equipes enfrentam dificuldades para validar identidades de forma segura, armazenar e recuperar documentos variados (PDF, Word, imagens) e garantir a conformidade de cadastros escritoriais. A solução pretende utilizar o banco **better‑sqlite3** para persistência, **node‑cron** para tarefas agendadas, **nodemailer** para comunicações, **pdf‑parse** e **word‑extractor** para extração de conteúdo, **playwright** para automação de navegação quando necessário e **zod** para validação de dados, oferecendo uma plataforma confiável e auditável para operações de back‑office.

## 2. Problem Statement
* **Problema central:** Falta de um módulo unificado que trate autenticação segura, validação de documentos e gerenciamento de cadastros de clientes, resultando em processos manuais, riscos de segurança e inconsistências de dados.  
* **Evidências:** O glossário extraído do código revela termos como `login`, `logout`, `solicitarRecuperacao`, `criarHashSenha`, `verificarSenha`, `exigirCsrf`, `tratarCadastrosContexto`, `detalheCliente`, `salvarCliente`, `listarClientes`, `auditarCadastro`, `auditarSeguranca`, `normalizarCnpj`, `criarConsultaCnpj`, `processar documentos` (`pdf-parse`, `word-extractor`), `controlarDownloadsChromium`, `renderizarCctMarkdown`, `consolidarCct`, entre outros, indicando que o código já contém lógica para essas funcionalidades, porém sem um modelo de dados ou rotas definidas.  
* **Custo de não agir (Cost of Inaction):** Continuação de processos manuais aumenta a probabilidade de fraudes, retrabalho na validação de CNPJ e documentos, perda de produtividade devido à falta de padronização e possível não‑conformidade com requisitos de auditoria e proteção de dados.

## 3. Target Audience & Personas
> `[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]`  
> `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`  
> **Premissas adotadas:** O produto será utilizado por equipes de back‑office de escritórios de contabilidade e advocacia que lidam com cadastro de clientes, validação de documentos e gestão de CCTs.  
| Persona | Perfil | Necessidade Principal | Ganho Esperado |
| :--- | :--- | :--- | :--- |
| Analista de Cadastro | Profissional responsável por inserir e validar informações de clientes e documentos. | Interface simples para upload, validação e consulta de documentos, com feedback imediato de erros. | Redução de tempo de cadastro de 30 % e diminuição de erros de digitação. |
| Gerente de Compliance | Responsável por garantir que os processos atendam às normas de segurança e retenção de dados. | Logs de auditoria, controle de acesso baseado em permissões e validação de CSRF. | Evitar multas e garantir rastreabilidade completa das operações. |
| Administrador de Sistema | Encargado de configurar o ambiente, gerenciar usuários e executar tarefas agendadas. | Ferramentas de criação de usuários, redefinição de senhas, agendamento de jobs e monitoramento de desempenho. | Maior controle sobre o ambiente e menor dependência de suporte externo. |

## 4. Core Objectives & Success Metrics
| Objetivo | KPI (Métrica) | Baseline Atual | Meta | Prazo |
| :--- | :--- | :--- | :--- | :--- |
| Implementar fluxo de autenticação seguro com MFA opcional | % de logins bem‑sucedidos sem incidentes de segurança | 0 % (não implementado) | ≥ 99,9 % de logins seguros | Q2/2026 |
| Processar e validar documentos de clientes (PDF, Word, imagem) | Tempo médio de extração e validação por documento | N/A (processo manual) | ≤ 5 s por documento | Q2/2026 |
| Garantir conformidade de cadastros escritoriais | % de cadastros com CNPJ validado e status “ativo” | 0 % (não validado) | ≥ 95 % dos cadastros válidos | Q3/2026 |
| Automatizar geração de relatórios CCT em Markdown | Número de relatórios gerados por semana | 0 | ≥ 20 relatórios/semana | Q3/2026 |

* **North Star Metric:** Número de documentos de clientes processados com sucesso por mês.  
* **Guardrail Metrics:** Taxa de falhas de autenticação (< 0,1 %), latência média de resposta da API (< 200 ms), custo de armazenamento não aumentar > 10 % ao trimestre.

## 5. Scope Boundaries
### In-Scope
* Autenticação de usuários (login, logout, recuperação de senha, hash de senha, validação de CSRF).  
* Validação e normalização de CNPJ.  
* Upload, armazenamento, extração de texto e indexação de documentos (PDF, Word, imagens).  
* Gerenciamento de cadastros de clientes e contatos (CRUD).  
* Auditoria de cadastros e de segurança.  
* Processamento e consolidação de convenções coletivas de trabalho (CCT) com geração de relatórios em Markdown.  
* Controle de downloads do Chromium com limites configuráveis.  
* Tarefas agendadas (node‑cron) para backup, limpeza de sessões e rotinas de manutenção.  
* Envio de e‑mails via nodemailer para notificações e recuperação de senha.  
* Validação de dados de entrada com zod.  

### Out-of-Scope
* Aplicativo móvel ou PWA para usuários finais.  
* Integração com sistemas de folha de pagamento ou ERP externos.  
* Funcionalidades de assinatura digital avançada (ex: ICP‑Brasil).  
* Análise preditiva ou machine learning sobre documentos.  
* Suporte a múltiplos locatários (multi‑tenancy) em uma mesma instância.  

### Future Considerations (Not Now)
* Implementação de refresh token e rota de revogação de sessões.  
* Integração com provedores de identidade externos (OAuth2, SAML).  
* Arquivamento de documentos em armazenamento frio (ex: S3 Glacier).  
* Dashboard de métricas operacionais em tempo real.  

## 6. Business Rules & Constraints
> **Observação:** A varredura do repositório não identificou tabelas de banco de dados nem rotas/IPC definidas. Portanto, não há entidades ou fluxos concretos aos quais ancorar regras de negócio neste momento. As regras abaixo são placeholders que deverão ser revisadas após a modelagem do esquema e a definição das APIs.  

* **BR-01:** Todo usuário deve possuir uma sessão válida identificada por `hashToken` armazenada em `cookieSessao` antes de acessar qualquer endpoint que manipule `detalheCliente`, `salvarCliente` ou `listarClientes`. *(Aguardando definição de tabelas de usuários e sessões.)*  
* **BR-02:** Antes de permitir a operação `salvarCliente` ou `salvarContato`, o sistema deve validar que o campo CNPJ, quando presente, passe por `normalizarCnpj` e retorne `true` em `cnpjValido`. *(Aguardando definição de campos de cliente.)*  
* **BR-03:** Qualquer requisição que altere dados de cadastro deve disparar a auditoria correspondente via `auditarCadastro` e registrar o resultado em um log imutável. *(Aguardando definição de tabela de logs de auditoria.)*  
* **BR-04:** A operação `exigirCsrf` deve ser aplicada a todas as requisições de estado alterante (POST, PUT, DELETE, PATCH) que não sejam de leitura pura. *(Aguardando definição de middleware de CSRF.)*  
* **BR-05:** O processo de consolidação de CCT (`consolidarCct`) somente pode ser iniciado quando todos os documentos fonte tiverem passado por `validarExtracaoCct` e `fingerprintDocumentos` gerado. *(Aguardando definição de entidade de documento e fluxo de consolidação.)*  

*Cada regra acima referencia explicitamente os termos do glossário (fonte: glossario) e deverá ser vinculada às entidades e endpoints assim que eles forem modelados.*  

## 7. Assumptions & Dependencies
* **Premissas:**  
  * O banco **better‑sqlite3** oferece desempenho suficiente para o volume esperado de documentos e cadastros (até algumas dezenas de milhares de registros).  
  * O ambiente Node.js (versão compatível com as dependências listadas) está disponível em servidores Linux ou Windows.  
  * As variáveis de ambiente necessárias (ex: segredo para hash de senha, configuração de SMTP) serão fornecidas via **dotenv**.  
  * Não haverá necessidade de escalabilidade horizontal imediata; o sistema será inicialmente verticalmente escalável.  
* **Dependências externas:**  
  * Servidor de SMTP para envio de e‑mails via **nodemailer**.  
  * Acesso à internet para consulta de CNPJ em serviços públicos (se a validação for feita via API externa – atualmente a validação é feita apenas por algoritmo local, mas a dependência pode ser revisada).  
  * Bibliotecas de terceiros listadas na seção de stack (better‑sqlite3, dotenv, html-entities, node-cron, nodemailer, pdf-parse, pg, playwright, word-extractor, zod).  
  * Nenhuma dependência de ORM ou query builder; todo acesso ao banco será feito com SQL cru.  

## 8. Risks & Mitigations (Business-Level)
| Risco | Probabilidade | Impacto | Mitigação |
| :--- | :--- | :--- | :--- |
| Esquema de banco não definido levando a retrabalho | Média | Alto | Realizar workshops de modelagem de dados com stakeholders antes do início da implementação; gerar DDL a partir do glossário e validar com a equipe de engenharia. |
| Falhas na extração de texto de PDFs/Word devido a layouts complexos | Média | Médio | Implementar testes de regressão com amostras reais de documentos; considerar uso de OCR (Tesseract) como fallback somente se necessário e aprovado. |
| Vazamento de credenciais por armazenamento inadequado de hashToken | Baixa | Alto | Armazenar hashToken apenas em cookies HttpOnly, Secure e SameSite=Strict; usar algoritmo de hash forte (bcrypt/argon2) via criarHashSenha/verificarSenha. |
| Não conformidade com leis de proteção de dados (LGPD/GDPR) | Baixa | Alto | Incluir cláusulas de consentimento e direito ao esquecimento no fluxo de cadastro; manter logs de auditoria (`auditarCadastro`, `auditarSeguranca`). |
| Dependência de versão específica do Playwright causando quebras em atualizações | Baixa | Médio | Bloquear versão no package.json; criar suite de testes de smoke para validar funcionalidades de automação a cada atualização. |

## 9. Financial Considerations
> `[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]`  
> `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`  
> **Premissas adotadas:** O projeto será desenvolvido por uma equipe interna de 3 engenheiros (full‑stack), 1 designer de UX e 1 analista de QA, com duração estimada de 4 meses para o MVP. Infraestrutura será provisionada em uma instância VM de médio porte (ex: 2 vCPU, 8 GB RAM, 100 GB SSD) em provedor de nuvem escolhido pela empresa.  
* **Investimento estimado:** R$ 320.000 (inclui salários, licenças de ferramentas de desenvolvimento e custos de infraestrutura para 6 meses de operação).  
* **ROI esperado / Payback:** Redução de 25 % no custo operacional de processos manuais de cadastro e validação de documentos, resultando em economia anual de aproximadamente R$ 150.000; payback previsto em 16 meses.  
* **Modelo de custo recorrente:** Hospedagem VM (R$ 1.200/mês), serviço de SMTP (R$ 200/mês), backup e armazenamento de documentos (R$ 300/mês), totalizando aproximadamente R$ 1.700/mês.  

## 10. Go-to-Market Considerations
> `[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]`  
> `[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA]`  
> **Premissas adotadas:** O lançamento será direcionado inicialmente a escritórios de contabilidade parceiros da empresa, com programa de acesso antecipado (beta fechado) para coleta de feedback e ajuste de fluxos.  
* **Estratégia de lançamento:** Beta fechado com 5 clientes piloto durante 6 semanas, seguido de rollout gradual para outras carteiras de clientes com base na adoção e nos níveis de satisfação.  
* **Comunicação & Enablement:**  
  * Material de treinamento (vídeos curtos e guias passo‑a‑passo) para analistas de cadastro e gestores de compliance.  
  * Webinars de lançamento e sessões de perguntas e respostas com a equipe de produto.  
  * Suporte dedicado via canal Slack e e‑mail durante as primeiras 8 semanas pós‑lançamento.  

## 11. Approval & Sign-off
| Papel | Nome | Status | Data |
| :--- | :--- | :--- | :--- |
| Sponsor | [Nome do Sponsor] | Pendente/Aprovado | |
| Product Lead | [Nome do Product Lead] | Pendente/Aprovado | |
| Engineering Lead | [Nome do Engineering Lead] | Pendente/Aprovado | |
| Design Lead | [Nome do Design Lead] | Pendente/Aprovado | |
| Compliance Officer | [Nome do Compliance Officer] | Pendente/Aprovado | |

## 12. Revision History
| Versão | Data | Autor | Mudanças |
| :--- | :--- | :--- | :--- |
| 1.0 | 02/11/2025 | [Seu Nome] | Criação inicial do BRD com base no glossário e na stack real. |