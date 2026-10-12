# S01-T02 — sidebar, topo, contexto e conta

Concluída em 12/10/2026, seguindo a [especificação visual](ESPECIFICACAO_VISUAL_UI_INTEGRADA.md). Entrega local, com identidade e contextos provenientes da sessão autenticada.

## Comportamento entregue

- Sidebar com marca, resumo do contexto, papel autorizado e identificação da conta. A navegação usa ícones com nomes acessíveis e indicação da área atual.
- Recolhimento desktop persistido como preferência visual `mediador_sidebar_recolhida`. O seletor, nome/e-mail da conta, tema e saída ficam no topo e continuam acessíveis com a lateral recolhida.
- Menu móvel em `dialog` nativo: abertura modal, foco inicial, retorno ao acionador, Escape, fechamento por clique fora e por navegação. A rolagem do fundo é restaurada ao fechar ou retornar ao desktop.
- O mesmo `WorkspaceSidebarContent.vue` compõe a lateral desktop e o menu móvel. Há apenas uma navegação montada por vez.
- Seletor agrupado visualmente com seu rótulo no topo; nomes completos continuam disponíveis nas opções e no resumo lateral. Atalho lateral fecha o menu e direciona o foco ao seletor.
- Área do escritório, portal da empresa e acesso de suporte são identificados explicitamente. Gestão do escritório aparece somente para administrador contextual; Plataforma somente para administrador global fora do contexto de cliente. Sem contexto, permanecem início, conta e Plataforma quando autorizada.

## Correções de ciclo de contexto

O fluxo anterior retornava antes de encerrar a concessão quando o seletor era limpo. Agora desmarcar ou usar “Encerrar acesso de suporte” chama a API, aguarda a revogação e só então descarta o contexto local. A troca entre escritórios também encerra o grant anterior antes de solicitar o próximo.

Se o encerramento falhar, o contexto anterior é preservado para nova tentativa, o erro aparece e nenhuma concessão nova é solicitada. Durante a troca, controles concorrentes ficam desabilitados e a tela contextual é desmontada. Respostas de um contexto anterior são recusadas pelo transporte contextual da aplicação.

Restauração de sessão/contexto termina antes de habilitar o seletor. Uma área deixa de ser exibida quando não é permitida pelo novo contexto; a navegação retorna ao início. A troca entre escritórios preserva a área quando ela permanece permitida. Links diretos e histórico de navegação continuam em S01-T03.

Logout apresenta estado ocupado e erro com nova tentativa se a API falhar. A sessão é revogada pelo contrato existente do servidor. Não houve alteração em permissões ou handlers do backend.

A skill baseline-ui orientou o uso do diálogo nativo existente como primitivo de interação, os alvos de foco, a hierarquia e os tokens aprovados; não foi adicionada uma biblioteca de UI.

## Validação

| Comando/cenário | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado |
| `npm run test:vue-ui` | Aprovado; regressão dos componentes existentes e novos cenários de falha de contexto/logout |
| `npm run test:postgres-https` | Aprovado, incluindo build operacional e navegador com banco descartável |
| Desktop | Recolhimento persistido após recarga, navegação por ícones, seletor e saída acessíveis |
| Menu móvel | Foco no diálogo, Tab/Shift+Tab, Escape e retorno de foco; navegação, backdrop e resize fecham o menu; rolagem restaurada |
| Papéis/contextos | Administrador e administrador da plataforma têm gestão contextual; operador/suporte não; cliente só vê início, documentos e conta |
| Concessões reais | Troca revoga concessão anterior; limpeza do seletor e botão explícito persistem revogação; leitura com grant encerrado retorna 403 |
| Falhas controladas | Encerramento 503 mantém contexto e permite retry sem novo grant; logout 503 mantém botão utilizável e permite nova tentativa; sem erro JavaScript não tratado |
| Regressão real | Isolamento, recarga contextual, portal/PDF, ciência, auditoria, CSRF/origem e logout aprovados |
| Limpeza | Banco descartável removido e ausência confirmada pelo nome exato |

## Capturas e reprodução

```powershell
$env:MEDIADOR_UI_VISUAL_DIR = Join-Path $PWD '.cache/ui-s01-t02'
npm run test:postgres-https
Remove-Item Env:MEDIADOR_UI_VISUAL_DIR
```

Evidências em `.cache/ui-s01-t02` (ignorado pelo Git): `shell-desktop.png`, `shell-recolhida.png`, `shell-mobile.png`, `shell-mobile-menu.png` e as 12 capturas de tabela/formulário/documento nos dois temas em 1440/390 px. Foram inspecionadas as capturas da lateral recolhida, menu móvel e página móvel. A URL de ensaio `https://localhost:<porta aleatória>` é encerrada ao fim do runner. Para inspeção interativa com a configuração local existente, executar `npm run dev` e acessar o endereço impresso.

Os testes adicionais estão em `test/workspace-shell-checks.mjs`, reutilizados pela jornada Vue controlada e pela fixture PostgreSQL conforme o cenário. A validação visual não presume aceite humano nem encerra os painéis ainda pendentes.

Próxima task: **S01-T03 — navegação direta por hash, voltar/avançar e fallback autorizado**.
