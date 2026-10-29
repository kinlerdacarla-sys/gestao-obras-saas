import { createTestTenant } from "../helpers/tenant.js";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID, createHash } from "node:crypto";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../../apps/api/src/app.js";
import { Database, Cache } from "../../apps/api/src/platform.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { snapshotProgress } from "../../apps/worker/src/progress.js";
describe("M3 execution with PostgreSQL and Redis", () => {
  let app: INestApplication,
    db: Database,
    server: Server,
    tenant: string,
    foreign: string,
    project: string,
    other: string,
    adminId: string;
  let cookie: string[],
    manager: string[],
    client: string[],
    inspector: string[],
    financier: string[];
  let summary: string,
    a: string,
    b: string,
    baseline: string,
    log: string,
    photo: string,
    internal: string;
  const suffix = randomUUID(),
    origin = process.env.WEB_ORIGIN ?? "http://localhost:3000",
    date = new Date().toISOString().slice(0, 10);
  const call = (
    method: "get" | "post" | "patch" | "delete",
    path: string,
    body?: unknown,
    auth = cookie,
    p = project,
  ) => {
    const agent = request(server);
    const r = agent[method](`/api/v1/projects/${p}${path}`)
      .set("Origin", origin)
      .set("Cookie", auth);
    return body ? r.send(body) : r;
  };
  const ver = async () =>
    (await call("get", `/daily-logs/${log}`)).body.version as number;
  const taskVersion = async (id: string) =>
    (await call("get", `/schedule/tasks/${id}`)).body.version as number;
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("test"))
      throw new Error("Test DB required");
    app = await createApp();
    await app.init();
    db = app.get(Database);
    server = app.getHttpServer() as Server;
    await app.get(Cache).del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
    tenant = (
      await createTestTenant(db, { data: { name: "M3", slug: `m3-${suffix}` } })
    ).id;
    foreign = (
      await createTestTenant(db, {
        data: { name: "M3 foreign", slug: `m3-b-${suffix}` },
      })
    ).id;
    const user = await db.user.create({
      data: {
        name: "M3 Admin",
        email: `m3-admin-${suffix}@example.test`,
        passwordHash: await hashPassword("Execution!2026"),
        status: "ACTIVE",
      },
    });
    adminId = user.id;
    await db.tenantUser.create({
      data: {
        tenantId: tenant,
        userId: user.id,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    for (const t of [tenant, foreign]) {
      const p = await db.project.create({
        data: {
          tenantId: t,
          code: "M3",
          name: "M3 project",
          createdBy: adminId,
          updatedBy: adminId,
        },
      });
      if (t === tenant) project = p.id;
      else other = p.id;
    }
    async function login(email: string) {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({
          tenantSlug: `m3-${suffix}`,
          email,
          password: "Execution!2026",
        });
      expect(res.status, res.text).toBe(200);
      return res.headers["set-cookie"] as unknown as string[];
    }
    cookie = await login(user.email);
    for (const role of [
      "MANAGER",
      "CLIENT",
      "INSPECTOR",
      "FINANCIER",
    ] as const) {
      const u = await db.user.create({
        data: {
          name: role,
          email: `m3-${role.toLowerCase()}-${suffix}@example.test`,
          passwordHash: await hashPassword("Execution!2026"),
          status: "ACTIVE",
        },
      });
      await db.tenantUser.create({
        data: { tenantId: tenant, userId: u.id, role, status: "ACTIVE" },
      });
      await db.projectUser.create({
        data: {
          tenantId: tenant,
          projectId: project,
          userId: u.id,
          role,
          status: "ACTIVE",
        },
      });
      const c = await login(u.email);
      if (role === "MANAGER") manager = c;
      if (role === "CLIENT") client = c;
      if (role === "INSPECTOR") inspector = c;
      if (role === "FINANCIER") financier = c;
    }
  }, 30000);
  it("blocks foreign resource IDs through an authorized project route", async () => {
    const foreignScope = {
      tenantId: foreign,
      projectId: other,
      createdBy: adminId,
    };
    const s = await db.schedule.create({
      data: {
        ...foreignScope,
        name: "Foreign",
        plannedStart: new Date(date),
        plannedEnd: new Date(date),
        updatedBy: adminId,
      },
    });
    const t = await db.scheduleTask.create({
      data: {
        ...foreignScope,
        scheduleId: s.id,
        code: "foreign",
        name: "Foreign",
        taskType: "TASK",
        plannedStart: new Date(date),
        plannedEnd: new Date(date),
        durationDays: 1,
        updatedBy: adminId,
      },
    });
    const l = await db.dailyLog.create({
      data: { ...foreignScope, logDate: new Date(date) },
    });
    const baseline = await db.scheduleBaseline.create({
      data: { ...foreignScope, scheduleId: s.id, revisionNumber: 0 },
    });
    for (const path of [
      `/schedule/tasks/${t.id}`,
      `/daily-logs/${l.id}`,
      `/schedule/variance?baselineId=${baseline.id}`,
    ])
      expect((await call("get", path)).status).toBe(404);
    expect(
      (
        await call("post", `/schedule/tasks/${t.id}/progress`, {
          version: 0,
          progress: "20",
          progressDate: date,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("patch", `/daily-logs/${l.id}`, {
          version: 0,
          generalNotes: "Foreign",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("post", `/daily-logs/${l.id}/photos`, {
          version: 0,
          fileName: "x.png",
          mimeType: "image/png",
          sizeBytes: 1,
          checksum: "0".repeat(64),
        })
      ).status,
    ).toBe(404);
  });
  afterAll(async () => {
    await app?.close();
  });
  it("creates schedule", async () => {
    const r = await call("post", "/schedule", {
      name: "Cronograma",
      plannedStart: date,
      plannedEnd: date,
    });
    expect(r.status, r.text).toBe(201);
  });
  it("creates hierarchy and milestone", async () => {
    for (const [code, name, type, parent] of [
      ["2", "Fundações", "SUMMARY", null],
      ["2.1", "Escavação", "TASK", "summary"],
      ["2.2", "Betão", "MILESTONE", "summary"],
    ]) {
      const r = await call("post", "/schedule/tasks", {
        code,
        name,
        taskType: type,
        parentId: parent ? summary : null,
        plannedStart: date,
        plannedEnd: date,
        weight: "1",
      });
      expect(r.status, r.text).toBe(201);
      if (type === "SUMMARY") summary = r.body.id;
      else if (code === "2.1") a = r.body.id;
      else b = r.body.id;
    }
  });
  it("creates dependency and blocks cycles", async () => {
    expect(
      (
        await call("post", "/schedule/dependencies", {
          predecessorId: a,
          successorId: b,
        })
      ).status,
    ).toBe(201);
    const r = await call("post", "/schedule/dependencies", {
      predecessorId: b,
      successorId: a,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("SCHEDULE_DEPENDENCY_CYCLE");
  });
  it("blocks hierarchy cycles", async () => {
    const r = await call("patch", `/schedule/tasks/${summary}`, {
      version: 0,
      parentId: summary,
    });
    expect(r.body.code).toBe("SCHEDULE_DEPENDENCY_CYCLE");
  });
  it("records baseline and protects it at database level", async () => {
    const r = await call("post", "/schedule/baselines", {
      description: "Baseline 0",
    });
    expect(r.status, r.text).toBe(201);
    baseline = r.body.id;
    await expect(
      db.scheduleBaseline.update({
        where: { id: baseline },
        data: { description: "mutated" },
      }),
    ).rejects.toThrow();
  });
  it("updates progress and calculates physical progress", async () => {
    const r = await call(
      "post",
      `/schedule/tasks/${a}/progress`,
      { version: 0, progress: "50", progressDate: date },
      manager,
    );
    expect(r.status, r.text).toBe(201);
    const p = await call("get", "/progress");
    expect(p.body.actualProgress).toBe("25.00");
  });
  it("rejects stale task version", async () => {
    const r = await call("post", `/schedule/tasks/${a}/progress`, {
      version: 0,
      progress: "60",
      progressDate: date,
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("RESOURCE_VERSION_CONFLICT");
  });
  it("derives summaries and returns variance", async () => {
    expect(
      (await call("get", "/schedule/tree")).body.items.find(
        (t: { id: string }) => t.id === summary,
      ).actualProgress,
    ).toBe("25.00");
    const r = await call("get", `/schedule/variance?baselineId=${baseline}`);
    expect(r.body.items[0].endDeltaDays).toBe(0);
  });
  it("snapshots are retry safe", async () => {
    await snapshotProgress(db, date);
    await snapshotProgress(db, date);
    expect(
      await db.projectProgressSnapshot.count({ where: { projectId: project } }),
    ).toBe(1);
  });
  it("manager creates diary; duplicate logical date rejected", async () => {
    const r = await call("post", "/daily-logs", { logDate: date }, manager);
    expect(r.status, r.text).toBe(201);
    log = r.body.id;
    const duplicate = await call(
      "post",
      "/daily-logs",
      { logDate: date },
      manager,
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("DAILY_LOG_ALREADY_EXISTS");
  });
  it("transactionally records activity and task progress", async () => {
    const r = await call(
      "post",
      `/daily-logs/${log}/activities`,
      {
        version: await ver(),
        description: "Escavação hoje",
        scheduleTaskId: a,
        taskVersion: await taskVersion(a),
        progressAfter: "75",
        updateTaskProgress: true,
      },
      manager,
    );
    expect(r.status, r.text).toBe(201);
    expect(
      (await call("get", `/schedule/tasks/${a}`)).body.actualProgress,
    ).toBe("75");
    expect(
      await db.taskProgressUpdate.count({ where: { dailyLogId: log } }),
    ).toBe(1);
  });
  it("rolls back diary claim and activity if task version stale", async () => {
    const version = await ver();
    const r = await call("post", `/daily-logs/${log}/activities`, {
      version,
      description: "Stale",
      scheduleTaskId: a,
      taskVersion: 0,
      progressAfter: "80",
      updateTaskProgress: true,
    });
    expect(r.status).toBe(409);
    expect(await ver()).toBe(version);
    expect(
      await db.dailyLogActivity.count({ where: { dailyLogId: log } }),
    ).toBe(1);
  });
  it("adds workforce, equipment, materials, deliveries and occurrences", async () => {
    for (const [kind, body] of [
      [
        "workforce",
        {
          companyName: "Demo",
          trade: "Pedreiro",
          workerCount: 5,
          hoursPerWorker: "8",
        },
      ],
      [
        "equipment",
        { equipmentName: "Escavadora", quantity: 1, hoursWorked: "6" },
      ],
      ["materials", { materialName: "Areia", quantity: "10", unit: "m3" }],
      [
        "deliveries",
        {
          supplierName: "Fornecedor",
          description: "Cimento",
          quantity: "50",
          unit: "saco",
          deliveryTime: "09:30",
        },
      ],
      [
        "occurrences",
        {
          occurrenceType: "WEATHER",
          title: "Chuva",
          description: "Chuva ligeira",
          severity: "LOW",
        },
      ],
    ] as const) {
      const r = await call(
        "post",
        `/daily-logs/${log}/${kind}`,
        { version: await ver(), ...body },
        manager,
      );
      expect(r.status, r.text).toBe(201);
    }
    const r = await call("get", `/daily-logs/${log}/summary`);
    expect(r.body.workers).toBe(5);
    expect(r.body.manHours).toBe("40.00");
  });
  it("inspector adds observation but cannot edit budget or schedule", async () => {
    expect((await call("get", "/schedule", undefined, inspector)).status).toBe(
      200,
    );
    expect(
      (
        await call(
          "post",
          `/daily-logs/${log}/observations`,
          { version: await ver(), text: "Observado no local" },
          inspector,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "patch",
          `/schedule/tasks/${a}`,
          { version: await taskVersion(a), name: "Forbidden" },
          inspector,
        )
      ).status,
    ).toBe(403);
    expect(
      (await call("post", "/budget", { name: "Forbidden" }, inspector)).status,
    ).toBe(403);
  });
  it("client and financier cannot write operational records", async () => {
    for (const auth of [client, financier]) {
      expect(
        (await call("post", "/daily-logs", { logDate: "2020-01-01" }, auth))
          .status,
      ).toBe(403);
      expect(
        (
          await call(
            "patch",
            `/schedule/tasks/${a}`,
            { version: await taskVersion(a), name: "Forbidden" },
            auth,
          )
        ).status,
      ).toBe(403);
      expect(
        (await call("get", `/daily-logs/${log}`, undefined, auth)).status,
      ).toBe(404);
    }
  });
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  async function upload(visibility: string) {
    const ticket = await call("post", `/daily-logs/${log}/photos`, {
      version: await ver(),
      fileName: "obra.png",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      visibility,
      isPhoto: true,
    });
    expect(ticket.status, ticket.text).toBe(201);
    const sent = await request(server)
      .put(ticket.body.uploadUrl)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .attach("file", bytes, {
        filename: "obra.png",
        contentType: "image/png",
      });
    expect(sent.status, sent.text).toBe(200);
    const confirmed = await call(
      "post",
      `/daily-logs/${log}/documents/${ticket.body.id}/confirm`,
      { version: ticket.body.version },
    );
    expect(confirmed.status, confirmed.text).toBe(201);
    return ticket.body.id as string;
  }
  it("uploads private photos through signed URLs and validates checksum", async () => {
    photo = await upload("CLIENT_VISIBLE");
    internal = await upload("INTERNAL");
  });
  it("rejects foreign tenant project access including presigned requests", async () => {
    for (const path of [
      "/schedule",
      `/schedule/tasks/${a}`,
      `/daily-logs/${log}`,
      `/schedule/variance?baselineId=${baseline}`,
      `/daily-logs/${log}/documents/${photo}/content`,
    ])
      expect((await call("get", path, undefined, cookie, other)).status).toBe(
        404,
      );
    expect(
      (
        await call(
          "post",
          `/daily-logs/${log}/photos`,
          {
            version: 0,
            fileName: "x.png",
            mimeType: "image/png",
            sizeBytes: bytes.length,
            checksum: createHash("sha256").update(bytes).digest("hex"),
          },
          cookie,
          other,
        )
      ).status,
    ).toBe(404);
  });
  it("rejects stale diary version", async () => {
    const r = await call("patch", `/daily-logs/${log}`, {
      version: 0,
      generalNotes: "Stale",
    });
    expect(r.status).toBe(409);
  });
  it("submits, approves and makes diary immutable", async () => {
    expect(
      (
        await call(
          "post",
          `/daily-logs/${log}/submit`,
          { version: await ver() },
          manager,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "post",
          `/daily-logs/${log}/approve`,
          { version: await ver() },
          manager,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call("post", `/daily-logs/${log}/approve`, {
          version: await ver(),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call("patch", `/daily-logs/${log}`, {
          version: await ver(),
          generalNotes: "No",
        })
      ).body.code,
    ).toBe("DAILY_LOG_IMMUTABLE");
    await expect(
      db.dailyLogWorkforce.create({
        data: {
          tenantId: tenant,
          projectId: project,
          dailyLogId: log,
          createdBy: adminId,
          companyName: "x",
          trade: "x",
          workerCount: 1,
        },
      }),
    ).rejects.toThrow();
  });
  it("client reads approved diary and only authorized photos", async () => {
    const r = await call("get", `/daily-logs/${log}`, undefined, client);
    expect(r.status).toBe(200);
    expect(r.body.photos.map((p: { id: string }) => p.id)).toEqual([photo]);
    expect(
      (
        await call(
          "get",
          `/daily-logs/${log}/documents/${internal}/content`,
          undefined,
          client,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "get",
          `/daily-logs/${log}/documents/${photo}/content`,
          undefined,
          client,
        )
      ).status,
    ).toBe(200);
  });
  it("only admin reopens and history is retained", async () => {
    expect(
      (
        await call(
          "post",
          `/daily-logs/${log}/reopen`,
          { version: await ver() },
          manager,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call("post", `/daily-logs/${log}/reopen`, {
          version: await ver(),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "patch",
          `/daily-logs/${log}`,
          { version: await ver(), generalNotes: "Reaberto" },
          manager,
        )
      ).status,
    ).toBe(200);
    expect(
      await db.auditLog.count({
        where: { tenantId: tenant, action: "DAILY_LOG_APPROVED" },
      }),
    ).toBe(1);
  });
  it("rejects tampered URLs and mismatched file bytes", async () => {
    const ticket = await call("post", `/daily-logs/${log}/photos`, {
      version: await ver(),
      fileName: "verify.png",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(ticket.status, ticket.text).toBe(201);
    const badUrl = ticket.body.uploadUrl.replace(
      /signature=[a-f0-9]+/,
      `signature=${"0".repeat(64)}`,
    );
    const unicodeUrl = ticket.body.uploadUrl.replace(
      /signature=[a-f0-9]+/,
      `signature=${encodeURIComponent("é".repeat(64))}`,
    );
    expect(
      (
        await request(server)
          .put(unicodeUrl)
          .set("Origin", origin)
          .set("Cookie", cookie)
          .attach("file", bytes, {
            filename: "verify.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(server)
          .put(badUrl)
          .set("Origin", origin)
          .set("Cookie", cookie)
          .attach("file", bytes, {
            filename: "verify.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(server)
          .put(ticket.body.uploadUrl)
          .set("Origin", origin)
          .set("Cookie", cookie)
          .attach("file", Buffer.alloc(bytes.length), {
            filename: "verify.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "post",
          `/daily-logs/${log}/documents/${ticket.body.id}/confirm`,
          { version: ticket.body.version },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "get",
          `/daily-logs/${log}/documents/${photo}/content`,
          undefined,
          financier,
        )
      ).status,
    ).toBe(403);
  });
  it("allows only one concurrent diary mutation", async () => {
    const version = await ver();
    const results = await Promise.all([
      call("patch", `/daily-logs/${log}`, {
        version,
        generalNotes: "Concurrent A",
      }),
      call("patch", `/daily-logs/${log}`, {
        version,
        generalNotes: "Concurrent B",
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("soft cancels a task and preserves its progress history", async () => {
    const task = await call("post", "/schedule/tasks", {
      code: "cancel",
      name: "Cancelável",
      taskType: "TASK",
      plannedStart: date,
      plannedEnd: date,
    });
    expect(task.status).toBe(201);
    expect(
      (
        await call("post", `/schedule/tasks/${task.body.id}/progress`, {
          version: 0,
          progress: "100",
          progressDate: date,
        })
      ).status,
    ).toBe(201);
    expect(
      (await call("delete", `/schedule/tasks/${task.body.id}`, { version: 1 }))
        .status,
    ).toBe(200);
    expect(
      (await call("get", `/schedule/tasks/${task.body.id}`)).body.status,
    ).toBe("CANCELLED");
    expect(
      await db.taskProgressUpdate.count({ where: { taskId: task.body.id } }),
    ).toBe(1);
  });
  it("documents M3 response schemas and signed uploads", async () => {
    const docs = await request(server).get("/api/docs-json");
    expect(docs.status).toBe(200);
    expect(
      docs.body.components.schemas.ScheduleTask.properties.actualProgress.type,
    ).toBe("string");
    expect(
      docs.body.paths[
        "/api/v1/projects/{projectId}/daily-logs/{dailyLogId}/documents/{id}/upload"
      ].put.requestBody.content["multipart/form-data"],
    ).toBeDefined();
  });
  it.each([500, 2000, 5000])(
    "reads and baselines %i database tasks in bounded queries",
    async (count) => {
      const p = await db.project.create({
        data: {
          tenantId: tenant,
          code: `PERF-${count}`,
          name: "Performance",
          createdBy: adminId,
          updatedBy: adminId,
        },
      });
      const s = await db.schedule.create({
        data: {
          tenantId: tenant,
          projectId: p.id,
          name: "Performance",
          plannedStart: new Date(date),
          plannedEnd: new Date(date),
          createdBy: adminId,
          updatedBy: adminId,
        },
      });
      await db.scheduleTask.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          tenantId: tenant,
          projectId: p.id,
          scheduleId: s.id,
          code: String(index),
          name: `Task ${index}`,
          taskType: "TASK" as const,
          plannedStart: new Date(date),
          plannedEnd: new Date(date),
          durationDays: 1,
          actualProgress: "50",
          weight: "1",
          createdBy: adminId,
          updatedBy: adminId,
        })),
      });
      const start = performance.now(),
        tree = await call("get", "/schedule/tree", undefined, cookie, p.id),
        readMs = performance.now() - start;
      expect(tree.status, tree.text.slice(0, 100)).toBe(200);
      expect(tree.body.items).toHaveLength(count);
      expect(tree.body.actualProgress).toBe("50.00");
      const baseline = await call(
        "post",
        "/schedule/baselines",
        { description: "Performance baseline" },
        cookie,
        p.id,
      );
      expect(baseline.status, baseline.text).toBe(201);
      console.info(
        "SCHEDULE_DATABASE_PERFORMANCE",
        JSON.stringify({
          count,
          readMs,
          baselineMs: performance.now() - start - readMs,
        }),
      );
    },
    30000,
  );
});
