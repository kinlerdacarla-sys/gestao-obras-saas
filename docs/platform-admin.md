# Administração da plataforma

`/platform/login` usa identidade PlatformUser separada do Tenant ADMIN. Cookie opaco HttpOnly, SameSite strict, caminho /api/v1/platform, 30 minutos. Alterações críticas exigem login há menos de 10 minutos. Um Tenant ADMIN não ganha acesso por conhecer IDs.

SUPER_ADMIN consulta dashboard, `/platform/tenants`, pesquisa/paginação e detalhe com Overview, Subscription, Usage, Users, Projects, Audit e Support. Listas diagnósticas mostram até 100 utilizadores/obras e 50 eventos recentes; não são exportações completas. Suspender/reativar requer motivo e confirmação do identificador na UI. API regista tenant_status_events e platform_audit_logs na mesma transação. Fecho é terminal. Não há impersonação.

Bootstrap inicial: no container migration executar `npx tsx scripts/bootstrap-platform.ts`, fornecendo PLATFORM_BOOTSTRAP_EMAIL, PLATFORM_BOOTSTRAP_NAME, PLATFORM_BOOTSTRAP_PASSWORD (mínimo 16 caracteres) e PLATFORM_BOOTSTRAP_REASON pelo secret store. O script exige uma identidade nova e recusa executar se já existir um SUPER_ADMIN ativo. Usa transação, lock global, Argon2 e auditoria PLATFORM_BOOTSTRAPPED. Nunca promove automaticamente admin@example.com. Não incluir valores em argumentos, histórico de shell ou Git. O MFA não é implementado na aplicação; aplicar proteção adicional de identidade no ingresso antes de lançamento.
