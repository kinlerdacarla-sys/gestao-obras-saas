import ExcelJS from "exceljs";
import type { ImportFields } from "../../../../packages/domain/src/budget-import.js";
import type { BudgetNode } from "../../../../packages/domain/src/budget.js";
export const standardHeaders = [
  "Código",
  "Descrição",
  "Unidade",
  "Quantidade",
  "Preço Unitário",
  "Código Pai",
  "Tipo",
];
export type ColumnMapping = Partial<Record<keyof ImportFields, string>>;
const keys: (keyof ImportFields)[] = [
  "code",
  "description",
  "unit",
  "quantity",
  "unitPrice",
  "parentCode",
  "itemType",
];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export const defaultMapping = (headers: string[]): ColumnMapping =>
  Object.fromEntries(
    keys.flatMap((key, i) => {
      const found = headers.find(
        (h) => normalize(h) === normalize(standardHeaders[i]),
      );
      return found ? [[key, found]] : [];
    }),
  );
export function mapCells(
  cells: Record<string, string>,
  mapping: ColumnMapping,
): ImportFields {
  return {
    code: cells[mapping.code ?? ""] ?? "",
    description: cells[mapping.description ?? ""] ?? "",
    unit: cells[mapping.unit ?? ""] ?? "",
    quantity: cells[mapping.quantity ?? ""] ?? "",
    unitPrice: cells[mapping.unitPrice ?? ""] ?? "",
    ...(mapping.parentCode
      ? { parentCode: cells[mapping.parentCode] ?? "" }
      : {}),
    ...(mapping.itemType ? { itemType: cells[mapping.itemType] ?? "" } : {}),
  };
}
export async function readWorkbook(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = book.worksheets[0];
  if (
    !sheet ||
    sheet.rowCount < 2 ||
    sheet.rowCount > 10001 ||
    sheet.columnCount > 50
  )
    throw new Error(
      "Ficheiro deve conter cabeçalho e 1–10.000 linhas, até 50 colunas",
    );
  const text = (cell: ExcelJS.Cell) => {
    if (cell.type === ExcelJS.ValueType.Formula)
      throw new Error(
        "Fórmulas não são aceites. Cole valores antes de importar.",
      );
    const value = cell.text;
    if (value.length > 5000) throw new Error("Célula excede 5.000 caracteres");
    return value;
  };
  const headers: string[] = [];
  sheet
    .getRow(1)
    .eachCell({ includeEmpty: true }, (cell) =>
      headers.push(text(cell).trim()),
    );
  if (new Set(headers).size !== headers.length || headers.some((h) => !h))
    throw new Error("Cabeçalhos vazios ou duplicados");
  const rows: { rowNumber: number; cells: Record<string, string> }[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    rows.push({
      rowNumber: i,
      cells: Object.fromEntries(
        headers.map((h, col) => [h, text(row.getCell(col + 1))]),
      ),
    });
  }
  return { headers, rows };
}
function workbook() {
  const book = new ExcelJS.Workbook();
  book.creator = "Obras";
  return book;
}
function style(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF173D37" },
  };
  sheet.columns.forEach((c, i) => {
    c.width = i === 1 ? 55 : 22;
  });
  sheet.autoFilter = {
    from: "A1",
    to: { row: sheet.rowCount, column: sheet.columnCount },
  };
}
export async function templateWorkbook() {
  const book = workbook(),
    sheet = book.addWorksheet("Orçamento");
  sheet.addRow(standardHeaders);
  sheet.addRows([
    ["01", "Trabalhos Preliminares", "", "", "", "", "GROUP"],
    ["01.01", "Estaleiro", "", "", "", "01", "GROUP"],
    ["01.01.001", "Mobilização", "un", "1.0000", "250000.00", "01.01", "ITEM"],
  ]);
  style(sheet);
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function exportWorkbook(nodes: BudgetNode[]) {
  const book = workbook(),
    sheet = book.addWorksheet("Orçamento");
  sheet.addRow([
    ...standardHeaders.slice(0, 5),
    "Valor Total",
    "Código Pai",
    "Tipo",
  ]);
  const stack = nodes
    .slice()
    .reverse()
    .map((node) => ({ node, parent: "" }));
  while (stack.length) {
    const { node, parent } = stack.pop()!;
    const row = sheet.addRow([
      node.code,
      node.description,
      node.unit ?? "",
      node.quantity ?? "",
      node.unitPrice ?? "",
      node.total,
      parent,
      node.itemType,
    ]);
    if (node.itemType === "GROUP") row.font = { bold: true };
    stack.push(
      ...node.children
        .slice()
        .reverse()
        .map((child) => ({ node: child, parent: node.code })),
    );
  }
  style(sheet);
  return Buffer.from(await book.xlsx.writeBuffer());
}
