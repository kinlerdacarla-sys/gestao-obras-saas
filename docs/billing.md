# Faturação manual

O provider MANUAL_BILLING não processa cartões, checkout nem webhooks. Não se apresentam pagamentos online fictícios. Drafts são idempotentes por tenant/chave e usam Decimal; a consulta exige tenant correto. Registos são preservados.

`/settings/billing` mostra apenas faturas da empresa autenticada: número, período, criação, vencimento, valor, moeda e estado. Sem registos apresenta empty state. O schema atual não contém documento fiscal associado; por isso não se oferece um download inexistente. A emissão fiscal e o recebimento seguem o processo comercial do operador; o ecrã não é um emissor fiscal certificado.

Preços nulos no catálogo são “sob consulta”. Alterar plano atualiza direitos e ciclo, sem afirmar que houve cobrança. Regularização de subscrição é uma ação administrativa auditada, distinta de comprovar pagamento.
