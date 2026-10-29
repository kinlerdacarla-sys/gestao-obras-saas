import { ManualBillingProvider } from "../../apps/api/src/saas/billing.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../../apps/api/src/app.js";
import { Database, Cache } from "../../apps/api/src/platform.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { DataExportService } from "../../apps/api/src/saas/exports.js";
import { InvitationService } from "../../apps/api/src/saas/invitations.js";
import { NotificationService } from "../../apps/api/src/notification/notification.module.js";
import { seedSaas } from "../../prisma/seed-saas.js";
describe("M8 real API enforcement and tenant portability", () => {
  const db = new Database(),
    cache = new Cache(),
    suffix = randomUUID(),
    password = "M8-Completion!2026",
    origin = process.env.WEB_ORIGIN!;
  let app: INestApplication,
    tenantId: string,
    otherId: string,
    adminId: string,
    cookie: string,
    otherCookie: string,
    platformCookie: string,
    starter: string,
    professional: string,
    projectId: string;
  const call = (method: "get" | "post" | "patch", path: string, c = cookie) => {
    const agent = request(app.getHttpServer());
    return agent[method](`/api/v1${path}`)
      .set("Cookie", c)
      .set("Origin", origin);
  };
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await cache.del(
      "auth:ip:127.0.0.1",
      "auth:ip:::ffff:127.0.0.1",
      "platform:login:ip:::ffff:127.0.0.1",
    );
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
    for (const key of ["primary", "other"]) {
      const t = await db.tenant.create({
        data: { name: `M8 API ${key}`, slug: `m8-api-${key}-${suffix}` },
      });
      const u = await db.user.create({
        data: {
          name: `Admin ${key}`,
          email: `m8-api-${key}-${suffix}@example.test`,
          passwordHash: await hashPassword(password),
          status: "ACTIVE",
        },
      });
      await db.tenantUser.create({
        data: { tenantId: t.id, userId: u.id, role: "ADMIN", status: "ACTIVE" },
      });
      await db.subscription.create({
        data: {
          tenantId: t.id,
          planId: starter,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      });
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({ tenantSlug: t.slug, email: u.email, password });
      expect(res.status).toBe(200);
      const c = (res.headers["set-cookie"] as unknown as string[])
        .map((x) => x.split(";")[0])
        .join("; ");
      if (key === "primary") {
        tenantId = t.id;
        adminId = u.id;
        cookie = c;
      } else {
        otherId = t.id;
        otherCookie = c;
      }
    }
    const u = await db.user.create({
      data: {
        name: "Platform completion",
        email: `platform-completion-${suffix}@example.test`,
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
      },
    });
    await db.platformUser.create({
      data: { userId: u.id, role: "SUPER_ADMIN" },
    });
    const res = await request(app.getHttpServer())
      .post("/api/v1/platform/auth/login")
      .set("Origin", origin)
      .send({ email: u.email, password });
    expect(res.status).toBe(201);
    platformCookie = (res.headers["set-cookie"] as unknown as string[])
      .map((x) => x.split(";")[0])
      .join("; ");
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
    await cache.quit();
  });
  it("enforces project quota through the existing route, upgrade and downgrade", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await call("post", "/projects").send({
        code: `P${i}`,
        name: `Project ${i}`,
      });
      expect(r.status).toBe(201);
      projectId = r.body.id;
    }
    const blocked = await call("post", "/projects").send({
      code: "P4",
      name: "Fourth",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("PROJECT_LIMIT_EXCEEDED");
    expect(
      (
        await call("post", "/subscription/change-plan").send({
          planId: professional,
          billingCycle: "MANUAL",
          version: 1,
        })
      ).status,
    ).toBe(201);
    expect(
      (await call("post", "/projects").send({ code: "P4", name: "Fourth" }))
        .status,
    ).toBe(201);
    const down = await call("post", "/subscription/change-plan").send({
      planId: starter,
      billingCycle: "MANUAL",
      version: 2,
    });
    expect(down.body.code).toBe("PLAN_DOWNGRADE_BLOCKED_BY_USAGE");
  });
  it("blocks user invitations at quota and accepts them after upgrading", async () => {
    for (let i = 0; i < 9; i++) {
      const r = await call("post", "/users/invite", otherCookie).send({
        name: `Member ${i}`,
        email: `m8-member-${i}-${suffix}@example.test`,
        role: "MANAGER",
      });
      expect(r.status).toBe(201);
    }
    const payload = {
      name: "Extra member",
      email: `m8-extra-${suffix}@example.test`,
      role: "MANAGER",
    };
    expect(
      (await call("post", "/users/invite", otherCookie).send(payload)).body
        .code,
    ).toBe("USER_LIMIT_EXCEEDED");
    expect(
      (
        await call("post", "/subscription/change-plan", otherCookie).send({
          planId: professional,
          billingCycle: "MANUAL",
          version: 1,
        })
      ).status,
    ).toBe(201);
    expect(
      (await call("post", "/users/invite", otherCookie).send(payload)).status,
    ).toBe(201);
  });
  it("suspends old mutation endpoints while preserving login, reads and export access", async () => {
    const status = await call(
      "post",
      `/platform/tenants/${tenantId}/suspend`,
      platformCookie,
    ).send({ reason: "Suspension integration verification" });
    expect(status.status).toBe(201);
    expect(
      (
        await call("post", "/projects").send({
          code: "blocked",
          name: "Blocked",
        })
      ).body.code,
    ).toBe("SUBSCRIPTION_SUSPENDED");
    expect(
      (
        await call("patch", `/projects/${projectId}`).send({
          name: "blocked update",
        })
      ).body.code,
    ).toBe("SUBSCRIPTION_SUSPENDED");
    expect((await call("get", `/projects/${projectId}`)).status).toBe(200);
    expect((await call("get", "/billing/invoices")).status).toBe(200);
    expect((await call("get", "/data-exports")).status).toBe(200);
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({
        tenantSlug: `m8-api-primary-${suffix}`,
        email: `m8-api-primary-${suffix}@example.test`,
        password,
      });
    expect(login.status).toBe(200);
    expect(
      (
        await call(
          "post",
          `/platform/tenants/${tenantId}/reactivate`,
          platformCookie,
        ).send({ reason: "Resolved suspension integration verification" })
      ).status,
    ).toBe(201);
    expect(
      (
        await call("patch", `/projects/${projectId}`).send({
          name: "Restored update",
        })
      ).status,
    ).toBe(200);
  });
  it("denies commercial features independently of client navigation", async () => {
    await db.subscription.update({
      where: { tenantId: otherId },
      data: { planId: starter },
    });
    const denied = await call("get", "/dashboard/portfolio", otherCookie);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("FEATURE_NOT_AVAILABLE");
    expect(
      (await call("get", "/checklist-templates", otherCookie)).body.code,
    ).toBe("FEATURE_NOT_AVAILABLE");
    expect(
      (
        await call(
          "post",
          `/projects/${projectId}/daily-log-occurrences/${randomUUID()}/create-non-conformity`,
          otherCookie,
        ).send({})
      ).body.code,
    ).toBe("FEATURE_NOT_AVAILABLE");

    expect((await call("get", "/platform/tenants")).status).toBe(401);
    expect(
      (await call("get", "/subscription", otherCookie)).body.subscription
        .tenantId,
    ).toBe(otherId);
    await app
      .get(ManualBillingProvider)
      .draft(tenantId, `isolation-${suffix}`, "100.00", "0.00");
    expect((await call("get", "/billing/invoices")).body).toHaveLength(1);
    expect((await call("get", "/billing/invoices", otherCookie)).body).toEqual(
      [],
    );
  });
  it("exports a snapshot without secrets, rejects cross-tenant reads and expires downloads", async () => {
    const exports = app.get(DataExportService),
      r = await call("post", "/data-exports");
    expect(r.status).toBe(201);
    await exports.process(r.body.id);
    const artifact = JSON.parse(
      gunzipSync(await readFile(exports.file(r.body.id))).toString(),
    );
    expect(artifact.tenant.id).toBe(tenantId);
    expect(artifact.projects.length).toBe(4);
    expect(artifact.users.some((u: { id: string }) => u.id === adminId)).toBe(
      true,
    );
    const serialized = JSON.stringify(artifact);
    expect(serialized).not.toMatch(
      /password_hash|passwordHash|token_hash|tokenHash|ciphertext|refresh_token|SMTP_URL/,
    );
    expect(serialized).not.toContain(otherId);
    const ticket = await call("get", `/data-exports/${r.body.id}`);
    expect(ticket.body.downloadUrl).toBeTruthy();
    const download = await request(app.getHttpServer())
      .get(ticket.body.downloadUrl)
      .set("Cookie", cookie);
    expect(download.status).toBe(200);
    expect(
      (await call("get", `/data-exports/${r.body.id}`, otherCookie)).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .get(ticket.body.downloadUrl)
          .set("Cookie", otherCookie)
      ).status,
    ).toBe(403);
    await db.dataExportJob.update({
      where: { id: r.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(ticket.body.downloadUrl)
          .set("Cookie", cookie)
      ).status,
    ).toBe(410);
    expect(
      await db.auditLog.count({
        where: {
          tenantId,
          entityId: r.body.id,
          action: {
            in: [
              "TENANT_DATA_EXPORT_REQUESTED",
              "TENANT_DATA_EXPORT_COMPLETED",
              "TENANT_DATA_EXPORT_DOWNLOADED",
            ],
          },
        },
      }),
    ).toBe(3);
  });
  it("does not deliver an expired invitation or expose its encrypted token", async () => {
    const row = await db.invitationDelivery.findFirstOrThrow({
      where: { tenantId: otherId },
    });
    await db.invitationDelivery.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const mail = vi
      .spyOn(app.get(NotificationService), "deliverReset")
      .mockResolvedValue();
    await app.get(InvitationService).process(row.id);
    expect(mail).not.toHaveBeenCalled();
    mail.mockRestore();
  });
  it("counts upload reservations and rechecks storage at confirmation", async () => {
    const base = await db.subscriptionPlan.findUniqueOrThrow({
      where: { id: professional },
      include: { limits: true, features: true },
    });
    const plan = await db.subscriptionPlan.create({
      data: {
        code: `STORAGE_${suffix}`,
        name: "Isolated storage plan",
        currency: "MZN",
        isPublic: false,
        limits: {
          create: base.limits.map((l) => ({
            limitKey: l.limitKey,
            limitValue:
              l.limitKey === "STORAGE_GB"
                ? 1
                : l.limitKey === "MONTHLY_REPORTS"
                  ? 1
                  : l.limitValue,
            unlimited: false,
          })),
        },
        features: {
          create: base.features.map((f) => ({
            featureId: f.featureId,
            enabled: f.enabled,
          })),
        },
      },
    });
    await db.subscription.update({
      where: { tenantId },
      data: { planId: plan.id },
    });
    const log = await call("post", `/projects/${projectId}/daily-logs`).send({
      logDate: "2026-10-20",
    });
    expect(log.status, log.text).toBe(201);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    );
    const reserve = () =>
      call(
        "post",
        `/projects/${projectId}/daily-logs/${log.body.id}/photos`,
      ).send({
        version: log.body.version,
        fileName: "quota.png",
        mimeType: "image/png",
        sizeBytes: bytes.length,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        visibility: "INTERNAL",
        isPhoto: true,
      });
    const ticket = await reserve();
    expect(ticket.status, ticket.text).toBe(201);
    const uploaded = await request(app.getHttpServer())
      .put(ticket.body.uploadUrl)
      .set("Cookie", cookie)
      .set("Origin", origin)
      .attach("file", bytes, {
        filename: "quota.png",
        contentType: "image/png",
      });
    expect(uploaded.status).toBe(200);
    const occupied = await db.document.create({
      data: {
        tenantId,
        projectId,
        createdBy: adminId,
        objectKey: `fixture/${randomUUID()}`,
        dailyLogId: log.body.id,
        fileName: "accounted.bin",
        mimeType: "application/octet-stream",
        sizeBytes: 1073741824n,
        checksum: "a".repeat(64),
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    expect((await reserve()).body.code).toBe("STORAGE_LIMIT_EXCEEDED");
    const blocked = await call(
      "post",
      `/projects/${projectId}/daily-logs/${log.body.id}/documents/${ticket.body.id}/confirm`,
    ).send({ version: ticket.body.version });
    expect(blocked.body.code).toBe("STORAGE_LIMIT_EXCEEDED");
    await db.document.update({
      where: { id: occupied.id },
      data: { deletedAt: new Date() },
    });
    expect(
      (
        await call(
          "post",
          `/projects/${projectId}/daily-logs/${log.body.id}/documents/${ticket.body.id}/confirm`,
        ).send({ version: ticket.body.version })
      ).status,
    ).toBe(201);
    expect((await call("get", "/usage")).body.confirmedDocumentBytes).toBe(
      String(bytes.length),
    );
  });
  it("accepts one monthly report, replays the same key and rejects a new allocation", async () => {
    const input = {
      projectId,
      reportType: "PROJECT_PROGRESS",
      format: "PDF",
      requestKey: randomUUID(),
    };
    const first = await call("post", "/reports").send(input);
    expect(first.status, first.text).toBe(201);
    const replay = await call("post", "/reports").send(input);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    const denied = await call("post", "/reports").send({
      ...input,
      requestKey: randomUUID(),
    });
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe("PLAN_LIMIT_EXCEEDED");
    expect((await call("get", "/usage")).body.usage.MONTHLY_REPORTS).toBe("1");
  });
  it("rolls back all provisioning records when subscription insertion fails", async () => {
    const tag = suffix.replaceAll("-", ""),
      slug = `rollback-${suffix}`,
      email = `rollback-${suffix}@example.test`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION m8_fail_${tag}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM tenants WHERE id=NEW.tenant_id AND slug='${slug}') THEN RAISE EXCEPTION 'forced subscription insertion failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER m8_fail_${tag} BEFORE INSERT ON subscriptions FOR EACH ROW EXECUTE FUNCTION m8_fail_${tag}()`,
    );
    try {
      const response = await request(app.getHttpServer())
        .post("/api/v1/onboarding")
        .set("Origin", origin)
        .send({
          company: { legalName: "Rollback company", slug, email },
          admin: { name: "Rollback admin", email },
          planId: starter,
          timezone: "Africa/Maputo",
          dateFormat: "dd/MM/yyyy",
          termsVersion: process.env.TERMS_VERSION ?? "draft",
          privacyVersion: process.env.PRIVACY_VERSION ?? "draft",
        });
      expect(response.status).toBe(500);
      expect(response.body.message).toBe("Erro interno");
      expect(await db.tenant.findUnique({ where: { slug } })).toBeNull();
      expect(await db.user.findUnique({ where: { email } })).toBeNull();
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER m8_fail_${tag} ON subscriptions`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION m8_fail_${tag}()`);
    }
  });
  it("denies unapproved platform support and prevents cross-surface export", async () => {
    const user = await db.user.create({
      data: {
        name: "Restricted support",
        email: `support-${suffix}@example.test`,
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
      },
    });
    await db.platformUser.create({
      data: { userId: user.id, role: "SUPPORT" },
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/platform/auth/login")
      .set("Origin", origin)
      .send({ email: user.email, password });
    expect(login.status).toBe(201);
    const supportCookie = (login.headers["set-cookie"] as unknown as string[])
      .map((x) => x.split(";")[0])
      .join("; ");
    expect(
      (await call("get", `/platform/tenants/${tenantId}`, supportCookie))
        .status,
    ).toBe(403);
    expect(
      (
        await call(
          "get",
          `/platform/support-sessions/${randomUUID()}`,
          supportCookie,
        )
      ).body.code,
    ).toBe("SUPPORT_SESSION_REQUIRED");
    expect((await call("post", "/data-exports", supportCookie)).status).toBe(
      401,
    );
  });
});
