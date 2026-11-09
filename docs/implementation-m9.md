# M9 — preparação local de lançamento e piloto
Data de validação: 10 de novembro de 2026 (Maputo). Estado do piloto: **não autorizado para go-live**. Nenhum Terraform apply, publicação ECR ou deploy AWS executado.

| Área | Estado | Evidência / limite |
|---|---|---|
| Pré-requisito M1–M8 | VALIDATED LOCALLY | Regressão de entrada 209 unitários, 213 integração, 22 E2E e CI do M8 verde no SHA 9e70150. |
| Infraestrutura | CONFIGURED | Módulos Terraform network/data/edge/compute/operations/platform, bootstrap de state e OIDC, roots staging/production e exemplos vazios. |
| Terraform | VALIDATED LOCALLY | Terraform 1.17.1: fmt -check -recursive, init -backend=false e validate em bootstrap, staging e produção. Sem credenciais nem plano contra conta real. |
| Rede e segurança | CONFIGURED | Duas AZs, subnets de dados isoladas, SG por serviço, tasks privadas, ALB limitado à origem CloudFront, TLS, WAF e acesso privado aos dados. |
| Entrega e operação | CONFIGURED | CI obrigatório, imagens SHA/digest, OIDC por environment, task de migration, snapshot para alteração de risco, smoke, rollback, aprovação de produção e gate por evidência do SHA. |
| Dados e email | CONFIGURED | Adaptador S3 para ficheiros reais; SESv2 com role da task, Reply-To e supressões. Administração inicial por convite cifrado de 1 h; sem seed demo em produção. |
| Observabilidade | CONFIGURED | CloudTrail, logs CloudWatch com retenção, métricas de filas, alarmes/SNS, synthetic sem credenciais de utilizador e Budgets 50/80/100%. |
| Docker e portabilidade | VALIDATED LOCALLY | Imagens non-root; cinco serviços locais healthy. Teste S3 com Moto: escrita condicional, confirmação, conteúdo, assinatura expira em 60 s e outro tenant não obtém assinatura. Não comprova políticas AWS. |
| Recuperação e finanças | VALIDATED LOCALLY | Novo projeto Compose, pg_dump/pg_restore para nova base, 19 migrations, integridade read-only (tenant/projeto/FKs, medições, pagamentos, retenções, adiantamentos, fundos, contratos e linhas de orçamento), identidade da obra e API ready confirmadas. Último ensaio: 32,88 s. |
| Segurança | VALIDATED LOCALLY | Auditoria npm de produção sem vulnerabilidades conhecidas. Trivy sem críticas em API/Web/worker após reconstrução. Gitleaks no histórico sem leaks: cinco SHA-256 históricos verificados contra os blobs originais, exceções individuais em .gitleaksignore. |
| Smoke e carga | VALIDATED LOCALLY | Login/logout e leitura local; 20 amostras por rota, concorrência 3, zero erros. P95 em ms: worklist 44,02; projetos 32,58; orçamento 61,58; cronograma 49,89; diários 50,34; financeiro 61,90. Não são medições de staging AWS. |
| Browsers | VALIDATED LOCALLY | Login, dashboard, diário, inspeção e NCR: Chrome Android e iPhone WebKit em viewports emulados, Edge desktop Windows e Firefox desktop Linux. Formulários de acesso inativos antes da hidratação e POST como fallback; teste sem JavaScript. Dispositivos físicos/UAT não testados. |
| Staging e produção AWS | PENDING EXTERNAL ACTION | Sem URL real, TLS real, health ou smoke AWS; nenhum dos ambientes está live. |
| Operação AWS/piloto | PENDING EXTERNAL ACTION | AWS Account/Organizations, SSO/IAM Identity Center, perfis/roles e IDs autorizados, domínio/zona/delegação DNS, OPS_ALERT_EMAIL, SUPPORT_EMAIL, FROM_EMAIL, REPLY_TO, orçamento, acesso SES fora do sandbox e aprovações de staging e produção. |
| Comprovações externas | NOT DONE | Plan/apply real, exercício RDS PITR/S3 version restore na AWS, entrega SES a utilizador real, verificação dos alarmes/custos reais, rollout/rollback ECS e aceite do cliente. |

## Resultados finais locais

| Verificação | Resultado |
|---|---|
| Lint / Typecheck / Build | PASS em Docker |
| Unit / Integration / E2E | 212 / 215 / 23 passaram |
| S3 / release / browsers | 1 integração S3, 4 checks offline de release e 4 jornadas de leitura em browsers passaram |
| Imagens API, Web e worker | Build, health e Trivy: zero achados críticos nas três imagens finais |
| Job de migration | Imagem dedicada executou preflight com 19 migrations aplicadas, nenhuma pendente, e terminou com schema atualizado |
| Restore / integridade | PASS; base e API independentes, sem substituir dados existentes |
| Go-live | Bloqueado sem evidências externas; o gate vazio produz 19 itens MANUAL e código não zero |

## Evidências e reprodução
- [Arquitetura](aws-architecture.md), [staging](staging.md), [produção](production.md), [rollback](rollback.md), [backup/restore](backup-restore.md), [DR](disaster-recovery.md), [monitorização](monitoring.md), [incidentes](incident-response.md), [UAT](pilot-uat.md), [checklist](production-checklist.md) e [gate](go-live.md).
- Docker: `docker compose --profile validation build tests`, preparar PostgreSQL/Redis exclusivos de testes e executar `docker compose --profile validation run --rm tests`. Nunca apontar a suite mutante a produção.
- S3 local: subir `infrastructure/docker/compose.s3-test.yml`, executar `npx vitest run tests/storage` com credenciais fictícias de emulador e região af-south-1; desligar o emulador. AWS real usa credenciais da task.
- Integridade/restore: `python infrastructure/release/restore-drill.py`. Inventário read-only com `node dist/scripts/storage-integrity.js`; guardar relatório com acesso restrito. Objetos suspeitos nunca são apagados automaticamente.
- Browser safe: `npx playwright test -c playwright.pilot.config.ts` com origem explicitamente autorizada, conta de leitura e projeto. Fluxos de mutação e financeiros ficam na suite isolada de E2E; jamais executar contra produção.
- Evidências locais em `work/` ignorado por Git: m9-baseline.txt, m9-final.log, m9-ui-final.log, m9-migration-job.log, m9-final-restore.log, m9-smoke-local.log, m9-load-local.log, m9-trivy-release-*.json, m9-gitleaks-verified.log, m9-audit-final.json e m9-browser-matrix-2.log/m9-firefox-linux.log.

O teste adicional do operador percorreu bootstrap → entrega pelo worker local → ativação → replay negado → login. Quatro testes offline de release verificaram bloqueio por scan crítico, migration falhada, rollback após falha do smoke e rejeição de aprovação sem evidência. A auditoria completa incluindo ferramentas de desenvolvimento ainda reportou sete ocorrências moderadas; nenhuma foi reportada na auditoria de dependências de produção.

O gate real permanece MANUAL/bloqueado sem evidência externa do SHA. RPO ≤15 min e RTO ≤4 h são objetivos do piloto, não garantias nem medições cloud. Não foi criada tag comercial.
