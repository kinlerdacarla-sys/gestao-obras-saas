import { z } from "zod";
export const dateOnly = z.iso.date();
const text = z.string().trim().min(1).max(200);
const note = z.string().max(10000).nullable().optional();
export const version = z.number().int().nonnegative();
export const percent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((v) => Number(v) <= 100);
export const scheduleCreate = z
  .object({
    name: text,
    description: note,
    plannedStart: dateOnly,
    plannedEnd: dateOnly,
    weightingMethod: z.enum(["MANUAL", "BUDGET_VALUE"]).default("MANUAL"),
    budgetRevisionId: z.uuid().nullable().optional(),
    status: z
      .enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"])
      .default("DRAFT"),
  })
  .strict();
export const schedulePatch = scheduleCreate
  .partial()
  .extend({ version })
  .strict();
export const taskCreate = z
  .object({
    parentId: z.uuid().nullable().default(null),
    code: text.max(100),
    name: text,
    description: note,
    taskType: z.enum(["SUMMARY", "TASK", "MILESTONE"]),
    plannedStart: dateOnly,
    plannedEnd: dateOnly,
    weight: z
      .string()
      .regex(/^\d{1,4}(\.\d{1,6})?$/)
      .default("1"),
    budgetItemId: z.uuid().nullable().default(null),
    sortOrder: z.number().int().min(0).max(1000000).default(0),
  })
  .strict();
export const taskPatch = taskCreate
  .partial()
  .extend({
    version,
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "ON_HOLD"]).optional(),
  })
  .strict();
export const progressInput = z
  .object({
    version,
    progress: percent,
    progressDate: dateOnly,
    actualStart: dateOnly.optional(),
    actualEnd: dateOnly.optional(),
    notes: note,
  })
  .strict();
export const dependencyInput = z
  .object({
    predecessorId: z.uuid(),
    successorId: z.uuid(),
    dependencyType: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
    lagDays: z.number().int().min(-3650).max(3650).default(0),
  })
  .strict();
export const baselineInput = z.object({ description: note }).strict();
export const versionInput = z.object({ version }).strict();
export const taskQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    status: z
      .enum(["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"])
      .optional(),
    taskType: z.enum(["SUMMARY", "TASK", "MILESTONE"]).optional(),
    delayed: z.enum(["true", "false"]).optional(),
    budgetItemId: z.uuid().optional(),
    search: z.string().max(200).optional(),
    referenceDate: dateOnly.optional(),
  })
  .strict();
