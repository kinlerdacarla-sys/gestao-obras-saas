import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
export type ReportSection = { title: string; rows: Record<string, unknown>[] };
const labels: Record<string, string> = {
  Schedule: "Cronograma",
  BudgetSummary: "Resumo financeiro",
  Quality: "Qualidade",
  Contracts: "Contratos",
  Measurements: "Medições",
  Payments: "Pagamentos",
  Funding: "Financiamento",
  DailyLogs: "Diários",
  totalContracts: "Total de contratos",
  originalValue: "Valor original (MZN)",
  currentValue: "Valor atual (MZN)",
  active: "Ativos",
  completed: "Concluídos",
  endingSoon: "Próximos do fim",
  additions: "Adendas (MZN)",
  omissions: "Supressões (MZN)",
  contractsWithOpenNcr: "Contratos com NCR ativa",
  plannedProgress: "Progresso planeado (%)",
  actualProgress: "Progresso real (%)",
  progressVariance: "Desvio (pp)",
  delayedTasks: "Atividades atrasadas",
  atRiskTasks: "Atividades em risco",
  completedTasks: "Atividades concluídas",
  totalTasks: "Total de atividades",
  plannedEnd: "Fim planeado",
  forecastEnd: "Fim previsto",
  forecastConfidence: "Confiança da previsão",
  scheduleVarianceDays: "Desvio em dias",
  available: "Dados disponíveis",
  approvedBudget: "Orçamento aprovado (MZN)",
  originalBudget: "Orçamento R0 (MZN)",
  currentContracts: "Contratos atuais (MZN)",
  currentContractValue: "Valor contratual (MZN)",
  certified: "Certificado (MZN)",
  paid: "Pago (MZN)",
  approvedFunding: "Financiamento aprovado (MZN)",
  fundingApproved: "Financiamento aprovado (MZN)",
  disbursed: "Desembolsado (MZN)",
  fundingDisbursed: "Desembolsado (MZN)",
  forecastAssumption: "Pressuposto da previsão",
  directExpenses: "Despesas diretas (MZN)",
  approvedExpenses: "Despesas aprovadas (MZN)",
  retentionBalance: "Saldo de retenção (MZN)",
  budgetVariance: "Variação do orçamento (MZN)",
  code: "Código",
  name: "Nome",
  status: "Estado",
  inspectionDate: "Data de inspeção",
  overallResult: "Resultado",
  date: "Data",
  severity: "Gravidade",
  title: "Título",
  description: "Descrição",
  dueDate: "Prazo",
};
const label = (key: string) =>
  labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
const text = (v: unknown): string =>
  v === null || v === undefined
    ? "Sem dados"
    : v instanceof Date
      ? v.toISOString().slice(0, 10)
      : typeof v === "object" && "toJSON" in v && typeof v.toJSON === "function"
        ? text(v.toJSON())
        : Array.isArray(v)
          ? v.map(text).join("; ") || "Sem registos"
          : typeof v === "object"
            ? Object.entries(v)
                .map(([key, value]) => `${label(key)}: ${text(value)}`)
                .join("; ")
            : String(v);
export async function renderReport(
  format: "PDF" | "XLSX",
  title: string,
  sections: ReportSection[],
  photos: { name: string; bytes: Buffer }[] = [],
) {
  if (format === "XLSX") {
    const book = new ExcelJS.Workbook();
    book.creator = "Obras";
    book.created = new Date();
    for (const section of sections) {
      const sheet = book.addWorksheet(
        label(section.title)
          .replace(/[\\/*?:[\]]/g, " ")
          .slice(0, 31),
      );
      const keys = [...new Set(section.rows.flatMap((x) => Object.keys(x)))];
      sheet.columns = keys.map((key) => ({
        header: label(key),
        key,
        width: 26,
      }));
      for (const row of section.rows)
        sheet.addRow(Object.fromEntries(keys.map((k) => [k, text(row[k])])));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0D6B5C" },
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      if (keys.length)
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: {
            row: Math.max(1, section.rows.length + 1),
            column: keys.length,
          },
        };
    }
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  const document = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 84, left: 48, right: 48 },
      bufferPages: true,
      info: { Title: title, Author: "Obras" },
    }),
    chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (x) => chunks.push(x));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document
    .fontSize(12)
    .fillColor("#0d6b5c")
    .text("OBRAS / RELATÓRIO EXECUTIVO");
  document.moveDown(3);
  document.fontSize(28).fillColor("#182d32").text(title);
  document.moveDown();
  document
    .fontSize(11)
    .text(
      `Emitido em ${new Date().toISOString()}\nMoeda: MZN\nAcesso restrito ao destinatário autorizado.`,
    );
  document.moveDown(2);
  document.text(
    "Os indicadores refletem os dados aprovados disponíveis na emissão. Previsões e aproximações são identificadas nas respetivas secções.",
  );
  for (const section of sections) {
    if (
      section === sections[0] ||
      document.y > 570 ||
      section.title === "Curva S"
    )
      document.addPage();
    else document.moveDown(2);
    document.x = 48;
    document.fillColor("#0d6b5c").fontSize(18).text(label(section.title));
    document.moveDown();
    document.fillColor("#182d32").fontSize(9);
    if (section.title === "Curva S" && section.rows.length > 1) {
      const series = [
        { key: "plannedPhysical", name: "Físico planeado", color: "#0d6b5c" },
        { key: "actualPhysical", name: "Físico real", color: "#275dad" },
        {
          key: "plannedFinancial",
          name: "Financeiro planeado",
          color: "#9b4d00",
        },
        { key: "actualFinancial", name: "Financeiro real", color: "#823b8b" },
      ];
      const top = document.y + 20,
        left = 48,
        width = 490,
        height = 180,
        max = Math.max(
          100,
          ...section.rows
            .flatMap((row) => series.map((s) => Number(row[s.key] ?? 0)))
            .filter(Number.isFinite),
        );
      document
        .save()
        .strokeColor("#b4c5bf")
        .moveTo(left, top)
        .lineTo(left, top + height)
        .lineTo(left + width, top + height)
        .stroke();
      document
        .fontSize(8)
        .text(`${max.toFixed(0)}%`, left, top - 12)
        .text("0%", left, top + height + 3);
      for (const [i, seriesItem] of series.entries()) {
        let started = false;
        document.strokeColor(seriesItem.color).lineWidth(1.5);
        if (seriesItem.key.startsWith("planned"))
          document.dash(5, { space: 3 });
        else document.undash();
        section.rows.forEach((row, index) => {
          const raw = row[seriesItem.key];
          if (raw === null || raw === undefined) {
            if (started) document.stroke();
            started = false;
            return;
          }
          const x = left + (index / (section.rows.length - 1)) * width,
            y = top + height - (Number(raw) / max) * height;
          if (!started) {
            document.moveTo(x, y);
            started = true;
          } else document.lineTo(x, y);
        });
        if (started) document.stroke();
        document.undash();
        document
          .fillColor(seriesItem.color)
          .fontSize(8)
          .text(
            seriesItem.name,
            left + (i % 2) * 245,
            top + height + 22 + Math.floor(i / 2) * 14,
          );
      }
      document.restore();
      document.y = top + height + 65;
      document.x = 48;
      document.fillColor("#182d32").fontSize(9);
    }

    if (!section.rows.length)
      document.text("Sem registos no período autorizado.");
    if (section.title === "Curva S") {
      document
        .fontSize(8)
        .text(
          "Data | Físico planeado | Físico real | Financeiro planeado | Financeiro real",
        );
      for (const row of section.rows) {
        document.text(
          [
            row.date,
            row.plannedPhysical,
            row.actualPhysical,
            row.plannedFinancial,
            row.actualFinancial,
          ]
            .map((v, i) =>
              i === 0
                ? text(v).slice(0, 10)
                : v == null
                  ? "—"
                  : `${Number(v).toFixed(2)}%`,
            )
            .join("   |   "),
        );
      }
      continue;
    }
    for (const row of section.rows) {
      const record = Object.entries(row)
        .map(([key, val]) => `${label(key)}: ${text(val)}`)
        .join("\n");
      const height = document.heightOfString(record, { width: 495 }) + 12;
      if (height < 690 && document.y + height > document.page.height - 84)
        document.addPage();
      for (const [key, val] of Object.entries(row)) {
        document.text(`${label(key)}: ${text(val)}`, { width: 495 });
      }
      document.moveDown();
    }
  }
  for (const photo of photos) {
    document.addPage();
    document.fontSize(16).text("Registo fotográfico");
    document.fontSize(10).text(photo.name);
    document.image(photo.bytes, 48, 110, {
      fit: [495, 600],
      align: "center",
      valign: "center",
    });
  }
  const range = document.bufferedPageRange();
  for (let page = 0; page < range.count; page++) {
    document.switchToPage(page);
    const bottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document
      .fontSize(8)
      .fillColor("#5d7377")
      .text(`Obras · ${page + 1} / ${range.count}`, 48, 780, {
        lineBreak: false,
      });
    document.page.margins.bottom = bottomMargin;
  }
  document.end();
  return complete;
}
