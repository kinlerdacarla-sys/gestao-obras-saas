import { z } from "zod";
import { uuid } from "./index.js";
const text = (max: number) => z.string().trim().min(1).max(max);
export const versionSchema = z
  .object({ version: z.number().int().nonnegative() })
  .strict();
export const budgetSchema = z
  .object({
    name: text(200).default("Orçamento principal"),
    description: text(5000).optional(),
  })
  .strict();
export const revisionSchema = z
  .object({
    sourceRevisionId: uuid.optional(),
    description: text(5000).optional(),
  })
  .strict();
export const revisionPatchSchema = versionSchema.extend({
  description: text(5000),
});
export const rejectSchema = versionSchema.extend({ reason: text(2000) });
export const itemFields = z
  .object({
    code: text(100),
    description: text(5000),
    itemType: z.enum(["GROUP", "ITEM"]),
    unit: text(30).nullable().default(null),
    parentId: uuid.nullable().default(null),
    quantity: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,4})?$/)
      .nullable()
      .default(null),
    unitPrice: z
      .string()
      .regex(/^\d{1,16}(\.\d{1,2})?$/)
      .nullable()
      .default(null),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();
export const itemCreateSchema = itemFields.extend({
  revisionId: uuid,
  version: z.number().int().nonnegative(),
});
export const itemPatchSchema = itemFields
  .extend({
    unit: text(30).nullable(),
    parentId: uuid.nullable(),
    quantity: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,4})?$/)
      .nullable(),
    unitPrice: z
      .string()
      .regex(/^\d{1,16}(\.\d{1,2})?$/)
      .nullable(),
    sortOrder: z.number().int().nonnegative(),
  })
  .partial()
  .extend({ revisionId: uuid, version: z.number().int().nonnegative() });
export const deleteItemSchema = versionSchema.extend({ revisionId: uuid });
export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const mappingSchema = versionSchema.extend({
  mapping: z
    .record(
      z.enum([
        "code",
        "description",
        "unit",
        "quantity",
        "unitPrice",
        "parentCode",
        "itemType",
      ]),
      z.string().max(200),
    )
    .refine((m) => !!m.code && !!m.description),
});
export const rowPatchSchema = versionSchema.extend({
  data: z
    .object({
      code: z.string().max(100).optional(),
      description: z.string().max(5000).optional(),
      unit: z.string().max(30).optional(),
      quantity: z.string().max(40).optional(),
      unitPrice: z.string().max(40).optional(),
      parentCode: z.string().max(100).optional(),
      itemType: z.enum(["GROUP", "ITEM"]).optional(),
    })
    .strict(),
});
