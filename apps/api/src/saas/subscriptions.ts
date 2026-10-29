import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { Database, fail } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import { recordAudit } from "../audit/audit.module.js";
import { QuotaService, EntitlementService } from "./entitlements.js";
import {
  assertDowngrade,
  assertSubscriptionTransition,
  billingPeriodEnd,
  effectiveSubscriptionStatus,
  type LimitKey,
} from "../../../../packages/domain/src/saas.js";
import type {
  changePlanInput,
  cancellationInput,
} from "../../../../packages/validation/src/saas.js";
@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(QuotaService) readonly quota: QuotaService,
    @Inject(EntitlementService) readonly entitlements: EntitlementService,
  ) {}
  async get(tenantId: string) {
    const result = await this.entitlements.getTenantEntitlements(tenantId);
    return {
      ...result,
      effectiveStatus: effectiveSubscriptionStatus(result.subscription),
    };
  }
  async change(r: ApiRequest, input: z.infer<typeof changePlanInput>) {
    return this.db.$transaction(async (tx) => {
      await this.quota.lock(tx, r.auth.tenantId);
      const before = await tx.subscription.findUniqueOrThrow({
        where: { tenantId: r.auth.tenantId },
      });
      if (before.version !== input.version)
        fail(
          409,
          "VERSION_CONFLICT",
          "A subscrição foi alterada; atualize a página",
        );
      if (!["ACTIVE", "TRIALING"].includes(effectiveSubscriptionStatus(before)))
        fail(
          409,
          "SUBSCRIPTION_READ_ONLY",
          "Contacte o operador para reativar a subscrição",
        );
      const plan = await tx.subscriptionPlan.findFirst({
        where: { id: input.planId, status: "ACTIVE", isPublic: true },
        include: { limits: true },
      });
      if (!plan) fail(404, "PLAN_NOT_FOUND", "Plano indisponível");
      assertDowngrade(
        plan.limits.map((l) => ({ ...l, limitKey: l.limitKey as LimitKey })),
        await this.quota.getUsage(r.auth.tenantId, tx),
      );
      const result = await tx.subscription.update({
        where: { id: before.id },
        data: {
          planId: plan.id,
          billingCycle: input.billingCycle,
          version: { increment: 1 },
        },
      });
      await recordAudit(
        tx,
        r.auth,
        {
          action: "PLAN_CHANGED",
          entityType: "Subscription",
          entityId: result.id,
          oldValues: {
            planId: before.planId,
            billingCycle: before.billingCycle,
          },
          newValues: {
            planId: result.planId,
            billingCycle: result.billingCycle,
          },
        },
        r,
      );
      return result;
    });
  }
  async cancel(r: ApiRequest, input: z.infer<typeof cancellationInput>) {
    return this.db.$transaction(async (tx) => {
      await this.quota.lock(tx, r.auth.tenantId);
      const before = await tx.subscription.findUniqueOrThrow({
        where: { tenantId: r.auth.tenantId },
      });
      if (before.version !== input.version)
        fail(409, "VERSION_CONFLICT", "Subscrição alterada");
      assertSubscriptionTransition(
        effectiveSubscriptionStatus(before),
        "CANCELLED",
      );
      const result = await tx.subscription.update({
        where: { id: before.id },
        data:
          input.mode === "immediate"
            ? {
                status: "CANCELLED",
                cancelledAt: new Date(),
                cancelAtPeriodEnd: false,
                version: { increment: 1 },
              }
            : { cancelAtPeriodEnd: true, version: { increment: 1 } },
      });
      await recordAudit(
        tx,
        r.auth,
        {
          action: "SUBSCRIPTION_CANCELLED",
          entityType: "Subscription",
          entityId: result.id,
          newValues: { mode: input.mode },
        },
        r,
      );
      return result;
    });
  }
  async transition(
    tenantId: string,
    status: "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED",
    version: number,
    actor: { platformUserId: string; reason: string },
  ) {
    return this.db.$transaction(async (tx) => {
      await this.quota.lock(tx, tenantId);
      const before = await tx.subscription.findUniqueOrThrow({
        where: { tenantId },
      });
      if (before.version !== version)
        fail(409, "VERSION_CONFLICT", "Subscrição alterada");
      assertSubscriptionTransition(effectiveSubscriptionStatus(before), status);
      const now = new Date();
      const result = await tx.subscription.update({
        where: { id: before.id },
        data: {
          status,
          version: { increment: 1 },
          ...(status === "ACTIVE"
            ? {
                currentPeriodStart: now,
                currentPeriodEnd: billingPeriodEnd(now, before.billingCycle),
                cancelAtPeriodEnd: false,
              }
            : {}),
          ...(status === "SUSPENDED" ? { suspendedAt: now } : {}),
          ...(status === "CANCELLED" ? { cancelledAt: now } : {}),
        },
      });
      await tx.platformAuditLog.create({
        data: {
          platformUserId: actor.platformUserId,
          tenantId,
          action: "SUBSCRIPTION_STATUS_CHANGED",
          entityType: "Subscription",
          entityId: before.id,
          oldValues: { status: before.status },
          newValues: { status, reason: actor.reason },
        },
      });
      return result;
    });
  }
}
