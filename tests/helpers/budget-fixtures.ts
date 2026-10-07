import ExcelJS from "exceljs";
export async function budgetFixture(
  kind:
    | "valid"
    | "duplicate"
    | "invalid-number"
    | "invalid-hierarchy"
    | "large" = "valid",
  size = 10000,
) {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Orçamento");
  sheet.addRow([
    "Código",
    "Descrição",
    "Unidade",
    "Quantidade",
    "Preço Unitário",
    "Código Pai",
    "Tipo",
  ]);
  sheet.addRow(["01", "Fundações", "", "", "", "", "GROUP"]);
  const count = kind === "large" ? size - 1 : 1;
  for (let i = 0; i < count; i++)
    sheet.addRow([
      `01.${String(i + 1).padStart(5, "0")}`,
      "Escavação",
      "m³",
      kind === "invalid-number" ? "inválido" : "100",
      "1000",
      kind === "invalid-hierarchy" ? "inexistente" : "01",
      "ITEM",
    ]);
  if (kind === "duplicate")
    sheet.addRow(["01.00001", "Duplicado", "m³", "1", "1", "01", "ITEM"]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
