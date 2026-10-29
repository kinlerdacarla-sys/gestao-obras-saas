# Evidências de validação M8 — 2026-10-29

## Regressão local desta completion pass

Executada em imagens Docker com PostgreSQL 18 e Redis 8.2 exclusivos de testes; sem depender de instalações locais desses serviços. O banco de testes foi recriado, as 18 migrations aplicadas e o seed executado.

| Verificação | Resultado |
| --- | --- |
| Lint | Passou |
| Typecheck API, Web e testes | Passou |
| Unit | 209 passaram |
| Integration | 212 passaram na regressão completa; mais 1 teste de ciclo de conexão Redis passou após correção do scanner vazio |
| E2E Chromium | 22 passaram, incluindo 4 jornadas M8; sem retries necessários |
| Build | TypeScript e Next.js produção passaram |
| Compose principal | `up --build -d --wait` passou; PostgreSQL, Redis, API, Web e Worker healthy |
| Compose release local | `up --build -d --wait` passou, com DB/Redis/volumes/segredos separados |
| Migrations | 18 aplicadas, schema atualizado |

Os testes de integração mantêm os cenários de volume M1–M7. Os novos casos exercitam limite de projetos/utilizadores, upgrade/downgrade, reservas e confirmação de storage, idempotência de relatórios, entitlements, suspensão por endpoints existentes, rollback transacional, convite expirado, exportação e suporte sem autorização. Testes de segurança verificam isolamento de subscrição/faturas/exportações, negação de ADMIN tenant na plataforma e ausência de segredos no ficheiro exportado.

Os E2E novos percorrem signup → email do worker → password → login → checklist → primeira obra; alteração de plano e exportação; suspensão/reativação com audit; e suporte autorizado com banner/encerramento auditado.

## Runtime e recuperação

API/worker executam como UID 1000, sem TypeScript nem Prisma CLI no runtime. Web executa como `node`. O job de migrations conserva tooling, não serve tráfego. Readiness da API confirma PostgreSQL/Redis; a do worker confirma processo, DB, Redis e filas. Um erro real no encerramento de conexões Redis de scanners vazios foi corrigido e coberto por teste; o release permaneceu healthy sem reinícios após a correção.

Smoke local de leitura: live, ready, login, dashboard, projetos e logout passaram. O bootstrap inicial da plataforma passou exclusivamente na base isolada de validação.

Foi executado `pg_dump` e `pg_restore --exit-on-error` para uma nova base isolada: 18 migrations e 4 planos recuperados. Este ensaio não representa um teste de PITR do fornecedor nem recuperação de documentos de produção. O runbook descreve esses exercícios antes do lançamento.

Logs locais (ignorados pelo Git): `work/m8-completion-final.txt`, `work/m8-worker-regression.txt`, `work/m8-main-verified.txt`, `work/m8-release-stable.txt`, `work/m8-smoke-final.txt`, `work/m8-bootstrap-validation.txt` e `work/m8-restore-isolated.txt`.

## CI e fronteira operacional

O [workflow Core SaaS CI](https://github.com/kinlerdacarla-sys/gestao-obras-saas/actions/workflows/ci.yml) executa install, validação/aplicação de migrations, lint, typecheck, 209 unitários, 213 testes de integração, build e 22 E2E, além de Compose clean-room e imagens de produção com tag SHA. O estado remoto deve ser consultado para o commit exato; resultados de commits anteriores não aprovam uma release nova.

Não houve deploy de produção. Staging remoto, DNS/TLS, SMTP real, backups/PITR externos e monitorização dependem do provisionamento descrito na checklist de lançamento. Os ficheiros privados de ambiente e credenciais de validação não são versionados.
