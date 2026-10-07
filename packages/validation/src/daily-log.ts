import { z } from "zod";
import { dateOnly, version, percent } from "./schedule.js";
const text = z.string().trim().min(1).max(500),
  notes = z.string().max(10000).nullable().optional();
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/),
  hours = z
    .string()
    .regex(/^\d{1,2}(\.\d{1,2})?$/)
    .refine((v) => Number(v) <= 24)
    .nullable()
    .optional();
export const logCreate = z
  .object({
    logDate: dateOnly,
    weatherCondition: text.nullable().optional(),
    weatherNotes: notes,
    temperatureMin: z
      .string()
      .regex(/^-?\d{1,2}(\.\d{1,2})?$/)
      .nullable()
      .optional(),
    temperatureMax: z
      .string()
      .regex(/^-?\d{1,2}(\.\d{1,2})?$/)
      .nullable()
      .optional(),
    generalNotes: notes,
  })
  .strict();
export const logPatch = logCreate
  .omit({ logDate: true })
  .partial()
  .extend({ version })
  .strict();
export const activityInput = z
  .object({
    version,
    scheduleTaskId: z.uuid().nullable().optional(),
    budgetItemId: z.uuid().nullable().optional(),
    description: text,
    progressAfter: percent.optional(),
    taskVersion: version.optional(),
    updateTaskProgress: z.boolean().default(false),
    quantityCompleted: amount.nullable().optional(),
    unit: text.nullable().optional(),
    notes,
  })
  .strict()
  .refine(
    (v) =>
      !v.updateTaskProgress ||
      (v.scheduleTaskId &&
        v.progressAfter !== undefined &&
        v.taskVersion !== undefined),
    { message: "Atualizar progresso exige tarefa, progresso e versão" },
  )
  .refine((v) => v.progressAfter === undefined || v.updateTaskProgress, {
    message: "Confirme explicitamente a atualização da tarefa",
  });
export const activityPatch = z
  .object({
    version,
    description: text.optional(),
    notes,
    quantityCompleted: amount.nullable().optional(),
    unit: text.nullable().optional(),
  })
  .strict();
export const workforceInput = z
  .object({
    version,
    companyName: text,
    trade: text,
    workerCount: z.number().int().min(0).max(100000),
    hoursPerWorker: hours,
    notes,
  })
  .strict();
export const equipmentInput = z
  .object({
    version,
    equipmentName: text,
    identifier: text.nullable().optional(),
    quantity: z.number().int().min(1).max(100000).default(1),
    hoursWorked: hours,
    hoursIdle: hours,
    status: z
      .enum(["OPERATING", "IDLE", "BROKEN", "MAINTENANCE"])
      .default("OPERATING"),
    notes,
  })
  .strict()
  .refine((v) => Number(v.hoursWorked ?? 0) + Number(v.hoursIdle ?? 0) <= 24, {
    message: "Horas totais não podem ultrapassar 24",
  });
export const materialInput = z
  .object({
    version,
    materialName: text,
    quantity: amount,
    unit: text,
    budgetItemId: z.uuid().nullable().optional(),
    notes,
  })
  .strict();
export const deliveryInput = z
  .object({
    version,
    supplierName: text,
    description: text,
    quantity: amount.nullable().optional(),
    unit: text.nullable().optional(),
    document: text.nullable().optional(),
    receivedBy: text.nullable().optional(),
    deliveryTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    notes,
  })
  .strict();
export const occurrenceInput = z
  .object({
    version,
    occurrenceType: z.enum([
      "GENERAL",
      "DELAY",
      "SAFETY",
      "QUALITY",
      "WEATHER",
      "ACCESS",
      "MATERIAL",
      "EQUIPMENT",
      "CLIENT",
      "OTHER",
    ]),
    title: text,
    description: z.string().min(1).max(10000),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
    occurredAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();
export const observationInput = z
  .object({ version, text: z.string().trim().min(1).max(10000) })
  .strict();
export const logQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REOPENED"]).optional(),
    createdBy: z.uuid().optional(),
    hasOccurrences: z.enum(["true", "false"]).optional(),
  })
  .strict();
export const visibility = z.enum([
  "INTERNAL",
  "PROJECT_MEMBERS",
  "CLIENT_VISIBLE",
  "FINANCIER_VISIBLE",
  "PUBLIC_PROJECT",
]);
export const uploadInput = z
  .object({
    version,
    fileName: z.string().min(1).max(180),
    mimeType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    visibility: visibility.default("INTERNAL"),
    isPhoto: z.boolean().default(true),
    caption: notes,
    takenAt: z.iso.datetime({ offset: true }).nullable().optional(),
    scheduleTaskId: z.uuid().nullable().optional(),
    budgetItemId: z.uuid().nullable().optional(),
  })
  .strict();
