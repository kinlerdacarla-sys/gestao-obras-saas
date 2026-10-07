import { describe, it, expect } from "vitest";
import {
  money,
  buildTree,
  compareRevisions,
  assertDraft,
  assertTransition,
  type BudgetLine,
} from "../../packages/domain/src/budget.js";
import { validateImport } from "../../packages/domain/src/budget-import.js";
const line = (
  id: string,
  parentId: string | null = null,
  itemType: "GROUP" | "ITEM" = "ITEM",
): BudgetLine => ({
  budgetItemId: id,
  parentId,
  code: id,
  description: id,
  itemType,
  unit: itemType === "ITEM" ? "m³" : null,
  quantity: itemType === "ITEM" ? "100.0000" : null,
  unitPrice: itemType === "ITEM" ? "1000.00" : null,
  totalValue: itemType === "ITEM" ? "100000.00" : "0.00",
  isActive: true,
  sortOrder: 0,
});
describe("Budget financial domain", () => {
  it("enforces depth consistently for parent-first and child-first input", () => {
    const rows = Array.from({ length: 101 }, (_, i) =>
      line(String(i), i ? String(i - 1) : null, "GROUP"),
    );
    expect(() => buildTree(rows)).toThrow("100 níveis");
    expect(() => buildTree([...rows].reverse())).toThrow("100 níveis");
    expect(buildTree(rows.slice(0, 100)).total).toBe("0.00");
  });
  it("calculates decimal multiplication with HALF_UP rounding", () => {
    expect(money("0.1000", "0.10")).toBe("0.01");
    expect(money("1.0050", "1.00")).toBe("1.01");
    expect(money("1", "9999999999999999.99")).toBe("9999999999999999.99");
  });
  it("rejects overflow and negative inputs", () => {
    expect(() => money("100", "9999999999999999")).toThrow();
    expect(() => money("-1", "1")).toThrow();
  });
  it("sums only leaves and groups reflect descendants without double counting", () => {
    const tree = buildTree([
      line("01", null, "GROUP"),
      line("01.01", "01", "GROUP"),
      line("one", "01.01"),
      line("two", "01"),
    ]);
    expect(tree.total).toBe("200000.00");
    expect(tree.items[0].total).toBe("200000.00");
    expect(tree.items[0].children.find((r) => r.code === "01.01")?.total).toBe(
      "100000.00",
    );
  });
  it("compares R0 100000 with R1 132000 at 32 percent", () => {
    const a = line("same"),
      b = { ...a, quantity: "120.0000", unitPrice: "1100.00" };
    const result = compareRevisions([a], [b]);
    expect(result.difference).toBe("32000.00");
    expect(result.differencePercentage).toBe("32.00");
    expect(result.items[0].classification).toBe("QUANTITY_AND_PRICE_CHANGED");
    expect(a.quantity).toBe("100.0000");
  });
  it("classifies additions, removals and unchanged lines", () => {
    const result = compareRevisions(
      [line("old"), line("same")],
      [line("new"), line("same")],
    );
    expect(result.items.map((i) => i.classification).sort()).toEqual([
      "ADDED",
      "REMOVED",
      "UNCHANGED",
    ]);
  });
  it("detects cycles, duplicate codes and item parents", () => {
    expect(() =>
      buildTree([line("a", "b", "GROUP"), line("b", "a", "GROUP")]),
    ).toThrow();
    expect(() => buildTree([line("a"), line("a")])).toThrow();
    expect(() => buildTree([line("a"), line("b", "a")])).toThrow();
  });
  it.each(["APPROVED", "SUBMITTED", "SUPERSEDED", "REJECTED", "CANCELLED"])(
    "makes %s immutable",
    (status) => expect(() => assertDraft(status)).toThrow(),
  );
  it("enforces the approval state machine", () => {
    expect(() => assertTransition("DRAFT", "SUBMITTED")).not.toThrow();
    expect(() => assertTransition("SUBMITTED", "APPROVED")).not.toThrow();
    expect(() => assertTransition("SUBMITTED", "REJECTED")).not.toThrow();
    expect(() => assertTransition("APPROVED", "DRAFT")).toThrow();
    expect(() => assertTransition("DRAFT", "APPROVED")).toThrow();
  });
});
const fields = (code: string) => ({
  code,
  description: "Escavação",
  unit: "m³",
  quantity: "100",
  unitPrice: "1000",
});
describe("Import validation", () => {
  it("infers hierarchy and supports decimal comma", () => {
    const result = validateImport([
      {
        rowNumber: 2,
        fields: {
          code: "01",
          description: "Grupo",
          unit: "",
          quantity: "",
          unitPrice: "",
        },
      },
      { rowNumber: 3, fields: { ...fields("01.001"), unitPrice: "1.000,00" } },
    ]);
    expect(result.rows[1].fields.parentCode).toBe("01");
    expect(result.total).toBe("100000.00");
  });
  it("prioritizes explicit parent code", () => {
    const result = validateImport([
      { rowNumber: 2, fields: { ...fields("01.001"), parentCode: "missing" } },
    ]);
    expect(result.rows[0].errors).toContain("Código pai inexistente");
  });
  it("warns when hierarchy cannot be inferred", () =>
    expect(
      validateImport([{ rowNumber: 2, fields: fields("01.001") }]).rows[0]
        .status,
    ).toBe("WARNING"));
  it("detects duplicate codes on both rows", () =>
    expect(
      validateImport([
        { rowNumber: 2, fields: fields("01") },
        { rowNumber: 3, fields: fields("01") },
      ]).rows.every((r) => r.status === "INVALID"),
    ).toBe(true));
  it.each(["abc", "-12", "1.23456", "999999999999999999999"])(
    "rejects invalid quantity %s",
    (quantity) =>
      expect(
        validateImport([
          { rowNumber: 2, fields: { ...fields("01"), quantity } },
        ]).rows[0].status,
      ).toBe("INVALID"),
  );
  it("rejects empty rows and units", () => {
    expect(
      validateImport([
        {
          rowNumber: 2,
          fields: {
            code: "",
            description: "",
            unit: "",
            quantity: "",
            unitPrice: "",
          },
        },
      ]).rows[0].status,
    ).toBe("INVALID");
    expect(
      validateImport([{ rowNumber: 2, fields: { ...fields("01"), unit: "" } }])
        .rows[0].status,
    ).toBe("INVALID");
  });
});
