# Sindicatos e filtros privados — S3-05

## Escopos

A identidade compartilhada do sindicato é seu ID, nome e CNPJ. A projeção do catálogo não retorna categoria, UF de consulta, vigência, palavra no título ou situação do monitoramento legado. O contador de clientes inclui somente empresas do escritório autorizado.

`monitoramentos_escritorios` guarda a configuração privada: escritório, sindicato, nome da consulta, CNPJ usado como filtro, categoria, UF, tipos de instrumento, vigência, título e situação. Dois escritórios podem configurar o mesmo sindicato independentemente. Há uma configuração por escritório/sindicato; IDs, propriedade e identidade do sindicato não podem ser transferidos na edição.

Administrador e operador podem configurar, editar, inativar e excluir monitoramentos do próprio escritório. Suporte com concessão justificada pode consultar; cliente não acessa configurações internas. Escrita exige sessão, CSRF, contexto revalidado e auditoria transacional com o ator real.

## API

| Método | Rota | Resultado |
|---|---|---|
| GET | `/api/contexto/sindicatos` | Catálogo de identidade com contador do escritório |
| GET | `/api/contexto/monitoramentos` | Configurações privadas do escritório |
| GET | `/api/contexto/monitoramentos/:id` | Configuração autorizada; ID externo retorna 404 |
| POST | `/api/contexto/monitoramentos` | Configura sindicato existente no catálogo |
| PUT | `/api/contexto/monitoramentos/:id` | Edita filtros ou situação sem mudar propriedade |
| DELETE | `/api/contexto/monitoramentos/:id` | Exclui se não houver clientes vinculados ao sindicato no escritório |

Cabeçalhos de contexto são os mesmos de [cadastros por escritório](CADASTROS_POR_ESCRITORIO.md). A API contextual do catálogo é somente leitura: novos sindicatos continuam sendo cadastrados pelo administrador da plataforma no painel global. Filtros exigem CNPJ válido, categoria ou palavra do título; tipos são validados e “Todos os tipos” normaliza a seleção para uma opção única.

## Interface e vínculos

Em **Minha conta**, confirme o escritório e use **Sindicatos e filtros privados → Configurar sindicato**. Escolha o sindicato do catálogo e defina filtros. Para ligar uma empresa, selecione seus sindicatos no formulário de cliente. Novos vínculos ficam sem confirmação de enquadramento; configurar uma consulta não constitui confirmação automática de aplicabilidade. Edição preserva campos e confirmações de vínculos existentes.

Novo vínculo de empresa exige sindicato previamente configurado no escritório. Um vínculo antigo do próprio cliente pode ser preservado mesmo sem configuração privada; a interface mostra “vínculo anterior”. Essa compatibilidade não permite que outra empresa herde o vínculo. Se houver clientes ligados ao sindicato, exclusão da configuração é bloqueada e deve-se inativar.

## Migração e limite operacional

Faça backup antes de abrir a versão atualizada. A migração transacional/versionada `004-monitoramentos-por-escritorio` copia configurações legadas para o escritório inicial. Para sindicatos já vinculados a empresas de outros escritórios, preserva uma cópia para os respectivos proprietários. Mantém nomes, campos, tipos e situação, sem alterar tabela de sindicatos, clientes, relações ou registros/documentos. Reexecução não duplica configurações.

Os campos antigos da tabela de sindicatos e as consultas do `config/watch.json` continuam alimentando o monitoramento global existente, restrito à plataforma. Alterações nos filtros privados **ainda não executam consultas nem mudam jobs globais**. A propagação do escritório em execução, agendamento, logs, filas e SMTP depende da Sprint 4. S3-05 entrega separação de dados/API/interface; não libera execução multi-escritório ou implantação externa.

## Validação

125 testes Vitest, 84 smoke, typecheck, build e testes no navegador de autenticação/cadastros e clientes com PDF/SMTP TLS local. Os testes novos cobrem migração idempotente, preservação de vínculos, filtros independentes do mesmo sindicato, contador privado, acesso cruzado, propriedade forjada, revogação durante leitura, exclusão com dependências, suporte somente leitura e compatibilidade de vínculos anteriores. O navegador verifica configurações diferentes em duas abas/escritórios e seleção de sindicatos no cliente. Todos usam bancos temporários ou em memória.
