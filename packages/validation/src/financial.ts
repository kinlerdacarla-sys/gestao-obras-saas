import { z } from "zod";
import { cash, version } from "./commercial.js";
export { pageInput } from "./commercial.js";
const id = z.uuid(),
  note = z.string().trim().max(10000).nullable().optional(),
  text = z.string().trim().min(1).max(200),
  date = z.iso.date();
export const action = z
  .object({ version, reason: z.string().trim().min(3).max(2000).optional() })
  .strict();
export const measurement = z
  .object({
    contractId: id,
    periodStart: date,
    periodEnd: date,
    description: note,
    manualAdvanceRecovery: cash.default("0"),
  })
  .strict();
export const measurementPatch = measurement
  .omit({ contractId: true })
  .partial()
  .extend({ version, manualAdvanceRecovery: cash.optional() })
  .strict();
export const item = z
  .object({
    version,
    contractItemId: id,
    currentQuantity: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/),
  })
  .strict();
export const deduction = z
  .object({
    version,
    type: z.enum(["PENALTY", "OTHER"]),
    description: text,
    amount: cash,
  })
  .strict();
export const settings = z
  .object({
    version,
    advanceRecoveryMethod: z.enum(["PERCENTAGE", "FIXED", "MANUAL"]),
    advanceRecoveryPercentage: cash.nullable().optional(),
    advanceRecoveryFixedAmount: cash.nullable().optional(),
    finalApprovalRole: z.enum(["FINANCIER", "CLIENT"]),
  })
  .strict();
export const release = z.object({ amount: cash, reason: text }).strict();
export const funding = z
  .object({
    financierOrganizationId: id,
    agreementNumber: text,
    title: text,
    description: note,
    approvedAmount: cash,
    startDate: date,
    endDate: date.nullable().optional(),
    status: z
      .enum(["DRAFT", "ACTIVE", "SUSPENDED", "CLOSED", "CANCELLED"])
      .default("DRAFT"),
  })
  .strict();
export const fundingPatch = funding
  .partial()
  .extend({
    version,
    status: z
      .enum(["DRAFT", "ACTIVE", "SUSPENDED", "CLOSED", "CANCELLED"])
      .optional(),
  })
  .strict();
export const request = z
  .object({
    fundingAgreementId: id,
    measurementId: id.nullable().optional(),
    requestedAmount: cash,
    description: note,
  })
  .strict();
export const approveRequest = action.extend({
  approvedAmount: cash.optional(),
});
export const disbursement = z
  .object({
    version,
    amount: cash,
    disbursementDate: date,
    reference: note,
    notes: note,
  })
  .strict();
export const payment = z
  .object({
    supplierId: id,
    contractId: id.nullable().optional(),
    measurementId: id.nullable().optional(),
    expenseId: id.nullable().optional(),
    retentionReleaseId: id.nullable().optional(),
    amount: cash,
    paymentDate: date,
    method: z.enum([
      "BANK_TRANSFER",
      "CASH",
      "CHEQUE",
      "MOBILE_MONEY",
      "OTHER",
    ]),
    reference: note,
    description: note,
  })
  .strict();

import { documentInput } from "./commercial.js";
export const document = documentInput.extend({
  documentType: z
    .enum([
      "MEASUREMENT_SHEET",
      "CERTIFICATE",
      "INVOICE",
      "PAYMENT_PROOF",
      "DISBURSEMENT_PROOF",
      "OTHER",
    ])
    .default("OTHER"),
});
