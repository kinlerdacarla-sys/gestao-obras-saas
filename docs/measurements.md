# Medições

A M5 acrescenta MeasurementModule ao monólito existente. Todas as rotas estão em `/api/v1/projects/:projectId`; contexto da empresa vem da sessão. Dinheiro é NUMERIC(18,2), quantidades NUMERIC(18,4), ambos enviados como strings. A moeda é MZN.

## Itens e cálculo

`POST /measurements` recebe contrato ativo, periodStart, periodEnd e descrição. O número MED-001 é atribuído sequencialmente por contrato dentro da transação. `POST/PATCH /measurements/:id/items` recebe contractItemId, currentQuantity e version da medição. O servidor copia descrição, unidade, preço e vínculo orçamental do item contratual. Totais fornecidos pelo cliente são rejeitados pelo schema.

PreviousQuantity e PreviousAmount somam medições de número anterior em APPROVED, CERTIFIED, PARTIALLY_PAID ou PAID. CurrentAmount = round(CurrentQuantity × UnitPrice, 2). CumulativeQuantity = PreviousQuantity + CurrentQuantity; CumulativeAmount = PreviousAmount + CurrentAmount. Quantidade e valor acumulados não podem exceder o item contratual, nem o total medido exceder o valor contratual atual. Um contrato de 100 unidades a 10.000 mede 20 e depois 30: anterior 20, atual 30, acumulado 50 e 500.000 MZN. Depois das primeiras 20, 80 são permitidas, 81 não.

Itens por preço global da M4 (sem quantidade) são tratados como 1 unidade do valor global. Assim, 0,2 de um item de 5 milhões corresponde a 1 milhão. As adendas da M4 alteram o valor global, sem alterar quantidades de itens. Uma adenda global não autoriza automaticamente quantidades adicionais. Supressões não podem reduzir o contrato abaixo das medições já aprovadas.

## Workflow

DRAFT → SUBMITTED → FISCAL_REVIEW → APPROVAL_REVIEW → APPROVED → CERTIFIED → PARTIALLY_PAID → PAID. A aprovação fiscal pode iniciar e concluir FISCAL_REVIEW numa operação, preservando as duas transições no histórico. Fiscal pode rejeitar ou pedir correções: FISCAL_REJECTED; gestor reabre para DRAFT. Rejeição final devolve a DRAFT. Pareceres anteriores e motivos são preservados.

MANAGER/ADMIN editam rascunhos e submetem. INSPECTOR/ADMIN fazem revisão fiscal. FINANCIER faz aprovação final por defeito; ADMIN pode configurar CLIENT em `/contracts/:id/financial-settings` antes de existirem medições em revisão/aprovadas. ADMIN certifica. O autor nunca pode aprovar fiscalmente, aprovar finalmente ou certificar o próprio registo, incluindo ADMIN e independentemente de PREVENT_SELF_APPROVAL.

Certificação recalcula e verifica os valores aprovados, exige ordem de certificação e grava movimentos de retenção/recuperação atomicamente. Itens e cálculos certificados ficam imutáveis, também por triggers PostgreSQL. As medições posteriores válidas impedem aprovar uma anterior que alteraria os acumulados.

Estorno exige motivo, ADMIN e Idempotency-Key. Não apaga documentos ou histórico. Primeiro devem ser estornados pagamentos; não pode haver medição posterior válida, pedidos de financiamento comprometidos ou retenção já libertada sem saldo para compensar. A medição fica CANCELLED com lançamentos compensatórios.

## API

GET/POST /measurements; GET/PATCH /measurements/:id; GET/POST /:id/items; PATCH/DELETE /:id/items/:itemId; POST /:id/deductions; DELETE /:id/deductions/:deductionId. Ações POST /:id/submit, fiscal-start, fiscal-approve, fiscal-reject, fiscal-request-changes, reopen, approve, reject, certify, reverse. Versão obrigatória nas mutações de registos existentes. Listas têm page e limit (máximo 200).
