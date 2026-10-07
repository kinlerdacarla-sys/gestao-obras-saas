import { Decimal } from "decimal.js";
Decimal.set({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
export const MONEY_MAX = "9999999999999999.99";
export const QUANTITY_MAX = "99999999999999.9999";
export class BudgetError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const budgetError = (code: string, message: string): never => {
  throw new BudgetError(code, message);
};
export function decimal(value: string, scale: number, max: string): Decimal {
  if (!/^\d+(\.\d+)?$/.test(value))
    return budgetError("BUDGET_IMPORT_INVALID", "Número inválido");
  const number = new Decimal(value);
  if (number.decimalPlaces() > scale || number.gt(max))
    return budgetError(
      "BUDGET_IMPORT_INVALID",
      "Precisão ou limite numérico excedido",
    );
  return number;
}
export function money(quantity: string, price: string): string {
  const result = decimal(quantity, 4, QUANTITY_MAX)
    .mul(decimal(price, 2, MONEY_MAX))
    .toDecimalPlaces(2);
  if (result.gt(MONEY_MAX))
    budgetError("BUDGET_IMPORT_INVALID", "Total acima do limite suportado");
  return result.toFixed(2);
}
export interface BudgetLine {
  budgetItemId: string;
  parentId: string | null;
  code: string;
  description: string;
  itemType: "GROUP" | "ITEM";
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
  quantity: string | null;
  unitPrice: string | null;
  totalValue: string;
}
export interface BudgetNode extends BudgetLine {
  total: string;
  children: BudgetNode[];
}
export function validateHierarchy(lines: BudgetLine[]): void {
  const active = lines.filter((x) => x.isActive),
    byId = new Map(active.map((x) => [x.budgetItemId, x])),
    codes = new Set<string>(),
    done = new Map<string, number>();
  for (const row of active) {
    if (codes.has(row.code))
      budgetError("BUDGET_DUPLICATE_CODE", `Código duplicado: ${row.code}`);
    codes.add(row.code);
    if (
      row.itemType === "ITEM" &&
      (!row.unit || row.quantity === null || row.unitPrice === null)
    )
      budgetError("BUDGET_IMPORT_INVALID", `Item incompleto: ${row.code}`);
    if (
      row.itemType === "GROUP" &&
      (row.quantity !== null || row.unitPrice !== null || row.unit !== null)
    )
      budgetError("BUDGET_IMPORT_INVALID", "Grupo não possui valores próprios");
    const path = new Set<string>();
    let current: BudgetLine | undefined = row;
    while (current && !done.has(current.budgetItemId)) {
      if (path.has(current.budgetItemId))
        budgetError("BUDGET_IMPORT_INVALID", "Referência circular");
      path.add(current.budgetItemId);
      if (path.size > 100)
        budgetError("BUDGET_IMPORT_INVALID", "Máximo de 100 níveis");
      if (!current.parentId) {
        current = undefined;
        break;
      }
      const parent = byId.get(current.parentId);
      if (!parent || parent.itemType !== "GROUP")
        budgetError(
          "BUDGET_IMPORT_INVALID",
          `Pai inexistente ou não é grupo: ${current.code}`,
        );
      current = parent;
    }
    let depth = current ? (done.get(current.budgetItemId) ?? 0) : 0;
    for (const id of [...path].reverse()) {
      depth++;
      if (depth > 100)
        budgetError("BUDGET_IMPORT_INVALID", "Máximo de 100 níveis");
      done.set(id, depth);
    }
  }
}
export function buildTree(lines: BudgetLine[]) {
  validateHierarchy(lines);
  const nodes = new Map<string, BudgetNode>(),
    roots: BudgetNode[] = [];
  for (const row of lines
    .filter((x) => x.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)))
    nodes.set(row.budgetItemId, {
      ...row,
      total:
        row.itemType === "ITEM" ? money(row.quantity!, row.unitPrice!) : "0.00",
      children: [],
    });
  for (const node of nodes.values()) {
    if (node.parentId) nodes.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const order: BudgetNode[] = [];
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop()!;
    order.push(node);
    stack.push(...node.children);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    if (node.itemType === "GROUP")
      node.total = node.children
        .reduce((sum, c) => sum.add(c.total), new Decimal(0))
        .toFixed(2);
  }
  const total = roots.reduce((sum, n) => sum.add(n.total), new Decimal(0));
  if (total.gt(MONEY_MAX))
    budgetError("BUDGET_IMPORT_INVALID", "Total do orçamento acima do limite");
  return { items: roots, total: total.toFixed(2), currency: "MZN" };
}
export function variation(previous: string, current: string) {
  const a = new Decimal(previous),
    b = new Decimal(current),
    difference = b.sub(a);
  return {
    previousTotal: a.toFixed(2),
    newTotal: b.toFixed(2),
    difference: difference.toFixed(2),
    differencePercentage: a.isZero()
      ? b.isZero()
        ? "0.00"
        : null
      : difference.div(a).mul(100).toFixed(2),
  };
}
export function compareRevisions(before: BudgetLine[], after: BudgetLine[]) {
  const old = new Map(
      before.filter((x) => x.isActive).map((x) => [x.budgetItemId, x]),
    ),
    next = new Map(
      after.filter((x) => x.isActive).map((x) => [x.budgetItemId, x]),
    );
  const items = [...new Set([...old.keys(), ...next.keys()])].flatMap((id) => {
    const a = old.get(id),
      b = next.get(id);
    if ((b ?? a)!.itemType === "GROUP") return [];
    const quantityChanged = a?.quantity !== b?.quantity,
      priceChanged = a?.unitPrice !== b?.unitPrice;
    const classification = !a
      ? "ADDED"
      : !b
        ? "REMOVED"
        : quantityChanged && priceChanged
          ? "QUANTITY_AND_PRICE_CHANGED"
          : quantityChanged
            ? "QUANTITY_CHANGED"
            : priceChanged
              ? "PRICE_CHANGED"
              : "UNCHANGED";
    const previousValue = a ? money(a.quantity!, a.unitPrice!) : "0.00",
      newValue = b ? money(b.quantity!, b.unitPrice!) : "0.00";
    return [
      {
        id,
        code: (b ?? a)!.code,
        description: (b ?? a)!.description,
        classification,
        metadataChanged:
          !!a &&
          !!b &&
          (a.code !== b.code ||
            a.description !== b.description ||
            a.parentId !== b.parentId ||
            a.unit !== b.unit),
        previousQuantity: a?.quantity ?? null,
        newQuantity: b?.quantity ?? null,
        previousUnitPrice: a?.unitPrice ?? null,
        newUnitPrice: b?.unitPrice ?? null,
        previousValue,
        newValue,
        ...variation(previousValue, newValue),
      },
    ];
  });
  return {
    ...variation(buildTree(before).total, buildTree(after).total),
    items,
  };
}
export const transitions: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["SUPERSEDED"],
  REJECTED: [],
  SUPERSEDED: [],
  CANCELLED: [],
};
export function assertTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to))
    budgetError(
      "INVALID_REVISION_TRANSITION",
      `Transição inválida: ${from} → ${to}`,
    );
}
export function assertDraft(status: string) {
  if (status !== "DRAFT")
    budgetError(
      "BUDGET_REVISION_IMMUTABLE",
      "Apenas rascunhos podem ser editados",
    );
}
