# Deployment configurável

Sem deploy de produção nesta entrega. Requer Docker Compose, proxy HTTPS e secret store. Nunca reutilizar o compose de desenvolvimento para produção.

1. Checkout do SHA aprovado. Copiar `infrastructure/docker/release.env.example` para ficheiro privado fora do Git; preencher variáveis próprias de staging, passwords URL-safe, origem HTTPS real, SMTP e termos.
2. `docker compose --env-file <ficheiro-privado> -f infrastructure/docker/compose.release.yml config --quiet` (não publicar a configuração expandida).
3. `docker compose --env-file <ficheiro-privado> -f infrastructure/docker/compose.release.yml build`.
4. `docker compose --env-file <ficheiro-privado> -f infrastructure/docker/compose.release.yml up -d --wait --wait-timeout 240`.
5. O job migrate aplica migrations antes da API; seed de demonstração não é executado. Bootstrap de operador sob procedimento seguro.
6. Configurar proxy TLS para a porta loopback WEB_PORT; API não exposta publicamente. Health API pode ser consultado dentro da rede, smoke usa URL autorizada.
7. Executar `node infrastructure/docker/smoke.mjs` com SMOKE_API_URL, SMOKE_WEB_URL, SMOKE_TENANT, SMOKE_EMAIL, SMOKE_PASSWORD e opcional SMOKE_PROJECT_ID em ambiente privado. Apenas leituras, login/logout; não criar ou destruir dados.

Projeto Compose `obras-staging` ou `obras-production`; volumes têm prefixos distintos. Nunca apontar staging para DB/Redis/storage de produção. Use hosts/contas separados em lançamento real. Imagens `obras-api:<SHA>`, `obras-worker:<SHA>`, `obras-web:<SHA>`; runtime non-root e dependências de produção. Build Web fixa API_INTERNAL_URL=http://api:3001; reconstruir se mudar topologia. Job migration inclui tooling e não serve tráfego.
