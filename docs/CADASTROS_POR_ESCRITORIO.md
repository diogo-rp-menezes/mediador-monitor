# Cadastros por escritório — Sprint 3 em andamento

## Contrato HTTP

As rotas abaixo exigem cookie de sessão e contexto de escritório autorizado em `X-Context-Type: escritorio` e `X-Context-Id: ID`. Acesso de suporte exige também `X-Support-Grant`. Escritas exigem JSON e `X-CSRF-Token` da sessão. Cada requisição revalida usuário, vínculo, escritório ativo e concessão; o contexto não é compartilhado globalmente entre abas.

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/api/contexto/clientes` | Lista somente empresas do escritório |
| GET | `/api/contexto/clientes/:id` | Detalhe com vínculos; cadastro de outro escritório retorna 404 |
| POST | `/api/contexto/clientes` | Cria empresa no escritório do contexto |
| PUT | `/api/contexto/clientes/:id` | Edita empresa do escritório; contatos externos são rejeitados |
| DELETE | `/api/contexto/clientes/:id` | Exclui conforme regras de histórico existentes |
| GET | `/api/contexto/contatos` | Lista somente contatos do escritório |
| GET | `/api/contexto/contatos/:id` | Retorna contato do escritório |
| POST / PUT / DELETE | `/api/contexto/contatos[/:id]` | Cria, edita e exclui no escritório autorizado |

Administrador de escritório e operador podem gerir cadastros. Suporte com concessão válida pode ler, mas não escrever. Cliente não acessa cadastros internos, nem usando um vínculo válido de empresa. Administrador da plataforma também precisa de vínculo ou concessão justificada para usar essas rotas com contexto.

Corpos usam os schemas de cadastro existentes com validação estrita: `escritorio_id`, ator e campos desconhecidos não são aceitos. Edição não transfere propriedade. Depois da leitura assíncrona do corpo, o backend revalida sessão, contexto e permissão antes de gravar. Gravação e evento de auditoria com ator/contexto acontecem na mesma transação; vínculo inválido reverte a alteração inteira.

## Compatibilidade e trabalho restante

O painel antigo usa as rotas globais `/api/clientes` e `/api/contatos`, ainda restritas ao administrador da plataforma. Usuários de escritório não recebem acesso a elas. As novas rotas não permitem documentos, envios, relatórios ou arquivos por aproximação: esses módulos seguem bloqueados até seu isolamento específico.

Não foi alterada a unicidade global do CNPJ: uma empresa pertence a um escritório inicialmente. A migração versionada `003-contatos-email-por-escritorio` substitui a unicidade global de e-mail por `UNIQUE(escritorio_id,email)`, sem diferenciar maiúsculas/minúsculas. O mesmo e-mail em dois escritórios representa dois contatos independentes, com IDs e vínculos separados. Dentro do escritório, duplicatas continuam bloqueadas.

Em **Minha conta**, selecione e confirme um escritório para abrir **Cadastros do escritório**. Administradores e operadores podem criar, editar, inativar e excluir clientes/contatos conforme regras de histórico. Cliente permite selecionar contatos do mesmo escritório; preferências dos vínculos já existentes e sindicatos permanecem preservados. Suporte com concessão recebe somente consulta. Ao trocar o seletor, listas e formulários anteriores são limpos imediatamente; respostas atrasadas não repovoam o contexto anterior. Seleção de empresa não abre esses cadastros internos.

Essa interface agora também oferece [configurações privadas de sindicatos](SINDICATOS_POR_ESCRITORIO.md), seleção de vínculos e [documentos/aplicabilidade](DOCUMENTOS_POR_ESCRITORIO.md) no cliente. Gestão de configurações de envio, escritórios e usuários permanece pendente. O modo de envio é apenas o campo de cadastro existente; notificações e jobs ainda exigem os incrementos seguintes. O seletor continua sem filtrar o painel global legado.

S3-02 a S3-05 estão entregues, com interface de clientes, contatos e filtros privados de sindicatos. Gestão de escritórios/usuários e isolamento dos demais módulos continuam pendentes; este incremento não conclui a Sprint 3 nem habilita implantação externa.

## Migração e backup

Faça backup antes de abrir a versão atualizada. A migração recria somente a tabela de contatos, preservando IDs, datas, campos, índices explícitos, triggers e sequência de autoincremento. Clientes-contatos, envios, snapshots e tentativas não são regravados. A cópia e troca da tabela são transacionais; validação de chaves estrangeiras acontece antes de registrar a migração. Falha reverte a alteração e restaura a configuração de chaves estrangeiras. Não execute a migração manualmente dentro de outra transação.

Nos cadastros locais legados, ausência de escritório mantém o escritório inicial como compatibilidade. A API por contexto fornece o escritório explicitamente; transferência continua bloqueada. Contatos agora rejeitam escritório nulo diretamente no banco.

## Validação

Resultado do incremento: 120 testes Vitest e 84 smoke, além de typecheck, build e ambos os testes de navegador (autenticação/cadastros por escritório e clientes com PDF/SMTP TLS local). Nenhum teste abriu o banco real.

`test/cadastros-contexto-http.test.ts` usa HTTP real e bancos em memória. Cobre leituras simultâneas de dois escritórios para o mesmo usuário, detalhes externos, edição/exclusão cruzadas, vínculo inválido com rollback, criação no escritório correto, ator auditado, campos de propriedade forjados, contexto inválido, CSRF, revogação durante leitura do corpo e restrições de cliente/suporte. A suíte anterior preserva a migração de bancos sem as colunas de escritório e o fluxo global local.

`test/migracao-contatos.test.ts` verifica preservação de histórico e sequência, idempotência, rollback, restauração de triggers e e-mail repetido entre escritórios. `test/auth-ui.e2e.mjs` verifica cadastros, inativação, exclusão permitida/bloqueada, limpeza ao trocar contexto, duas abas em escritórios diferentes e suporte sem controles de escrita.
