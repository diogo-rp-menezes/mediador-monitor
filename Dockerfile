FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY scripts/build-operacional.mjs scripts/build-operacional.mjs
COPY src src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright UI_BIND_HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist dist
COPY migrations/postgres migrations/postgres
COPY web/acesso.html web/login.html web/theme-ui.js web/workspace-ui.js web/cadastros-ui.js web/uf-ui.js web/resumo-ui.js web/workspace-conceito.css web/auth-ui.css web/auth-ui.js web/auth-client.js web/cliente-vinculos-ui.js web/cliente-cnpj-ui.js web/gestao-ui.js web/publicacoes-ui.js web/monitoramento-ui.js web/ia-plataforma-ui.js web/
RUN mkdir -p data downloads && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/auth/estado').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server.js"]
