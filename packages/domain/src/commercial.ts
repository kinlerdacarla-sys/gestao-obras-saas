import { Decimal } from "decimal.js";
import { MONEY_MAX } from "./budget.js";
export class CommercialError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function problem(code: string, message: string, status = 400): never {
  throw new CommercialError(code, message, status);
}
export function amount(value: string) {
  const d = new Decimal(value);
  if (!d.isFinite() || d.lt(0) || d.gt(MONEY_MAX) || d.decimalPlaces() > 2)
    problem("VALIDATION_ERROR", "Valor monet�rio inv�lido");
  return d;
}
export function fixed(value: Decimal) {
  if (value.abs().gt(MONEY_MAX))
    problem("VALIDATION_ERROR", "Valor excede o limite monet�rio");
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
export function percentage(
  value: string,
  code = "INVALID_RETENTION_PERCENTAGE",
) {
  const d = new Decimal(value);
  if (!d.isFinite() || d.lt(0) || d.gt(100) || d.decimalPlaces() > 2)
    problem(code, "Percentagem deve estar entre 0 e 100");
  return d;
}
export function calculateRetention(value: string, percent: string) {
  return fixed(amount(value).mul(percentage(percent)).div(100));
}
export function calculateAdvance(
  original: string,
  percent = "0",
  fixedAmount = "0",
) {
  const p = percentage(percent, "INVALID_ADVANCE_PERCENTAGE"),
    a = amount(fixedAmount);
  if (p.gt(0) && a.gt(0))
    problem("INVALID_ADVANCE_PERCENTAGE", "Escolha percentual ou valor fixo");
  const result = p.gt(0) ? amount(original).mul(p).div(100) : a;
  if (result.gt(amount(original)))
    problem("INVALID_ADVANCE_PERCENTAGE", "Adiantamento excede valor original");
  return fixed(result);
}
export function currentContractValue(
  original: string,
  additions: string,
  omissions: string,
) {
  const v = amount(original).plus(amount(additions)).minus(amount(omissions));
  if (v.lt(0))
    problem(
      "INVALID_AMENDMENT_TRANSITION",
      "Valor contratual n�o pode ser negativo",
      409,
    );
  return fixed(v);
}
export function contractItemTotal(
  q?: string | null,
  p?: string | null,
  total?: string,
) {
  if (q != null && p != null) {
    const n = new Decimal(q);
    if (n.lt(0) || n.decimalPlaces() > 4 || n.gt("99999999999999.9999"))
      problem("VALIDATION_ERROR", "Quantidade inv�lida");
    return fixed(n.mul(amount(p)));
  }
  if (q != null || p != null || total === undefined)
    problem("VALIDATION_ERROR", "Indique quantidade e pre�o, ou total fixo");
  return fixed(amount(total));
}
export function expenseTotal(subtotal: string, tax = "0") {
  return fixed(amount(subtotal).plus(amount(tax)));
}
export function remainingBudget(
  budget: string,
  contracted: string,
  direct: string,
) {
  return fixed(amount(budget).minus(amount(contracted)).minus(amount(direct)));
}
export function overcontracted(budget: string, contracted: string) {
  return amount(contracted).gt(amount(budget))
    ? ["BUDGET_ITEM_OVERCONTRACTED"]
    : [];
}
export function assertVersion(actual: number, expected: number) {
  if (actual !== expected)
    problem(
      "RESOURCE_VERSION_CONFLICT",
      "Registo alterado; atualize a p�gina",
      409,
    );
}
export function selfApproval(
  creator: string,
  approver: string,
  enabled = true,
) {
  if (enabled && creator === approver)
    problem(
      "SELF_APPROVAL_NOT_ALLOWED",
      "Outro administrador deve aprovar este registo",
      403,
    );
}
export function contractTransition(state: string, action: string) {
  const map: Record<string, Record<string, string>> = {
    DRAFT: { activate: "ACTIVE" },
    ACTIVE: {
      suspend: "SUSPENDED",
      complete: "COMPLETED",
      terminate: "TERMINATED",
    },
    SUSPENDED: { activate: "ACTIVE", terminate: "TERMINATED" },
  };
  return (
    map[state]?.[action] ??
    problem(
      "INVALID_CONTRACT_TRANSITION",
      "Transi��o de contrato inv�lida",
      409,
    )
  );
}
export function approvalTransition(
  state: string,
  action: string,
  expense = false,
) {
  const map: Record<string, Record<string, string>> = {
    DRAFT: { submit: "SUBMITTED" },
    SUBMITTED: { approve: "APPROVED", reject: "REJECTED" },
    APPROVED: expense ? { reverse: "REVERSED" } : {},
  };
  return (
    map[state]?.[action] ??
    problem(
      expense ? "INVALID_EXPENSE_TRANSITION" : "INVALID_AMENDMENT_TRANSITION",
      "Transi��o inv�lida",
      409,
    )
  );
}
export function editable(
  state: string,
  entity: "CONTRACT" | "CONTRACT_AMENDMENT" | "EXPENSE",
) {
  if (state !== "DRAFT")
    problem(entity + "_IMMUTABLE", "Apenas rascunhos podem ser editados", 409);
}
