import { z } from "zod";
const text = z.string().trim().min(1).max(200),
  note = z.string().max(10000).nullable().optional(),
  id = z.uuid(),
  optionalId = id.nullable().optional();
export const cash = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/);
const pct = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/);
export const version = z.number().int().nonnegative();
export const actionInput = z
  .object({ version, reason: z.string().trim().min(3).max(2000).optional() })
  .strict();
export const pageInput = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    search: z.string().max(200).optional(),
    status: z.string().max(30).optional(),
    type: z.string().max(30).optional(),
    supplier: optionalId,
    contract: optionalId,
    cost_center: optionalId,
    budget_item: optionalId,
    date_from: z.iso.date().optional(),
    date_to: z.iso.date().optional(),
  })
  .strict();
export const supplierInput = z
  .object({
    organizationId: optionalId,
    supplierType: z.enum([
      "SUPPLIER",
      "SUBCONTRACTOR",
      "CONSULTANT",
      "SERVICE_PROVIDER",
      "OTHER",
    ]),
    legalName: text,
    tradeName: note,
    taxNumber: z.string().trim().min(1).max(50).nullable().optional(),
    email: z.email().nullable().optional(),
    phone: note,
    address: note,
    contactPerson: note,
    contactPhone: note,
    contactEmail: z.email().nullable().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).default("ACTIVE"),
  })
  .strict();
export const supplierPatch = supplierInput
  .partial()
  .extend({
    version,
    status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).optional(),
  })
  .strict();
export const contractInput = z
  .object({
    supplierId: id,
    contractNumber: text,
    title: text,
    description: note,
    contractType: z.enum([
      "CONSTRUCTION",
      "SUBCONTRACT",
      "SUPPLY",
      "SERVICE",
      "CONSULTANCY",
      "OTHER",
    ]),
    originalValue: cash,
    retentionPercentage: pct.default("0"),
    advancePercentage: pct.default("0"),
    advanceAmount: cash.default("0"),
    startDate: z.iso.date().nullable().optional(),
    endDate: z.iso.date().nullable().optional(),
  })
  .strict();
export const contractPatch = contractInput
  .omit({ originalValue: true })
  .partial()
  .extend({
    version,
    retentionPercentage: pct.optional(),
    advancePercentage: pct.optional(),
    advanceAmount: cash.optional(),
  })
  .strict();
export const itemInput = z
  .object({
    version,
    budgetItemId: optionalId,
    code: note,
    description: text,
    unit: note,
    quantity: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,4})?$/)
      .nullable()
      .optional(),
    unitPrice: cash.nullable().optional(),
    totalValue: cash.optional(),
  })
  .strict();
export const amendmentInput = z
  .object({
    amendmentType: z.enum(["ADDITION", "OMISSION", "TIME_EXTENSION", "OTHER"]),
    description: text,
    amount: cash,
    effectiveDate: z.iso.date().nullable().optional(),
  })
  .strict();
export const amendmentPatch = amendmentInput
  .partial()
  .extend({ version })
  .strict();
export const centerInput = z
  .object({
    code: text,
    name: text,
    description: note,
    parentId: optionalId,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();
export const centerPatch = centerInput
  .partial()
  .extend({ version, status: z.enum(["ACTIVE", "INACTIVE"]).optional() })
  .strict();
export const expenseInput = z
  .object({
    expenseNumber: text,
    supplierId: optionalId,
    contractId: optionalId,
    budgetItemId: optionalId,
    costCenterId: id,
    expenseDate: z.iso.date(),
    description: text,
    documentNumber: note,
    subtotal: cash,
    taxAmount: cash.default("0"),
  })
  .strict();
export const expensePatch = expenseInput
  .partial()
  .extend({ version, taxAmount: cash.optional() })
  .strict();
export const documentInput = z
  .object({
    version,
    fileName: text,
    mimeType: z.enum([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    documentType: z
      .enum(["INVOICE", "RECEIPT", "DELIVERY_NOTE", "PURCHASE_ORDER", "OTHER"])
      .default("OTHER"),
  })
  .strict();
