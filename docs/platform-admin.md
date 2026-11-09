# Administração da plataforma

`/platform/login` usa identidade PlatformUser separada do Tenant ADMIN. Cookie opaco HttpOnly, SameSite strict, caminho /api/v1/platform, 30 minutos. Alterações críticas exigem login há menos de 10 minutos. Um Tenant ADMIN não ganha acesso por conhecer IDs.

SUPER_ADMIN consulta dashboard, `/platform/tenants`, pesquisa/paginação e detalhe com Overview, Subscription, Usage, Users, Projects, Audit e Support. Listas diagnósticas mostram até 100 utilizadores/obras e 50 eventos recentes; não são exportações completas. Suspender/reativar requer motivo e confirmação do identificador na UI. API regista tenant_status_events e platform_audit_logs na mesma transação. Fecho é terminal. Não há impersonação.

Bootstrap inicial: ver procedimento por convite em [production.md](production.md). O comando exige nome, email e motivo; recusa promover uma identidade de tenant ou criar outro Super Admin inicial.

O bootstrap M9 apenas cria uma identidade INVITED e um convite cifrado com prazo de uma hora, entregue pelo worker. Confirmar a caixa, definir password e entrar pelo login de plataforma. Ver production.md.
