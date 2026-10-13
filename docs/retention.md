# Retenções e libertação

Retenção de cada medição = round(GrossAmount × ContractRetentionPercentage / 100, 2). Só a certificação cria WITHHELD. `retention_transactions` é append-only; RELEASED reserva uma libertação aprovada e REVERSED compensa uma certificação estornada.

Saldo disponível = WITHHELD − RELEASED − REVERSED. O saldo é calculado do ledger, nunca de um contador livremente editável. A aprovação de uma libertação reserva imediatamente o saldo; o pagamento não o reduz novamente.

GET /api/v1/projects/:projectId/contracts/:id/retention retorna saldos e páginas de movimentos/libertações. POST /contracts/:id/retention-releases cria DRAFT com amount e reason; gestor submete em /retention-releases/:id/submit; outro ADMIN/FINANCIER aprova em /approve. /reject preserva histórico de auditoria. Estados DRAFT, SUBMITTED, APPROVED, REJECTED, PAID.

Libertações positivas não podem exceder o saldo disponível, verificado novamente na aprovação sob bloqueio transacional da obra. Pagamento usa retentionReleaseId e fornecedor do contrato; admite pagamentos parciais. A libertação fica PAID quando integralmente paga. Estornar um pagamento devolve-a a APPROVED, mantendo a reserva no ledger.

A página Retenções e adiantamentos está no detalhe do contrato. Aprovar a própria libertação é proibido.
