import { effectiveSubscriptionStatus } from "../../../../packages/domain/src/saas.js";
import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Database, fail } from "../platform.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  assertQuota,
  limitQuantity,
  usagePeriod,
  operationalFlag,
  type LimitKey,
} from "../../../../packages/domain/src/saas.js";
type Tx = Prisma.TransactionClient;
const activeProjects = ["PLANNING", "ACTIVE", "SUSPENDED"] as const;
@Injectable()
export class EntitlementService {
  constructor(@Inject(Database) readonly db: Database) {}
  async getTenantEntitlements(tenantId: string, tx: Tx = this.db) {
    const subscription = await tx.subscription.findUnique({
      where: { tenantId },
    });
    if (!subscription)
      return fail(403, "SUBSCRIPTION_REQUIRED", "Subscrição não configurada");
    const plan = await tx.subscriptionPlan.findUniqueOrThrow({
      where: { id: subscription.planId },
      include: { limits: true, features: { include: { feature: true } } },
    });
    return {
      subscription,
      plan,
      features: plan.features
        .filter((f) => f.enabled)
        .map((f) => f.feature.code),
    };
  }
  async hasFeature(tenantId: string, feature: string, tx: Tx = this.db) {
    return (await this.getTenantEntitlements(tenantId, tx)).features.includes(
      feature,
    );
  }
  async assertFeature(tenantId: string, feature: string, tx: Tx = this.db) {
    if (!(await this.hasFeature(tenantId, feature, tx)))
      fail(
        403,
        "FEATURE_NOT_AVAILABLE",
        "Funcionalidade não incluída no plano",
      );
  }
  async flag(tenantId: string, code: string) {
    const flag = await this.db.featureFlag.findUnique({ where: { code } });
    if (!flag) return false;
    const override = await this.db.tenantFeatureOverride.findUnique({
      where: { tenantId_featureFlagId: { tenantId, featureFlagId: flag.id } },
    });
    const bucket =
      createHash("sha256")
        .update(`${code}:${tenantId}`)
        .digest()
        .readUInt32BE(0) % 100;
    return operationalFlag(
      flag.enabled,
      flag.rolloutPercentage,
      bucket,
      override?.enabled,
    );
  }
}
@Injectable()
export class StorageUsageService {
  constructor(@Inject(Database) readonly db: Database) {}
  async bytes(tenantId: string, tx: Tx = this.db) {
    // Include unexpired upload reservations: concurrent uploads cannot oversubscribe.
    const result = await tx.document.aggregate({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ confirmedAt: { not: null } }, { expiresAt: { gt: new Date() } }],
      },
      _sum: { sizeBytes: true },
    });
    const reports = await tx.reportJob.aggregate({
      where: { tenantId, objectKey: { not: null } },
      _sum: { sizeBytes: true },
    });
    return (result._sum.sizeBytes ?? 0n) + (reports._sum.sizeBytes ?? 0n);
  }
}
@Injectable()
export class QuotaService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(EntitlementService) readonly entitlements: EntitlementService,
    @Inject(StorageUsageService) readonly storage: StorageUsageService,
  ) {}
  async lock(tx: Tx, tenantId: string) {
    // All resource allocations and plan changes share this transaction-scoped lock.
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
  }
  async getLimit(tenantId: string, key: LimitKey, tx: Tx = this.db) {
    const { plan } = await this.entitlements.getTenantEntitlements(
      tenantId,
      tx,
    );
    const limit = plan.limits.find((l) => l.limitKey === key);
    if (!limit)
      return fail(403, "PLAN_LIMIT_NOT_CONFIGURED", "Limite não configurado");
    return { ...limit, limitKey: key };
  }
  async getUsage(
    tenantId: string,
    tx: Tx = this.db,
  ): Promise<Record<LimitKey, bigint>> {
    const { start, end } = usagePeriod();
    const [projects, users, bytes, reports, ai] = await Promise.all([
      tx.project.count({
        where: { tenantId, status: { in: [...activeProjects] } },
      }),
      tx.tenantUser.count({
        where: { tenantId, status: { in: ["ACTIVE", "INVITED"] } },
      }),
      this.storage.bytes(tenantId, tx),
      tx.reportJob.count({
        where: {
          tenantId,
          createdAt: { gte: start, lt: end },
          OR: [
            { errorMessage: null },
            { errorMessage: { not: "REPORT_QUEUE_UNAVAILABLE" } },
          ],
        },
      }),
      tx.tenantUsage.findUnique({
        where: {
          tenantId_usageKey_periodStart: {
            tenantId,
            usageKey: "AI_ACTIONS",
            periodStart: start,
          },
        },
      }),
    ]);
    return {
      ACTIVE_PROJECTS: BigInt(projects),
      USERS: BigInt(users),
      STORAGE_GB: bytes,
      MONTHLY_REPORTS: BigInt(reports),
      MONTHLY_AI_ACTIONS: ai?.usedQuantity ?? 0n,
    };
  }
  async assertCanConsume(
    tx: Tx,
    tenantId: string,
    key: LimitKey,
    quantity = 1n,
  ) {
    await this.lock(tx, tenantId);
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const { subscription } = await this.entitlements.getTenantEntitlements(
      tenantId,
      tx,
    );
    const state = effectiveSubscriptionStatus(subscription);
    if (tenant.status !== "ACTIVE" || state === "SUSPENDED")
      fail(403, "SUBSCRIPTION_SUSPENDED", "Empresa suspensa");
    if (!["ACTIVE", "TRIALING"].includes(state))
      fail(403, "SUBSCRIPTION_READ_ONLY", "Subscrição em modo de leitura");
    const limit = await this.getLimit(tenantId, key, tx);
    const usage = await this.getUsage(tenantId, tx);
    assertQuota(limit, usage[key], quantity);
  }
  async canConsume(tenantId: string, key: LimitKey, quantity = 1n) {
    const limit = await this.getLimit(tenantId, key);
    const maximum = limitQuantity(limit);
    const used = (await this.getUsage(tenantId))[key];
    return quantity >= 0n && (maximum === null || used + quantity <= maximum);
  }
  async recordUsage(tenantId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, tenantId);
      const usage = await this.getUsage(tenantId, tx);
      const { start, end } = usagePeriod();
      const keys = {
        ACTIVE_PROJECTS: "ACTIVE_PROJECTS",
        USERS: "USERS",
        STORAGE_GB: "STORAGE_BYTES",
        MONTHLY_REPORTS: "REPORTS_GENERATED",
        MONTHLY_AI_ACTIONS: "AI_ACTIONS",
      };
      for (const key of Object.keys(usage) as LimitKey[]) {
        const usageKey = keys[key];
        await tx.tenantUsage.upsert({
          where: {
            tenantId_usageKey_periodStart: {
              tenantId,
              usageKey,
              periodStart: start,
            },
          },
          create: {
            tenantId,
            usageKey,
            periodStart: start,
            periodEnd: end,
            usedQuantity: usage[key],
          },
          update: { usedQuantity: usage[key] },
        });
      }
      return usage;
    });
  }
}
