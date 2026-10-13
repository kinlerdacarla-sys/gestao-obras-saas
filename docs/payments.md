# Pagamentos

PaymentModule regista saídas para fornecedores; financiamento recebido é uma entidade distinta. ADMIN pode lançar e estornar. ADMIN, MANAGER, FINANCIER e CLIENT participantes consultam pagamentos da obra.

POST /api/v1/projects/:projectId/payments exige exatamente uma origem: measurementId, expenseId ou retentionReleaseId. supplierId tem de corresponder à origem; contractId, quando informado, também. Medição deve estar certificada; despesa APPROVED e com fornecedor; libertação APPROVED. A transação valida o saldo ainda disponível, evitando pagamentos excessivos concorrentes.

Métodos: BANK_TRANSFER, CASH, CHEQUE, MOBILE_MONEY, OTHER. Regista amount decimal positivo, paymentDate, reference e description. Numeração é sequencial por obra. Requer Idempotency-Key; chaves são isoladas por tenant, obra e autor, com hash canónico de ação e corpo. Repetição devolve o resultado original; mudança de corpo devolve IDEMPOTENCY_CONFLICT.

PaidAmount soma pagamentos POSTED. OutstandingPayable = NetCertifiedAmount − PaidAmount. Zero pago mantém CERTIFIED; parcial é PARTIALLY_PAID; integral é PAID. Overpayment devolve PAYMENT_EXCEEDS_OUTSTANDING. Pagamentos de despesas e retenções não entram no cartão Pago em medições, evitando misturar bases de comparação.

POST /payments/:id/reverse exige version, motivo e Idempotency-Key. Cria payment_reversals append-only, muda o pagamento para REVERSED e recalcula origem na mesma transação. Não há DELETE. Uma despesa não pode ser estornada com pagamentos POSTED. Reversão duplicada devolve PAYMENT_ALREADY_REVERSED, exceto repetição com a mesma chave, que devolve a resposta original.

Comprovativos são anexados em /payments/:id/documents. O upload pode incrementar a versão, sem alterar montante, origem ou data do pagamento. Conteúdo privado é validado por tamanho, MIME, assinatura do ficheiro e SHA-256.
