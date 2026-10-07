# Validação Docker do M1 + M2 — 7 de outubro de 2026

## Âmbito

Validação exclusiva de infraestrutura e regressão. Nenhuma funcionalidade nova, nenhuma alteração ao código de domínio/API/frontend ou às migrations do M1/M2. Alterações: healthchecks web/worker, target Docker e perfil Compose para testes, script de validação, finais de linha LF, job CI de arranque e documentação.

## Ambiente limpo

- Docker Engine 29.8.2, Compose v5.5.1, Docker Desktop com engine Linux e WSL 2.
- O executável estava instalado, mas fora do PATH da sessão antiga; foi usado o caminho instalado e um PATH apenas de sessão.
- Cópia limpa de 125 ficheiros de código/documentação, mais `.env` copiado de `.env.example` e registo da configuração resolvida.
- Sem `.git`, node_modules, `.env` local, builds, Prisma gerado ou storage do host.
- `docker compose -p core-saas down -v` removeu os três volumes anteriores. `docker compose -p core-saas up --build -d` terminou com exit code 0 e criou volumes novos.
- `npm ci` e `prisma generate` executados dentro do build Linux. Node 24.21.0, npm 11.19.0, PostgreSQL 18.6 e Redis 8.2.10.
- API/worker ligam a `postgres:5432` e `redis:6379`. Nenhum teste depende dos serviços nativos anteriormente usados nas portas 55432/56379.
- API/worker montam exclusivamente o volume Docker `core-saas_budget_storage` em `/data/budget-storage`, sem bind mounts do código, dependências ou storage local.

## Docker

```yaml
docker compose config: PASS (normal e perfil validation)
docker compose build: PASS (imagens api, web e worker)
docker compose build tests: PASS (Chromium e dependências Linux incluídos)
docker compose up --build -d: PASS
postgres: healthy
redis: healthy
api: healthy
web: healthy
worker: healthy
```

`GET http://localhost:3001/health` retornou HTTP 200:

```json
{"api":"up","postgresql":"up","redis":"up"}
```

## Migrations e seed

As quatro migrations foram aplicadas automaticamente no arranque sobre volume PostgreSQL vazio:

- `202610070001_core`
- `202610070002_integrity`
- `202610070003_budget`
- `202610070004_budget_integrity`

`prisma migrate status`: Database schema is up to date. `npm run migrate` e `npm run seed` repetidos explicitamente dentro do contentor API, ambos com exit code 0. Seed criou empresa/contas demo e orçamento R0 aprovado.

## Teste direto da stack Compose

Smoke test executado por Node dentro do contentor API, comunicando por HTTP com API e web e utilizando o worker separado:

- Web `/login`, login, refresh e logout: PASS.
- Criar obra, carregar XLSX e aguardar worker: PASS.
- Original descarregado com SHA-256 igual ao upload: PASS.
- Preview e confirmação única/transacional: PASS.
- R0 aprovado de 100.000 MZN e R1 de 132.000 MZN: PASS.
- Edição de aprovado e versão desatualizada rejeitadas: PASS.
- R0 preservado; comparação 32.000 MZN / 32%: PASS.
- Exportação reaberta com ExcelJS e eventos de auditoria: PASS.

## Suite Linux reproduzível

Execução integral de `docker compose -p core-saas --profile validation run --rm tests`: **exit code 0**. Nenhuma falha ignorada, nenhum teste desativado e nenhuma correção funcional necessária.

```text
Unit:        55/55 PASS
Integration: 58/58 PASS
E2E:          5/5  PASS (Chromium, 20,6 s)
Lint:        PASS
Typecheck:   PASS
Build:       PASS (TypeScript + Next.js produção)
```

A suite cobre login/refresh/logout, tenants, organizações, utilizadores, obras, RBAC, isolamento e audit log do M1; orçamento, hierarquia, R0/R1, aprovação, imutabilidade, comparação, XLSX válido/inválido, preview corrigível, rollback transacional, exportação, auditoria e optimistic locking do M2. Inclui orçamentos de 1.000, 5.000 e 10.000 linhas. No maior caso, upload/worker/preview/confirmar/consultas levaram 7.601 ms; submissão/aprovação/cópia foram medidas separadamente em 2.698 ms.

O perfil `validation` usa `postgres-test` e `redis-test`, sem portas no host e sem acesso aos bancos demo. A imagem contém dependências instaladas pelo lockfile e Chromium. O script aborta na primeira falha. Os testes E2E iniciam API/web/worker no mesmo contentor de testes, todos ligados aos serviços PostgreSQL/Redis exclusivos do Compose.

O contentor de testes foi inspecionado: rede `core-saas_default`, sem mounts do host. O banco `obras_test` começou vazio e recebeu as quatro migrations no início da suite. O contentor foi removido automaticamente ao terminar.

## CI

Workflow existente inspecionado: install, generate/migrate, lint, typecheck, unit, integration, seed, build e E2E, com serviços PostgreSQL 18 e Redis 8.2. Mantido e complementado com `compose-smoke`, timeout e permissão mínima `contents: read`.

Sintaxe, expressões e configuração do workflow validadas com exit code 0 por [actionlint 1.7.12](https://github.com/rhysd/actionlint/blob/main/docs/usage.md#docker), executado em Docker. O novo job reproduz config, build/up com espera por healthchecks, health HTTP e status das migrations; guarda logs em falha e limpa volumes do runner.

Execução remota GitHub Actions não realizada: o repositório local não tem remoto Git configurado. Os comandos de qualidade são executados localmente em Linux/Docker; isto não é apresentado como um run remoto do GitHub.

## Pendências reais

Somente a execução remota do workflow GitHub Actions. A pendência de validação local da infraestrutura Docker/WSL 2 do M2 está resolvida.

## Evidências

- [Build e arranque limpo](evidence/infrastructure/docker-up.txt)
- [Build da imagem de testes](evidence/infrastructure/docker-validation-build.txt)
- [Suite completa Linux](evidence/infrastructure/docker-tests.txt)
- [Smoke funcional API/worker separados](evidence/infrastructure/compose-smoke.txt)
- [Arranque com espera pelos healthchecks](evidence/infrastructure/docker-ci-smoke.txt)
- [Resumo de ambiente e estado final](evidence/infrastructure/result.json)

## Reproduzir

Ver [guia Docker](docker-validation-guide.md) e [README](../README.md). Não é necessário instalar Node, npm, PostgreSQL, Redis ou Chromium no host. A aplicação de demonstração permanece disponível em http://localhost:3000 após a validação.
