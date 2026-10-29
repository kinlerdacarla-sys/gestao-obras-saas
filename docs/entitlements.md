# Entitlements

A fonte comercial é `Subscription → SubscriptionPlan → PlanFeature`, consultada no backend a cada pedido. Feature flags operacionais nunca concedem direitos de um plano.

- ADVANCED_REPORTS: ReportService, pedido, worker, consulta e download; PROJECT_PROGRESS é o relatório básico.
- PORTFOLIO_ANALYTICS: dashboard/portfolio e analytics/projects/compare. Analytics de uma obra mantém autorização operacional.
- CLIENT_PORTAL e FINANCIER_PORTAL: guard central para o perfil do tenant e ExecutionAccess para o perfil específico da obra.
- ADVANCED_QUALITY: endpoints de inspeção, pedidos, NCR e ações corretivas.
- API_ACCESS e CUSTOM_BRANDING: política preparada e catálogo desativado; não existem produtos públicos fictícios.

Negação: FEATURE_NOT_AVAILABLE. `/entitlements` fornece os direitos da própria empresa. O frontend apresenta bloqueio/ação de upgrade em analytics e aviso nos relatórios; esconder navegação não é uma medida de segurança.
