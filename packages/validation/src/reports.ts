import { z } from "zod";
export const reportRequest = z
  .object({
    projectId: z.uuid().optional(),
    reportType: z.enum([
      "PROJECT_EXECUTIVE",
      "PROJECT_PROGRESS",
      "FINANCIAL",
      "MEASUREMENTS",
      "CONTRACTS",
      "QUALITY",
      "DAILY_LOG",
      "FUNDING",
      "PORTFOLIO",
    ]),
    format: z.enum(["PDF", "XLSX"]),
    parameters: z
      .object({
        date_from: z.iso.date().optional(),
        date_to: z.iso.date().optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .refine(
    (x) => (x.reportType === "PORTFOLIO" ? !x.projectId : !!x.projectId),
    "Selecione a obra",
  )
  .refine(
    (x) =>
      !x.parameters.date_from ||
      !x.parameters.date_to ||
      x.parameters.date_from <= x.parameters.date_to,
    "Período inválido",
  );
