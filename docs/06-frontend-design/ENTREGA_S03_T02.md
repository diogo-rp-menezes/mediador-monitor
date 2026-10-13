# S03-T02 — Leitura da análise e evidências

Concluída em 12/10/2026. Base inspecionada: DocumentAnalysis, AnalysisValue, normalizarExtracao/paraVisao, template canônico e autorização de navegação da App. Mudanças preexistentes preservadas.

Leitura agora organiza tópicos históricos e alterações de aditivos em campos, mantendo ação, cláusula, citação e observações recebidas. Template mantém sua hierarquia. Formatos alternativos continuam disponíveis no leitor recursivo, inclusive quando a API retorna tópicos históricos vazios para dados que não reconhece.

Cobertura distingue valores de campos sem informação: null, undefined, branco e marcador “Não consta na CCT” não contam como valor; zero e falso são preservados. O marcador explícito continua exibido no template; campos vazios recebem indicação “Não informado na análise”. Campos sem fonte mostram essa condição; referência apenas por cláusula abre evidência com aviso de citação indisponível. Citações são interpoladas como texto, preservando quebras de linha e caracteres especiais. Mudança dos dados reinicia seleção de seção/evidência.

Rodapé informa o responsável pela análise/reanálise. Somente administrador da plataforma recebe “Abrir Plataforma”; a navegação usa a autorização existente e desmonta a ficha. **Esta tarefa entrega o encaminhamento. A interface operacional de reanálise permanece pendente em S08-T04**, como previsto; nenhuma chamada de geração foi adicionada.

Verificações aprovadas:

- `npm run typecheck`, build frontend e build operacional.
- `npx vitest run test/analysis-presentation.test.ts test/extract.test.ts test/template-cct.test.ts`: dez testes, cobrindo ausência versus valores válidos, hierarquia, referências e compatibilidade.
- `node test/vue-shell.e2e.mjs`: regressões completas e nova jornada `test/analysis-checks.mjs`, com template, tópicos, aditivo, fallback e análise ausente. Conferidos zero/falso, citação literal com HTML inerte, evidência parcial, fechamento com Escape e navegação exclusiva ao administrador global.
- `node test/postgres-https.integration.mjs`: jornada real completa aprovada, incluindo `test/analysis-integrated-checks.mjs`. Template válido com 60 campos, tópicos históricos, aditivo, formato alternativo e ausência salvos no banco descartável e lidos pela API/UI reais. Citações comparadas literalmente; administrador do escritório sem ação de Plataforma. Extração anterior restaurada; banco descartável removido com ausência confirmada.
- 64 capturas em `.cache/ui-s03-t02`: oito novas de análise/evidência, claro/escuro e 1440/390 px, mais 56 de regressão. Análise desktop clara e evidência mobile escura inspecionadas; sem overflow horizontal da página, modal com rolagem interna.
- `git diff --check` sem erros. Permanecem os avisos conhecidos CRLF e script clássico de tema inicial.

A primeira expectativa de cobertura do teste contou apenas a seção visível; foi corrigida para considerar todas as seções. A primeira fixture real omitia campos obrigatórios do template; foi corrigida para fornecer os 60 campos exigidos, preservando a validação estrita do backend. As execuções finais passaram.

Arquivos: `frontend/src/analysis.ts`, DocumentAnalysis, AnalysisValue, DocumentsPanel, App, helpers/runners de teste e artefato Vue. Backend, regras de extração e dados operacionais preservados.

Reprodução: `$env:MEDIADOR_UI_VISUAL_DIR='.cache/ui-s03-t02'`; `npm run test:vue-ui`; `npm run test:postgres-https`. Validação interativa: `npm run dev`, autenticar, selecionar escritório, Documentos → ficha → Análise. Aceite visual humano separado.

Próxima: **S03-T03 — vínculos/rejeição de aditivos e concorrência**.
