import { z } from "zod";
export const analyticsQuery = z
  .object({
    project: z.uuid().optional(),
    status: z
      .enum(["PLANNING", "ACTIVE", "SUSPENDED", "COMPLETED", "CANCELLED"])
      .optional(),
    manager: z.uuid().optional(),
    client: z.uuid().optional(),
    portfolio: z.enum(["all", "active", "completed", "at-risk"]).default("all"),
    date_from: z.iso.date().optional(),
    date_to: z.iso.date().optional(),
  })
  .strict()
  .refine(
    (x) => !x.date_from || !x.date_to || x.date_from <= x.date_to,
    "Período inválido",
  );
export const curveQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    granularity: z.enum(["DAY", "WEEK", "MONTH"]).default("DAY"),
  })
  .strict()
  .refine((x) => !x.from || !x.to || x.from <= x.to, "Período inválido");
export const compareQuery = z
  .object({
    projects: z
      .string()
      .transform((x) => x.split(","))
      .pipe(z.array(z.uuid()).min(2).max(10)),
  })
  .strict();
