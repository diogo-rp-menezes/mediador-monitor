# Inventário para retirada do SQLite

Atualização do progresso em 09/10/2026: as lacunas abaixo descrevem o levantamento original e devem ser confrontadas com PLANO_SPRINTS.md. Desde então, coleta/agendas/limites, IA configurada/filas, transporte de recuperação de senha e recuperação cifrada em Docker novo foram implementados e exercitados com fixtures. O ensaio de recuperação agora inclui concorrência de contextos e revogação de vínculo em dois escritórios sintéticos. Isso não conclui jornadas com dados reais, piloto, corte, estabilização ou separação do driver SQLite do runtime.

Levantamento do código em 9 de outubro de 2026. Este inventário conclui S7-01; não conclui equivalência, corte ou retirada do driver. PostgreSQL será o único banco operacional. Ferramentas de importação e leitura histórica devem ficar separadas do runtime final.

## Fluxos operacionais

| Fluxo | Código legado | Substituição existente | Lacuna e critério para retirada |
|---|---|---|---|
| Inicialização e rotas HTTP | `src/server.ts`, `src/db.ts` | Pools runtime e handlers PostgreSQL em modo opt-in; barreira impede abertura SQLite nesse modo | Separar entrada HTTP PostgreSQL dos imports legados; retirar fallback após estabilização; iniciar sem driver/arquivo SQLite |
| Identidade e gestão | `autenticacao.ts`, `auth-http.ts`, `organizacoes.ts`, `gestao-contexto-api.ts` | `postgres-autenticacao.ts`, `postgres-auth-http.ts`, `postgres-organizacoes.ts`, `postgres-papeis.ts` | Recuperação de senha possui callback, mas o servidor não fornece transporte PostgreSQL; testar recuperação real e vínculos em HTTP |
| Clientes, contatos e aplicabilidade | `cadastros.ts`, `cadastros-contexto-api.ts`, `clientes-api.ts`, `documentos-contexto.ts` | `postgres-organizacoes.ts`, `postgres-documentos.ts`, `postgres-gestao-http.ts` | Validar jornadas visuais com dados importados; preservar decisões, revisão otimista e isolamento |
| Catálogo e filtros de monitoramento | `monitoramentos-escritorio.ts`, `settings.ts` | CRUD de monitoramentos em `postgres-organizacoes.ts`; tabelas de execução migradas | Cadastro de filtros não executa coleta; implementar solicitação, reserva, execução, cancelamento e histórico por escritório |
| Coleta e downloads | `monitoring/runner.ts`, `index.ts`, `db.ts`, `vinculos.ts` | `scraper.ts`, `parser.ts`, `documento.ts` são componentes reutilizáveis; persistência documental PostgreSQL existe | Criar orquestrador PostgreSQL que persista coleta/hash/metadados e associações; não reutilizar runner SQLite como worker PostgreSQL |
| IA e reanálise | `reanalisar.ts`, `extract.ts`, `consolidacao.ts`, `revisoes.ts` | `postgres-interpretacoes.ts`, `postgres-consolidacao.ts` leem/revisam extrações existentes | Implementar configuração cifrada de IA, reserva, geração, validação e conclusão/falha; conferir concorrência e versão antes de salvar |
| Revisões e relatórios | `interpretacoes-contexto.ts`, `relatorios.ts`, `interpretacoes-contexto-api.ts` | Consolidação determinística, revisão otimista, histórico e Markdown PostgreSQL; PDF usado em envios/publicações | Testar equivalência de instrumentos, aditivos e documentos importados; separar helpers de arquivo/PDF da persistência SQLite |
| SMTP e fila de envios | `envios.ts`, `envios-contexto-api.ts`, `operacoes-escritorio.ts` | `postgres-smtp.ts`, `postgres-preparacao-envios.ts`, `postgres-fila-envios.ts`, worker separado; SMTP TLS integrado testado | Ligar gatilhos à conclusão da coleta/análise com ator de sistema explícito; manter aprovação, limites e tratamento incerto |
| Publicações, portal e notificações | `publicacoes.ts`, `migracao-publicacoes.ts` | `postgres-publicacoes.ts`, `postgres-notificacoes-publicacoes.ts`, portal HTTP | Validar jornadas completas de publicação/consulta/revogação em navegador com dados importados; definir retenção operacional |
| Cron e CLI | `server.ts`, `index.ts`, `config.ts`, scripts `check`, `seed`, `reanalisar` | CLI de bootstrap, migrations, worker e importação PostgreSQL | Substituir comandos de coleta/IA e cron por execução contextual; impedir que scripts operacionais finais usem `DB_PATH` |
| Painel global e configurações | Rotas globais de `server.ts`, `web/index.html`, `settings.ts`, `db.ts` | Área de conta/contexto em PostgreSQL; ajustes globais importados cifrados e desativados | Definir e implementar painel/configurações PostgreSQL para funções necessárias; não reativar envelopes legados sem revisão |
| Auditoria e isolamento | Triggers e tabelas SQLite, `autorizacao.ts` | Auditorias PostgreSQL, RLS, papel runtime, transações com contexto | Completar retenção, teste de carga/adversarial e recuperação de permissões; manter histórico imutável |

## Dependências indiretas

Os módulos PostgreSQL ainda importam funções de `cadastros.ts` (schemas, normalização e erros), `autenticacao.ts` (hash de senha, tokens/cookies e constantes), `relatorios.ts` (PDF, arquivos e hashes), `monitoramentos-escritorio.ts` (schema) e `notify.ts` (transporte SMTP). Esses arquivos também pertencem ao legado ou importam seus módulos. A ausência de abertura SQLite em modo PostgreSQL não significa ausência do driver no grafo de imports.

Na retirada, extrair os utilitários compartilhados para módulos independentes de persistência, mover tipos comuns e deixar os adaptadores SQLite exclusivamente na ferramenta histórica. Verificar o grafo e iniciar servidor/worker com `better-sqlite3` ausente. Não remover a dependência antes disso.

## Ferramentas históricas e evidências

`postgres-import-*`, `postgres-migration-*`, `postgres-operational-import*`, `postgres-recovery-*` e `sqlite-recovery-inspection*` leem a origem SQLite e fazem parte da manutenção/transição. Devem continuar disponíveis em um pacote de manutenção separado, com chave protegida, acesso administrativo e origem somente leitura. O runtime final não executa importação automática.

Preservar snapshot, originais, manifesto, mapas privados, recibos e relatórios assinados conforme política de retenção. Bloqueios `sqlite-cutover-lock.ts` protegem a fase temporária; não autorizam liberar filas nem substituem a recuperação pelo PostgreSQL. A liberação controlada do legado exige conciliação de dados e entregas e ainda não foi implementada.

## Ordem das próximas entregas

1. Concluir a execução contextual de monitoramento (S4-06): solicitação, reserva, cancelamento e histórico PostgreSQL, antes de integrar o scraper.
2. Integrar coleta/download/persistência e limites por escritório (S4-07/S4-08 e S6-06); exercitar falhas e trabalhos concorrentes sem acessar escritórios alheios.
3. Integrar geração/validação de extrações IA e concluir equivalência de relatórios (S6-05); ligar preparação de envios ao resultado validado.
4. Completar recuperação de senha, painel/configurações necessários e jornadas HTTP/visuais PostgreSQL (S6-03/S6-04/S6-08).
5. Validar recuperação de dados/arquivos/chaves/permissões, conciliação, piloto e corte local (S6-10/S6-11/S6-12).
6. Registrar estabilização e executar S7-02 a S7-08; retirar SQLite somente depois da recuperação PostgreSQL validada.

As próximas entregas não dependem de contratar infraestrutura externa. Docker local é o ambiente adotado para validar o produto. Casos que enviam mensagens ou acessam serviços devem usar fixtures/destinatários controlados nos testes; processamento real depende das configurações operacionais do escritório.
