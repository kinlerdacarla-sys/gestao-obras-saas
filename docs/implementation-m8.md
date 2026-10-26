# M8 — estado de implementação

Atualizado em 2026-10-26. **M8 em desenvolvimento; não concluído e não pronto para M9.**

## Base validada

M7 no commit `0904b47064a9ba5f942af9859c838680e7adfb96`, sem alterações locais no início.
A regressão inicial em Docker (`work/m8-baseline.txt`) passou migrations (14), lint,
typecheck, 180 testes unitários, 191 de integração, 18 E2E e build.
CI desse commit: https://github.com/kinlerdacarla-sys/gestao-obras-saas/actions/runs/39757518027

## Implementação atual

- Migration aditiva `202610260015_saas_commercialization`, validada no PostgreSQL
  isolado e aplicada no Compose local, preservando os dados existentes. Não altera dados das obras; adiciona CLOSED ao enum de tenant.
- Identidades PLATFORM SUPER_ADMIN/SUPPORT distintas de Tenant ADMIN. Sessões opacas,
  hash no banco, cookie HttpOnly com caminho de plataforma, CSRF Origin, expiração de
  30 minutos e reautenticação após 10 minutos para ações críticas. MFA ainda não implementado.
- API de plataforma: autenticação, logout, métricas agregadas sem receita inventada,
  listagem/detalhe de tenants, consulta de planos/auditoria, suspensão, reativação e fecho.
- Suporte autorizado pelo Super Admin, prazo de 15 minutos, diagnóstico apenas de leitura,
  sem assumir identidade de utilizador. Auditoria de abertura/encerramento e acesso condicionado
  ao operador designado. O frontend com banner ainda falta.
- Catálogo, limites e features no schema; seed idempotente separado. Preços nulos até
  configuração comercial. O seed SaaS ainda não está ligado ao seed principal.
- EntitlementService, StorageUsageService e QuotaService: cálculo de uso a partir de recursos,
  BigInt para bytes, reservas de upload, bloqueio transacional por tenant e snapshot idempotente.
- Políticas de transição, trial efetivo, cancelamento e downgrade; SubscriptionService
  testa versão antes da alteração. As APIs de subscrição do tenant ainda não estão expostas.
- Abstração BillingProvider e implementação manual com drafts idempotentes. Não há checkout,
  gateway externo nem webhooks falsos. Emissão/baixa de invoices ainda falta.
- Serviço transacional de onboarding implementado mas deliberadamente não exposto antes
  de completar o enforcement nas operações existentes. A aceitação legal deve ser feita
  pelo administrador convidado após verificar o email, não pelo operador em seu nome.
- Telemetria HTTP com X-Request-ID gerado no servidor, logs estruturados sem query/body/headers, métricas por processo protegidas por Super Admin, interface segura para error tracking e `/health/live`/`health/ready`.
- Entrega de convites sem tokens nos logs: SMTP configurado ou EML privado no ambiente local.
  O envio real de email não foi validado. Falha de entrega após provisionamento exige reenvio.

## Quotas e catálogo de demonstração

| Plano | Obras não concluídas | Utilizadores ativos/convidados | GiB | Relatórios/mês |
|---|---:|---:|---:|---:|
| Starter | 3 | 10 | 10 | 10 |
| Professional | 20 | 75 | 100 | 250 |
| Enterprise | sem limite | sem limite | sem limite | sem limite |

Números de seed, não oferta comercial definitiva. AI_ACTIONS é zero; IA não é exposta.
Starter não possui advanced reports. Professional/Enterprise habilitam as funcionalidades
existentes de relatórios, analytics, portais e qualidade. API_ACCESS, CUSTOM_BRANDING e
PRIORITY_SUPPORT permanecem desativados porque o respetivo produto ainda não foi entregue.
Flags operacionais nunca concedem entitlements comerciais.

## Trabalho obrigatório restante

1. Ligar quotas a criação/reativação de obras, convites/utilizadores, todos os uploads e
   geração de relatórios; testar concorrência pela API, não só pelo serviço.
2. Definir migração explícita de tenants existentes, sem fallback silencioso que contorne quotas.
3. Aplicar estado da subscrição e tenant a mutações, mantendo login/leitura limitada/exportação
   autorizada; revisão também dos workers e downloads.
4. APIs de planos editáveis e feature flags, controlo de versões e auditoria de todas as mutações.
5. Expor onboarding com convite, aceitação legal autenticada, preferências e checklist/empty states.
6. APIs e páginas de subscrição/billing; emissão e baixa manual de invoices, sem pagamento online.
7. Worker de expiração de trial/cancelamento, alertas e uso acumulado de relatórios sem perdas.
8. Exportação isolada de dados/documentos, limites de armazenamento dos artefactos e retenção.
9. Frontend de plataforma, suporte com banner permanente e testes E2E de todos os fluxos M8.
10. Rate limiting por tenant/user/IP; ampliar métricas de filas/jobs/DB, configurar destino externo
    de error tracking e validação de configuração para staging/production.
11. Imagens de produção, configuração isolada de staging, pipeline de release com aprovação,
    secret scan, backups e teste de restore não destrutivo.
12. Documentação final exigida, regressão completa final, commit/push e CI remoto do M8 verde.

Nenhum deploy de produção foi executado. Não usar esta etapa como autorização de lançamento.
