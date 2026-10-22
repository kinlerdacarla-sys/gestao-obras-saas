import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { mayRequestReport } from "../../packages/domain/src/reports.js";
import { renderReport } from "../../apps/api/src/report/render.js";
import { notificationCategory } from "../../apps/worker/src/email.js";
describe("M7 reports and notification rules", () => {
  it("limits report types by role", () => {
    expect(mayRequestReport("CLIENT", "FINANCIAL")).toBe(false);
    expect(mayRequestReport("CLIENT", "PROJECT_EXECUTIVE")).toBe(true);
    expect(mayRequestReport("FINANCIER", "CONTRACTS")).toBe(false);
    expect(mayRequestReport("INSPECTOR", "FINANCIAL")).toBe(false);
    expect(mayRequestReport("MANAGER", "PORTFOLIO")).toBe(false);
    expect(mayRequestReport("ADMIN", "PORTFOLIO")).toBe(true);
    expect(mayRequestReport("unknown", "QUALITY")).toBe(false);
  });
  it("generates a real PDF and a formatted XLSX without interpreting cell text as formulas", async () => {
    const sections = [
      {
        title: "Portfolio",
        rows: [{ Obra: '=HYPERLINK("evil")', Valor: "25000000.00" }],
      },
    ];
    const pdf = await renderReport("PDF", "Relatório de teste", sections);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const bytes = await renderReport("XLSX", "Teste", sections),
      book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(book.worksheets[0].getCell("A2").value).toBe('=HYPERLINK("evil")');
    expect(book.worksheets[0].getCell("A2").type).toBe(
      ExcelJS.ValueType.String,
    );
  });
  it("routes preferences to the source category", () => {
    expect(notificationCategory("NCR_CRITICAL")).toBe("qualityNotifications");
    expect(notificationCategory("INSPECTION_PENDING")).toBe(
      "inspectionNotifications",
    );
    expect(notificationCategory("MEASUREMENT_PENDING_APPROVAL")).toBe(
      "measurementNotifications",
    );
    expect(notificationCategory("SCHEDULE_DELAY")).toBe(
      "scheduleNotifications",
    );
  });
});
