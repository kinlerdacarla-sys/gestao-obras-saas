import { Decimal } from "decimal.js";
import {
  buildTree,
  decimal,
  money,
  MONEY_MAX,
  QUANTITY_MAX,
  type BudgetLine,
} from "./budget.js";
export type ImportFields = {
  code: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  parentCode?: string;
  itemType?: string;
};
export interface StagedRow {
  rowNumber: number;
  fields: ImportFields;
  errors: string[];
  warnings: string[];
  status: "VALID" | "INVALID" | "WARNING";
  totalValue: string;
}
export function normalizeNumber(value: string): string {
  const trimmed = value.trim().replace(/\s/g, "");
  // Portuguese grouping is accepted only when a decimal comma makes it unambiguous.
  return trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
}
export function validateImport(
  input: { rowNumber: number; fields: ImportFields }[],
): { rows: StagedRow[]; total: string } {
  const rows: StagedRow[] = input.map((x) => ({
    rowNumber: x.rowNumber,
    fields: { ...x.fields },
    errors: [],
    warnings: [],
    status: "VALID",
    totalValue: "0.00",
  }));
  const codes = new Map<string, StagedRow[]>();
  for (const row of rows) {
    const code = row.fields.code.trim();
    row.fields.code = code;
    const group = codes.get(code);
    if (group) group.push(row);
    else codes.set(code, [row]);
  }
  for (const row of rows) {
    const f = row.fields;
    if (!Object.values(f).some(Boolean)) row.errors.push("Linha vazia");
    if (!f.code || f.code.length > 100)
      row.errors.push("Código vazio ou demasiado longo");
    if (!f.description.trim() || f.description.length > 5000)
      row.errors.push("Descrição vazia ou demasiado longa");
    if ((codes.get(f.code)?.length ?? 0) > 1)
      row.errors.push("Código duplicado");
    if (!f.itemType) {
      f.itemType = !f.unit && !f.quantity && !f.unitPrice ? "GROUP" : "ITEM";
    }
    if (!["GROUP", "ITEM"].includes(f.itemType))
      row.errors.push("Tipo inválido");
    if (f.parentCode === undefined) {
      const parent = f.code.includes(".")
        ? f.code.slice(0, f.code.lastIndexOf("."))
        : "";
      f.parentCode = codes.has(parent) ? parent : "";
      if (parent && !codes.has(parent))
        row.warnings.push(
          "Hierarquia não inferida: confirme ou corrija o código pai",
        );
    }
    if (f.parentCode && !codes.has(f.parentCode))
      row.errors.push("Código pai inexistente");
    if (f.itemType === "GROUP") {
      if (f.quantity || f.unitPrice || f.unit)
        row.errors.push("GROUP não aceita unidade, quantidade ou preço");
    } else {
      if (!f.unit.trim() || f.unit.length > 30)
        row.errors.push("Unidade vazia ou inválida");
      try {
        f.quantity = decimal(
          normalizeNumber(f.quantity),
          4,
          QUANTITY_MAX,
        ).toFixed(4);
      } catch {
        row.errors.push("Quantidade inválida, negativa ou acima do limite");
      }
      try {
        f.unitPrice = decimal(
          normalizeNumber(f.unitPrice),
          2,
          MONEY_MAX,
        ).toFixed(2);
      } catch {
        row.errors.push("Preço inválido, negativo ou acima do limite");
      }
      if (!row.errors.length)
        try {
          row.totalValue = money(f.quantity, f.unitPrice);
        } catch {
          row.errors.push("Total acima do limite suportado");
        }
    }
  }
  const byCode = new Map(rows.map((r) => [r.fields.code, r]));
  const done = new Set<string>();
  for (const row of rows) {
    const path = new Set<string>();
    let current: StagedRow | undefined = row;
    while (current && !done.has(current.fields.code)) {
      if (path.has(current.fields.code)) {
        for (const code of path)
          byCode.get(code)!.errors.push("Referência circular");
        break;
      }
      path.add(current.fields.code);
      const parent: StagedRow | undefined = current.fields.parentCode
        ? byCode.get(current.fields.parentCode)
        : undefined;
      if (parent && parent.fields.itemType !== "GROUP")
        current.errors.push("Pai deve ser GROUP");
      current = parent;
    }
    path.forEach((code) => done.add(code));
  }
  let total = rows.reduce((sum, r) => sum.add(r.totalValue), new Decimal(0));
  if (total.gt(MONEY_MAX)) {
    rows[0]?.errors.push("Total do orçamento acima do limite");
    total = new Decimal(0);
  }
  for (const row of rows)
    row.status = row.errors.length
      ? "INVALID"
      : row.warnings.length
        ? "WARNING"
        : "VALID";
  if (!rows.some((r) => r.status === "INVALID"))
    try {
      buildTree(importLines(rows));
    } catch (e) {
      if (rows[0]) {
        rows[0].errors.push((e as Error).message);
        rows[0].status = "INVALID";
      }
    }
  return { rows, total: total.toFixed(2) };
}
export function importLines(rows: StagedRow[]): BudgetLine[] {
  return rows.map((r, i) => ({
    budgetItemId: r.fields.code,
    parentId: r.fields.parentCode || null,
    code: r.fields.code,
    description: r.fields.description,
    itemType: r.fields.itemType as "GROUP" | "ITEM",
    unit: r.fields.unit || null,
    quantity: r.fields.itemType === "ITEM" ? r.fields.quantity : null,
    unitPrice: r.fields.itemType === "ITEM" ? r.fields.unitPrice : null,
    sortOrder: i,
    isActive: true,
    totalValue: r.totalValue,
  }));
}
