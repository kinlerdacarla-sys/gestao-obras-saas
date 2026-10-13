import { Decimal } from "decimal.js";
import { amount, fixed, percentage, problem } from "./commercial.js";
export {
  amount,
  fixed,
  problem,
  assertVersion,
  percentage,
} from "./commercial.js";
export function independent(creator: string, actor: string) {
  if (creator === actor)
    problem(
      "SELF_APPROVAL_NOT_ALLOWED",
      "O autor não pode aprovar ou certificar o próprio registo",
      403,
    );
}
export function measurementValues(
  previous: string,
  current: string,
  quantity: string,
  price: string,
  limit: string,
  previousAmount?: string,
) {
  const p = new Decimal(previous),
    c = new Decimal(current),
    q = new Decimal(quantity),
    u = amount(price);
  if (!c.isFinite() || c.lt(0) || c.decimalPlaces() > 4)
    problem("VALIDATION_ERROR", "Quantidade inválida");
  const cumulative = p.plus(c);
  if (cumulative.gt(q))
    problem(
      "MEASUREMENT_QUANTITY_EXCEEDS_CONTRACT",
      "Quantidade acumulada excede o contrato",
      409,
    );
  const before =
      previousAmount === undefined
        ? new Decimal(fixed(p.mul(u)))
        : amount(previousAmount),
    now = new Decimal(fixed(c.mul(u))),
    total = before.plus(now);
  if (total.gt(amount(limit)))
    problem(
      "MEASUREMENT_VALUE_EXCEEDS_CONTRACT",
      "Valor acumulado excede o contrato",
      409,
    );
  return {
    previousQuantity: p.toFixed(4),
    currentQuantity: c.toFixed(4),
    cumulativeQuantity: cumulative.toFixed(4),
    previousAmount: fixed(before),
    currentAmount: fixed(now),
    cumulativeAmount: fixed(total),
  };
}
export function recovery(
  gross: string,
  outstanding: string,
  method: string,
  percent: string,
  fixedAmount: string,
  manual: string,
) {
  const available = amount(outstanding);
  const requested =
    method === "PERCENTAGE"
      ? amount(gross).mul(percentage(percent)).div(100)
      : amount(method === "FIXED" ? fixedAmount : manual);
  if (method === "MANUAL" && requested.gt(available))
    problem(
      "ADVANCE_RECOVERY_EXCEEDS_OUTSTANDING",
      "Recuperação excede saldo",
      409,
    );
  return fixed(Decimal.min(requested, available));
}
export function measurementTotals(
  gross: string,
  retentionPercent: string,
  advance: string,
  deductions: string,
) {
  const g = amount(gross),
    retention = new Decimal(
      fixed(g.mul(percentage(retentionPercent)).div(100)),
    ),
    net = g.minus(retention).minus(amount(advance)).minus(amount(deductions));
  if (net.lt(0))
    problem(
      "INVALID_NET_CERTIFIED_AMOUNT",
      "Deduções excedem o valor bruto",
      409,
    );
  return {
    grossAmount: fixed(g),
    retentionAmount: fixed(retention),
    advanceRecoveryAmount: fixed(amount(advance)),
    otherDeductionsAmount: fixed(amount(deductions)),
    netCertifiedAmount: fixed(net),
  };
}
export function paymentState(
  net: string,
  paid: string,
): "CERTIFIED" | "PARTIALLY_PAID" | "PAID" {
  const n = amount(net),
    p = amount(paid);
  if (p.gt(n))
    problem("PAYMENT_EXCEEDS_OUTSTANDING", "Pagamento excede saldo", 409);
  return p.isZero() ? "CERTIFIED" : p.eq(n) ? "PAID" : "PARTIALLY_PAID";
}
export function ledgerBalance(
  rows: { type: string; amount: string }[],
  positive: string[],
) {
  return fixed(
    rows.reduce(
      (sum, row) =>
        positive.includes(row.type)
          ? sum.plus(amount(row.amount))
          : sum.minus(amount(row.amount)),
      new Decimal(0),
    ),
  );
}
