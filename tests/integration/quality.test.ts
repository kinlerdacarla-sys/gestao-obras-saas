import { createTestTenant } from "../helpers/tenant.js";
import { checkQualityCertification } from "../../apps/api/src/quality/measurement-block.js";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID, createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Server } from "node:http";
import { createApp } from "../../apps/api/src/app.js";
import { Database, Cache } from "../../apps/api/src/platform.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { monitorQualityDeadlines } from "../../apps/worker/src/quality.js";
import { seedBudget } from "../../prisma/seed-budget.js";
describe("M6 quality PostgreSQL integration", () => {
  let app: INestApplication,
    db: Database,
    server: Server,
    tenant: string,
    project: string,
    other: string,
    foreign: string;
  const users: Record<string, string> = {},
    cookies: Record<string, string[]> = {},
    suffix = randomUUID(),
    origin = process.env.WEB_ORIGIN ?? "http://localhost:3000",
    date = new Date().toISOString().slice(0, 10);
  let template: string,
    versionId: string,
    requestId: string,
    inspection: string,
    items: { id: string; template: { code: string } }[],
    ncr: string,
    action: string,
    photo: string,
    budget: string;
  const call = (
    method: "get" | "post" | "patch" | "delete",
    path: string,
    body?: unknown,
    role = "ADMIN",
    p = project,
  ) => {
    const agent = request(server);
    const c = agent[method](`/api/v1/projects/${p}${path}`)
      .set("Origin", origin)
      .set("Cookie", cookies[role]);
    return body ? c.send(body) : c;
  };
  const global = (
    method: "get" | "post" | "patch",
    path: string,
    body?: unknown,
    role = "ADMIN",
  ) => {
    const agent = request(server);
    const c = agent[method](`/api/v1${path}`)
      .set("Origin", origin)
      .set("Cookie", cookies[role]);
    return body ? c.send(body) : c;
  };
  const getVersion = async (path: string) =>
    (await call("get", path)).body.version as number;
  const act = async (
    path: string,
    verb: string,
    role = "ADMIN",
    extra: object = {},
  ) =>
    call(
      "post",
      `${path}/${verb}`,
      { version: await getVersion(path), ...extra },
      role,
    );
  const good = (
    r: { status: number; text: string; body: unknown },
    code = 201,
  ) => {
    expect(r.status, r.text).toBe(code);
    return r.body as Record<string, unknown>;
  };
  const rules = [
    { code: "01", description: "Dimensões", sortOrder: 0 },
    { code: "02", description: "Limpeza", sortOrder: 1 },
    { code: "03", description: "Liberação", sortOrder: 2, isHoldPoint: true },
  ];
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("test"))
      throw Error("Test database required");
    app = await createApp();
    await app.init();
    db = app.get(Database);
    server = app.getHttpServer() as Server;
    await app.get(Cache).del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
    tenant = (
      await createTestTenant(db, { data: { name: "M6", slug: `m6-${suffix}` } })
    ).id;
    foreign = (
      await createTestTenant(db, {
        data: { name: "Foreign", slug: `m6-other-${suffix}` },
      })
    ).id;
    for (const role of [
      "ADMIN",
      "MANAGER",
      "INSPECTOR",
      "FINANCIER",
      "CLIENT",
    ] as const) {
      const u = await db.user.create({
        data: {
          name: role,
          email: `m6-${role.toLowerCase()}-${suffix}@example.test`,
          passwordHash: await hashPassword("Quality!2026"),
          status: "ACTIVE",
        },
      });
      users[role] = u.id;
      await db.tenantUser.create({
        data: { tenantId: tenant, userId: u.id, role, status: "ACTIVE" },
      });
      const res = await request(server)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({
          tenantSlug: `m6-${suffix}`,
          email: u.email,
          password: "Quality!2026",
        });
      expect(res.status, res.text).toBe(200);
      cookies[role] = res.headers["set-cookie"] as unknown as string[];
    }
    for (const t of [tenant, foreign]) {
      const p = await db.project.create({
        data: {
          tenantId: t,
          code: "M6",
          name: "Quality",
          createdBy: users.ADMIN,
          updatedBy: users.ADMIN,
        },
      });
      if (t === tenant) project = p.id;
      else other = p.id;
    }
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
    await seedBudget(db, tenant, project, users.ADMIN);
    budget = (
      await db.budgetItem.findFirstOrThrow({
        where: { tenantId: tenant, projectId: project, itemType: "ITEM" },
      })
    ).id;
  });
  afterAll(async () => {
    await app?.close();
  });
  it("creates template and publishes immutable version", async () => {
    let r = await global("post", "/checklist-templates", {
      name: "Estrutura",
      code: "CHK",
      items: rules,
    });
    good(r);
    template = r.body.id;
    versionId = r.body.draftVersionId;
    r = await global(
      "post",
      `/checklist-template-versions/${versionId}/publish`,
      { version: 0 },
    );
    good(r);
    expect(r.body.status).toBe("PUBLISHED");
  });
  it("rejects changing published content through API and DB", async () => {
    const r = await global(
      "patch",
      `/checklist-template-versions/${versionId}/items`,
      { version: 1, items: rules },
    );
    expect(r.body.code).toBe("CHECKLIST_VERSION_IMMUTABLE");
    await expect(
      db.checklistTemplateItem.updateMany({
        where: { checklistTemplateVersionId: versionId },
        data: { description: "tampered" },
      }),
    ).rejects.toThrow();
  });
  it("creates independently versioned draft", async () => {
    const r = await global(
      "post",
      `/checklist-templates/${template}/versions`,
      { items: rules },
    );
    good(r);
    expect(r.body.versionNumber).toBe(2);
    expect(r.body.status).toBe("DRAFT");
  });
  it("manager requests and submits; fiscal schedules inspection", async () => {
    const r = await call(
      "post",
      "/inspection-requests",
      {
        title: "Armadura sapatas",
        requestedInspectionDate: date,
        budgetItemId: budget,
      },
      "MANAGER",
    );
    good(r);
    requestId = r.body.id;
    expect(r.body.code).toBe("IR-001");
    good(await act(`/inspection-requests/${requestId}`, "submit", "MANAGER"));
    good(
      await act(`/inspection-requests/${requestId}`, "schedule", "INSPECTOR", {
        assignedInspectorId: users.INSPECTOR,
      }),
    );
  });
  it("creates inspection with inherited references and checklist", async () => {
    const r = await call(
      "post",
      "/inspections",
      {
        inspectionRequestId: requestId,
        checklistTemplateVersionId: versionId,
        title: "Inspeção armadura",
        inspectionDate: date,
        inspectorId: users.INSPECTOR,
      },
      "INSPECTOR",
    );
    good(r);
    inspection = r.body.id;
    expect(r.body.budgetItemId).toBe(budget);
    items = (await call("get", `/inspections/${inspection}`)).body.items;
    expect(items).toHaveLength(3);
    good(await act(`/inspections/${inspection}`, "start", "INSPECTOR"));
  });
  it("serializes concurrent inspection edits with optimistic locking", async () => {
    const version = await getVersion(`/inspections/${inspection}`);
    const responses = await Promise.all([
      call(
        "patch",
        `/inspections/${inspection}`,
        { version, description: "First edit" },
        "INSPECTOR",
      ),
      call(
        "patch",
        `/inspections/${inspection}`,
        { version, description: "Second edit" },
        "INSPECTOR",
      ),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)?.body.code).toBe(
      "RESOURCE_VERSION_CONFLICT",
    );
  });
  it("rejects missing required answers", async () => {
    expect(
      (await act(`/inspections/${inspection}`, "submit", "INSPECTOR")).body
        .code,
    ).toBe("INSPECTION_REQUIRED_ITEM_MISSING");
  });
  it("calculates FAIL and enforces photo before submission", async () => {
    for (let i = 0; i < 3; i++)
      good(
        await call(
          "patch",
          `/inspections/${inspection}/items/${items[i].id}`,
          {
            version: await getVersion(`/inspections/${inspection}`),
            result: i === 2 ? "FAIL" : "PASS",
            comment: i === 2 ? "Recobrimento insuficiente" : null,
          },
          "INSPECTOR",
        ),
        200,
      );
    const r = await call("get", `/inspections/${inspection}`);
    expect(r.body.overallResult).toBe("FAIL");
    expect(
      (await act(`/inspections/${inspection}`, "submit", "INSPECTOR")).body
        .code,
    ).toBe("INSPECTION_FAIL_REQUIRES_EVIDENCE");
  });
  const upload = async (
    kind: string,
    id: string,
    role: string,
    item?: string,
  ) => {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    );
    const r = await call(
      "post",
      `/${kind}/${id}/evidence`,
      {
        version: await getVersion(`/${kind}/${id}`),
        fileName: "quality.png",
        mimeType: "image/png",
        sizeBytes: bytes.length,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        visibility: "PUBLIC_PROJECT",
        isPhoto: true,
        evidenceType: "PHOTO",
        ...(item ? { inspectionItemId: item } : {}),
      },
      role,
    );
    good(r);
    const sent = await request(server)
      .put(r.body.uploadUrl)
      .set("Origin", origin)
      .set("Cookie", cookies[role])
      .attach("file", bytes, {
        filename: "quality.png",
        contentType: "image/png",
      });
    expect(sent.status, sent.text).toBe(200);
    good(
      await call(
        "post",
        `/${kind}/${id}/documents/${r.body.id}/confirm`,
        { version: r.body.version },
        role,
      ),
    );
    return r.body.id as string;
  };
  it("uploads confirmed photo with existing DocumentModule", async () => {
    const removed = await upload(
      "inspections",
      inspection,
      "INSPECTOR",
      items[2].id,
    );
    good(
      await call(
        "delete",
        `/inspections/${inspection}/evidence/${removed}`,
        { version: await getVersion(`/inspections/${inspection}`) },
        "INSPECTOR",
      ),
      200,
    );
    expect(
      (await act(`/inspections/${inspection}`, "submit", "INSPECTOR")).body
        .code,
    ).toBe("INSPECTION_FAIL_REQUIRES_EVIDENCE");
    photo = await upload("inspections", inspection, "INSPECTOR", items[2].id);
    const evidence = await call("get", `/inspections/${inspection}/evidence`);
    expect(evidence.body.items).toHaveLength(1);
    good(await act(`/inspections/${inspection}`, "submit", "INSPECTOR"));
  });
  it("requires explicit hold point release", async () => {
    expect(
      (await act(`/inspections/${inspection}`, "close", "INSPECTOR")).body.code,
    ).toBe("HOLD_POINT_NOT_RELEASED");
    good(
      await call(
        "post",
        `/inspections/${inspection}/items/${items[2].id}/release-hold-point`,
        {
          version: await getVersion(`/inspections/${inspection}`),
          comment: "Trabalho permanece reprovado; correção tratada via NCR",
        },
        "INSPECTOR",
      ),
    );
    good(await act(`/inspections/${inspection}`, "close", "INSPECTOR"));
  });
  it("closed inspection and evidence are immutable", async () => {
    const r = await call(
      "patch",
      `/inspections/${inspection}`,
      {
        version: await getVersion(`/inspections/${inspection}`),
        title: "change",
      },
      "INSPECTOR",
    );
    expect(r.body.code).toBe("INSPECTION_IMMUTABLE");
    await expect(
      db.inspection.update({
        where: { id: inspection },
        data: { title: "tamper" },
      }),
    ).rejects.toThrow();
    await expect(
      db.document.update({
        where: { id: photo },
        data: { deletedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
  it("creates NCR from closed inspection without rewriting original", async () => {
    const r = await call(
      "post",
      "/non-conformities",
      {
        inspectionId: inspection,
        inspectionItemId: items[2].id,
        title: "Recobrimento insuficiente",
        description: "Sapata S03",
        severity: "CRITICAL",
        category: "WORKMANSHIP",
        dueDate: "2020-01-01",
      },
      "INSPECTOR",
    );
    good(r);
    ncr = r.body.id;
    expect(r.body.code).toBe("NCR-001");
    expect(r.body.budgetItemId).toBe(budget);
    expect(
      (await call("get", `/inspections/${inspection}`)).body.overallResult,
    ).toBe("FAIL");
  });
  it("enforces role restrictions", async () => {
    for (const role of ["CLIENT", "FINANCIER", "MANAGER"]) {
      const r = await call(
        "post",
        "/inspections",
        {
          checklistTemplateVersionId: versionId,
          title: "No",
          inspectionDate: date,
          inspectorId: users.INSPECTOR,
        },
        role,
      );
      expect(r.status).toBe(403);
    }
    for (const role of ["CLIENT", "FINANCIER"]) {
      expect(
        (await call("get", `/non-conformities/${ncr}`, undefined, role)).status,
      ).toBe(200);
      expect(
        (await act(`/non-conformities/${ncr}`, "close", role)).status,
      ).toBe(403);
    }
  });
  it("assigns and starts correction", async () => {
    good(
      await act(`/non-conformities/${ncr}`, "assign", "INSPECTOR", {
        responsibleUserId: users.MANAGER,
      }),
    );
    good(await act(`/non-conformities/${ncr}`, "start-correction", "MANAGER"));
    const r = await call(
      "post",
      `/non-conformities/${ncr}/corrective-actions`,
      {
        version: await getVersion(`/non-conformities/${ncr}`),
        description: "Ajustar espaçadores",
        responsibleUserId: users.MANAGER,
      },
      "MANAGER",
    );
    good(r);
    action = r.body.id;
    good(await act(`/corrective-actions/${action}`, "start", "MANAGER"));
  });
  it("requires corrective evidence then marks complete", async () => {
    expect(
      (
        await act(`/corrective-actions/${action}`, "complete", "MANAGER", {
          completionNotes: "Corrigido",
        })
      ).status,
    ).toBe(400);
    await upload("corrective-actions", action, "MANAGER");
    good(
      await act(`/corrective-actions/${action}`, "complete", "MANAGER", {
        completionNotes: "Espaçadores corrigidos",
      }),
    );
    good(
      await act(
        `/non-conformities/${ncr}`,
        "ready-for-verification",
        "MANAGER",
      ),
    );
  });
  it("prevents manager self-verification with explicit error", async () => {
    expect(
      (await act(`/corrective-actions/${action}`, "verify", "MANAGER")).body
        .code,
    ).toBe("SELF_VERIFICATION_NOT_ALLOWED");
    expect(
      (await act(`/non-conformities/${ncr}`, "verify", "MANAGER")).body.code,
    ).toBe("SELF_VERIFICATION_NOT_ALLOWED");
  });
  it("rejects correction and reopens NCR", async () => {
    good(
      await act(`/non-conformities/${ncr}`, "reject-correction", "INSPECTOR", {
        comment: "Rever evidência",
      }),
    );
    expect((await call("get", `/non-conformities/${ncr}`)).body.status).toBe(
      "REOPENED",
    );
    good(await act(`/non-conformities/${ncr}`, "start-correction", "MANAGER"));
    good(await act(`/corrective-actions/${action}`, "start", "MANAGER"));
    good(
      await act(`/corrective-actions/${action}`, "complete", "MANAGER", {
        completionNotes: "Correção reverificada",
      }),
    );
    good(
      await act(
        `/non-conformities/${ncr}`,
        "ready-for-verification",
        "MANAGER",
      ),
    );
  });
  it("independently verifies and closes NCR", async () => {
    expect(
      (await act(`/non-conformities/${ncr}`, "close", "INSPECTOR")).body.code,
    ).toBe("NCR_CLOSE_REQUIRES_VERIFIED_ACTIONS");
    good(await act(`/non-conformities/${ncr}`, "verify", "INSPECTOR"));
    good(await act(`/non-conformities/${ncr}`, "close", "INSPECTOR"));
    await expect(
      db.nonConformity.update({
        where: { id: ncr },
        data: { title: "History rewrite" },
      }),
    ).rejects.toThrow();
    expect(
      (await call("get", `/inspections/${inspection}`)).body.overallResult,
    ).toBe("FAIL");
  });
  it("preserves timeline, comments and global audits", async () => {
    const r = await call("get", `/non-conformities/${ncr}`);
    expect(
      r.body.events.some(
        (x: { eventType: string }) => x.eventType === "VERIFICATION_REJECTED",
      ),
    ).toBe(true);
    expect(
      await db.auditLog.count({
        where: {
          tenantId: tenant,
          projectId: project,
          action: "CORRECTIVE_ACTION_VERIFIED",
        },
      }),
    ).toBeGreaterThan(0);
    await expect(
      db.nonConformity.delete({ where: { id: ncr } }),
    ).rejects.toThrow();
  });
  it("reopens with reason and enforces optimistic locking", async () => {
    good(
      await act(`/non-conformities/${ncr}`, "reopen", "INSPECTOR", {
        comment: "Novo defeito encontrado",
      }),
    );
    const r = await call(
      "patch",
      `/non-conformities/${ncr}`,
      { version: 0, title: "stale" },
      "INSPECTOR",
    );
    expect(r.body.code).toBe("RESOURCE_VERSION_CONFLICT");
  });
  it("computes dashboard and trends", async () => {
    const r = await call("get", "/quality/summary");
    expect(r.body.inspectionsTotal).toBe(1);
    expect(r.body.inspectionsFailed).toBe(1);
    expect(r.body.criticalNonConformities).toBe(1);
    expect(r.body.overdueNonConformities).toBe(1);
    const t = await call("get", "/quality/trends");
    expect(t.body.series.length).toBeGreaterThan(0);
  });
  it("sends deadline notices without daily duplicates", async () => {
    await monitorQualityDeadlines(db);
    const where = { tenantId: tenant, projectId: project, type: "NCR_OVERDUE" };
    const count = await db.notification.count({ where });
    expect(count).toBeGreaterThan(0);
    await monitorQualityDeadlines(db);
    expect(await db.notification.count({ where })).toBe(count);
  });
  it("hides notifications after project participation is revoked", async () => {
    const notification = await db.notification.findFirstOrThrow({
      where: { tenantId: tenant, projectId: project, userId: users.MANAGER },
    });
    await db.projectUser.updateMany({
      where: { tenantId: tenant, projectId: project, userId: users.MANAGER },
      data: { status: "DISABLED" },
    });
    try {
      const list = await global("get", "/notifications", undefined, "MANAGER");
      expect(list.status).toBe(200);
      expect(
        list.body.items.some(
          (item: { id: string }) => item.id === notification.id,
        ),
      ).toBe(false);
      expect(
        (
          await global(
            "post",
            `/notifications/${notification.id}/read`,
            {},
            "MANAGER",
          )
        ).status,
      ).toBe(404);
    } finally {
      await db.projectUser.updateMany({
        where: { tenantId: tenant, projectId: project, userId: users.MANAGER },
        data: { status: "ACTIVE" },
      });
    }
  });
  it("rejects cross-tenant reads writes and evidence downloads", async () => {
    for (const path of [
      `/inspections/${inspection}`,
      `/non-conformities/${ncr}`,
      `/inspections/${inspection}/documents/${photo}/content`,
    ])
      expect((await call("get", path, undefined, "ADMIN", other)).status).toBe(
        404,
      );
    const foreignTemplate = await db.checklistTemplate
      .create({
        data: {
          tenantId: foreign,
          createdBy: users.ADMIN,
          name: "Foreign",
          code: "PRIVATE",
        },
      })
      .catch(() => null);
    expect(foreignTemplate).toBeNull();
    expect(
      (await global("get", `/checklist-templates/${randomUUID()}`)).status,
    ).toBe(404);
  });
  it("returns report and source indicators", async () => {
    const r = await call("get", `/inspections/${inspection}/report`);
    expect(r.body.project.id).toBe(project);
    expect(r.body.data.closedBy).toBe(users.INSPECTOR);
    expect(r.body.closedByIdentity.id).toBe(users.INSPECTOR);
    expect(r.body.inspectorIdentity.id).toBe(users.INSPECTOR);
    expect(r.body.checklist.id).toBe(template);
    expect(r.body.checklist.versionNumber).toBe(1);
    const i = await call("get", `/quality/indicators/budget/${budget}`);
    expect(i.body.qualityStatus).toBe("CRITICAL");
  });
  it("blocks certification through budget linkage until independent closure, without retroactive payment blocking", async () => {
    const scope = { tenantId: tenant, projectId: project },
      stamp = { createdBy: users.ADMIN, updatedBy: users.ADMIN };
    const supplier = await db.supplier.create({
      data: {
        tenantId: tenant,
        ...stamp,
        legalName: "Quality supplier",
        supplierType: "SUBCONTRACTOR",
      },
    });
    const contract = await db.contract.create({
      data: {
        ...scope,
        ...stamp,
        supplierId: supplier.id,
        contractNumber: "QUALITY-CERT",
        title: "Quality contract",
        contractType: "SUBCONTRACT",
        originalValue: "1000",
        currentValue: "1000",
      },
    });
    const ci = await db.contractItem.create({
      data: {
        ...scope,
        ...stamp,
        contractId: contract.id,
        budgetItemId: budget,
        description: "Measured work",
        quantity: "10",
        unitPrice: "100",
        totalValue: "1000",
      },
    });
    await db.contract.update({
      where: { id: contract.id },
      data: { status: "ACTIVE" },
    });
    let r = await call(
      "post",
      "/measurements",
      { contractId: contract.id, periodStart: date, periodEnd: date },
      "MANAGER",
    );
    good(r);
    const mid = r.body.id;
    good(
      await call(
        "post",
        `/measurements/${mid}/items`,
        { version: 0, contractItemId: ci.id, currentQuantity: "1" },
        "MANAGER",
      ),
    );
    for (const [a, role] of [
      ["submit", "MANAGER"],
      ["fiscal-approve", "INSPECTOR"],
      ["approve", "FINANCIER"],
    ]) {
      r = await call(
        "post",
        `/measurements/${mid}/${a}`,
        { version: await getVersion(`/measurements/${mid}`) },
        role,
      ).set("Idempotency-Key", randomUUID());
      good(r);
    }
    const certify = async () =>
      call("post", `/measurements/${mid}/certify`, {
        version: await getVersion(`/measurements/${mid}`),
      }).set("Idempotency-Key", randomUUID());
    r = await certify();
    expect(r.body.code).toBe("MEASUREMENT_BLOCKED_BY_CRITICAL_NCR");
    expect(r.body.details.some((x: { id: string }) => x.id === ncr)).toBe(true);
    good(
      await call("patch", "/quality/policy", {
        version: 0,
        blockMeasurementOnOpenCriticalNcr: false,
        preventSelfVerification: true,
      }),
      200,
    );
    expect(
      (await call("get", "/quality/policy")).body
        .blockMeasurementOnOpenCriticalNcr,
    ).toBe(false);
    await expect(
      db.$transaction((tx) =>
        checkQualityCertification(tx, scope, {
          id: mid,
          contractId: contract.id,
        }),
      ),
    ).resolves.toBeUndefined();
    good(
      await call("patch", "/quality/policy", {
        version: 1,
        blockMeasurementOnOpenCriticalNcr: true,
        preventSelfVerification: true,
      }),
      200,
    );
    good(await act(`/non-conformities/${ncr}`, "start-correction", "MANAGER"));
    r = await call(
      "post",
      `/non-conformities/${ncr}/corrective-actions`,
      {
        version: await getVersion(`/non-conformities/${ncr}`),
        description: "Reparação definitiva",
      },
      "MANAGER",
    );
    good(r);
    const aid = r.body.id;
    good(await act(`/corrective-actions/${aid}`, "start", "MANAGER"));
    await upload("corrective-actions", aid, "MANAGER");
    good(
      await act(`/corrective-actions/${aid}`, "complete", "MANAGER", {
        completionNotes: "Evidência definitiva",
      }),
    );
    good(
      await act(
        `/non-conformities/${ncr}`,
        "ready-for-verification",
        "MANAGER",
      ),
    );
    good(await act(`/non-conformities/${ncr}`, "verify", "INSPECTOR"));
    good(await act(`/non-conformities/${ncr}`, "close", "INSPECTOR"));
    good(await certify());
    good(
      await act(`/non-conformities/${ncr}`, "reopen", "INSPECTOR", {
        comment: "Defeito posterior à certificação",
      }),
    );
    r = await call("post", "/payments", {
      supplierId: supplier.id,
      measurementId: mid,
      amount: "100",
      paymentDate: date,
      method: "BANK_TRANSFER",
    }).set("Idempotency-Key", randomUUID());
    good(r);
    expect((await call("get", `/measurements/${mid}`)).body.status).toBe(
      "PAID",
    );
  });
  it("rejects foreign and same-tenant other-project links and checklist use", async () => {
    await db.tenantUser.create({
      data: {
        tenantId: foreign,
        userId: users.ADMIN,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    const t = await db.checklistTemplate.create({
      data: {
        tenantId: foreign,
        createdBy: users.ADMIN,
        name: "Foreign",
        code: "PRIVATE",
      },
    });
    const v = await db.checklistTemplateVersion.create({
      data: {
        tenantId: foreign,
        createdBy: users.ADMIN,
        checklistTemplateId: t.id,
        versionNumber: 1,
        status: "PUBLISHED",
      },
    });
    expect((await global("get", `/checklist-templates/${t.id}`)).status).toBe(
      404,
    );
    expect(
      (await global("get", `/checklist-template-versions/${v.id}`)).status,
    ).toBe(404);
    expect(
      (
        await call(
          "post",
          "/inspections",
          {
            title: "Foreign",
            inspectionDate: date,
            inspectorId: users.INSPECTOR,
            checklistTemplateVersionId: v.id,
          },
          "INSPECTOR",
        )
      ).status,
    ).toBe(404);
    const p2 = await db.project.create({
      data: {
        tenantId: tenant,
        code: "OTHER",
        name: "Other project",
        createdBy: users.ADMIN,
        updatedBy: users.ADMIN,
      },
    });
    await seedBudget(db, tenant, p2.id, users.ADMIN);
    const bi = await db.budgetItem.findFirstOrThrow({
      where: { tenantId: tenant, projectId: p2.id, itemType: "ITEM" },
    });
    expect(
      (
        await call(
          "post",
          "/non-conformities",
          {
            title: "Invalid",
            description: "Invalid",
            severity: "LOW",
            category: "OTHER",
            budgetItemId: bi.id,
          },
          "INSPECTOR",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "get",
          `/inspections/${inspection}`,
          undefined,
          "ADMIN",
          p2.id,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "get",
          `/inspections/${inspection}/documents/${photo}/content`,
          undefined,
          "ADMIN",
          p2.id,
        )
      ).status,
    ).toBe(404);
  });

  it("validates actual foreign task and measurement associations", async () => {
    const scope = { tenantId: foreign, projectId: other },
      stamp = { createdBy: users.ADMIN, updatedBy: users.ADMIN };
    const schedule = await db.schedule.create({
      data: {
        ...scope,
        ...stamp,
        name: "Foreign schedule",
        plannedStart: new Date(date),
        plannedEnd: new Date(date),
      },
    });
    const task = await db.scheduleTask.create({
      data: {
        ...scope,
        ...stamp,
        scheduleId: schedule.id,
        code: "F",
        name: "Foreign task",
        taskType: "TASK",
        plannedStart: new Date(date),
        plannedEnd: new Date(date),
        durationDays: 1,
      },
    });
    const supplier = await db.supplier.create({
      data: {
        tenantId: foreign,
        ...stamp,
        legalName: "Foreign supplier",
        supplierType: "SUPPLIER",
      },
    });
    const contract = await db.contract.create({
      data: {
        ...scope,
        ...stamp,
        supplierId: supplier.id,
        contractNumber: "FOREIGN",
        title: "Foreign contract",
        contractType: "SUBCONTRACT",
        originalValue: "100",
        currentValue: "100",
      },
    });
    const m = await db.measurement.create({
      data: {
        ...scope,
        ...stamp,
        contractId: contract.id,
        measurementNumber: 1,
        code: "MED-001",
        periodStart: new Date(date),
        periodEnd: new Date(date),
      },
    });
    for (const reference of [
      { scheduleTaskId: task.id },
      { measurementId: m.id },
    ])
      expect(
        (
          await call(
            "post",
            "/non-conformities",
            {
              title: "Wrong scope",
              description: "Wrong scope",
              severity: "LOW",
              category: "OTHER",
              ...reference,
            },
            "INSPECTOR",
          )
        ).status,
      ).toBe(404);
    for (const [method, path, body] of [
      ["patch", `/inspections/${inspection}`, { version: 0, title: "wrong" }],
      ["patch", `/non-conformities/${ncr}`, { version: 0, title: "wrong" }],
      ["post", `/non-conformities/${ncr}/close`, { version: 0 }],
    ] as const)
      expect((await call(method, path, body, "ADMIN", other)).status).toBe(404);
  });
  it("guards draft/published version order and invalid filters", async () => {
    const a = await global(
      "post",
      `/checklist-templates/${template}/versions`,
      { items: rules },
    );
    good(a);
    const b = await global(
      "post",
      `/checklist-templates/${template}/versions`,
      { items: rules },
    );
    good(b);
    good(
      await global(
        "post",
        `/checklist-template-versions/${b.body.id}/publish`,
        { version: 0 },
      ),
    );
    expect(
      (
        await global(
          "post",
          `/checklist-template-versions/${a.body.id}/publish`,
          { version: 0 },
        )
      ).body.code,
    ).toBe("CHECKLIST_VERSION_IMMUTABLE");
    expect((await call("get", "/inspections?status=WRONG")).status).toBe(400);
    expect((await call("get", "/non-conformities?status=WRONG")).status).toBe(
      400,
    );
  });
  it("assigns an organization without requiring a named user and preserves due date", async () => {
    const org = await db.organization.create({
      data: {
        tenantId: tenant,
        legalName: "Correction team",
        organizationType: "CONTRACTOR",
      },
    });
    await db.projectOrganization.create({
      data: {
        tenantId: tenant,
        projectId: project,
        organizationId: org.id,
        relationshipType: "CONTRACTOR",
      },
    });
    const n = await call(
      "post",
      "/non-conformities",
      {
        title: "Organizational responsibility",
        description: "Rework",
        severity: "LOW",
        category: "PROCESS",
        dueDate: "2030-01-01",
      },
      "INSPECTOR",
    );
    good(n);
    const assigned = await act(
      `/non-conformities/${n.body.id}`,
      "assign",
      "INSPECTOR",
      { responsibleOrganizationId: org.id },
    );
    good(assigned);
    expect(assigned.body.responsibleOrganizationId).toBe(org.id);
    expect(assigned.body.dueDate.slice(0, 10)).toBe("2030-01-01");
  });
  it("scales 10000 inspections, 100000 items, 50000 NCR and 100000 actions", async () => {
    const p = await db.project.create({
        data: {
          tenantId: tenant,
          code: "SCALE",
          name: "Quality scale",
          createdBy: users.ADMIN,
          updatedBy: users.ADMIN,
        },
      }),
      pid = p.id,
      actor = users.ADMIN;
    const t = await db.checklistTemplate.create({
      data: {
        tenantId: tenant,
        createdBy: actor,
        name: "Scale",
        code: "SCALE",
      },
    });
    const v = await db.checklistTemplateVersion.create({
      data: {
        tenantId: tenant,
        createdBy: actor,
        checklistTemplateId: t.id,
        versionNumber: 1,
      },
    });
    await db.checklistTemplateItem.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        tenantId: tenant,
        createdBy: actor,
        checklistTemplateVersionId: v.id,
        code: String(i),
        description: "Scale item",
        sortOrder: i,
      })),
    });
    await db.checklistTemplateVersion.update({
      where: { id: v.id },
      data: { status: "PUBLISHED" },
    });
    // Bounded fixture batches avoid a single enormous deferred FK trigger queue.
    const fixtureStart = performance.now();
    for (let start = 1; start <= 10000; start += 500) {
      const end = start + 499;
      await db.$executeRaw`INSERT INTO inspections(id,tenant_id,project_id,created_by,updated_at,inspection_number,code,checklist_template_version_id,title,inspection_date,inspector_id) SELECT gen_random_uuid(),${tenant}::uuid,${pid}::uuid,${actor}::uuid,now(),g,'S-'||g,${v.id}::uuid,'Scale',current_date,${actor}::uuid FROM generate_series(${start}::integer,${end}::integer) g`;
      await db.$executeRaw`INSERT INTO inspection_items(id,tenant_id,project_id,created_by,updated_at,inspection_id,template_item_id,result) SELECT gen_random_uuid(),i.tenant_id,i.project_id,${actor}::uuid,now(),i.id,t.id,'PASS' FROM inspections i CROSS JOIN checklist_template_items t WHERE i.tenant_id=${tenant}::uuid AND i.project_id=${pid}::uuid AND i.inspection_number BETWEEN ${start} AND ${end} AND t.checklist_template_version_id=${v.id}::uuid`;
    }
    for (let start = 1; start <= 50000; start += 1000) {
      const end = start + 999;
      await db.$executeRaw`INSERT INTO non_conformities(id,tenant_id,project_id,created_by,updated_at,ncr_number,code,title,description,severity,category,detected_by,due_date) SELECT gen_random_uuid(),${tenant}::uuid,${pid}::uuid,${actor}::uuid,now(),g,'N-'||g,'Scale','Scale','HIGH','WORKMANSHIP',${actor}::uuid,NULL FROM generate_series(${start}::integer,${end}::integer) g`;
      await db.$executeRaw`INSERT INTO corrective_actions(id,tenant_id,project_id,created_by,updated_at,non_conformity_id,action_number,description) SELECT gen_random_uuid(),n.tenant_id,n.project_id,${actor}::uuid,now(),n.id,g,'Scale correction' FROM non_conformities n CROSS JOIN generate_series(1,2) g WHERE n.tenant_id=${tenant}::uuid AND n.project_id=${pid}::uuid AND n.ncr_number BETWEEN ${start} AND ${end}`;
    }
    console.info("QUALITY_FIXTURE_MS", performance.now() - fixtureStart);
    expect(
      await db.inspectionItem.count({
        where: { tenantId: tenant, projectId: pid },
      }),
    ).toBe(100000);
    expect(
      await db.correctiveAction.count({
        where: { tenantId: tenant, projectId: pid },
      }),
    ).toBe(100000);
    const start = performance.now();
    const summary = await call(
      "get",
      "/quality/summary",
      undefined,
      "ADMIN",
      pid,
    );
    expect(summary.status, summary.text).toBe(200);
    expect(summary.body.inspectionsTotal).toBe(10000);
    expect(summary.body.openNonConformities).toBe(50000);
    const listing = await call(
      "get",
      "/non-conformities?severity=HIGH&limit=30",
      undefined,
      "ADMIN",
      pid,
    );
    expect(listing.body.items).toHaveLength(30);
    expect(listing.body.total).toBe(50000);
    const trends = await call(
      "get",
      "/quality/trends",
      undefined,
      "ADMIN",
      pid,
    );
    expect(trends.status, trends.text).toBe(200);
    const elapsed = performance.now() - start;
    console.info(
      "QUALITY_SCALE",
      JSON.stringify({
        inspections: 10000,
        items: 100000,
        ncr: 50000,
        actions: 100000,
        queryMs: elapsed,
      }),
    );
    expect(elapsed).toBeLessThan(10000);
    // Loading 260,000 relational rows with integrity triggers is fixture setup;
    // the API queries above retain their independent 10-second performance bound.
  }, 600000);
});
