import { z } from "zod";
import { roles } from "../../domain/src/index.js";
export const uuid = z.uuid();
export const role = z.enum(roles);
const text = (max: number) => z.string().trim().min(1).max(max);
export const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const password = z
  .string()
  .min(10)
  .max(128)
  .refine(
    (v) =>
      /[a-zA-Z]/.test(v) &&
      /[^a-zA-Z]/.test(v) &&
      !/(password|123456|qwerty|abcdefgh)/i.test(v),
    "Escolha uma password menos previsível",
  );
export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    tenantSlug: text(100),
  })
  .strict();
export const forgotSchema = z.object({ email, tenantSlug: text(100) }).strict();
export const resetSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password })
  .strict();
export const inviteSchema = z.object({ name: text(200), email, role }).strict();
export const userPatchSchema = z
  .object({ name: text(200).optional(), role: role.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const organizationSchema = z
  .object({
    legalName: text(200),
    tradeName: text(200).nullable().optional(),
    taxNumber: text(50).nullable().optional(),
    organizationType: z.enum([
      "CONTRACTOR",
      "CLIENT",
      "INSPECTOR",
      "FINANCIER",
      "SUPPLIER",
      "SUBCONTRACTOR",
      "OTHER",
    ]),
    phone: text(40).nullable().optional(),
    email: email.nullable().optional(),
    address: text(2000).nullable().optional(),
  })
  .strict();
export const organizationPatchSchema = organizationSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const projectSchema = z
  .object({
    code: text(50),
    name: text(200),
    description: text(5000).nullable().optional(),
    location: text(250).nullable().optional(),
    startDate: z.iso.date().nullable().optional(),
    plannedEndDate: z.iso.date().nullable().optional(),
    contractValue: z
      .string()
      .regex(/^\d{1,16}(\.\d{1,2})?$/)
      .nullable()
      .optional(),
    currency: z.literal("MZN").default("MZN"),
    status: z
      .enum(["PLANNING", "ACTIVE", "SUSPENDED", "COMPLETED", "CANCELLED"])
      .default("PLANNING"),
  })
  .strict();
export const projectPatchSchema = projectSchema
  .extend({
    currency: z.literal("MZN"),
    status: z.enum([
      "PLANNING",
      "ACTIVE",
      "SUSPENDED",
      "COMPLETED",
      "CANCELLED",
    ]),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const projectUserSchema = z
  .object({
    userId: uuid,
    role,
    status: z.enum(["INVITED", "ACTIVE", "DISABLED"]).default("ACTIVE"),
  })
  .strict();
export const projectUserPatchSchema = projectUserSchema
  .omit({ userId: true })
  .extend({ status: z.enum(["INVITED", "ACTIVE", "DISABLED"]) })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const projectOrganizationSchema = z
  .object({
    organizationId: uuid,
    relationshipType: z.enum([
      "OWNER",
      "CONTRACTOR",
      "INSPECTOR",
      "FINANCIER",
      "SUPPLIER",
      "SUBCONTRACTOR",
      "OTHER",
    ]),
  })
  .strict();
export type ProjectInput = z.infer<typeof projectSchema>;
