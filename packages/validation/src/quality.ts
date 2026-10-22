import { z } from "zod";
import { uploadInput } from "./daily-log.js";
const id = z.uuid(),
  optionalId = id.nullable().optional();
const text = z.string().trim().min(1).max(10000),
  note = z.string().trim().max(10000).nullable().optional();
export const version = z.number().int().nonnegative();
export const action = z.object({ version, comment: note }).strict();
export const severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const category = z.enum([
  "WORKMANSHIP",
  "MATERIAL",
  "DESIGN",
  "DIMENSION",
  "SAFETY",
  "DOCUMENTATION",
  "EQUIPMENT",
  "PROCESS",
  "OTHER",
]);
export const refs = {
  scheduleTaskId: optionalId,
  budgetItemId: optionalId,
  dailyLogId: optionalId,
  contractId: optionalId,
  measurementId: optionalId,
};
const responsible = {
  responsibleUserId: optionalId,
  responsibleOrganizationId: optionalId,
  dueDate: z.iso.date().nullable().optional(),
};
export const templateItem = z
  .object({
    section: note,
    code: z.string().trim().min(1).max(50),
    description: text,
    responseType: z
      .enum(["PASS_FAIL_NA", "YES_NO_NA", "TEXT", "NUMBER", "DATE"])
      .default("PASS_FAIL_NA"),
    isRequired: z.boolean().default(true),
    allowComment: z.boolean().default(true),
    requirePhotoOnFail: z.boolean().default(true),
    isHoldPoint: z.boolean().default(false),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();
export const template = z
  .object({
    name: z.string().trim().min(1).max(200),
    code: z.string().trim().min(1).max(50),
    description: note,
    category: note,
    items: z.array(templateItem).min(1).max(500),
  })
  .strict();
export const templatePatch = template
  .omit({ items: true, code: true })
  .partial()
  .extend({
    version,
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  })
  .strict();
export const templateVersion = z
  .object({ items: z.array(templateItem).min(1).max(500) })
  .strict();
export const versionItems = templateVersion.extend({ version }).strict();
export const request = z
  .object({
    title: text,
    description: note,
    requestedInspectionDate: z.iso.date(),
    scheduleTaskId: optionalId,
    budgetItemId: optionalId,
    dailyLogId: optionalId,
    contractId: optionalId,
  })
  .strict();
export const requestPatch = request.partial().extend({ version }).strict();
export const schedule = action.extend({ assignedInspectorId: id }).strict();
export const inspection = z
  .object({
    ...refs,
    title: text,
    description: note,
    inspectionDate: z.iso.date(),
    inspectorId: id,
    inspectionRequestId: optionalId,
    checklistTemplateVersionId: id,
    generalComments: note,
  })
  .strict();
export const inspectionPatch = inspection
  .omit({ checklistTemplateVersionId: true, inspectionRequestId: true })
  .partial()
  .extend({ version })
  .strict();
export const answer = z
  .object({
    version,
    result: z.enum(["PASS", "FAIL", "NA"]).nullable().optional(),
    textValue: note,
    numericValue: z
      .string()
      .regex(/^-?\d{1,18}(\.\d{1,6})?$/)
      .nullable()
      .optional(),
    dateValue: z.iso.date().nullable().optional(),
    comment: note,
  })
  .strict();
export const ncr = z
  .object({
    ...refs,
    ...responsible,
    inspectionId: optionalId,
    inspectionItemId: optionalId,
    title: text,
    description: text,
    severity,
    category,
  })
  .strict();
export const ncrPatch = ncr.partial().extend({ version }).strict();
export const assignment = action
  .extend(responsible)
  .strict()
  .refine(
    (x) => x.responsibleUserId || x.responsibleOrganizationId,
    "Selecione um responsável",
  );
export const correctiveAction = z
  .object({ ...responsible, description: text, version })
  .strict();
export const correctivePatch = correctiveAction
  .partial()
  .extend({ version, completionNotes: note })
  .strict();
export const completion = action.extend({ completionNotes: text }).strict();
export const comment = z.object({ comment: text, version }).strict();
export const evidence = uploadInput
  .extend({
    visibility: z
      .enum([
        "PROJECT_MEMBERS",
        "CLIENT_VISIBLE",
        "FINANCIER_VISIBLE",
        "PUBLIC_PROJECT",
      ])
      .default("PROJECT_MEMBERS"),
    inspectionItemId: optionalId,
    evidenceType: z
      .enum(["PHOTO", "DOCUMENT", "DRAWING", "TEST_RESULT", "OTHER"])
      .default("PHOTO"),
  })
  .strict();
export const policy = z
  .object({
    version,
    blockMeasurementOnOpenCriticalNcr: z.boolean(),
    preventSelfVerification: z.literal(true),
  })
  .strict();
export const query = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(30),
    status: z.string().max(50).optional(),
    result: z.enum(["PASS", "PASS_WITH_OBSERVATIONS", "FAIL"]).optional(),
    severity: severity.optional(),
    category: category.optional(),
    inspector: id.optional(),
    responsible_user: id.optional(),
    responsible_organization: id.optional(),
    overdue: z.enum(["true", "false"]).optional(),
    active: z.enum(["true", "false"]).optional(),
    contract: id.optional(),
    schedule_task: id.optional(),
    budget_item: id.optional(),
    measurement: id.optional(),
    date_from: z.iso.date().optional(),
    date_to: z.iso.date().optional(),
    search: z.string().max(200).optional(),
    interval: z.enum(["week", "month"]).default("month"),
  })
  .strict();
