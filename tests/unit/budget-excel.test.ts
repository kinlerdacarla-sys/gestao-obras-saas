import { describe, it, expect } from "vitest";
import { budgetFixture } from "../helpers/budget-fixtures.js";
import {
  readWorkbook,
  defaultMapping,
  mapCells,
  exportWorkbook,
} from "../../apps/api/src/budget/excel.js";
import {
  validateImport,
  importLines,
} from "../../packages/domain/src/budget-import.js";
import {
  buildTree,
  compareRevisions,
} from "../../packages/domain/src/budget.js";
import { verifyZip } from "../../apps/api/src/budget/import-stage.js";
describe("XLSX fixtures and performance", () => {
  it.each([
    "valid",
    "duplicate",
    "invalid-number",
    "invalid-hierarchy",
  ] as const)("validates fixture %s", async (kind) => {
    const buffer = await budgetFixture(kind);
    await verifyZip(buffer);
    const workbook = await readWorkbook(buffer),
      mapping = defaultMapping(workbook.headers);
    const result = validateImport(
      workbook.rows.map((r) => ({
        rowNumber: r.rowNumber,
        fields: mapCells(r.cells, mapping),
      })),
    );
    expect(result.rows.some((r) => r.status === "INVALID")).toBe(
      kind !== "valid",
    );
  });
  it("rejects malformed ZIP data", async () =>
    await expect(verifyZip(Buffer.from("not xlsx"))).rejects.toThrow());
  it.each([1000, 5000, 10000])(
    "parses, validates, totals, compares and exports %i rows",
    async (size) => {
      const start = performance.now(),
        buffer = await budgetFixture("large", size);
      const workbook = await readWorkbook(buffer);
      const parsedAt = performance.now();
      const mapping = defaultMapping(workbook.headers);
      const validated = validateImport(
        workbook.rows.map((r) => ({
          rowNumber: r.rowNumber,
          fields: mapCells(r.cells, mapping),
        })),
      );
      expect(validated.rows.every((r) => r.status !== "INVALID")).toBe(true);
      const lines = importLines(validated.rows),
        tree = buildTree(lines);
      expect(tree.total).toBe(`${(size - 1) * 100000}.00`);
      const compared = compareRevisions(lines, lines);
      expect(compared.difference).toBe("0.00");
      const calculatedAt = performance.now();
      const output = await exportWorkbook(tree.items);
      expect(output.length).toBeGreaterThan(1000);
      const done = performance.now();
      console.info(
        "BUDGET_PERFORMANCE",
        JSON.stringify({
          rows: size,
          fixtureAndParseMs: Math.round(parsedAt - start),
          validateTreeCompareMs: Math.round(calculatedAt - parsedAt),
          exportMs: Math.round(done - calculatedAt),
          totalMs: Math.round(done - start),
        }),
      );
      expect(done - start).toBeLessThan(30000);
    },
    60000,
  );
});
