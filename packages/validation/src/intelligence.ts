import { z } from "zod";
export const alertSettingsInput = z
  .object({
    scheduleDelayThresholdPP: z.coerce.number().min(0).max(100),
    fundingLowThresholdPercentage: z.coerce.number().min(0).max(100),
    contractExpiryDays: z.number().int().min(1).max(365),
    missingDailyLogDays: z.number().int().min(1).max(365),
    enableEmail: z.boolean(),
    enableInApp: z.boolean(),
  })
  .strict();
export const alertAction = z
  .object({
    version: z.number().int().nonnegative(),
    status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
  })
  .strict();
export const alertQuery = z
  .object({
    project: z.uuid().optional(),
    status: z
      .enum(["ACTIVE", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();
export const notificationPreferences = z
  .object({
    emailEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
    dailyDigestEnabled: z.boolean(),
    inspectionNotifications: z.boolean(),
    measurementNotifications: z.boolean(),
    qualityNotifications: z.boolean(),
    financialNotifications: z.boolean(),
    scheduleNotifications: z.boolean(),
  })
  .strict();
