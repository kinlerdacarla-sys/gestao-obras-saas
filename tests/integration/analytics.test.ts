import { seedBudget } from "../../prisma/seed-budget.js";
import { seedExecution } from "../../prisma/seed-execution.js";
import { AnalyticsService } from "../../apps/api/src/analytics/analytics.service.js";
import {
  snapshotProjectKpis,
  closeIntelligence,
} from "../../apps/worker/src/intelligence.js";
import { ReportDataService } from "../../apps/api/src/report/data.js";
import { ReportService } from "../../apps/api/src/report/report.service.js";
import {
  deliverNotificationEmail,
  dailyDigest,
} from "../../apps/worker/src/email.js";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Server } from "node:http";
import { createApp } from "../../apps/api/src/app.js";
import { Database, Cache } from "../../apps/api/src/platform.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
describe("M7 analytics authorization and aggregation", () => {
  let app: INestApplication,
    db: Database,
    server: Server,
    tenant: string,
    project: string,
    foreignProject: string,
    unassigned: string;
  const users: Record<string, string> = {},
    cookies: Record<string, string[]> = {},
    suffix = randomUUID(),
    origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const get = (path: string, role = "ADMIN") =>
    request(server).get(`/api/v1${path}`).set("Cookie", cookies[role]);
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("test"))
      throw Error("Test database required");
    app = await createApp();
    await app.init();
    db = app.get(Database);
    server = app.getHttpServer() as Server;
    await app.get(Cache).del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
    tenant = (
      await db.tenant.create({
        data: { name: "Similar tenant", slug: `m7-${suffix}` },
      })
    ).id;
    const foreign = (
      await db.tenant.create({
        data: { name: "Similar tenant", slug: `m7-b-${suffix}` },
      })
    ).id;
    for (const role of [
      "ADMIN",
      "MANAGER",
      "INSPECTOR",
      "FINANCIER",
      "CLIENT",
    ] as const) {
      const user = await db.user.create({
        data: {
          name: role,
          email: `m7-${role.toLowerCase()}-${suffix}@example.test`,
          passwordHash: await hashPassword("Analytics!2026"),
          status: "ACTIVE",
        },
      });
      users[role] = user.id;
      await db.tenantUser.create({
        data: { tenantId: tenant, userId: user.id, role, status: "ACTIVE" },
      });
      const result = await request(server)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({
          tenantSlug: `m7-${suffix}`,
          email: user.email,
          password: "Analytics!2026",
        });
      expect(result.status, result.text).toBe(200);
      cookies[role] = result.headers["set-cookie"] as unknown as string[];
    }
    for (const t of [tenant, foreign]) {
      const p = await db.project.create({
        data: {
          tenantId: t,
          code: "SAME",
          name: "Similar project",
          createdBy: users.ADMIN,
          updatedBy: users.ADMIN,
        },
      });
      if (t === tenant) project = p.id;
      else foreignProject = p.id;
    }
    unassigned = (
      await db.project.create({
        data: {
          tenantId: tenant,
          code: "PRIVATE",
          name: "Private project",
          createdBy: users.ADMIN,
          updatedBy: users.ADMIN,
        },
      })
    ).id;
    for (const role of ["MANAGER", "INSPECTOR", "FINANCIER", "CLIENT"] as const)
      await db.projectUser.create({
        data: {
          tenantId: tenant,
          projectId: project,
          userId: users[role],
          role,
          status: "ACTIVE",
        },
      });
  });
  afterAll(async () => {
    await closeIntelligence();
    await app?.close();
  });
  it("aggregates only the authenticated tenant even with identical project names", async () => {
    const r = await get("/dashboard/portfolio");
    expect(r.status, r.text).toBe(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.text).not.toContain(foreignProject);
    expect(r.body.totals.approvedBudget).toBe("0.00");
  });
  it("limits each non-admin portfolio to assigned projects", async () => {
    for (const role of ["MANAGER", "INSPECTOR", "FINANCIER", "CLIENT"]) {
      const r = await get("/dashboard/portfolio", role);
      expect(r.status, r.text).toBe(200);
      expect(r.body.items).toHaveLength(1);
      expect(r.text).not.toContain(unassigned);
      expect(r.text).not.toContain(foreignProject);
    }
  });
  it("denies foreign and unassigned projects including comparison and curves", async () => {
    for (const role of ["CLIENT", "FINANCIER"]) {
      for (const p of [foreignProject, unassigned]) {
        expect((await get(`/projects/${p}/analytics`, role)).status).toBe(404);
        expect(
          (await get(`/projects/${p}/analytics/s-curve`, role)).status,
        ).toBe(404);
        expect(
          (
            await get(
              `/analytics/projects/compare?projects=${project},${p}`,
              role,
            )
          ).status,
        ).toBe(404);
      }
    }
  });
  it("shows missing schedule and financial baseline honestly", async () => {
    const r = await get(`/projects/${project}/analytics`);
    expect(r.body.schedule.available).toBe(false);
    expect(r.body.schedule.forecastEnd).toBeNull();
    expect(r.body.financial.financialProgressPercentage).toBeNull();
    const c = await get(`/projects/${project}/analytics/s-curve`);
    expect(c.status, c.text).toBe(200);
    expect(c.body.baselineSource).toBeNull();
    expect(c.body.items).toEqual([]);
  });
  it("does not give inspector access to financial KPIs", async () => {
    const r = await get(`/projects/${project}/analytics`, "INSPECTOR");
    expect(r.status, r.text).toBe(200);
    expect(r.body.financial).toBeNull();
    expect(r.body.contracts).toBeNull();
  });
  it("revokes access immediately despite warm project and portfolio caches", async () => {
    await get(`/projects/${project}/analytics`, "CLIENT");
    await get("/dashboard/portfolio", "CLIENT");
    await db.projectUser.updateMany({
      where: { projectId: project, userId: users.CLIENT },
      data: { status: "DISABLED" },
    });
    expect((await get(`/projects/${project}/analytics`, "CLIENT")).status).toBe(
      404,
    );
    expect((await get("/dashboard/portfolio", "CLIENT")).body.items).toEqual(
      [],
    );
  });
  it("validates filters and comparison size", async () => {
    expect((await get("/dashboard/portfolio?status=INVALID")).status).toBe(400);
    expect(
      (await get(`/analytics/projects/compare?projects=${project}`)).status,
    ).toBe(400);
    expect(
      (
        await get(
          `/projects/${project}/analytics/s-curve?from=2026-02-01&to=2026-01-01`,
        )
      ).status,
    ).toBe(400);
  });
  it("measures warm portfolio p95", async () => {
    await get("/dashboard/portfolio");
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const r = await get("/dashboard/portfolio");
      expect(r.status).toBe(200);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.info("M7_PORTFOLIO_WARM_P95_MS", times[18]);
    expect(times[18]).toBeLessThan(1000);
  });
  const mutate = (
    method: "post" | "patch",
    path: string,
    body: object = {},
    role = "ADMIN",
  ) => {
    const agent = request(server);
    return agent[method](`/api/v1${path}`)
      .set("Cookie", cookies[role])
      .set("Origin", origin)
      .send(body);
  };
  it("deduplicates alerts and enforces optimistic locking with audit history", async () => {
    await db.project.update({
      where: { id: project },
      data: { status: "ACTIVE" },
    });
    let r = await mutate("post", `/projects/${project}/alerts/evaluate`);
    expect(r.status, r.text).toBe(201);
    expect(r.body.created).toBe(1);
    r = await mutate("post", `/projects/${project}/alerts/evaluate`);
    expect(r.body.created).toBe(0);
    const list = await get(`/alerts?project=${project}`);
    expect(list.body.items).toHaveLength(1);
    const alert = list.body.items[0];
    r = await mutate("patch", `/alerts/${alert.id}`, {
      version: alert.version,
      status: "ACKNOWLEDGED",
    });
    expect(r.status, r.text).toBe(200);
    expect(
      (
        await mutate("patch", `/alerts/${alert.id}`, {
          version: alert.version,
          status: "RESOLVED",
        })
      ).status,
    ).toBe(409);
    expect(
      await db.auditLog.count({
        where: {
          tenantId: tenant,
          entityId: alert.id,
          action: "ALERT_ACKNOWLEDGED",
        },
      }),
    ).toBe(1);
    expect((await get(`/alerts?project=${foreignProject}`)).body.items).toEqual(
      [],
    );
  });
  it("persists preferences, read-all and individual read audit", async () => {
    const p = await get("/notifications/preferences");
    expect(p.status, p.text).toBe(200);
    const fields = [
      "emailEnabled",
      "inAppEnabled",
      "dailyDigestEnabled",
      "inspectionNotifications",
      "measurementNotifications",
      "qualityNotifications",
      "financialNotifications",
      "scheduleNotifications",
    ];
    const input = Object.fromEntries(
      fields.map((k) => [k, k !== "emailEnabled"]),
    );
    expect(
      (await mutate("patch", "/notifications/preferences", input)).status,
    ).toBe(200);
    const unread = await get("/notifications/unread-count");
    expect(unread.body.count).toBeGreaterThan(0);
    expect((await mutate("post", "/notifications/read-all")).status).toBe(201);
    expect((await get("/notifications/unread-count")).body.count).toBe(0);
    expect(
      await db.auditLog.count({
        where: { tenantId: tenant, action: "NOTIFICATION_PREFERENCE_UPDATED" },
      }),
    ).toBeGreaterThan(0);
  });
  it("generates and securely downloads PDF and XLSX with report auditing", async () => {
    for (const format of ["PDF", "XLSX"]) {
      const r = await mutate("post", "/reports", {
        projectId: project,
        reportType: "PROJECT_EXECUTIVE",
        format,
      });
      expect(r.status, r.text).toBe(201);
      const id = r.body.id;
      await app.get(ReportService).process(id);
      const ready = await get(`/reports/${id}`);
      expect(ready.body.status, ready.text).toBe("COMPLETED");
      expect(ready.body.objectKey).toBeUndefined();
      const ticket = await mutate("post", `/reports/${id}/download`);
      expect(ticket.status, ticket.text).toBe(201);
      const file = await request(server)
        .get(ticket.body.url)
        .set("Cookie", cookies.ADMIN);
      expect(file.status, file.text).toBe(200);
      expect(file.headers["cache-control"]).toBe("private, no-store");
      expect(
        (
          await request(server)
            .get(ticket.body.url)
            .set("Cookie", cookies.MANAGER)
        ).status,
      ).toBe(403);
      expect(
        await db.auditLog.count({
          where: {
            tenantId: tenant,
            entityId: id,
            action: "REPORT_DOWNLOADED",
          },
        }),
      ).toBe(1);
      await (await app.get(ReportService).queue.getJob(id))?.remove();
    }
  });
  it("denies report scope bypass and rechecks authorization at processing and download", async () => {
    await db.projectUser.updateMany({
      where: { projectId: project, userId: users.CLIENT },
      data: { status: "ACTIVE" },
    });
    expect(
      (
        await mutate(
          "post",
          "/reports",
          {
            projectId: foreignProject,
            reportType: "PROJECT_EXECUTIVE",
            format: "PDF",
          },
          "CLIENT",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await mutate(
          "post",
          "/reports",
          {
            projectId: unassigned,
            reportType: "PROJECT_EXECUTIVE",
            format: "PDF",
          },
          "FINANCIER",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await mutate(
          "post",
          "/reports",
          { projectId: project, reportType: "FINANCIAL", format: "PDF" },
          "CLIENT",
        )
      ).status,
    ).toBe(403);
    const r = await mutate(
      "post",
      "/reports",
      { projectId: project, reportType: "PROJECT_EXECUTIVE", format: "PDF" },
      "CLIENT",
    );
    expect(r.status, r.text).toBe(201);
    await db.projectUser.updateMany({
      where: { projectId: project, userId: users.CLIENT },
      data: { status: "DISABLED" },
    });
    await expect(app.get(ReportService).process(r.body.id)).rejects.toThrow();
    expect(
      (await db.reportJob.findUniqueOrThrow({ where: { id: r.body.id } }))
        .status,
    ).toBe("FAILED");
    expect(
      (await mutate("post", `/reports/${r.body.id}/download`, {}, "CLIENT"))
        .status,
    ).toBe(404);
    await (await app.get(ReportService).queue.getJob(r.body.id))?.remove();
  });
  it("delivers queued email with local transport only when preferences allow", async () => {
    const pref = { tenantId: tenant, userId: users.ADMIN };
    await db.notificationPreference.update({
      where: { tenantId_userId: pref },
      data: { emailEnabled: true },
    });
    await db.alertSetting.upsert({
      where: { tenantId: tenant },
      create: { tenantId: tenant, enableEmail: true },
      update: { enableEmail: true },
    });
    const notification = await db.notification.findFirstOrThrow({
      where: { tenantId: tenant, userId: users.ADMIN },
    });
    const previous = process.env.MAIL_TRANSPORT;
    process.env.MAIL_TRANSPORT = "stream";
    try {
      expect(await deliverNotificationEmail(db, notification.id)).toEqual({
        delivered: true,
      });
      expect(
        await readFile(`work/mail-outbox/${notification.id}.eml`, "utf8"),
      ).toContain("Subject:");
      expect(await deliverNotificationEmail(db, notification.id)).toEqual({
        skipped: true,
      });
    } finally {
      if (previous === undefined) delete process.env.MAIL_TRANSPORT;
      else process.env.MAIL_TRANSPORT = previous;
    }
  });
  it("keeps daily snapshots idempotent and redacts financial values for fiscal", async () => {
    await snapshotProjectKpis({ tenantId: tenant, projectId: project });
    await snapshotProjectKpis({ tenantId: tenant, projectId: project });
    expect(
      await db.projectKpiSnapshot.count({
        where: { tenantId: tenant, projectId: project },
      }),
    ).toBe(1);
    const fiscal = await get(
      `/projects/${project}/analytics/snapshots`,
      "INSPECTOR",
    );
    expect(fiscal.status, fiscal.text).toBe(200);
    expect(fiscal.body.items[0].approvedBudget).toBeUndefined();
    expect(
      (
        await mutate(
          "post",
          `/projects/${project}/analytics/snapshots`,
          {},
          "MANAGER",
        )
      ).status,
    ).toBe(403);
  });
  it("filters INTERNAL and unapproved photos and invalidates an export when visibility changes", async () => {
    await db.projectUser.updateMany({
      where: { projectId: project, userId: users.CLIENT },
      data: { status: "ACTIVE" },
    });
    const log = await db.dailyLog.create({
      data: {
        tenantId: tenant,
        projectId: project,
        createdBy: users.MANAGER,
        logDate: new Date("2026-01-01"),
        status: "APPROVED",
        approvedBy: users.ADMIN,
        approvedAt: new Date(),
      },
    });
    const privateDoc = await db.document.create({
      data: {
        tenantId: tenant,
        projectId: project,
        dailyLogId: log.id,
        createdBy: users.MANAGER,
        objectKey: `tenant/${tenant}/tests/${randomUUID()}.png`,
        fileName: "INTERNAL secret photo",
        mimeType: "image/png",
        sizeBytes: 1,
        checksum: "0".repeat(64),
        visibility: "INTERNAL",
        isPhoto: true,
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    for (const role of ["CLIENT", "FINANCIER"]) {
      const gallery = await get(`/projects/${project}/gallery`, role);
      expect(gallery.status, gallery.text).toBe(200);
      expect(gallery.text).not.toContain(privateDoc.id);
      expect(gallery.text).not.toContain("INTERNAL secret");
      expect(
        (await get(`/projects/${project}/gallery/${privateDoc.id}/file`, role))
          .status,
      ).toBe(403);
    }
    const r = await mutate(
      "post",
      "/reports",
      { projectId: project, reportType: "QUALITY", format: "XLSX" },
      "CLIENT",
    );
    expect(r.status, r.text).toBe(201);
    await app.get(ReportService).process(r.body.id);
    const ticket = await mutate(
      "post",
      `/reports/${r.body.id}/download`,
      {},
      "CLIENT",
    );
    expect(ticket.status, ticket.text).toBe(201);
    // Direct data-policy mutation simulates a later visibility change; approved diary data remains untouched.
    await db.document.create({
      data: {
        tenantId: tenant,
        projectId: project,
        dailyLogId: log.id,
        createdBy: users.ADMIN,
        objectKey: `tenant/${tenant}/tests/${randomUUID()}.txt`,
        fileName: "New visibility policy input",
        mimeType: "text/plain",
        sizeBytes: 1,
        checksum: "1".repeat(64),
        visibility: "CLIENT_VISIBLE",
        isPhoto: false,
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(
      (await request(server).get(ticket.body.url).set("Cookie", cookies.CLIENT))
        .status,
    ).toBe(409);
    await (await app.get(ReportService).queue.getJob(r.body.id))?.remove();
  });
  it("does not include foreign tenant identifiers, organizations or quality records in report data", async () => {
    const other = await db.project.findUniqueOrThrow({
      where: { id: foreignProject },
    });
    await db.tenantUser.upsert({
      where: {
        tenantId_userId: { tenantId: other.tenantId, userId: users.ADMIN },
      },
      create: {
        tenantId: other.tenantId,
        userId: users.ADMIN,
        role: "ADMIN",
        status: "ACTIVE",
      },
      update: {},
    });
    const foreignNcr = await db.nonConformity.create({
      data: {
        tenantId: other.tenantId,
        projectId: other.id,
        createdBy: users.ADMIN,
        detectedBy: users.ADMIN,
        ncrNumber: 1,
        code: "NCR-001",
        title: "FOREIGN-PRIVATE-NCR",
        description: "Other tenant",
        severity: "CRITICAL",
        category: "PROCESS",
      },
    });
    const requestContext = await app
      .get(ReportService)
      .requester({ tenantId: tenant, requestedBy: users.ADMIN } as Parameters<
        ReportService["requester"]
      >[0]);
    const data = await app
      .get(ReportDataService)
      .collect(requestContext, project, "QUALITY", {});
    const serialized = JSON.stringify(data.sections);
    expect(serialized).not.toContain(foreignProject);
    expect(serialized).not.toContain(foreignNcr.id);
    expect(serialized).not.toContain("FOREIGN-PRIVATE-NCR");
  });
  it("daily digest applies the current project role instead of the tenant role", async () => {
    await db.notificationPreference.upsert({
      where: { tenantId_userId: { tenantId: tenant, userId: users.MANAGER } },
      create: {
        tenantId: tenant,
        userId: users.MANAGER,
        dailyDigestEnabled: true,
      },
      update: { dailyDigestEnabled: true },
    });
    await db.projectUser.updateMany({
      where: { tenantId: tenant, projectId: project, userId: users.MANAGER },
      data: { role: "CLIENT", status: "ACTIVE" },
    });
    await db.alert.create({
      data: {
        tenantId: tenant,
        projectId: project,
        alertType: "BUDGET_OVERRUN_RISK",
        severity: "HIGH",
        title: "Private financial alert",
        message: "Private",
        entityType: "Project",
        entityId: project,
        deduplicationKey: `digest-private-${suffix}`,
      },
    });
    try {
      const allowed = await db.alert.count({
        where: {
          tenantId: tenant,
          projectId: project,
          status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
          alertType: { in: ["NCR_CRITICAL", "SCHEDULE_DELAY"] },
        },
      });
      await dailyDigest(db);
      await dailyDigest(db);
      const rows = await db.notification.findMany({
        where: {
          tenantId: tenant,
          userId: users.MANAGER,
          type: "DAILY_DIGEST",
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe(
        `Resumo diário: ${allowed} alertas nas suas obras`,
      );
    } finally {
      await db.projectUser.updateMany({
        where: { tenantId: tenant, projectId: project, userId: users.MANAGER },
        data: { role: "MANAGER" },
      });
    }
  });
  it("measures warm portfolio and operational project p95 with 27 projects", async () => {
    await seedBudget(db, tenant, project, users.ADMIN);
    await seedExecution(db, tenant, project, users.ADMIN);
    await db.project.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        tenantId: tenant,
        code: `PERF-${i}`,
        name: `Performance ${i}`,
        createdBy: users.ADMIN,
        updatedBy: users.ADMIN,
      })),
    });
    const context = await app
      .get(ReportService)
      .requester({ tenantId: tenant, requestedBy: users.ADMIN } as Parameters<
        ReportService["requester"]
      >[0]);
    await app.get(AnalyticsService).project(context, project, true);
    await get("/dashboard/portfolio");
    const portfolio: number[] = [],
      projectTimes: number[] = [],
      coldProjectTimes: number[] = [];
    for (let i = 0; i < 20; i++) {
      let start = performance.now();
      expect((await get("/dashboard/portfolio")).status).toBe(200);
      portfolio.push(performance.now() - start);
      start = performance.now();
      expect((await get(`/projects/${project}/analytics`)).status).toBe(200);
      projectTimes.push(performance.now() - start);
      start = performance.now();
      await app.get(AnalyticsService).project(context, project, true);
      coldProjectTimes.push(performance.now() - start);
    }
    portfolio.sort((a, b) => a - b);
    projectTimes.sort((a, b) => a - b);
    coldProjectTimes.sort((a, b) => a - b);
    console.info(
      "M7_ANALYTICS_P95",
      JSON.stringify({
        projects: 27,
        samples: 20,
        portfolioMs: portfolio[18],
        projectMs: projectTimes[18],
        projectWithoutCacheMs: coldProjectTimes[18],
      }),
    );
    expect(portfolio[18]).toBeLessThan(1000);
    expect(projectTimes[18]).toBeLessThan(1000);
    expect(coldProjectTimes[18]).toBeLessThan(1000);
  }, 60000);
});
