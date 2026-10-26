import { z } from "zod";
import { featureCodes, limitKeys } from "../../domain/src/saas.js";
export const planInput = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,49}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(2000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  monthlyPrice: z
    .string()
    .regex(/^\d{1,16}(\.\d{1,2})?$/)
    .nullable(),
  annualPrice: z
    .string()
    .regex(/^\d{1,16}(\.\d{1,2})?$/)
    .nullable(),
  trialDays: z.number().int().min(0).max(365),
  isPublic: z.boolean(),
  limits: z
    .array(
      z
        .object({
          limitKey: z.enum(limitKeys),
          limitValue: z.number().int().min(0).max(2147483647).nullable(),
          unlimited: z.boolean(),
        })
        .refine((l) =>
          l.unlimited ? l.limitValue === null : l.limitValue !== null,
        ),
    )
    .length(5)
    .refine((l) => new Set(l.map((x) => x.limitKey)).size === 5),
  features: z.array(z.enum(featureCodes)),
});
export const changePlanInput = z.object({
  planId: z.uuid(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL", "MANUAL"]),
  version: z.number().int().positive(),
});
export const cancellationInput = z.object({
  mode: z.enum(["immediate", "end_of_period"]).default("end_of_period"),
  version: z.number().int().positive(),
});
export const platformLoginInput = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1).max(200),
});
export const reasonInput = z.object({
  reason: z.string().trim().min(10).max(2000),
});
export const supportInput = reasonInput.extend({
  tenantId: z.uuid(),
  platformUserId: z.uuid(),
});
export const onboardingInput = z.object({
  company: z.object({
    legalName: z.string().trim().min(2).max(200),
    tradeName: z.string().max(200).optional(),
    taxNumber: z.string().max(50).optional(),
    phone: z.string().max(40).optional(),
    email: z.email(),
    address: z.string().max(1000).optional(),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,59}$/),
  }),
  admin: z.object({
    name: z.string().trim().min(2).max(200),
    email: z.email().toLowerCase(),
  }),
  planId: z.uuid(),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  dateFormat: z.enum(["dd/MM/yyyy", "yyyy-MM-dd"]),
  termsVersion: z.string().min(1).max(100),
  privacyVersion: z.string().min(1).max(100),
});
