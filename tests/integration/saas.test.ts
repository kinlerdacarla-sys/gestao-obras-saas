import { OnboardingService } from "../../apps/api/src/saas/onboarding.js";
import { NotificationService } from "../../apps/api/src/notification/notification.module.js";
import { ManualBillingProvider } from "../../apps/api/src/saas/billing.js";
import request from "supertest";
import { createApp } from "../../apps/api/src/app.js";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Database, Cache } from "../../apps/api/src/platform.js";
import {
  EntitlementService,
  QuotaService,
  StorageUsageService,
} from "../../apps/api/src/saas/entitlements.js";
import {
  PlatformAuthService,
  type PlatformRequest,
} from "../../apps/api/src/saas/platform-auth.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { seedSaas } from "../../prisma/seed-saas.js";
import { billingPeriodEnd } from "../../packages/domain/src/saas.js";
import type { Request } from "express";
import { SubscriptionService } from "../../apps/api/src/saas/subscriptions.js";
import type { ApiRequest } from "../../apps/api/src/auth/security.js";

describe("M8 isolated commercial foundations", () => {
  const db = new Database(),
    cache = new Cache();
  const entitlements = new EntitlementService(db),
    storage = new StorageUsageService(db);
  const quota = new QuotaService(db, entitlements, storage);
  const subscriptions = new SubscriptionService(db, quota, entitlements);
  const auth = new PlatformAuthService(db, cache);
  const suffix = randomUUID();
  let app: INestApplication;
  let tenantId: string,
    otherTenantId: string,
    userId: string,
    starter: string,
    professional: string;
  const req = () =>
    ({
      auth: { tenantId, userId, role: "ADMIN", sessionId: randomUUID() },
      ip: "192.0.2.81",
      get: () => "M8 integration",
    }) as unknown as ApiRequest;
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await seedSaas(db);
    starter = (
      await db.subscriptionPlan.findUniqueOrThrow({
        where: { code: "STARTER" },
      })
    ).id;
    professional = (
      await db.subscriptionPlan.findUniqueOrThrow({
        where: { code: "PROFESSIONAL" },
      })
    ).id;
    tenantId = (
      await db.tenant.create({
        data: { name: "M8 quota", slug: `m8-${suffix}` },
      })
    ).id;
    otherTenantId = (
      await db.tenant.create({
        data: { name: "M8 isolation", slug: `m8-other-${suffix}` },
      })
    ).id;
    userId = (
      await db.user.create({
        data: {
          name: "M8 admin",
          email: `m8-${suffix}@example.test`,
          passwordHash: await hashPassword("M8-Integration!2026"),
          status: "ACTIVE",
        },
      })
    ).id;
    await db.tenantUser.create({
      data: { tenantId, userId, role: "ADMIN", status: "ACTIVE" },
    });
    const now = new Date();
    for (const id of [tenantId, otherTenantId])
      await db.subscription.create({
        data: {
          tenantId: id,
          planId: starter,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: billingPeriodEnd(now, "MANUAL"),
        },
      });
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
    await cache.quit();
  });
  it("serializes competing allocations without exceeding the quota", async () => {
    const allocate = () =>
      db.$transaction(async (tx) => {
        await quota.assertCanConsume(tx, tenantId, "ACTIVE_PROJECTS");
        return tx.project.create({
          data: {
            tenantId,
            code: randomUUID(),
            name: "Quota race",
            createdBy: userId,
            updatedBy: userId,
          },
        });
      });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, allocate),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
    expect(await db.project.count({ where: { tenantId } })).toBe(3);
    expect((await quota.getUsage(otherTenantId)).ACTIVE_PROJECTS).toBe(0n);
  });
  it("denies Starter advanced reports and does not grant features through a flag", async () => {
    expect(await entitlements.hasFeature(tenantId, "ADVANCED_REPORTS")).toBe(
      false,
    );
    await expect(
      entitlements.assertFeature(tenantId, "ADVANCED_REPORTS"),
    ).rejects.toThrow();
    await db.featureFlag.create({
      data: {
        code: `test-${suffix}`,
        description: "Rollout",
        enabled: true,
        rolloutPercentage: 100,
      },
    });
    expect(await entitlements.flag(tenantId, `test-${suffix}`)).toBe(true);
    expect(await entitlements.hasFeature(tenantId, "ADVANCED_REPORTS")).toBe(
      false,
    );
  });
  it("upgrades, rejects stale versions and blocks downgrade above usage", async () => {
    await subscriptions.change(req(), {
      planId: professional,
      billingCycle: "MANUAL",
      version: 1,
    });
    await expect(
      subscriptions.change(req(), {
        planId: starter,
        billingCycle: "MANUAL",
        version: 1,
      }),
    ).rejects.toThrow();
    await db.$transaction(async (tx) => {
      await quota.assertCanConsume(tx, tenantId, "ACTIVE_PROJECTS");
      await tx.project.create({
        data: {
          tenantId,
          code: randomUUID(),
          name: "Fourth project",
          createdBy: userId,
          updatedBy: userId,
        },
      });
    });
    await expect(
      subscriptions.change(req(), {
        planId: starter,
        billingCycle: "MANUAL",
        version: 2,
      }),
    ).rejects.toThrow("PLAN_DOWNGRADE_BLOCKED_BY_USAGE");
    expect((await subscriptions.get(tenantId)).plan.code).toBe("PROFESSIONAL");
  });
  it("snapshots current usage idempotently", async () => {
    await quota.recordUsage(tenantId);
    await quota.recordUsage(tenantId);
    expect(await db.tenantUsage.count({ where: { tenantId } })).toBe(5);
    expect(
      (
        await db.tenantUsage.findFirstOrThrow({
          where: { tenantId, usageKey: "ACTIVE_PROJECTS" },
        })
      ).usedQuantity,
    ).toBe(4n);
  });
  it("provisions atomically and delivers a single-use invitation without returning credentials", async () => {
    const mail = app.get(NotificationService);
    let invitation = "";
    const delivery = vi
      .spyOn(mail, "deliverReset")
      .mockImplementation(async (_email, token) => {
        invitation = token;
      });
    try {
      const service = new OnboardingService(db, cache, mail);
      const input = {
        company: {
          legalName: "New company",
          email: `company-${suffix}@example.test`,
          slug: `new-${suffix}`,
        },
        admin: { name: "First Admin", email: `invited-${suffix}@example.test` },
        planId: starter,
        timezone: "Africa/Maputo",
        dateFormat: "dd/MM/yyyy" as const,
        termsVersion: "draft",
        privacyVersion: "draft",
      };
      const result = await service.provision(input, {
        ip: "192.0.2.85",
        get: () => "integration",
      } as unknown as Request);
      expect(result.invitation).toBe("SENT");
      expect(JSON.stringify(result)).not.toContain(invitation);
      expect(invitation).toMatch(/^[a-f0-9]{64}$/);
      expect(
        (
          await db.subscription.findUniqueOrThrow({
            where: { tenantId: result.tenantId },
          })
        ).status,
      ).toBe("TRIALING");
      expect(
        await db.project.count({ where: { tenantId: result.tenantId } }),
      ).toBe(0);
      const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
      const reset = await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .set("Origin", origin)
        .send({ token: invitation, password: "Onboarding-Test!2026" });
      expect(reset.status).toBe(200);
      expect(
        (
          await request(app.getHttpServer())
            .post("/api/v1/auth/reset-password")
            .set("Origin", origin)
            .send({ token: invitation, password: "Onboarding-Test!2026" })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app.getHttpServer())
            .post("/api/v1/auth/login")
            .set("Origin", origin)
            .send({
              email: input.admin.email,
              password: "Onboarding-Test!2026",
              tenantSlug: result.slug,
            })
        ).status,
      ).toBe(200);
      await expect(
        service.provision(
          {
            ...input,
            company: { ...input.company, slug: `rollback-${suffix}` },
          },
          { ip: "192.0.2.85", get: () => "integration" } as unknown as Request,
        ),
      ).rejects.toThrow();
      expect(
        await db.tenant.findUnique({ where: { slug: `rollback-${suffix}` } }),
      ).toBeNull();
    } finally {
      delivery.mockRestore();
    }
  });
  it("creates manual invoices idempotently and isolates invoice retrieval", async () => {
    const billing = new ManualBillingProvider(db);
    const [a, b] = await Promise.all([
      billing.draft(tenantId, `invoice-${suffix}`, "100.25", "16.04"),
      billing.draft(tenantId, `invoice-${suffix}`, "100.25", "16.04"),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.totalAmount.toString()).toBe("116.29");
    expect(a.status).toBe("DRAFT");
    expect(billing.onlinePayments).toBe(false);
    await expect(billing.getInvoice(otherTenantId, a.id)).rejects.toThrow();
    await expect(billing.createCheckoutSession()).rejects.toThrow();
    await expect(billing.handleWebhook()).rejects.toThrow();
  });
  it("keeps cancellation data and audits the requested timing", async () => {
    const result = await subscriptions.cancel(req(), {
      mode: "end_of_period",
      version: 2,
    });
    expect(result.status).toBe("ACTIVE");
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(await db.project.count({ where: { tenantId } })).toBe(4);
    expect(
      await db.auditLog.count({
        where: { tenantId, action: "SUBSCRIPTION_CANCELLED" },
      }),
    ).toBe(1);
  });
  it("does not authenticate a tenant admin as platform admin", async () => {
    await expect(
      auth.login(`m8-${suffix}@example.test`, "M8-Integration!2026", {
        ip: "192.0.2.82",
      } as Request),
    ).rejects.toThrow();
  });
  it("exposes live/ready health and generates request IDs without echoing attacker input", async () => {
    const live = await request(app.getHttpServer())
      .get("/health/live")
      .set("X-Request-ID", "attacker-supplied");
    expect(live.status).toBe(200);
    expect(live.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/);
    const ready = await request(app.getHttpServer()).get("/health/ready");
    expect(ready.body).toEqual({ api: "up", postgresql: "up", redis: "up" });
    expect(
      (await request(app.getHttpServer()).get("/api/v1/platform/metrics"))
        .status,
    ).toBe(401);
  });
  it("protects platform HTTP routes from tenant sessions and missing origin", async () => {
    const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({
        email: `m8-${suffix}@example.test`,
        password: "M8-Integration!2026",
        tenantSlug: `m8-${suffix}`,
      });
    expect(login.status).toBe(200);
    const tenantCookie = login.headers["set-cookie"];
    const denied = await request(app.getHttpServer())
      .get("/api/v1/platform/dashboard")
      .set("Cookie", tenantCookie);
    expect(denied.status).toBe(401);
    const csrf = await request(app.getHttpServer())
      .post("/api/v1/platform/auth/login")
      .send({ email: "a@example.test", password: "password" });
    expect(csrf.status).toBe(403);
  });
  it("authenticates separate platform sessions and observes revocation", async () => {
    const platform = await db.platformUser.create({
      data: { userId, role: "SUPPORT" },
    });
    const raw = await auth.login(
      `m8-${suffix}@example.test`,
      "M8-Integration!2026",
      { ip: "192.0.2.83" } as Request,
    );
    const r = {
      cookies: { platform_access: raw },
    } as unknown as PlatformRequest;
    await auth.authenticate(r);
    expect(r.platform.id).toBe(platform.id);
    expect(() => auth.superAdmin(r)).toThrow();
    await db.platformUser.update({
      where: { id: platform.id },
      data: { status: "DISABLED" },
    });
    await expect(auth.authenticate(r)).rejects.toThrow();
    await expect(
      db.platformAuditLog.deleteMany({
        where: { platformUserId: platform.id },
      }),
    ).rejects.toThrow();
  });
});
