# Planos SaaS

O catálogo público é servido por `GET /api/v1/plans`. Starter: 3 obras ativas, 10 utilizadores, 10 GiB e 10 relatórios/mês. Professional: 20, 75, 100 GiB e 250. Enterprise: ilimitado nestes recursos. Ações de IA: zero em todos. Preços nulos significam consulta comercial, nunca preço zero nem pagamento confirmado.

A migration 16 atribui explicitamente LEGACY privado a tenants anteriores sem subscrição; conserva os seus direitos anteriores. A demonstração recebe Professional. Novos tenants não recebem LEGACY nem fallback ilimitado. O seed não sobrescreve condições comerciais existentes. A migration 18 normaliza apenas nomes ainda iguais aos códigos.

Os planos são comparados em `/settings/subscription`. Alterações usam versão da subscrição, bloqueio por tenant e validação de todas as quotas. A confirmação comercial é manual; não existe gateway online. Alterações do catálogo em produção exigem uma migration revista, mantendo limites existentes até migração comercial expressamente aprovada.
