# S03-T03 — Decisões de vínculos de aditivos

Concluída em 12/10/2026. Base inspecionada: AmendmentLinks, transporte HTTP, salvarVinculoContextoPostgres, autorização contextual e revisão otimista. Mudanças preexistentes preservadas.

Formulário identifica a decisão registrada, sua revisão e a proposta a salvar. Justificativa continua obrigatória, entre 8 e 2000 caracteres, enviada sem espaços nas extremidades. Destino vazio mantém o contrato de rejeição/remoção como base null, com descrição da ação antes de salvar. Lista de aditivos exige termo aditivo de CCT; destino aceita somente convenções coletivas disponíveis no escritório. Backend mantém a validação autoritativa.

Transporte agora propaga ApiError com status HTTP e mensagem. No 409, o formulário bloqueia novos envios e oferece “Atualizar decisão registrada”. A leitura atualiza a decisão/revisão e preserva destino e justificativa do rascunho, para comparação antes de um novo salvamento explícito. Falha nessa leitura mantém bloqueio e rascunho, permitindo tentar atualizar novamente. Outros erros não são tratados como conflitos. Campos e fechamento permanecem bloqueados durante requisição; painel desmontado descarta respostas atrasadas.

Verificações aprovadas:

- `npm run typecheck` e `npm run build`.
- `npx vitest run test/api-transport.test.ts test/postgres-interpretacoes.test.ts`: sete testes. Status/mensagem, fallback sem JSON, CSRF/contexto/expiração e validação/concorrência do backend.
- `node test/vue-shell.e2e.mjs`: regressões completas; 409 exige atualização antes de salvar, 503 ao atualizar preserva rascunho/bloqueio, nova leitura permite decisão explícita, remoção versionada e suporte sem ação de escrita.
- `node test/postgres-https.integration.mjs`: jornada completa real aprovada. Novo helper `test/amendment-integrated-checks.mjs` salva vínculo, reabre, recebe 409 após decisão concorrente real, confirma no banco que não houve sobrescrita, atualiza/reenvia com revisão vigente, recarrega e remove vínculo. Conferidos justificativa, ator, revisões 1–4, associação CCT/aditivo, destino de outro escritório recusado, tipos incorretos e justificativa em branco recusados. Decisão independente do escritório B e registro original da CCT permanecem idênticos. Fixtures sintéticas removidas e banco descartável removido com ausência confirmada.
- Verificação real por perfil: administradores de escritório, operador e administrador global têm ação disponível e passam pela autorização de escrita; suporte, com concessão real, não recebe ação e é recusado pela API antes da validação do payload.
- 72 capturas em `.cache/ui-s03-t03`: oito novas da decisão/conflito reais, claro/escuro e 1440/390 px, mais 64 de regressão. Decisão desktop clara e conflito mobile escuro inspecionados. Página sem overflow horizontal; conteúdo longo usa rolagem do modal.
- `git diff --check` sem erros; permanecem avisos conhecidos de CRLF e script clássico de tema inicial.

O primeiro teste de papéis omitia a concessão contextual no administrador global e recebeu 403; passou a enviar a concessão validada do shell, inclusive para suporte. A execução final completa passou.

Arquivos: AmendmentLinks, services/api.ts, teste unitário do transporte, helper de aditivos, runners Vue/fixture integrada, documentação e artefato Vue. Nenhuma alteração de contrato, backend, original ou operação externa.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s03-t03'`; `npm run test:vue-ui`; `npm run test:postgres-https`. Interativo: `npm run dev`, selecionar escritório, Documentos → Instrumentos → Gerenciar vínculos de aditivos. Aceite visual humano separado.

Próxima: **S03-T04 — consolidação e revisão por campo**.
