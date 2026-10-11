# Contributing & Onboarding Guide — MTE Mediador Monitor Unificado

> Bem-vindo(a)! Este guia leva você do zero ao primeiro PR mergeado no `mte-mediador-monitor-unificado`.

## 1. Primeiros Passos

**Pré-requisitos** (conforme o artefato *Development Environment*):
- Node.js 22+ (o projeto usa `@types/node` 22.9 e scripts com `tsx`/`node`/`playwright` 1.48)
- npm (gerenciador de pacotes padrão do projeto)
- Qualquer SO compatível (Windows/Linux/macOS) — setup é 100% local, sem containers

**Passo a passo:**
1. Clonar o repositório: `git clone [url-do-repositório]` [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]
2. Instalar dependências: `npm install`
   - O hook `postinstall` lembrará de instalar o browser do Playwright: `npx playwright install chromium` (ou `npm run playwright:install`)
3. Configurar variáveis de ambiente: o projeto usa `dotenv` — crie um arquivo `.env` na raiz com os valores necessários (credenciais de e-mail/SMTP para o `nodemailer`, etc.). [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código: documentar as variáveis exatas exigidas, pois não há `.env.example` detectado na varredura]
4. Criar o primeiro usuário de acesso: `npm run auth:bootstrap`
5. Rodar o servidor de desenvolvimento (com watch): `npm run dev`
6. Rodar a suíte de testes: `npm test` (executa `vitest run`)
7. Verificar se o ambiente está saudável:
   - `npm run typecheck` — deve passar sem erros de tipo
   - `npm run test:smoke` — smoke test do template CCT
   - `npm run list` — deve listar dados do banco SQLite local sem erros

## 2. Estrutura do Projeto

```
├── src/            # Código-fonte principal (35 arquivos TypeScript)
│   ├── index.ts        # Entry point CLI (comandos: check, list, seed, reanalisar, importar-legado)
│   ├── server.ts       # Servidor web (npm run ui / npm run dev)
│   ├── autenticacao.ts # Lógica de autenticação
│   ├── auth-cli.ts     # CLI de autenticação (bootstrap, redefinir senha)
│   ├── auth-http.ts    # Camada HTTP de autenticação
│   └── ...             # Demais módulos de domínio
├── test/           # Testes (13 arquivos: vitest *.test.ts, smoke *.mjs, e2e *.mjs)
├── web/            # Assets/código da interface web (3 arquivos)
├── dist/           # Saída do build (gerado por `npm run build`)
└── package.json    # Scripts e dependências
```

**Banco de dados:** SQLite via `better-sqlite3`, com SQL cru (sem ORM/query builder). O arquivo do banco é criado localmente ao rodar os comandos.

## 3. Padrões de Commit

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Premissa: não há configuração de commitlint/husky detectada no repositório. Sugestão a validar pela equipe:
* **Convenção:** Conventional Commits — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
* **Exemplo:** `feat(auth): adiciona comando de redefinição de senha`
* **Regras adicionais:** commits atômicos, mensagens em português (alinhado aos identificadores do código, que são em português)

## 4. Fluxo de Contribuição (Branching & PRs)

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Fluxo sugerido (não há CI/CD detectado na varredura — validar com a equipe):
1. Criar branch a partir de `main`: `git checkout -b feature/nome-da-feature`
2. Desenvolver seguindo os padrões de código do projeto
3. Garantir localmente que `npm run typecheck` e `npm test` passam
4. Abrir Pull Request com descrição clara (o quê, por quê, como testar)
5. Solicitar revisão de pelo menos 1 revisor
6. Endereçar comentários e aguardar aprovação
7. Merge após validação (estratégia de merge a definir pela equipe)

### Template de PR sugerido
```markdown
## O que este PR faz
## Como testar
## Checklist
- [ ] `npm run typecheck` passa
- [ ] `npm test` passa (testes adicionados/atualizados)
- [ ] Documentação atualizada
- [ ] Sem breaking changes (ou documentado)
```

## 5. Padrões de Código

* **Linguagem:** TypeScript 5.6 (executado via `tsx` em dev; compilado com `tsc` para produção em `dist/`)
* **Validação de dados:** `zod` — use schemas zod para validar entradas externas
* **Estilo:** Não há ESLint/Prettier configurado no projeto. A verificação de qualidade disponível é `npm run typecheck` (`tsc --noEmit`). [ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código: definir/adotar ferramenta de lint e formatação]
* **Convenções de nomenclatura:** identificadores em português e camelCase para funções/variáveis (ex.: `criarAutenticacao`, `validarRequisicao`), conforme o código existente
* **Banco de dados:** SQL cru com `better-sqlite3` — não introduzir ORM
* **Testes obrigatórios para:** novas features e correções de bugs. Padrões existentes:
  - Testes unitários com **vitest** (`test/*.test.ts`) — rodar com `npm test`
  - Smoke tests com `node --test` (`test/*.smoke.mjs`) — ex.: `npm run test:smoke`, `npm run test:status`, `npm run test:gmail`, `npm run test:review`
  - Testes E2E de UI (`test/*.e2e.mjs`) — ex.: `npm run test:clientes-ui`, `npm run test:auth-ui`
* **Atenção:** a varredura identificou chamadas `console.*` residuais e funções com complexidade ciclomática alta (ex.: `criarAcessoHttp` em `src/auth-http.ts`). Evite adicionar novos `console.log` fora de CLIs e prefira funções pequenas.

## 6. Revisão de Código (Code Review Guidelines)

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

[INFERIDO POR IA — REQUER VALIDAÇÃO HUMANA] Diretrizes sugeridas:
* Revisores devem verificar: corretude, legibilidade, cobertura de testes, segurança (especialmente em `auth-*.ts` e envio de e-mails) e ausência de `console.*` residuais
* Tempo esperado de resposta a um PR: 1 dia útil
* Feedback construtivo: sugestões claras, distinguindo bloqueios de melhorias opcionais

## 7. Reportando Bugs

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código: definir issue tracker]

Template sugerido: passos para reproduzir, comportamento esperado vs. atual, ambiente (SO, versão do Node), e saída de `npm run typecheck`/`npm test` se relevante.

## 8. Propondo Novas Funcionalidades

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código: definir processo de discussão prévia/RFC antes de implementar]

## 9. Código de Conduta

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código: não há CODE_OF_CONDUCT.md detectado. Espera-se respeito, inclusão e comunicação profissional; definir canal de denúncia.]

## 10. Contatos & Suporte

[ENTRADA HUMANA NECESSÁRIA — não gerado a partir do código]

| Canal | Uso |
| :--- | :--- |
| [A definir — chat da equipe] | Dúvidas rápidas |
| [A definir — issue tracker] | Bugs e features |
| [A definir — e-mail da equipe] | Questões sensíveis |