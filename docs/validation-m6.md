# Validação M6 — fiscalização e qualidade

Data: 22 de outubro de 2026, Africa/Maputo. Sem deploy em produção.

## Resultado local

- Migrations: 12 aplicadas, incluindo `202610130011_quality` e `202610220012_quality_integrity`.
- Lint e typecheck: aprovados.
- Unitários M1–M6: 172 aprovados.
- Integração PostgreSQL/Redis M1–M6: 173 aprovados, incluindo 31 de M6.
- E2E Chromium M1–M6: 13 aprovados, sem retries (1,4 minutos).
- Build de produção: aprovado.
- Docker Compose: configuração válida, `up --build -d --wait` executado; PostgreSQL, Redis, API, Web e Worker healthy. `/health` confirma API/PostgreSQL/Redis disponíveis.

A validação usa Node 24 e PostgreSQL/Redis do Compose. A base de testes é isolada e descartável. Migrations e seed foram executados também numa base vazia antes dos E2E. O seed preserva os dados existentes da aplicação demo.

## Escala

10.000 inspeções, 100.000 itens, 50.000 NCR e 100.000 ações corretivas, com contagens verificadas. Preparação em lotes: 168,15 segundos. Consultas de resumo, listagem paginada e tendências: 131,81 ms em conjunto. O limite de 10 segundos das consultas é separado do prazo de preparação dos dados. Estes números descrevem este ambiente, não uma garantia de latência em produção.

## Cobertura e correções verificadas

- Checklist publicado e inspeção encerrada imutáveis, incluindo proteções no PostgreSQL.
- Respostas obrigatórias, fotografia confirmada em FAIL e liberação justificada de hold point.
- Evidências removidas não satisfazem os requisitos de submissão/conclusão.
- NCR com responsabilidade individual ou organizacional, prazos, correção, rejeição, verificação independente, encerramento e reabertura.
- Auto-verificação bloqueada, inclusive para administradores que executaram a correção.
- Isolamento tenant/obra e referências estrangeiras; RBAC de obra, auditoria e optimistic locking.
- Notificações de prazo deduplicadas; participação revogada impede leitura das notificações da obra.
- Certificação bloqueada pela NCR crítica relacionada; encerramento permite nova tentativa. Reabertura posterior à certificação não bloqueia pagamentos retroativamente.
- Ecrã de ação corretiva bloqueia operações concorrentes enquanto atualiza a versão. O teste aguarda o estado concluído antes de pedir verificação da NCR.
- Interface móvel de inspeção/NCR, dashboard e relatório de inspeção com identificação do fiscal, checklist, fotografias e responsável pelo encerramento.

## Reprodução

```sh
docker compose --profile validation config --quiet
docker compose up --build -d --wait
docker compose exec -T api npx prisma migrate status
docker compose --profile validation build tests
docker compose --profile validation run --rm tests
```

O último comando executa migrations, lint, typecheck, unitários, integração, seed, build e E2E com serviços dedicados. Não é necessário PostgreSQL ou Redis instalado no computador.

## CI

O workflow [Core SaaS CI](https://github.com/kinlerdacarla-sys/gestao-obras-saas/actions/workflows/ci.yml) executa instalação, geração Prisma, migrations, lint, typecheck, unitários, integração, seed, build e E2E. O job `compose-smoke` constrói uma stack nova e confirma health checks/migrations. O resultado remoto deve ser consultado para o SHA do commit entregue; os números acima registam a execução local reproduzível.

## Evidências

- [Docker](evidence/m6/docker.json), [health](evidence/m6/health.json), [migrations](evidence/m6/migrations.txt), [testes e escala](evidence/m6/tests.txt).
- [Inspeção móvel](evidence/m6/inspection-mobile.png), [NCR móvel](evidence/m6/ncr-mobile.png), [dashboard](evidence/m6/quality-dashboard.png), [relatório](evidence/m6/inspection-report.png).
- [Fluxo manual e regra exata de certificação](quality-workflow.md).

As notificações M6 são internas à aplicação. Os relatórios podem ser impressos/guardados em PDF pelo navegador; identificação eletrónica não é assinatura digital qualificada.
