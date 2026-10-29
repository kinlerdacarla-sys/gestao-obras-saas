import { createTestTenant } from "../helpers/tenant.js";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID, createHash } from "node:crypto";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../../apps/api/src/app.js";
import { Database, Cache } from "../../apps/api/src/platform.js";
import { hashPassword } from "../../apps/api/src/auth/crypto.js";
import { seedBudget } from "../../prisma/seed-budget.js";
describe("M5 financial with PostgreSQL and Redis", () => {
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
  let supplier: string,
    contract: string,
    budgetItem: string,
    contractItem: string,
    measurement: string,
    second: string,
    payment: string,
    agreement: string,
    fundingRequest: string,
    disbursement: string,
    release: string;
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
  const mv = async (id = measurement) =>
    (await call("get", `/measurements/${id}`)).body.version as number;
  const act = async (
    action: string,
    auth = cookie,
    id = measurement,
    reason?: string,
  ) =>
    call(
      "post",
      `/measurements/${id}/${action}`,
      { version: await mv(id), ...(reason ? { reason } : {}) },
      auth,
    ).set("Idempotency-Key", randomUUID());
  const pay = (amount: string, key = randomUUID()) =>
    call("post", "/payments", {
      supplierId: supplier,
      measurementId: measurement,
      amount,
      paymentDate: date,
      method: "BANK_TRANSFER",
    }).set("Idempotency-Key", key);
  afterAll(async () => {
    await app?.close();
  });
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("test"))
      throw new Error("Test DB required");
    app = await createApp();
    await app.init();
    db = app.get(Database);
    server = app.getHttpServer() as Server;
    await app.get(Cache).del("auth:ip:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
    tenant = (
      await createTestTenant(db, { data: { name: "M3", slug: `m5-${suffix}` } })
    ).id;
    foreign = (
      await createTestTenant(db, {
        data: { name: "M3 foreign", slug: `m5-b-${suffix}` },
      })
    ).id;
    const user = await db.user.create({
      data: {
        name: "M3 Admin",
        email: `m5-admin-${suffix}@example.test`,
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
          tenantSlug: `m5-${suffix}`,
          email,
          password: "Execution!2026",
        });
      expect(res.status, res.text).toBe(200);
      return res.headers["set-cookie"] as unknown as string[];
    }
    cookie = await login(user.email);
    await seedBudget(db, tenant, project, adminId);
    budgetItem = (
      await db.budgetItem.findFirstOrThrow({
        where: { projectId: project, itemType: "ITEM" },
      })
    ).id;
    for (const role of [
      "MANAGER",
      "CLIENT",
      "INSPECTOR",
      "FINANCIER",
    ] as const) {
      const u = await db.user.create({
        data: {
          name: role,
          email: `m5-${role.toLowerCase()}-${suffix}@example.test`,
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

  it("creates an active contract and financial terms", async () => {
    const sup = await db.supplier.create({
      data: {
        tenantId: tenant,
        legalName: "M5 Supplier",
        supplierType: "SUBCONTRACTOR",
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    supplier = sup.id;
    const c = await db.contract.create({
      data: {
        tenantId: tenant,
        projectId: project,
        supplierId: supplier,
        contractNumber: "M5",
        title: "M5",
        contractType: "SUBCONTRACT",
        originalValue: "1000000",
        currentValue: "1000000",
        retentionPercentage: "5",
        advanceAmount: "100000",
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    contract = c.id;
    contractItem = (
      await db.contractItem.create({
        data: {
          tenantId: tenant,
          projectId: project,
          contractId: contract,
          budgetItemId: budgetItem,
          description: "Trabalhos",
          quantity: "100",
          unitPrice: "10000",
          totalValue: "1000000",
          createdBy: adminId,
          updatedBy: adminId,
        },
      })
    ).id;
    await db.contract.update({
      where: { id: contract },
      data: { status: "ACTIVE" },
    });
    const r = await call("patch", `/contracts/${contract}/financial-settings`, {
      version: 0,
      advanceRecoveryMethod: "PERCENTAGE",
      advanceRecoveryPercentage: "10",
      finalApprovalRole: "FINANCIER",
    });
    expect(r.status, r.text).toBe(200);
    const invalid = await call(
      "patch",
      `/contracts/${contract}/financial-settings`,
      {
        version: r.body.version,
        advanceRecoveryMethod: "MANUAL",
        advanceRecoveryPercentage: "101",
        finalApprovalRole: "FINANCIER",
      },
    );
    expect(invalid.status, invalid.text).toBe(400);
  });
  it("manager creates and measures 20 units", async () => {
    const r = await call(
      "post",
      "/measurements",
      { contractId: contract, periodStart: date, periodEnd: date },
      manager,
    );
    expect(r.status, r.text).toBe(201);
    measurement = r.body.id;
    expect(r.body.code).toBe("MED-001");
    const item = await call(
      "post",
      `/measurements/${measurement}/items`,
      { version: 0, contractItemId: contractItem, currentQuantity: "20" },
      manager,
    );
    expect(item.status, item.text).toBe(201);
    expect(item.body.grossAmount).toBe("200000");
    expect(item.body.netCertifiedAmount).toBe("170000");
  });
  it("rejects stale versions", async () => {
    const r = await call(
      "patch",
      `/measurements/${measurement}`,
      { version: 0, description: "stale" },
      manager,
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("RESOURCE_VERSION_CONFLICT");
  });
  it("enforces role and tenant isolation", async () => {
    expect(
      (
        await call(
          "post",
          "/measurements",
          { contractId: contract, periodStart: date, periodEnd: date },
          client,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "get",
          `/measurements/${measurement}`,
          undefined,
          cookie,
          other,
        )
      ).status,
    ).toBe(404);
    expect((await call("get", `/measurements/${randomUUID()}`)).status).toBe(
      404,
    );
  });
  it("requires fiscal then final approval", async () => {
    expect((await act("approve", financier)).status).toBe(409);
    expect((await act("submit", manager)).status).toBe(201);
    expect((await act("fiscal-approve", manager)).status).toBe(403);
    expect((await act("fiscal-approve", inspector)).status).toBe(201);
    expect((await act("approve", client)).status).toBe(403);
    expect((await act("approve", financier)).status).toBe(201);
  });
  it("certifies atomically and retries idempotently", async () => {
    const key = randomUUID(),
      body = { version: await mv() };
    const r = await call(
      "post",
      `/measurements/${measurement}/certify`,
      body,
    ).set("Idempotency-Key", key);
    expect(r.status, r.text).toBe(201);
    const again = await call(
      "post",
      `/measurements/${measurement}/certify`,
      body,
    ).set("Idempotency-Key", key);
    expect(again.body).toEqual(r.body);
    const conflict = await call(
      "post",
      `/measurements/${measurement}/certify`,
      { version: body.version + 1 },
    ).set("Idempotency-Key", key);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");
    const b = await call("get", `/contracts/${contract}/retention`);
    expect(b.body.retentionAvailable).toBe("10000.00");
    expect(b.body.advanceOutstanding).toBe("80000.00");
  });
  it("freezes certification in API and database", async () => {
    expect(
      (
        await call(
          "patch",
          `/measurements/${measurement}`,
          { version: await mv(), description: "tamper" },
          manager,
        )
      ).body.code,
    ).toBe("MEASUREMENT_IMMUTABLE");
    await expect(
      db.measurement.update({
        where: { id: measurement },
        data: { grossAmount: "200001", netCertifiedAmount: "170001" },
      }),
    ).rejects.toThrow();
  });
  it("posts a partial payment exactly once under concurrency", async () => {
    const key = randomUUID();
    const results = await Promise.all([pay("100000", key), pay("100000", key)]);
    expect(results.map((x) => x.status)).toEqual([201, 201]);
    expect(results[0].body.id).toBe(results[1].body.id);
    payment = results[0].body.id;
    const m = await call("get", `/measurements/${measurement}`);
    expect(m.body.status).toBe("PARTIALLY_PAID");
    expect(m.body.outstandingPayable).toBe("70000.00");
  });
  it("rejects overpayment and invalid origin", async () => {
    expect((await pay("70000.01")).body.code).toBe(
      "PAYMENT_EXCEEDS_OUTSTANDING",
    );
    const r = await call("post", "/payments", {
      supplierId: supplier,
      amount: "1",
      paymentDate: date,
      method: "CASH",
    }).set("Idempotency-Key", randomUUID());
    expect(r.body.code).toBe("INVALID_PAYMENT_SOURCE");
  });
  it("posts full payment and preserves reversal history", async () => {
    expect((await pay("70000")).status).toBe(201);
    expect(
      (await call("get", `/measurements/${measurement}`)).body.status,
    ).toBe("PAID");
    const r = await call("post", `/payments/${payment}/reverse`, {
      version: 0,
      reason: "Correção do comprovativo",
    }).set("Idempotency-Key", randomUUID());
    expect(r.status, r.text).toBe(201);
    expect(
      (await call("get", `/measurements/${measurement}`)).body.status,
    ).toBe("PARTIALLY_PAID");
    expect(
      await db.paymentReversal.count({ where: { paymentId: payment } }),
    ).toBe(1);
  });
  it("calculates second measurement from prior valid quantities", async () => {
    const r = await call(
      "post",
      "/measurements",
      { contractId: contract, periodStart: date, periodEnd: date },
      manager,
    );
    second = r.body.id;
    const add = await call(
      "post",
      `/measurements/${second}/items`,
      { version: 0, contractItemId: contractItem, currentQuantity: "30" },
      manager,
    );
    expect(add.status, add.text).toBe(201);
    const rows = (await call("get", `/measurements/${second}/items`)).body
      .items;
    expect(rows[0].previousQuantity).toBe("20");
    expect(rows[0].cumulativeQuantity).toBe("50");
    expect(rows[0].cumulativeAmount).toBe("500000");
    const bad = await call(
      "patch",
      `/measurements/${second}/items/${rows[0].id}`,
      {
        version: await mv(second),
        contractItemId: contractItem,
        currentQuantity: "81",
      },
      manager,
    );
    expect(bad.body.code).toBe("MEASUREMENT_QUANTITY_EXCEEDS_CONTRACT");
  });
  it("records fiscal rejection and resubmission history", async () => {
    expect((await act("submit", manager, second)).status).toBe(201);
    expect(
      (await act("fiscal-reject", inspector, second, "Corrigir quantidades"))
        .status,
    ).toBe(201);
    expect((await act("reopen", manager, second)).status).toBe(201);
    expect((await act("submit", manager, second)).status).toBe(201);
    expect((await act("fiscal-approve", inspector, second)).status).toBe(201);
    expect((await act("approve", financier, second)).status).toBe(201);
    expect((await act("certify", cookie, second)).status).toBe(201);
    expect(
      (await call("get", `/measurements/${second}`)).body.reviews.length,
    ).toBe(3);
  });
  it("reverses measurement with compensating ledgers", async () => {
    const r = await act("reverse", cookie, second, "Certificação anulada");
    expect(r.status, r.text).toBe(201);
    const b = (await call("get", `/contracts/${contract}/retention`)).body;
    expect(b.retentionAvailable).toBe("10000.00");
    expect(b.advanceOutstanding).toBe("80000.00");
  });
  it("reserves retention upon independent approval", async () => {
    const r = await call(
      "post",
      `/contracts/${contract}/retention-releases`,
      { amount: "5000", reason: "Receção parcial" },
      manager,
    );
    expect(r.status, r.text).toBe(201);
    release = r.body.id;
    expect(
      (
        await call(
          "post",
          `/retention-releases/${release}/submit`,
          { version: 0 },
          manager,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "post",
          `/retention-releases/${release}/approve`,
          { version: 1 },
          financier,
        )
      ).status,
    ).toBe(201);
    expect(
      (await call("get", `/contracts/${contract}/retention`)).body
        .retentionAvailable,
    ).toBe("5000.00");
    const paid = await call("post", "/payments", {
      supplierId: supplier,
      retentionReleaseId: release,
      amount: "5000",
      paymentDate: date,
      method: "BANK_TRANSFER",
    }).set("Idempotency-Key", randomUUID());
    expect(paid.status, paid.text).toBe(201);
    expect(
      (await db.retentionRelease.findUniqueOrThrow({ where: { id: release } }))
        .status,
    ).toBe("PAID");
  });
  it("creates funding and a request", async () => {
    const org = await db.organization.create({
      data: {
        tenantId: tenant,
        legalName: "M5 Fund",
        organizationType: "FINANCIER",
      },
    });
    const r = await call("post", "/funding-agreements", {
      financierOrganizationId: org.id,
      agreementNumber: "FIN-001",
      title: "Financiamento",
      approvedAmount: "15000000",
      startDate: date,
      status: "ACTIVE",
    });
    expect(r.status, r.text).toBe(201);
    agreement = r.body.id;
    const req = await call(
      "post",
      "/disbursement-requests",
      {
        fundingAgreementId: agreement,
        measurementId: measurement,
        requestedAmount: "2000000",
      },
      manager,
    );
    expect(req.status, req.text).toBe(201);
    fundingRequest = req.body.id;
  });
  it("approves request and checks funding limit", async () => {
    expect(
      (
        await call(
          "post",
          `/disbursement-requests/${fundingRequest}/submit`,
          { version: 0 },
          manager,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "post",
          `/disbursement-requests/${fundingRequest}/approve`,
          { version: 1 },
          financier,
        )
      ).status,
    ).toBe(201);
    const r = await call("patch", `/funding-agreements/${agreement}`, {
      version: 0,
      approvedAmount: "1000000",
    });
    expect(r.body.code).toBe("FUNDING_LIMIT_EXCEEDED");
  });
  it("posts partial and full disbursements without creating payments", async () => {
    const before = await db.payment.count({ where: { projectId: project } });
    const r = await call(
      "post",
      `/disbursement-requests/${fundingRequest}/disbursements`,
      { version: 2, amount: "500000", disbursementDate: date },
      financier,
    ).set("Idempotency-Key", randomUUID());
    expect(r.status, r.text).toBe(201);
    disbursement = r.body.id;
    const full = await call(
      "post",
      `/disbursement-requests/${fundingRequest}/disbursements`,
      { version: 3, amount: "1500000", disbursementDate: date },
      financier,
    ).set("Idempotency-Key", randomUUID());
    expect(full.status, full.text).toBe(201);
    expect(
      (await call("get", `/funding-agreements/${agreement}`)).body
        .fundingBalance,
    ).toBe("13000000.00");
    expect(await db.payment.count({ where: { projectId: project } })).toBe(
      before,
    );
  });
  it("reverses disbursement and updates balance", async () => {
    const r = await call("post", `/disbursements/${disbursement}/reverse`, {
      version: 0,
      reason: "Referência incorreta",
    }).set("Idempotency-Key", randomUUID());
    expect(r.status, r.text).toBe(201);
    expect(
      (await call("get", `/funding-agreements/${agreement}`)).body
        .fundingBalance,
    ).toBe("13500000.00");
  });
  it("summarizes ledger and financial curve consistently", async () => {
    const r = await call("get", "/financial/summary");
    expect(r.status, r.text).toBe(200);
    expect(r.body.certified).toBe("200000.00");
    expect(r.body.netCertified).toBe("170000.00");
    expect(r.body.paid).toBe("70000.00");
    expect(r.body.disbursed).toBe("1500000.00");
    expect(r.body.advanceOutstanding).toBe("80000.00");
    expect((await call("get", "/financial/curve")).status).toBe(200);
    const spec = await request(server).get("/api/docs-json");
    expect(spec.status).toBe(200);
    expect(
      spec.body.paths[
        "/api/v1/projects/{projectId}/measurements/{id}/certify"
      ].post.parameters.some(
        (x: { name: string; required: boolean }) =>
          x.name === "Idempotency-Key" && x.required,
      ),
    ).toBe(true);
    expect(
      spec.body.paths["/api/v1/projects/{projectId}/financial/summary"].get
        .responses["200"].content["application/json"].schema.properties
        .netCertified.type,
    ).toBe("string");
  });
  it("keeps audit events for all financial writes", async () => {
    const events = await db.auditLog.findMany({
      where: { tenantId: tenant, projectId: project },
      select: { action: true },
    });
    for (const action of [
      "MEASUREMENT_CREATED",
      "MEASUREMENT_CERTIFIED",
      "MEASUREMENT_FISCAL_APPROVED",
      "MEASUREMENT_FISCAL_REJECTED",
      "MEASUREMENT_REVERSED",
      "PAYMENT_POSTED",
      "PAYMENT_REVERSED",
      "DISBURSEMENT_POSTED",
      "RETENTION_RELEASE_APPROVED",
    ])
      expect(events.map((x) => x.action)).toContain(action);
  });

  it("blocks self approval even for an administrator", async () => {
    const r = await call("post", "/measurements", {
      contractId: contract,
      periodStart: date,
      periodEnd: date,
    });
    const id = r.body.id;
    await call("post", `/measurements/${id}/items`, {
      version: 0,
      contractItemId: contractItem,
      currentQuantity: "1",
    });
    await act("submit", cookie, id);
    expect((await act("fiscal-approve", cookie, id)).body.code).toBe(
      "SELF_APPROVAL_NOT_ALLOWED",
    );
    await act("fiscal-approve", inspector, id);
    expect((await act("approve", cookie, id)).body.code).toBe(
      "SELF_APPROVAL_NOT_ALLOWED",
    );
    await act("approve", financier, id);
    expect((await act("certify", cookie, id)).body.code).toBe(
      "SELF_APPROVAL_NOT_ALLOWED",
    );
  });
  it("protects remaining payment balance under competing requests", async () => {
    const results = await Promise.all([pay("100000"), pay("100000")]);
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(
      (await call("get", `/measurements/${measurement}`)).body.status,
    ).toBe("PAID");
  });
  it("reuses private document tickets and blocks unauthorized access", async () => {
    const m = await call(
      "post",
      "/measurements",
      { contractId: contract, periodStart: date, periodEnd: date },
      manager,
    );
    const id = m.body.id,
      bytes = Buffer.from("%PDF-1.4 financial test"),
      body = {
        version: 0,
        fileName: "medicao.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        documentType: "MEASUREMENT_SHEET",
      };
    const ticket = await call(
      "post",
      `/measurements/${id}/documents`,
      body,
      manager,
    );
    expect(ticket.status, ticket.text).toBe(201);
    const upload = await request(server)
      .put(ticket.body.uploadUrl)
      .set("Origin", origin)
      .set("Cookie", manager)
      .attach("file", bytes, {
        filename: "medicao.pdf",
        contentType: "application/pdf",
      });
    expect(upload.status, upload.text).toBe(200);
    const confirmed = await call(
      "post",
      `/measurements/${id}/documents/${ticket.body.id}/confirm`,
      { version: ticket.body.version },
      manager,
    );
    expect(confirmed.status, confirmed.text).toBe(201);
    expect(
      (
        await call(
          "get",
          `/measurements/${id}/documents/${ticket.body.id}/content`,
          undefined,
          inspector,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "get",
          `/measurements/${id}/documents`,
          undefined,
          cookie,
          other,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "post",
          `/measurements/${id}/documents`,
          { ...body, version: 2 },
          client,
        )
      ).status,
    ).toBe(403);
  });
  it("prevents canceling funding already committed", async () => {
    const current = (await call("get", `/funding-agreements/${agreement}`))
      .body;
    const result = await call("patch", `/funding-agreements/${agreement}`, {
      version: current.version,
      status: "CANCELLED",
    });
    expect(result.body.code).toBe("INVALID_DISBURSEMENT_TRANSITION");
    const stale = await call("patch", `/funding-agreements/${agreement}`, {
      version: current.version + 1,
      title: "stale",
    });
    expect(stale.body.code).toBe("RESOURCE_VERSION_CONFLICT");
  });
  it("rejects conflicting retention releases under concurrency", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const result = await call(
        "post",
        `/contracts/${contract}/retention-releases`,
        { amount: "4000", reason: "Receção concorrente" },
        manager,
      );
      expect(result.status, result.text).toBe(201);
      ids.push(result.body.id);
      await call(
        "post",
        `/retention-releases/${result.body.id}/submit`,
        { version: 0 },
        manager,
      );
    }
    const results = await Promise.all(
      ids.map((id) =>
        call(
          "post",
          `/retention-releases/${id}/approve`,
          { version: 1 },
          financier,
        ),
      ),
    );
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(results.find((x) => x.status === 409)?.body.code).toBe(
      "RETENTION_EXCEEDS_AVAILABLE_BALANCE",
    );
  });
  it("requires idempotency on payments and rejects cross-project sources", async () => {
    const body = {
      supplierId: supplier,
      measurementId: measurement,
      amount: "1",
      paymentDate: date,
      method: "CASH",
    };
    expect((await call("post", "/payments", body)).body.code).toBe(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    const result = await call("post", "/payments", body, cookie, other).set(
      "Idempotency-Key",
      randomUUID(),
    );
    expect(result.status).toBe(404);
    expect((await call("get", "/payments", undefined, inspector)).status).toBe(
      403,
    );
  });
  it("paginates and aggregates 5000 measurements, 100000 items, 50000 payments and 10000 disbursements", async () => {
    const scope = { tenantId: tenant, projectId: project },
      stamp = { createdBy: adminId, updatedBy: adminId };
    const bulk = await db.contract.create({
      data: {
        ...scope,
        ...stamp,
        supplierId: supplier,
        contractNumber: "PERF-M5",
        title: "Performance",
        contractType: "SUBCONTRACT",
        originalValue: "100000000",
        currentValue: "100000000",
      },
    });
    const contractIds = Array.from({ length: 20 }, () => randomUUID());
    await db.contractItem.createMany({
      data: contractIds.map((id, i) => ({
        ...scope,
        ...stamp,
        id,
        contractId: bulk.id,
        description: `Perf ${i}`,
        quantity: "100000",
        unitPrice: "1",
        totalValue: "100000",
      })),
    });
    await db.contract.update({
      where: { id: bulk.id },
      data: { status: "ACTIVE" },
    });
    const measurements = Array.from({ length: 5000 }, () => randomUUID());
    for (let offset = 0; offset < 5000; offset += 250) {
      await db.measurement.createMany({
        data: measurements.slice(offset, offset + 250).map((id, i) => ({
          ...scope,
          ...stamp,
          id,
          contractId: bulk.id,
          measurementNumber: offset + i + 1,
          code: `PERF-${offset + i + 1}`,
          periodStart: new Date(date),
          periodEnd: new Date(date),
          grossAmount: "20",
          netCertifiedAmount: "20",
        })),
      });
      await db.measurementItem.createMany({
        data: measurements
          .slice(offset, offset + 250)
          .flatMap((measurementId) =>
            contractIds.map((contractItemId) => ({
              ...scope,
              ...stamp,
              measurementId,
              contractItemId,
              description: "Perf",
              contractQuantity: "100000",
              previousQuantity: "0",
              currentQuantity: "1",
              cumulativeQuantity: "1",
              unitPrice: "1",
              previousAmount: "0",
              currentAmount: "1",
              cumulativeAmount: "1",
            })),
          ),
      });
    }
    await db.measurement.updateMany({
      where: { ...scope, contractId: bulk.id },
      data: { status: "PAID", certifiedAt: new Date() },
    });
    const max =
      (
        await db.payment.aggregate({
          where: scope,
          _max: { paymentNumber: true },
        })
      )._max.paymentNumber ?? 0;
    for (let offset = 0; offset < 50000; offset += 1000)
      await db.payment.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          ...scope,
          ...stamp,
          supplierId: supplier,
          contractId: bulk.id,
          measurementId: measurements[Math.floor((offset + i) / 10)],
          paymentNumber: max + offset + i + 1,
          amount: "2",
          paymentDate: new Date(date),
          method: "CASH" as const,
        })),
      });
    for (let offset = 0; offset < 10000; offset += 1000)
      await db.disbursement.createMany({
        data: Array.from({ length: 1000 }, () => ({
          ...scope,
          ...stamp,
          fundingAgreementId: agreement,
          disbursementRequestId: fundingRequest,
          amount: "1",
          disbursementDate: new Date(date),
        })),
      });
    const start = performance.now();
    const [m, payments, summary] = await Promise.all([
      call("get", "/measurements?page=2&limit=50"),
      call("get", "/payments?page=2&limit=50"),
      call("get", "/financial/summary"),
    ]);
    expect(m.status, m.text).toBe(200);
    expect(m.body.items).toHaveLength(50);
    expect(payments.body.items).toHaveLength(50);
    expect(summary.status, summary.text).toBe(200);
    const queryMs = performance.now() - start;
    console.info(
      "FINANCIAL_PERFORMANCE",
      JSON.stringify({
        measurements: 5000,
        items: 100000,
        payments: 50000,
        disbursements: 10000,
        queryMs,
      }),
    );
    expect(queryMs).toBeLessThan(10000);
  }, 120000);
});
