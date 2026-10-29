# M8 — completion pass

Atualizado em 2026-10-29. Completion pass implementada e validada localmente. A aprovação de release exige também o CI verde do SHA exato, consultável no GitHub Actions.

## Implementado

- Quotas reais: criação/reativação de obras, convites, reservas e confirmação de uploads, aceitação idempotente de relatórios. Locks transacionais por tenant e revalidação de estado; snapshots de uso e reconciliação periódica.
- Guard central de subscrição, acesso limitado de leitura para suspensão/expiração/inadimplência, preservando autenticação, gestão e portabilidade. Entitlements de relatórios, portfólio, portais e qualidade no backend. API/branding futuros continuam desativados.
- Migration 16: catálogo e transição explícita de tenants existentes para LEGACY privado, sem fallback para novos tenants. Migration 17: outbox de convites cifrado, idempotência de relatórios e tamanhos de artefactos. Migration 18: nomes de catálogo. Seed SaaS integrado no seed principal sem sobrescrever valores existentes.
- `/signup`: seis passos; provisionamento atómico, convite pelo worker, ativação de conta, aceitação legal autenticada e checklist no dashboard.
- `/settings/subscription`: plano/estado/trial/período, barras e avisos 80/90/100%, comparação, downgrade, alteração versionada e cancelamento no fim do período.
- `/settings/billing`: faturas reais do tenant, estado vazio e faturação manual sem checkout fictício. Não inventa documento fiscal inexistente.
- `/settings/data-exports`: pedido, acompanhamento e download. JSON.gz com dados de domínio e metadados de documentos; worker, snapshot consistente, allowlist, segredos excluídos, download assinado vinculado ao administrador, expiração de 24 h e auditoria.
- `/platform`, login, tenants/lista/detalhe: overview, subscription, usage, users, projects, audit e suporte. Suspensão/reativação com confirmação forte e motivo; transições comerciais versionadas e auditadas.
- Suporte separado, autorizado pelo Super Admin, apenas diagnóstico de leitura, banner, prazo de 15 minutos e encerramento/expiração auditados. Sem impersonação ou exportação silenciosa.
- Configuração explícita de produção, cookies seguros, proxy restrito, CORS/CSRF, headers, logs estruturados sem payloads sensíveis e readiness de API/worker.
- Docker multi-stage com runtimes non-root, dependências de produção, tags SHA e migration job separado. Compose de release configurável com ambientes/volumes independentes; smoke de staging de leitura.
- CI ampliado com validação de migrations e build das imagens de produção, mantendo testes existentes. Sem deploy de produção.
- Runbooks de planos/subscrições/limites/onboarding/platform/support/billing/deployment/releases/backup/produção e checklist operacional.

## Validação desta completion pass

Regressão Docker limpa: 209 unitários, 212 testes de integração e 22 E2E passaram, juntamente com lint, typecheck, seed e build. Um teste adicional com Redis real passou após corrigir o encerramento prematuro de scanners vazios; o CI executa os 213 testes de integração juntos. Nenhuma asserção dos módulos anteriores foi removida.

Compose principal e release local: cinco serviços healthy; 18 migrations aplicadas. Runtimes API/worker sem TypeScript/Prisma CLI, UID 1000; worker estável sem reinícios após a correção. Smoke de leitura, bootstrap isolado e backup/restore PostgreSQL isolado passaram. Ver [evidências e limites](validation-m8.md).

## Operação antes de lançamento

DNS/TLS, SMTP real, storage/backup/PITR do fornecedor, contas e segredos de staging/produção, coleta externa de logs/erros e aprovação de produção são responsabilidades de provisionamento, descritas em production-checklist.md. Esta entrega prepara a configuração; não afirma que esses serviços remotos existem nem executa deploy de produção. MFA, gateway online, API pública e branding não são produtos fictícios implementados nesta milestone.
