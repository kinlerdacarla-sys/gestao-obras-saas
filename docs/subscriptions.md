# Subscrições

`GET /subscription`, `POST /subscription/change-plan` e `POST /subscription/cancel` são relativos ao tenant autenticado e exclusivos de ADMIN. Versões desatualizadas devolvem VERSION_CONFLICT. Cancelamento no final do período mantém operação até `currentPeriodEnd`; depois aplica leitura, sem apagar dados.

ACTIVE e TRIALING permitem operações dentro das quotas. PAST_DUE, EXPIRED e CANCELLED ficam em leitura. Tenant ou subscrição SUSPENDED bloqueia mutações com SUBSCRIPTION_SUSPENDED. O CommercialPolicy chamado pelo SessionGuard cobre também os endpoints anteriores M1–M7. Autenticação, faturação, subscrição e exportação continuam disponíveis. A atribuição de quotas volta a verificar o estado sob bloqueio transacional.

O worker de reconciliação aplica expiração/cancelamento e regista aviso TRIAL_ENDING nos três dias anteriores, sem criar notificações fictícias de obras. A página apresenta a data de trial e o estado efetivo mesmo antes do próximo ciclo do worker. O Super Admin pode alterar estado com motivo e versão em `POST /platform/tenants/:id/subscription/status`; é auditado e exige autenticação recente. Transições inválidas são rejeitadas pelo domínio.
