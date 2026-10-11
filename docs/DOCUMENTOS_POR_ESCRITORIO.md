# Documentos e aplicabilidade — S3-06

## Uso na interface

Em **Minha conta**, confirme o escritório e clique em **Documentos** no cliente. A listagem mostra os documentos associados à empresa e suas decisões de aplicabilidade. **Atualizar documentos** procura candidatos nos vínculos sindicais e metadados públicos existentes, sem executar consulta externa ao Mediador.

Administrador e operador podem atualizar candidatos, baixar o original e registrar confirmação ou rejeição com justificativa. O responsável é sempre o usuário autenticado. Suporte com concessão justificada pode consultar e baixar, mas não decidir. Representantes de empresas não recebem candidatos nem acesso a essa interface interna: publicações do portal serão entregues na Sprint 5.

Uma coincidência de sindicato cria um candidato; não confirma seu enquadramento. Regras determinísticas existentes continuam podendo indicar confirmação quando as evidências do original satisfazem os critérios. Para confirmação manual, o backend também exige original disponível, dentro das pastas autorizadas e com hash conferido. A aplicação não conclui que o operador efetivamente leu o documento.

## Isolamento e concorrência

O mesmo original público pode aparecer para empresas de escritórios distintos, mas status, responsável e justificativa pertencem a cada empresa. A API exige contexto de escritório validado e verifica propriedade do cliente antes de consultar documentos. Cliente ou associação de documento externos retornam 404.

A projeção de documentos contém somente metadados públicos e a decisão da empresa. Não inclui caminhos, extrações, configurações de consulta ou decisões/revisões globais de consolidação. Consultar a lista não atualiza o banco. Trocar contexto limpa a tela; respostas antigas não repovoam documentos de outro cliente/escritório.

Cada documento retorna uma `versao`, calculada a partir de sua decisão e do contexto atual. Mudança no original registrado, vínculos, dados de enquadramento ou decisão de outro operador invalida a versão apresentada. Escrita obsoleta retorna 409 e exige nova conferência. Decisão e auditoria são transacionais: falha no registro do evento reverte a alteração.

Pausar monitoramento não muda o enquadramento já definido nem a aplicabilidade. O fingerprint conserva a representação histórica de sindicatos ativos para evitar invalidar suas decisões apenas pela atualização. Decisões antigas cujo fingerprint incluía sindicato pausado podem exigir atualização/conferência; o histórico de decisões permanece na auditoria.

## API

As rotas exigem cookie, `X-Context-Type: escritorio`, `X-Context-Id` e concessão de suporte quando aplicável. Escritas exigem JSON e CSRF; sessão, vínculo e permissão são revalidados depois de ler o corpo.

| Método | Rota | Contrato |
|---|---|---|
| GET | `/api/contexto/clientes/:id/documentos` | Metadados e decisões da empresa; não executa descoberta |
| POST | `/api/contexto/clientes/:id/documentos/atualizar` | Corpo `{}`; atualiza candidatos da empresa |
| POST | `/api/contexto/clientes/:id/documentos/decidir` | `numero`, `status` confirmado/rejeitado, `justificativa`, `versao` |
| GET | `/api/contexto/clientes/:id/documentos/original?numero=...` | Original relacionado à empresa, autorizado antes de servir bytes |

Ator, escritório e responsável não podem ser enviados pelo corpo. A confirmação registra o hash do original verificado. Downloads resolvem o caminho real, limitam acesso a `data/` ou à pasta de downloads configurada, conferem hash e retornam `no-store`. Arquivo alterado ou sem hash retorna conflito; caminho externo retorna 403.

## Envios e limites

Decidir nesta interface **não coloca documentos na fila de e-mail**. A atualização de candidatos não habilita novos envios; confirmação/rejeição contextual retira a habilitação de envio daquele documento. Uma aprovação anterior não é suficiente para enviá-lo enquanto essa habilitação estiver desativada. O fluxo legado do administrador ainda pode realizar a inclusão/preparação explícita para o escritório inicial.

Desde a Sprint 4, cada envio conserva o escritório derivado da empresa e usa somente o SMTP configurado para esse escritório. A configuração global legada permanece limitada ao escritório inicial durante a transição, impedindo o uso das credenciais/remetente da instalação inicial por outra empresa.

O original antecipa parte da S3-09. PDF, Markdown, anexos, revisões e consolidações estão disponíveis nas rotas contextualizadas e descritos em [Interpretações por escritório](INTERPRETACOES_POR_ESCRITORIO.md). Não há portal de cliente ou rastreamento de leitura entregue nesta etapa.

O evento `ORIGINAL_INTERNO_DISPONIBILIZADO` registra operador real, empresa, escritório, hash, horário e IP direto da conexão. É um evento operacional do acesso interno; não comprova conclusão do download ou abertura/leitura pelo cliente. Evidências de acesso às publicações e tratamento de proxies pertencem à Sprint 5.

## Validação

129 testes Vitest e 84 smoke passaram, além de typecheck, build e ambos os testes de navegador. Os cenários novos cobrem decisões diferentes sobre o mesmo original em dois escritórios, ator derivado da sessão, contexto/versão obsoletos, identidade forjada, hash/caminho inválidos, cliente sem acesso a candidatos, rollback se auditoria falhar e bloqueio de SMTP externo ao escritório inicial.

No navegador foram exercitados descoberta, download, confirmação em A e rejeição em B, duas abas com decisões distintas e suporte somente para consulta. A regressão local de clientes preservou PDF real e SMTP TLS simulado. Foram utilizados bancos temporários ou em memória, sem abrir o banco real.
