# Validação de infraestrutura M1 + M2

Numa nova máquina, clone o repositório ou extraia o pacote de código. Abra um terminal na pasta do README e inicie Docker Desktop com engine Linux/WSL 2. Verifique `docker --version` e `docker compose version`. Se um terminal aberto antes da instalação não reconhecer Docker, reabra-o para atualizar o PATH.

## Arranque limpo

1. Copie `.env.example` para `.env`: `Copy-Item .env.example .env` no PowerShell ou `cp .env.example .env` em Linux/macOS. Os valores de exemplo são apenas de desenvolvimento. Compose fornece os endereços internos `postgres`/`redis`, independentemente dos endereços localhost do exemplo local.
2. Execute `docker compose config`.
3. Para começar sem dados anteriores, execute `docker compose --profile validation down -v`. **Este comando remove os dados e originais XLSX dos volumes deste projeto.** Não o use quando pretender preservar dados.
4. Execute `docker compose up --build -d --wait --wait-timeout 180`.
5. Confirme `docker compose ps`: postgres, redis, api, web e worker devem estar healthy. Abra http://localhost:3000; `/health` na porta 3001 confirma API/PostgreSQL/Redis.
6. O arranque da API aplica migrations e seed automaticamente. Verifique com `docker compose exec -T api npx prisma migrate status`. `docker compose exec -T api npm run migrate` e `docker compose exec -T api npm run seed` permitem repetir explicitamente estes passos.

## Suite completa dentro de Docker

```bash
docker compose --profile validation build tests
docker compose --profile validation up -d --wait postgres-test redis-test
docker compose --profile validation run --rm tests
```

O target `validation` instala Chromium e bibliotecas Linux do Playwright. O script `infrastructure/docker/validate.sh` executa migrations, status, lint, typecheck, unit, integration, seed, build e E2E, abortando na primeira falha. Os E2E iniciam API, web e worker dentro do contentor de testes. Todos os processos usam exclusivamente `postgres-test` e `redis-test`, sem acesso aos bancos da demonstração ou aos serviços do computador.

O código é copiado para a imagem e as dependências vêm de `npm ci`; não são montados node_modules, `.env`, build ou código gerado do host. Os resultados ficam no log do comando. Não há dependência de Node, PostgreSQL, Redis ou navegador instalados no Windows.

Para repetir desde um banco de testes vazio sem apagar a demonstração:

```bash
docker compose --profile validation rm -s -f postgres-test redis-test
docker compose --profile validation up -d --wait postgres-test redis-test
docker compose --profile validation run --rm tests
```

As bases de testes são efémeras. API/worker da demonstração partilham o volume `budget_storage`. As portas 3000, 3001, 5432 e 6379 devem estar livres; os serviços de teste não publicam portas no host.

## CI

O CI mantém a suite com serviços PostgreSQL/Redis e acrescenta `compose-smoke` para validar a subida limpa e healthchecks. Consulte [o relatório de infraestrutura](infrastructure-validation.md) para resultados reais e estado da execução remota.
