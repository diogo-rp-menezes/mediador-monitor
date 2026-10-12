# S01-T01 — aparência compartilhada

Concluída em 12/10/2026. Aplicação local do sistema visual aprovado aos componentes Vue existentes.

## Entrega

- `frontend/src/tokens.css`: fonte única de cores dos temas claro/escuro, tipografia, espaço, raios e elevação. Os aliases antigos (`--bg`, `--surface`, etc.) apontam para os tokens canônicos, preservando os consumidores de domínio.
- `frontend/src/shared.css`: botões, campos, cartões, tabelas, tabs, badges, toast, erros e foco. Substitui `styles.css`, removido por conter estilos globais duplicados e valores roxos literais.
- Sidebar, modais e documentos usam os tokens comuns; modais mantêm o `dialog` nativo, rolagem e ações acessíveis em celular. O PDF mantém fundo branco por representar o próprio documento.
- Formulários existentes usam botão primário para submissão; confirmações de exclusão usam variante de perigo. Cadastros ativos têm badge de sucesso; inativos/pendentes permanecem neutros.
- `AppDialog.vue` expõe estado ocupado. Controles desabilitados indicam indisponibilidade, e modal ocupado informa processamento.
- `frontend/public/theme.js` define o tema antes da renderização: preferência salva, depois preferência do sistema. A aplicação continua utilizável quando o armazenamento local está indisponível. O botão informa qual tema será ativado.

O bootstrap de tema é um script externo clássico carregado no head, compatível com a CSP `script-src 'self'`. O Vite informa que esse script não será empacotado como módulo; ele é copiado de `public` para `web/vue/theme.js` e foi servido com sucesso no ensaio real. Não adicionar `type=module`, pois isso adiaria sua execução.

A skill baseline-ui orientou a manutenção dos componentes existentes, foco, alvos de interação, safe area e ausência de animações decorativas. A especificação aprovada do projeto prevaleceu nos tokens e no uso de CSS/Vue.

## Verificações

| Verificação | Evidência |
| --- | --- |
| `npm run typecheck` | Aprovado |
| `npm run test:vue-ui` | Aprovado; cadastros, vínculos, documentos, conflitos, publicações e suporte continuam funcionais |
| `npm run test:postgres-https` | Aprovado, incluindo build completo e papéis reais no banco descartável |
| Captura real após ajuste final de cor | `npm run build:frontend` e `node test/postgres-https.integration.mjs` aprovados com `MEDIADOR_UI_VISUAL_DIR` definido |
| Tema inicial | Preferências clara/escura do sistema, preferência explícita e storage bloqueado conferidos por execução do bootstrap |
| Contraste | Pares texto/superfície, secundário/canvas, destaque e cores semânticas conferidos matematicamente; mínimo 4,5:1. Texto secundário claro ajustado para `#5e6e67`, incluindo uso sobre superfície sutil |
| Responsividade | 12 capturas: tabela, formulário e documento, 1440/390 px, claro/escuro; página sem overflow horizontal; campos/ação final do formulário alcançáveis por rolagem |
| Limpeza | Banco criado pelo ensaio removido, ausência confirmada pelo nome exato |

A primeira captura documental não encontrou o instrumento porque a fixture de portal não o vinculava a um cliente no catálogo interno. O preparo passou a criar essa associação sintética no banco descartável; a jornada foi reexecutada com sucesso. A captura agora espera o conteúdo carregado, além da abertura do modal.

## Reprodução e evidência visual

Na raiz do projeto:

```powershell
$env:MEDIADOR_UI_VISUAL_DIR = Join-Path $PWD '.cache/ui-s01-t01'
npm run test:postgres-https
Remove-Item Env:MEDIADOR_UI_VISUAL_DIR
```

As capturas ficam em `.cache/ui-s01-t01`, ignorado pelo Git. São geradas contra `https://localhost:<porta aleatória>`, URL temporária do ensaio. Para inspecionar interativamente a aplicação com a configuração local já existente, usar `npm run dev`; conferir o endereço impresso pelo comando.

Arquivos: `{light|dark}-{1440|390}-{cadastros|formulario|documento}.png`. Foram inspecionadas capturas de tabela clara desktop, formulário escuro mobile e documento escuro desktop. As demais são evidência para comparação posterior; não constituem aceite visual humano.

Não foram alterados handlers ou payloads de negócio. Esta entrega aplica a aparência comum; refinamento de navegação/contexto e composição da sidebar continua em **S01-T02**. A auditoria completa de acessibilidade permanece prevista na Sprint 10.
