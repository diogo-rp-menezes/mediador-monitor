# Desenvolvimento com hot reload

Execute `npm run dev` com PostgreSQL disponível e a configuração local habitual.

- Acesse `/app/` na origem do servidor Node (por padrão `http://localhost:3000/app/`). Faça login em `/login` se necessário.
- O Vite serve os fontes Vue e CSS e aplica HMR no mesmo servidor; não há segunda origem para a API ou cookies.
- Mudanças de template/estilo normalmente preservam o estado. Mudanças de script podem reinicializar o componente; alterações incompatíveis podem recarregar a página.
- `tsx watch` reinicia o backend ao alterar fontes de servidor.
- Ctrl+C encerra o ambiente. Em produção, `npm run build` e `npm run start` continuam usando os artefatos compilados.
- A interface histórica em `/` ainda pertence à migração e não recebe HMR Vue. Use `/app/` para conferir os componentes migrados.

Validação: `npm run test:dev-hmr` altera um componente em diretório temporário e verifica atualização com estado preservado. O modo real também foi iniciado contra PostgreSQL, com asset Vite servido e página protegida por sessão.
