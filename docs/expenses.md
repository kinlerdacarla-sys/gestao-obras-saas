# Centros de custo, despesas e comprovativos (M4)

Centros de custo por obra, código único, hierarquia opcional e estados ACTIVE/INACTIVE. ADMIN e MANAGER autorizado criam, editam e desativam. A hierarquia é serializada por obra para impedir ciclos concorrentes. Centros inativos não aceitam novas despesas. A gestão encontra-se em `/projects/[id]/cost-centers`.

Despesas obrigam número único por obra, data, descrição, centro de custo e subtotal. Fornecedor, contrato e rubrica são opcionais. Custos sem orçamento são permitidos. Se existir contrato, o fornecedor é validado/preenchido pelo backend; só contratos ACTIVE/SUSPENDED/COMPLETED aceitam despesas. Recursos associados precisam pertencer ao mesmo tenant/obra.

`totalAmount = subtotal + taxAmount`, com imposto zero por defeito **apenas na criação**. O cliente apresenta o cálculo em tempo real, mas não envia o total como autoridade. Atualizações parciais preservam valores omitidos.

## Workflow

DRAFT → SUBMITTED → APPROVED ou REJECTED. ADMIN/MANAGER criam/editam/submetem; ADMIN aprova/rejeita. `PREVENT_SELF_APPROVAL=true` rejeita criador=aprovador, incluindo ADMIN, com `SELF_APPROVAL_NOT_ALLOWED`. Para aprovar é necessário outro ADMIN. Não há permissão de aprovação para MANAGER. INSPECTOR, CLIENT e FINANCIER não consultam despesas individuais nem comprovativos no MVP; FINANCIER vê custos agregados.

APPROVED é imutável. ADMIN pode estornar com motivo: cria `expense_reversals` e altera status para REVERSED na mesma transação, mantendo valores, anexos e auditoria. Não existe hard delete financeiro. Apenas APPROVED entra no realizado; estorno remove o valor dos indicadores. REJECTED não é reutilizada: correção usa novo registo.

## Documentos

Reutiliza o DocumentModule e volume privado existente. `expense_documents` associa tipo INVOICE, RECEIPT, DELIVERY_NOTE, PURCHASE_ORDER ou OTHER. POST cria ticket autenticado/assinado de 10 minutos; PUT multipart recebe PDF/JPEG/PNG/WEBP até 20 MiB; POST confirm verifica conteúdo, MIME, tamanho e SHA-256. Ticket e confirmação usam a versão da despesa e só funcionam em DRAFT. GET content revalida autorização. Links não tornam comprovativos públicos. Erros de upload não aprovam nem anexam silenciosamente o ficheiro.

## API

Prefixo `/api/v1/projects/:projectId`:

- `/cost-centers`: GET/POST; `/:id`: PATCH; `/:id/deactivate`: POST.
- `/expenses`: GET/POST; `/:expenseId`: GET/PATCH.
- `/:expenseId/submit`, `/approve`, `/reject`, `/reverse`: POST com `version`; reject/reverse exigem `reason`.
- `/:expenseId/documents`: GET/POST; `/:documentId/upload`: PUT; `/confirm`: POST; `/content`: GET.
- `/:expenseId/history`: GET.

Filtros: `date_from`, `date_to`, `supplier`, `contract`, `cost_center`, `status`, `budget_item`, `search`. Listagem paginada por 50, máximo 200. Conflito de edição responde `409 RESOURCE_VERSION_CONFLICT`.
