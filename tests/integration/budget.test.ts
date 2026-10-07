import { budgetFixture } from "../helpers/budget-fixtures.js";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { Worker } from "bullmq";
import { createApp } from "../../apps/api/src/app.js";
import { Database, Cache } from "../../apps/api/src/platform.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { redisConnection } from "../../packages/config/src/redis.js";
import { processBudgetImport } from "../../apps/api/src/budget/import-stage.js";
import {
  templateWorkbook,
  readWorkbook,
} from "../../apps/api/src/budget/excel.js";
describe("M2 budgets with real PostgreSQL/Redis/worker", () => {
  let app: INestApplication, db: Database, server: Server, worker: Worker;
  let a: string,
    b: string,
    projectA: string,
    projectB: string,
    cookie: string[],
    r0: string,
    r1: string,
    item: string;
  const suffix = randomUUID(),
    origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const call = (
    method: "get" | "post" | "patch" | "delete",
    path: string,
    body?: unknown,
  ) => {
    const c = request(server);
    const r = c[method](`/api/v1/projects/${projectA}/budget${path}`)
      .set("Origin", origin)
      .set("Cookie", cookie);
    return body ? r.send(body) : r;
  };
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("test"))
      throw new Error("Test database required");
    app = await createApp();
    await app.init();
    db = app.get(Database);
    server = app.getHttpServer() as Server;
    await app.get(Cache).del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
    a = (
      await db.tenant.create({ data: { name: "M2 A", slug: `m2-${suffix}` } })
    ).id;
    b = (
      await db.tenant.create({ data: { name: "M2 B", slug: `m2b-${suffix}` } })
    ).id;
    const user = await db.user.create({
      data: {
        name: "M2 Admin",
        email: `m2-${suffix}@example.test`,
        passwordHash: await hashPassword("Budget-Secure!2026"),
        status: "ACTIVE",
      },
    });
    await db.tenantUser.create({
      data: { tenantId: a, userId: user.id, role: "ADMIN", status: "ACTIVE" },
    });
    projectA = (
      await db.project.create({
        data: {
          tenantId: a,
          code: "A",
          name: "A",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    ).id;
    projectB = (
      await db.project.create({
        data: {
          tenantId: b,
          code: "B",
          name: "B",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    ).id;
    const login = await request(server)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({
        email: user.email,
        password: "Budget-Secure!2026",
        tenantSlug: `m2-${suffix}`,
      });
    cookie = login.headers["set-cookie"] as unknown as string[];
    worker = new Worker(
      "budget-import",
      (job) => processBudgetImport(db, job.data),
      { connection: redisConnection() },
    );
  });
  afterAll(async () => {
    await worker?.close();
    await app?.close();
  });
  it("creates budget with R0", async () => {
    const r = await call("post", "", { name: "Principal" });
    expect(r.status, r.text).toBe(201);
    r0 = r.body.revision.id;
    expect(r.body.revision.code).toBe("R0");
  });
  it("creates 100m3 at 1000 MZN", async () => {
    const r = await call("post", "/items", {
      revisionId: r0,
      version: 0,
      code: "99",
      description: "Escavação",
      itemType: "ITEM",
      unit: "m³",
      quantity: "100",
      unitPrice: "1000",
    });
    expect(r.status, r.text).toBe(201);
    item = r.body.budgetItemId;
    expect(r.body.totalValue).toBe("100000.00");
  });
  it("rejects stale edits with optimistic locking", async () => {
    const r = await call("patch", `/items/${item}`, {
      revisionId: r0,
      version: 0,
      quantity: "120",
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("RESOURCE_VERSION_CONFLICT");
  });
  it("submits and prevents editing SUBMITTED", async () => {
    expect(
      (await call("post", `/revisions/${r0}/submit`, { version: 1 })).status,
    ).toBe(201);
    expect(
      (
        await call("patch", `/items/${item}`, {
          revisionId: r0,
          version: 2,
          quantity: "120",
        })
      ).status,
    ).toBe(409);
  });
  it("approves R0 and rejects database snapshot mutations", async () => {
    const r = await call("post", `/revisions/${r0}/approve`, { version: 2 });
    expect(r.status, r.text).toBe(201);
    await expect(
      db.budgetRevisionValue.updateMany({
        where: { tenantId: a, budgetRevisionId: r0 },
        data: { description: "tamper" },
      }),
    ).rejects.toThrow();
  });
  it("creates R1 with stable item IDs", async () => {
    const r = await call("post", "/revisions", {});
    expect(r.status, r.text).toBe(201);
    r1 = r.body.id;
    const tree = await call("get", `/tree?revisionId=${r1}`);
    expect(tree.body.items[0].budgetItemId).toBe(item);
    expect(tree.body.total).toBe("100000.00");
  });
  it("edits R1 without altering R0 metadata or values", async () => {
    const r = await call("patch", `/items/${item}`, {
      revisionId: r1,
      version: 0,
      quantity: "120",
      unitPrice: "1100",
      description: "Escavação revista",
    });
    expect(r.status, r.text).toBe(200);
    const old = await call("get", `/revisions/${r0}`);
    expect(old.body.total).toBe("100000.00");
    expect(old.body.items[0].description).toBe("Escavação");
  });
  it("approves R1 and supersedes R0", async () => {
    await call("post", `/revisions/${r1}/submit`, { version: 1 });
    const r = await call("post", `/revisions/${r1}/approve`, { version: 2 });
    expect(r.status, r.text).toBe(201);
    expect((await call("get", `/revisions/${r0}`)).body.status).toBe(
      "SUPERSEDED",
    );
  });
  it("compares revisions with 32000 and 32%", async () => {
    const r = await call(
      "get",
      `/revisions/compare?fromRevisionId=${r0}&toRevisionId=${r1}`,
    );
    expect(r.status, r.text).toBe(200);
    expect(r.body.difference).toBe("32000.00");
    expect(r.body.differencePercentage).toBe("32.00");
  });
  it("reports the original and current budget", async () => {
    const r = await call("get", "");
    expect(r.body.originalTotal).toBe("100000.00");
    expect(r.body.currentTotal).toBe("132000.00");
  });
  it("exports valid XLSX and audits it", async () => {
    const r = await call("get", `/revisions/${r0}/export`);
    expect(r.status, r.text).toBe(200);
    expect(r.headers["content-disposition"]).toContain("Orcamento_A_R0.xlsx");
    expect(
      await db.auditLog.count({
        where: { tenantId: a, action: "BUDGET_EXPORTED" },
      }),
    ).toBe(1);
  });
  it("blocks every cross-tenant route", async () => {
    for (const path of [
      "",
      `/revisions/${r0}`,
      `/revisions/compare?fromRevisionId=${r0}&toRevisionId=${r1}`,
      `/revisions/${r0}/export`,
      `/imports/${randomUUID()}`,
    ]) {
      const r = await request(server)
        .get(`/api/v1/projects/${projectB}/budget${path}`)
        .set("Cookie", cookie);
      expect(r.status, path).toBe(404);
    }
    expect(
      (
        await request(server)
          .post(`/api/v1/projects/${projectB}/budget/revisions/${r0}/approve`)
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({ version: 0 })
      ).status,
    ).toBe(404);
  });
  it("processes XLSX in worker, previews, confirms once and preserves original", async () => {
    const buffer = await templateWorkbook();
    expect((await readWorkbook(buffer)).rows.length).toBe(3);
    const upload = await request(server)
      .post(`/api/v1/projects/${projectA}/budget/imports`)
      .set("Cookie", cookie)
      .set("Origin", origin)
      .attach("file", buffer, "valid-budget.xlsx");
    expect(upload.status, upload.text).toBe(201);
    const id = upload.body.id;
    let job = upload.body;
    for (let i = 0; i < 100 && job.status !== "READY"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      job = (await call("get", `/imports/${id}`)).body;
    }
    expect(job.status, job.errorMessage).toBe("READY");
    expect(job.invalidRows).toBe(0);
    expect(job.previewTotal).toBe("250000");
    const confirmed = await call("post", `/imports/${id}/confirm`, {
      version: job.version,
    });
    expect(confirmed.status, confirmed.text).toBe(201);
    expect(confirmed.body.code).toBe("R2");
    expect(
      (await call("post", `/imports/${id}/confirm`, { version: job.version }))
        .status,
    ).toBe(409);
    expect((await call("get", `/imports/${id}/original`)).status).toBe(200);
  });
  it("rejects revision and duplicates it preserving rejected history", async () => {
    const list = await call("get", "/revisions");
    const current = list.body.data[0];
    await call("post", `/revisions/${current.id}/submit`, {
      version: current.version,
    });
    const rejected = await call("post", `/revisions/${current.id}/reject`, {
      version: current.version + 1,
      reason: "Rever quantidades",
    });
    expect(rejected.status, rejected.text).toBe(201);
    const next = await call("post", "/revisions", {
      sourceRevisionId: current.id,
    });
    expect(next.status, next.text).toBe(201);
    expect((await call("get", `/revisions/${current.id}`)).body.status).toBe(
      "REJECTED",
    );
  });

  async function uploadFixture(kind: "valid" | "invalid-number" = "valid") {
    const upload = await request(server)
      .post(`/api/v1/projects/${projectA}/budget/imports`)
      .set("Cookie", cookie)
      .set("Origin", origin)
      .attach("file", await budgetFixture(kind), `${kind}.xlsx`);
    expect(upload.status, upload.text).toBe(201);
    let job = upload.body;
    for (let i = 0; i < 100 && job.status !== "READY"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      job = (await call("get", `/imports/${job.id}`)).body;
    }
    expect(job.status, job.errorMessage).toBe("READY");
    return job;
  }
  it("rolls back a confirmation when an existing draft prevents import", async () => {
    const job = await uploadFixture();
    const before = await db.budgetRevision.count({ where: { tenantId: a } });
    const result = await call("post", `/imports/${job.id}/confirm`, {
      version: job.version,
    });
    expect(result.status).toBe(409);
    expect((await call("get", `/imports/${job.id}`)).body.status).toBe("READY");
    expect(await db.budgetRevision.count({ where: { tenantId: a } })).toBe(
      before,
    );
    expect(
      await db.auditLog.count({
        where: {
          tenantId: a,
          entityId: job.id,
          action: "BUDGET_IMPORT_CONFIRMED",
        },
      }),
    ).toBe(0);
  });
  it("blocks invalid confirmation and corrects a staged row without touching budget", async () => {
    const job = await uploadFixture("invalid-number");
    expect(job.invalidRows).toBe(1);
    expect(
      (
        await call("post", `/imports/${job.id}/confirm`, {
          version: job.version,
        })
      ).status,
    ).toBe(409);
    const corrected = await call("patch", `/imports/${job.id}/rows/3`, {
      version: job.version,
      data: { quantity: "120" },
    });
    expect(corrected.status, corrected.text).toBe(200);
    const preview = (await call("get", `/imports/${job.id}`)).body;
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows.data[1].totalValue).toBe("120000.00");
    expect(
      (
        await call("patch", `/imports/${job.id}/rows/3`, {
          version: job.version,
          data: { quantity: "130" },
        })
      ).status,
    ).toBe(409);
    expect((await call("get", "")).body.currentTotal).toBe("132000.00");
  });
  it("allows exactly one concurrent edit at the same revision version", async () => {
    const draft = (await call("get", "/revisions")).body.data[0];
    const results = await Promise.all(
      ["Primeira", "Segunda"].map((description) =>
        call("patch", `/revisions/${draft.id}`, {
          version: draft.version,
          description,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await call("get", `/revisions/${draft.id}`)).body.version).toBe(
      draft.version + 1,
    );
  });
  it("rejects UUIDs belonging to another project within an accessible URL", async () => {
    const other = await db.budget.create({
      data: {
        tenantId: b,
        projectId: projectB,
        name: "B",
        createdBy: randomUUID(),
        updatedBy: randomUUID(),
      },
    });
    const revision = await db.budgetRevision.create({
      data: {
        tenantId: b,
        projectId: projectB,
        budgetId: other.id,
        revisionNumber: 0,
        code: "R0",
        createdBy: randomUUID(),
      },
    });
    for (const path of [
      `/revisions/${revision.id}`,
      `/revisions/${revision.id}/export`,
      `/revisions/compare?fromRevisionId=${r0}&toRevisionId=${revision.id}`,
    ])
      expect((await call("get", path)).status).toBe(404);
    const draft = (await call("get", "/revisions")).body.data[0];
    expect(
      (
        await call("patch", `/items/${randomUUID()}`, {
          revisionId: draft.id,
          version: draft.version,
          quantity: "1",
        })
      ).status,
    ).toBe(404);
  });
  it.each(["MANAGER", "INSPECTOR", "FINANCIER", "CLIENT"] as const)(
    "enforces role %s on assigned project",
    async (role) => {
      const user = await db.user.create({
        data: {
          name: role,
          email: `${role.toLowerCase()}-${suffix}@example.test`,
          passwordHash: await hashPassword("Budget-Secure!2026"),
          status: "ACTIVE",
        },
      });
      await db.tenantUser.create({
        data: { tenantId: a, userId: user.id, role, status: "ACTIVE" },
      });
      await db.projectUser.create({
        data: {
          tenantId: a,
          projectId: projectA,
          userId: user.id,
          role,
          status: "ACTIVE",
        },
      });
      const login = await request(server)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({
          email: user.email,
          password: "Budget-Secure!2026",
          tenantSlug: `m2-${suffix}`,
        });
      expect(login.status, login.text).toBe(200);
      const auth = login.headers["set-cookie"] as unknown as string[];
      const get = await request(server)
        .get(`/api/v1/projects/${projectA}/budget/revisions/${r1}`)
        .set("Cookie", auth);
      expect(get.status).toBe(200);
      const draft = (await call("get", "/revisions")).body.data[0];
      const patch = await request(server)
        .patch(`/api/v1/projects/${projectA}/budget/revisions/${draft.id}`)
        .set("Cookie", auth)
        .set("Origin", origin)
        .send({ version: draft.version, description: "Gestor" });
      expect(patch.status).toBe(role === "MANAGER" ? 200 : 403);
      expect(
        (
          await request(server)
            .post(
              `/api/v1/projects/${projectA}/budget/revisions/${draft.id}/approve`,
            )
            .set("Cookie", auth)
            .set("Origin", origin)
            .send({ version: draft.version })
        ).status,
      ).toBe(403);
    },
  );

  it.each([1000, 5000, 10000])(
    "imports and reads %i rows through PostgreSQL and worker",
    async (size) => {
      const previousProject = projectA;
      const source = await db.project.findUniqueOrThrow({
        where: { id: projectA },
      });
      const project = await db.project.create({
        data: {
          tenantId: a,
          code: `PERF-${size}`,
          name: "Performance",
          createdBy: source.createdBy,
          updatedBy: source.updatedBy,
        },
      });
      projectA = project.id;
      try {
        const buffer = await budgetFixture("large", size),
          start = performance.now();
        const upload = await request(server)
          .post(`/api/v1/projects/${project.id}/budget/imports`)
          .set("Cookie", cookie)
          .set("Origin", origin)
          .attach("file", buffer, "large-budget.xlsx");
        expect(upload.status, upload.text).toBe(201);
        let job = upload.body;
        for (
          let i = 0;
          i < 600 && job.status !== "READY" && job.status !== "FAILED";
          i++
        ) {
          await new Promise((r) => setTimeout(r, 100));
          job = (await call("get", `/imports/${job.id}`)).body;
        }
        expect(job.status, job.errorMessage).toBe("READY");
        expect(job.totalRows).toBe(size);
        const ready = performance.now();
        const confirmed = await call("post", `/imports/${job.id}/confirm`, {
          version: job.version,
        });
        expect(confirmed.status, confirmed.text).toBe(201);
        const applied = performance.now();
        const tree = await call("get", "/tree");
        expect(tree.status, tree.text).toBe(200);
        expect(tree.body.total).toBe(`${(size - 1) * 100000}.00`);
        expect(tree.body.items[0].children.length).toBe(size - 1);
        const read = performance.now();
        const page = await call("get", "/items?page=2&limit=50");
        expect(page.body.data.length).toBe(50);
        expect(page.body.meta.total).toBe(size);
        const comparison = await call(
          "get",
          `/revisions/compare?fromRevisionId=${confirmed.body.id}&toRevisionId=${confirmed.body.id}&page=2&limit=50`,
        );
        expect(comparison.body.data.length).toBe(50);
        expect(comparison.body.meta.total).toBe(size - 1);
        expect(comparison.body.difference).toBe("0.00");
        const done = performance.now();
        const approvalStart = performance.now();
        expect(
          (
            await call("post", `/revisions/${confirmed.body.id}/submit`, {
              version: confirmed.body.version,
            })
          ).status,
        ).toBe(201);
        expect(
          (
            await call("post", `/revisions/${confirmed.body.id}/approve`, {
              version: confirmed.body.version + 1,
            })
          ).status,
        ).toBe(201);
        const clone = await call("post", "/revisions", {});
        expect(clone.status, clone.text).toBe(201);
        expect(
          await db.budgetRevisionValue.count({
            where: { tenantId: a, budgetRevisionId: clone.body.id },
          }),
        ).toBe(size);
        console.info(
          "BUDGET_REVISION_PERFORMANCE",
          JSON.stringify({
            rows: size,
            submitApproveCloneMs: Math.round(performance.now() - approvalStart),
          }),
        );
        console.info(
          "BUDGET_DATABASE_PERFORMANCE",
          JSON.stringify({
            rows: size,
            uploadWorkerPreviewMs: Math.round(ready - start),
            confirmMs: Math.round(applied - ready),
            treeMs: Math.round(read - applied),
            pageAndCompareMs: Math.round(done - read),
            totalMs: Math.round(done - start),
          }),
        );
        expect(done - start).toBeLessThan(120000);
      } finally {
        projectA = previousProject;
      }
    },
    150000,
  );

  it("reimports using stable IDs, soft deletes and preserves approved history", async () => {
    const previousProject = projectA,
      source = await db.project.findUniqueOrThrow({ where: { id: projectA } });
    projectA = (
      await db.project.create({
        data: {
          tenantId: a,
          code: "REIMPORT",
          name: "Reimport",
          createdBy: source.createdBy,
          updatedBy: source.updatedBy,
        },
      })
    ).id;
    try {
      const firstJob = await uploadFixture(),
        first = (
          await call("post", `/imports/${firstJob.id}/confirm`, {
            version: firstJob.version,
          })
        ).body;
      const firstTree = (await call("get", "/tree")).body,
        itemId = firstTree.items[0].children[0].budgetItemId;
      expect(
        (
          await call("post", `/revisions/${first.id}/submit`, {
            version: first.version,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await call("post", `/revisions/${first.id}/approve`, {
            version: first.version + 1,
          })
        ).status,
      ).toBe(201);
      const secondJob = await uploadFixture(),
        second = (
          await call("post", `/imports/${secondJob.id}/confirm`, {
            version: secondJob.version,
          })
        ).body;
      expect(second.code).toBe("R1");
      expect(
        (await call("get", "/tree")).body.items[0].children[0].budgetItemId,
      ).toBe(itemId);
      const removed = await call("delete", `/items/${itemId}`, {
        revisionId: second.id,
        version: second.version,
      });
      expect(removed.status, removed.text).toBe(200);
      expect((await call("get", `/revisions/${first.id}`)).body.total).toBe(
        "100000.00",
      );
      expect((await call("get", "/tree")).body.total).toBe("0.00");
      expect(
        await db.budgetItem.count({ where: { id: itemId, tenantId: a } }),
      ).toBe(1);
      expect(
        (
          await call(
            "get",
            `/revisions/compare?fromRevisionId=${first.id}&toRevisionId=${second.id}`,
          )
        ).body.data[0].classification,
      ).toBe("REMOVED");
    } finally {
      projectA = previousProject;
    }
  });
  it("documents budget response schemas and paginated comparisons", async () => {
    const doc = await request(server).get("/api/docs-json");
    expect(doc.status).toBe(200);
    expect(
      doc.body.components.schemas.BudgetNode.properties.children.items.$ref,
    ).toContain("BudgetNode");
    const op =
      doc.body.paths["/api/v1/projects/{projectId}/budget/revisions/compare"]
        .get;
    expect(
      op.responses["200"].content["application/json"].schema.properties.data
        .type,
    ).toBe("array");
  });
});
