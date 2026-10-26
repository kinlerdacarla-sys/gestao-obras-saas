import type { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import {
  featureCodes,
  limitKeys,
  billingPeriodEnd,
} from "../packages/domain/src/saas.js";
/** Only demo catalog values; commercial prices remain unset until an operator configures them. */
export async function seedSaas(db: PrismaClient) {
  for (const code of featureCodes)
    await db.feature.upsert({
      where: { code },
      create: { code, name: code.replaceAll("_", " ") },
      update: {},
    });
  for (const [code, name, limits] of [
    ["STARTER", "Starter", [3, 10, 10, 10, 0]],
    ["PROFESSIONAL", "Professional", [20, 75, 100, 250, 0]],
    ["ENTERPRISE", "Enterprise", [null, null, null, null, 0]],
  ] as const) {
    const plan = await db.subscriptionPlan.upsert({
      where: { code },
      create: { code, name, currency: "MZN", trialDays: 14 },
      update: {},
    });
    for (const [index, key] of limitKeys.entries())
      await db.planLimit.upsert({
        where: { planId_limitKey: { planId: plan.id, limitKey: key } },
        create: {
          planId: plan.id,
          limitKey: key,
          limitValue: limits[index],
          unlimited: limits[index] === null,
        },
        update: {},
      });
    for (const feature of await db.feature.findMany())
      await db.planFeature.upsert({
        where: { planId_featureId: { planId: plan.id, featureId: feature.id } },
        create: {
          planId: plan.id,
          featureId: feature.id,
          enabled:
            code !== "STARTER" &&
            !["API_ACCESS", "CUSTOM_BRANDING", "PRIORITY_SUPPORT"].includes(
              feature.code,
            ),
        },
        update: {},
      });
  }
  const plan = await db.subscriptionPlan.findUniqueOrThrow({
    where: { code: "PROFESSIONAL" },
  });
  const tenant = await db.tenant.findUnique({
    where: { slug: "construtora-demo" },
  });
  if (tenant) {
    const now = new Date();
    await db.subscription.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "ACTIVE",
        billingCycle: "MANUAL",
        currentPeriodStart: now,
        currentPeriodEnd: billingPeriodEnd(now, "MANUAL"),
      },
      update: {},
    });
    await db.tenantSetting.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id },
      update: {},
    });
  }
}
