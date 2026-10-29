import type { Database } from "../../apps/api/src/platform.js";
import type { Prisma } from "../../apps/api/src/generated/prisma/client.js";
import {
  featureCodes,
  limitKeys,
  billingPeriodEnd,
} from "../../packages/domain/src/saas.js";
/** M1–M7 fixtures explicitly use a private unrestricted plan. Production enforcement is unchanged. */
export async function createTestTenant(
  db: Database,
  input: { data: Prisma.TenantCreateInput },
) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test fixture only");
  const plan = await db.subscriptionPlan.upsert({
    where: { code: "TEST_UNRESTRICTED" },
    create: {
      code: "TEST_UNRESTRICTED",
      name: "Isolated regression fixture",
      currency: "MZN",
      isPublic: false,
    },
    update: {},
  });
  for (const key of limitKeys)
    await db.planLimit.upsert({
      where: { planId_limitKey: { planId: plan.id, limitKey: key } },
      create: { planId: plan.id, limitKey: key, unlimited: true },
      update: {},
    });
  for (const code of featureCodes) {
    const feature = await db.feature.upsert({
      where: { code },
      create: { code, name: code },
      update: {},
    });
    await db.planFeature.upsert({
      where: { planId_featureId: { planId: plan.id, featureId: feature.id } },
      create: { planId: plan.id, featureId: feature.id, enabled: true },
      update: {},
    });
  }
  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create(input);
    const now = new Date();
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "ACTIVE",
        billingCycle: "MANUAL",
        currentPeriodStart: now,
        currentPeriodEnd: billingPeriodEnd(now, "MANUAL"),
      },
    });
    return tenant;
  });
}
