# Obras — Gestão de obras M1–M7

Fundação SaaS para gestão de obras: autenticação, empresas cliente, utilizadores, organizações, perfis, obras, participantes e auditoria. Inclui o M2: orçamento hierárquico, revisões imutáveis, importação/preview XLSX, aprovação, comparação e exportação. Consulte [o módulo Budget](docs/budget.md) e [os resultados de validação M2](docs/validation-m2.md).

M3 acrescenta [cronograma, baselines e progresso físico](docs/schedule.md), [diário de obra, recursos e anexos privados](docs/daily-log.md). Na obra, abra **Cronograma** ou **Diário**. O seed cria atividades de demonstração, Baseline 0 e três diários aprovados. Consulte [a validação M3](docs/validation-m3.md).

O M8 está em desenvolvimento. Consulte o [estado de implementação e pendências](docs/implementation-m8.md); esta etapa ainda não constitui uma versão comercial pronta.

## Pré-requisitos

- Docker: não requer Node, npm, PostgreSQL ou Redis instalados no host.
- Execução local sem Docker: Node.js 24 LTS e npm 11+.
- Docker Engine/Desktop com Compose v2 para o ambiente integrado.
- Alternativa sem Docker: PostgreSQL 18 e Redis 8.2 acessíveis localmente.

## Instalação e Docker

Na pasta deste README:

```bash
docker compose config
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
```

O Compose instala dependências, gera Prisma Client, aplica migrations, executa seed e inicia postgres, redis, api, web e worker. Não exige `.env` para a demonstração: defaults são exclusivamente de desenvolvimento. Os dados permanecem nos volumes. Após alterar código, repita `docker compose up --build`.

- Web: [localhost:3000](http://localhost:3000)
- API: [localhost:3001/api/v1](http://localhost:3001/api/v1)
- Swagger: [localhost:3001/api/docs](http://localhost:3001/api/docs)
- Swagger pela origem da web, para “Try it out”: [localhost:3000/api/docs](http://localhost:3000/api/docs)
- Saúde: [localhost:3001/health](http://localhost:3001/health)

```bash
docker compose logs -f api
docker compose stop
```

## Instalação local

Para validar M1 + M2 exclusivamente em contentores, siga o [guia Docker de arranque limpo e testes](docs/docker-validation-guide.md). O perfil `validation` inclui PostgreSQL, Redis e Chromium isolados. Consulte também o [relatório de infraestrutura](docs/infrastructure-validation.md).

```bash
npm ci
```

Copie `.env.example` para `.env` (`Copy-Item .env.example .env` no PowerShell; `cp .env.example .env` no Linux/macOS). Configure PostgreSQL e Redis. Gere uma chave local e coloque-a em JWT_SECRET:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run generate
npm run migrate
npm run seed
```

O backend e Prisma carregam `.env` da raiz. Para mudar o destino da API no frontend local, exporte `API_INTERNAL_URL` no shell que inicia a web; o default é `http://localhost:3001`. O Compose configura essa variável automaticamente.

## Variáveis de ambiente

| Variável         | Uso                                                      |
| ---------------- | -------------------------------------------------------- |
| NODE_ENV         | development, test ou production                          |
| DATABASE_URL     | URL PostgreSQL; banco deve existir                       |
| REDIS_URL        | URL Redis; database 15 reservado aos testes              |
| JWT_SECRET       | Chave aleatória com pelo menos 32 caracteres             |
| WEB_ORIGIN       | Origem exata do navegador, default http://localhost:3000 |
| API_INTERNAL_URL | Destino Next → API; nunca contém credenciais             |
| PORT             | Porta da API, default 3001; web usa 3000 explicitamente  |
| DEMO_PASSWORD    | Password do seed; obrigatória e somente desenvolvimento  |

`.env` é ignorado pelo Git e pelo Docker build. Não reutilize valores demo fora do ambiente local. Produção exige HTTPS para os cookies Secure.

## Executar web, API e worker

Em três terminais, na raiz:

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

Build e execução compilada:

```bash
npm run build
npm run start:api
npm run start:worker
npm run start -w @obras/web
```

Os comandos start devem correr em terminais separados. `NODE_ENV=production` é uma configuração operacional explícita; não execute o seed nesse modo.

## Migrations e seed

```bash
npm run generate
npm run migrate
npm run seed
```

Migrations: `202610070001_core` cria dez entidades e enums; `202610070002_integrity` acrescenta constraints MZN, valor/datas e proteção append-only da auditoria. Para novas alterações de schema em desenvolvimento: `npx prisma migrate dev --name nome_da_alteracao`. Nunca use `db push` em produção.

O seed cria Construtora Demo, cinco perfis, a organização da construtora e OBR-001 / Edifício Demo / Maputo. Pode ser repetido sem duplicar estes registos. Não redefine contas já existentes.

## Credenciais de desenvolvimento

Empresa: `construtora-demo`. Password inicial para todas as contas: `Demo-Obras!2026`, ou o valor de DEMO_PASSWORD no primeiro seed.

| E-mail                  | Perfil    |
| ----------------------- | --------- |
| admin@example.com       | ADMIN     |
| gestor@example.com      | MANAGER   |
| fiscal@example.com      | INSPECTOR |
| financiador@example.com | FINANCIER |
| cliente@example.com     | CLIENT    |

Todos participam na obra demo. Convites e recuperação apresentam links nos logs da API em desenvolvimento. Abra o link e defina a password; nenhum token é devolvido pela API nem enviado a um serviço externo. Entrega real de e-mail exige implementar um fornecedor no NotificationModule antes de produção.

## Executar testes

```bash
npm run lint
npm run typecheck
npm test
```

Integração exige PostgreSQL e Redis reais, uma base dedicada cujo nome contenha `test` e migrations aplicadas. Exemplo PowerShell com os serviços Compose já ativos:

```powershell
docker compose exec postgres createdb -U obras obras_test
$env:DATABASE_URL = 'postgresql://obras:development@localhost:5432/obras_test'
npm run migrate
npm run test:integration
npm run seed
npx playwright install chromium
npm run test:e2e
```

Se a base já existe, não repita `createdb`. Para Linux/macOS, use `export DATABASE_URL=postgresql://obras:development@localhost:5432/obras_test`. Redis de integração usa database 15 e reinicia somente os contadores de IP de teste; não use essa database para dados reais. Fixtures têm identificadores aleatórios e permanecem na base de teste. Para E2E, execute a API com o mesmo DATABASE_URL do seed ou deixe Playwright iniciá-la. Não reutilize uma API de desenvolvimento ligada a outra base. CI usa serviços limpos e não reutiliza servidores.

```bash
npm run build
npm audit
```

Playwright inicia web/API se não estiverem ativos. A pipeline em `.github/workflows/ci.yml` executa install, geração, migrations, lint, typecheck, unitários, integração, seed, build e E2E. Qualquer falha interrompe a pipeline. Não há deploy.

## Swagger e contratos

Swagger disponível apenas em development/test em `/api/docs`; JSON em `/api/docs-json`. Requests documentados a partir dos schemas Zod e responses com schemas OpenAPI. Autenticação por cookie `access`; login requer `email`, `password` e `tenantSlug`. A empresa é validada pelo backend antes de entrar na sessão.

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Dados inválidos",
  "details": []
}
```

Erros incluem UNAUTHORIZED, FORBIDDEN, RESOURCE_NOT_FOUND, TENANT_ACCESS_DENIED, PROJECT_ACCESS_DENIED, EMAIL_ALREADY_EXISTS e CONFLICT. Mutações HTTP exigem o header `Origin: http://localhost:3000` (ou WEB_ORIGIN configurado). Dinheiro deve ser string decimal, por exemplo `"125000.50"`; currency aceita apenas MZN. Datas de obra usam YYYY-MM-DD.

## Arquitetura e multi-tenancy

```text
apps/api/src/{auth,tenant,user,organization,project,audit,health,notification}
apps/web/{app,components,lib}
apps/worker/src
packages/{domain,types,validation,ui,config}
prisma/{schema.prisma,migrations,seed.ts}
infrastructure/docker
tests/{unit,integration,e2e}
docs
```

Backend separado, monólito modular; contexto autenticado e filtros tenant-scoped; FKs compostas contra associações cruzadas. JWT curto, refresh rotativo com hash, Argon2id, revogação imediata, Origin/CSRF e limites Redis. Auditoria transacional e append-only. Consulte [decisões de arquitetura](docs/architecture.md) e [evidência de validação](docs/validation.md).

## Perfis

ADMIN gere utilizadores, organizações, obras e participantes dentro do tenant. MANAGER só consulta obras atribuídas e edita campos operacionais quando também é MANAGER na obra. INSPECTOR, FINANCIER e CLIENT só consultam obras atribuídas. A UI acompanha essas regras; a segurança é aplicada no backend. Não existe editor de permissões.

## Troubleshooting

- **Docker não encontrado:** instale Docker/Compose ou use PostgreSQL/Redis locais; não é necessário Docker para compilar e testar com serviços nativos.
- **Prisma Client inexistente:** execute `npm run generate` depois de `npm ci`.
- **Conexão ao banco recusada:** confirme URL, porta, base existente e saúde do PostgreSQL. Dentro do Compose o hostname é `postgres`, fora é `localhost`.
- **403 em POST/PATCH/DELETE:** confirme Origin igual a WEB_ORIGIN, cookies e permissões. Use Swagger pela porta 3000 para testar com a origem correta.
- **429 após tentativas:** aguarde 15 minutos. Não remova o rate limiting em produção.
- **Login não funciona após mudar DEMO_PASSWORD:** o seed preserva contas existentes; use recuperação de password.
- **Convite sem e-mail:** M1 entrega links nos logs locais. Produção retorna DELIVERY_UNAVAILABLE até configurar um fornecedor.
- **Porta ocupada:** pare a instância anterior; a API usa 3001, a web 3000. Não encerre processos alheios ao projeto.
- **Seed bloqueado:** não execute dados demo com NODE_ENV=production.
- **Auditoria não apaga:** é comportamento intencional; use uma base descartável para testes.

## M2 — Orçamento

Execute novamente `npm run migrate` e `npm run seed` após atualizar. O seed adiciona R0 aprovado de 1.325.000,00 MZN ao Edifício Demo. API e worker devem partilhar `BUDGET_STORAGE_PATH` (default `work/budget-storage`; volume partilhado no Compose). O worker expõe saúde na porta `WORKER_HEALTH_PORT`, default 3003.

O template está em `GET /api/v1/projects/:projectId/budget/import/template`. Fluxos, endpoints, limites e instruções de teste estão em [docs/budget.md](docs/budget.md). Os mesmos comandos de lint, typecheck, testes, E2E e build incluem M1 e M2 automaticamente.

## M4 — Gestão comercial e custos

Fornecedores/subempreiteiros, contratos e itens ligados ao orçamento, adendas/supressões, retenção e adiantamentos, centros de custo, despesas com comprovativos e estorno, dashboard sem dupla contagem. Ver [fornecedores](docs/suppliers.md), [contratos](docs/contracts.md), [despesas](docs/expenses.md) e [regras de custos](docs/cost-management.md).

As aprovações exigem outro ADMIN por defeito (`PREVENT_SELF_APPROVAL=true`). O demo inclui `diretor@example.com` para aprovação independente. O seed mantém os dados existentes e não funciona em produção.


## M5 — Medições, certificação, financiamento e pagamentos

Medições acumuladas com revisão fiscal, aprovação independente e certificação; retenções e adiantamentos por ledger; libertações; vários acordos de financiamento; pedidos e desembolsos; pagamentos parciais/totais e estornos; comprovativos privados; dashboard e curva S física/financeira. Todas as operações financeiras mantêm isolamento de empresa/obra, auditoria, versões e idempotência nos lançamentos críticos.

Consulte [medições](docs/measurements.md), [retenções](docs/retention.md), [adiantamentos](docs/advance-recovery.md), [financiamento](docs/funding.md), [pagamentos](docs/payments.md) e [fluxo completo com teste manual](docs/financial-workflow.md).

Atualização local: `docker compose up --build -d --wait`. API aplica migrations e seed automaticamente. O demo MED-001 tem líquido 850.000 MZN, pago 500.000; o financiamento aprovado é 15.000.000 com 2.000.000 desembolsados. O seed preserva dados existentes. A aprovação M5 nunca permite o próprio autor, mesmo que a configuração de exceção M4 esteja desativada.

Resultados e evidências da M5: [validação completa](docs/validation-m5.md).

## M6 — Fiscalização, qualidade e não conformidades

Na obra, abra **Fiscalização e qualidade**. A M6 acrescenta pedidos de inspeção, templates/versionamento de checklist, inspeções com evidências, hold points, NCR, ações corretivas, verificação independente, indicadores, relatórios e notificações de prazo. Integra cronograma, orçamento, diário, contratos e medições sem alterar automaticamente valores ou progresso.

- [Inspeções e evidências](docs/inspections.md)
- [Checklists e versões](docs/checklists.md)
- [Não conformidades](docs/non-conformities.md)
- [Ações corretivas](docs/corrective-actions.md)
- [Fluxo manual, segurança, indicadores e bloqueio de certificação](docs/quality-workflow.md)

O seed inclui CHK-FUND, CHK-STRUCT e CHK-MASON; IR-001, uma inspeção com sete respostas PASS e uma FAIL, NCR-001 aberta e uma NCR encerrada. Templates são exemplos configuráveis. Fotografias demo são ilustrativas. O worker reutilizado agenda `quality-deadline-monitor` às 07:00 Africa/Maputo e grava avisos deduplicados na caixa de entrada da aplicação.

A política de bloquear certificação com NCR crítica não encerrada está ativa por omissão. O bloqueio aplica-se no instante da certificação; não bloqueia retroativamente o pagamento de medições já certificadas. Consulte a regra exata na documentação do fluxo.

Resultados e evidências da M6: [validação completa](docs/validation-m6.md).


## M7 — Intelligence, relatórios e portais

Dashboards por perfil, comparação de obras, curva S, snapshots, alertas, notificações, relatórios privados PDF/XLSX e portais de cliente/financiador. Consulte [analytics e fórmulas](docs/analytics.md), [dashboards e teste manual](docs/dashboards.md), [alertas](docs/alerts.md), [notificações/email](docs/notifications.md), [relatórios](docs/reports.md), [cliente](docs/client-portal.md) e [financiador](docs/financier-portal.md).

### Arranque numa máquina nova

```bash
git clone https://github.com/kinlerdacarla-sys/gestao-obras-saas.git
cd gestao-obras-saas
cp .env.example .env
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 240
docker compose exec api npx prisma migrate status
docker compose ps
```

No PowerShell, usar `Copy-Item .env.example .env`. O Compose aplica migrations e seed automaticamente antes de iniciar a API; não depende de PostgreSQL/Redis instalados no computador. O worker e API partilham o volume privado de documentos para exportações. Os defaults são apenas para demonstração local. Não executar `down -v` sobre dados que se pretendem preservar.

### Regressão reproduzível

```bash
docker compose --profile validation up -d --wait postgres-test redis-test
docker compose --profile validation build tests
docker compose --profile validation run --rm tests
```

O perfil executa migrations, lint, typecheck, testes unitários, integração, seed, build de produção e E2E com Chromium. Usa PostgreSQL/Redis isolados e volume documental próprio. Para repetir a partir de base vazia, recriar apenas `postgres-test` e `redis-test` com `--force-recreate`; não fazê-lo durante testes em execução. A CI executa estas verificações e smoke test Compose; não faz deploy.

Evidências e limites da validação M7: [relatório de validação](docs/validation-m7.md).

## M8 — SaaS e operação

Registo público em `/signup`; subscrição, faturação manual e exportação em `/settings/subscription`, `/settings/billing` e `/settings/data-exports`. Administração separada em `/platform/login`; o administrador de demonstração não é operador de plataforma.

A API aplica quotas e direitos comerciais independentemente da interface. Novos tenants começam com trial explícito; contas anteriores recebem a transição documentada. O convite inicial é processado pelo worker, com token cifrado no outbox e uso único. Em desenvolvimento, emails são ficheiros EML privados no diretório `work/mail-outbox` do worker; em produção exige SMTP.

Para staging/produção usar exclusivamente o [runbook de deployment](docs/deployment.md), o Compose de release e segredos próprios. Não executar seed demo em produção. Ver [estado M8](docs/implementation-m8.md), [quotas](docs/usage-limits.md), [onboarding](docs/onboarding.md), [suporte](docs/support-access.md), [backup/restore](docs/backup-restore.md) e [checklist de lançamento](docs/production-checklist.md).
