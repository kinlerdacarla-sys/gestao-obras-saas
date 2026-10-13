# Financiamento

FundingModule reutiliza organizações existentes. Uma obra admite vários funding_agreements com organização financiadora, número, título, montante, datas, estado e versão. ADMIN cria/atualiza; ADMIN, MANAGER, FINANCIER e CLIENT atribuídos à obra consultam. A autorização de FINANCIER é por participação na obra, não por acesso a todas as obras da empresa.

Estados de acordo: DRAFT, ACTIVE, SUSPENDED, CLOSED, CANCELLED. Pedidos/desembolsos exigem acordo ACTIVE. Montante do acordo não pode ficar abaixo dos pedidos já aprovados. Cada pedido tem número sequencial por acordo e pode ligar uma medição certificada da mesma obra.

Fluxo de pedido: DRAFT → SUBMITTED → APPROVED → PARTIALLY_DISBURSED → DISBURSED; rejeição guarda motivo e aprovador. ADMIN/MANAGER cria/submete; outro ADMIN/FINANCIER aprova. Soma dos valores aprovados dos pedidos comprometidos não pode exceder approvedAmount. Aprovação parcial é permitida e não pode exceder requestedAmount.

POST /disbursement-requests/:id/disbursements regista montante, data e referência. Exige versão do pedido e Idempotency-Key. Cada desembolso é POSTED; ADMIN pode estornar com motivo em /disbursements/:id/reverse. Saldo do pedido e estado são recalculados; histórico original é preservado. Desembolso não cria pagamento ao fornecedor.

FundingBalance = soma dos acordos reconhecidos (ACTIVE/SUSPENDED/CLOSED) − desembolsos POSTED. Acordos individuais mostram approvedAmount − desembolsos válidos. Listas GET /funding-agreements e /disbursement-requests são paginadas. Comprovativos usam DocumentModule em /funding-agreements/:id/documents.
