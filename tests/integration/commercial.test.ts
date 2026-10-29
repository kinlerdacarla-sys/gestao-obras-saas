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
describe("M4 commercial with PostgreSQL and Redis", () => {
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
    center: string,
    expense: string,
    budgetItem: string,
    addition: string,
    omission: string,
    document: string;
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
  const cv = async () =>
    (await call("get", `/contracts/${contract}`)).body.version as number;
  const ev = async () =>
    (await call("get", `/expenses/${expense}`)).body.version as number;
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
      await createTestTenant(db, { data: { name: "M3", slug: `m4-${suffix}` } })
    ).id;
    foreign = (
      await createTestTenant(db, {
        data: { name: "M3 foreign", slug: `m4-b-${suffix}` },
      })
    ).id;
    const user = await db.user.create({
      data: {
        name: "M3 Admin",
        email: `m4-admin-${suffix}@example.test`,
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
          tenantSlug: `m4-${suffix}`,
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
          email: `m4-${role.toLowerCase()}-${suffix}@example.test`,
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
  it("creates supplier and reuses equivalent organization", async () => {
    const org = await db.organization.create({
      data: {
        tenantId: tenant,
        legalName: "Commercial supplier",
        taxNumber: suffix,
        organizationType: "SUBCONTRACTOR",
      },
    });
    const r = await request(server)
      .post("/api/v1/suppliers")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({
        supplierType: "SUBCONTRACTOR",
        legalName: "Alias",
        taxNumber: suffix,
      });
    expect(r.status, r.text).toBe(201);
    supplier = r.body.id;
    expect(r.body.organizationId).toBe(org.id);
    expect(r.body.legalName).toBe(org.legalName);
    expect(
      (
        await request(server)
          .post("/api/v1/suppliers")
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({
            supplierType: "SUPPLIER",
            legalName: "Duplicate",
            organizationId: org.id,
          })
      ).status,
    ).toBe(409);
  });
  it("manager creates contract with server calculated advance", async () => {
    const r = await call(
      "post",
      "/contracts",
      {
        supplierId: supplier,
        contractNumber: "SUB-001",
        title: "Fundações",
        contractType: "SUBCONTRACT",
        originalValue: "10000000",
        retentionPercentage: "5",
        advancePercentage: "10",
      },
      manager,
    );
    expect(r.status, r.text).toBe(201);
    contract = r.body.id;
    expect(r.body.advanceAmount).toBe("1000000");
    expect(r.body.originalValue).toBe(r.body.currentValue);
  });
  it("rejects frontend current value and original value overwrite", async () => {
    expect(
      (
        await call("patch", `/contracts/${contract}`, {
          version: await cv(),
          currentValue: "1",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("patch", `/contracts/${contract}`, {
          version: await cv(),
          originalValue: "1",
        })
      ).status,
    ).toBe(400);
  });
  it("adds budget linked item and recalculates total", async () => {
    const r = await call(
      "post",
      `/contracts/${contract}/items`,
      {
        version: await cv(),
        budgetItemId: budgetItem,
        description: "Fundações",
        quantity: "100",
        unitPrice: "100000",
        totalValue: "1",
      },
      manager,
    );
    expect(r.status, r.text).toBe(201);
    expect(r.body.totalValue).toBe("10000000");
  });
  it("rejects foreign budget item and rolls back version", async () => {
    await seedBudget(db, foreign, other, adminId);
    const item = await db.budgetItem.findFirstOrThrow({
      where: { projectId: other, itemType: "ITEM" },
    });
    const version = await cv();
    expect(
      (
        await call("post", `/contracts/${contract}/items`, {
          version,
          description: "Foreign",
          totalValue: "1",
          budgetItemId: item.id,
        })
      ).status,
    ).toBe(400);
    expect(await cv()).toBe(version);
  });
  it("activates contract and protects structure", async () => {
    expect(
      (
        await call("post", `/contracts/${contract}/activate`, {
          version: await cv(),
        })
      ).status,
    ).toBe(201);
    const r = await call("patch", `/contracts/${contract}`, {
      version: await cv(),
      title: "No",
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("CONTRACT_IMMUTABLE");
    await expect(
      db.contract.update({
        where: { id: contract },
        data: { originalValue: "1" },
      }),
    ).rejects.toThrow();
    await expect(
      db.contract.delete({ where: { id: contract } }),
    ).rejects.toThrow();
  });
  it("creates addition and omission drafts without changing current", async () => {
    for (const [type, value] of [
      ["ADDITION", "1500000"],
      ["OMISSION", "300000"],
    ]) {
      const r = await call(
        "post",
        `/contracts/${contract}/amendments`,
        { amendmentType: type, description: type, amount: value },
        manager,
      );
      expect(r.status, r.text).toBe(201);
      if (type === "ADDITION") addition = r.body.id;
      else omission = r.body.id;
    }
    expect(
      (await call("get", `/contracts/${contract}`)).body.currentValue,
    ).toBe("10000000");
  });
  it("submits and approves amendments; computes 11200000", async () => {
    for (const id of [addition, omission]) {
      expect(
        (
          await call(
            "post",
            `/contracts/${contract}/amendments/${id}/submit`,
            { version: 0 },
            manager,
          )
        ).status,
      ).toBe(201);
      expect(
        (
          await call(
            "post",
            `/contracts/${contract}/amendments/${id}/approve`,
            { version: 1 },
          )
        ).status,
      ).toBe(201);
    }
    const r = await call("get", `/contracts/${contract}`);
    expect(r.body.currentValue).toBe("11200000");
    expect(r.body.approvedAdditions).toBe("1500000.00");
    expect(r.body.approvedOmissions).toBe("300000.00");
    expect(r.body.advanceAmount).toBe("1000000");
  });
  it("protects approved amendment API and SQL", async () => {
    const r = await call(
      "patch",
      `/contracts/${contract}/amendments/${addition}`,
      { version: 2, amount: "1" },
    );
    expect(r.status).toBe(409);
    await expect(
      db.contractAmendment.update({
        where: { id: addition },
        data: { amount: "1" },
      }),
    ).rejects.toThrow();
  });
  it("rejects negative resulting contract value atomically", async () => {
    const a = await call(
      "post",
      `/contracts/${contract}/amendments`,
      {
        amendmentType: "OMISSION",
        description: "Too much",
        amount: "20000000",
      },
      manager,
    );
    await call(
      "post",
      `/contracts/${contract}/amendments/${a.body.id}/submit`,
      { version: 0 },
      manager,
    );
    expect(
      (
        await call(
          "post",
          `/contracts/${contract}/amendments/${a.body.id}/approve`,
          { version: 1 },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await db.contractAmendment.findUniqueOrThrow({
          where: { id: a.body.id },
        })
      ).status,
    ).toBe("SUBMITTED");
  });
  it("prevents self approval including admin", async () => {
    const a = await call("post", `/contracts/${contract}/amendments`, {
      amendmentType: "TIME_EXTENSION",
      description: "Prazo",
      amount: "0",
    });
    await call(
      "post",
      `/contracts/${contract}/amendments/${a.body.id}/submit`,
      { version: 0 },
    );
    const r = await call(
      "post",
      `/contracts/${contract}/amendments/${a.body.id}/approve`,
      { version: 1 },
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("SELF_APPROVAL_NOT_ALLOWED");
  });
  it("manager creates center hierarchy and rejects cycles", async () => {
    const a = await call(
      "post",
      "/cost-centers",
      { code: "01", name: "Administração" },
      manager,
    );
    expect(a.status, a.text).toBe(201);
    center = a.body.id;
    const b = await call(
      "post",
      "/cost-centers",
      { code: "01.01", name: "Água", parentId: center },
      manager,
    );
    expect(b.status).toBe(201);
    expect(
      (
        await call(
          "patch",
          `/cost-centers/${center}`,
          { version: 0, parentId: b.body.id },
          manager,
        )
      ).status,
    ).toBe(400);
  });
  it("manager creates expense with backend total", async () => {
    const r = await call(
      "post",
      "/expenses",
      {
        expenseNumber: "E-001",
        costCenterId: center,
        contractId: contract,
        budgetItemId: budgetItem,
        expenseDate: date,
        description: "Invoice",
        subtotal: "100000",
        taxAmount: "16000",
      },
      manager,
    );
    expect(r.status, r.text).toBe(201);
    expense = r.body.id;
    expect(r.body.totalAmount).toBe("116000");
    expect(r.body.supplierId).toBe(supplier);
  });
  it("reuses signed document upload and confirms receipt", async () => {
    const bytes = Buffer.from("%PDF-1.4\nM4 receipt\n%%EOF");
    const ticket = await call(
      "post",
      `/expenses/${expense}/documents`,
      {
        version: await ev(),
        fileName: "receipt.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        documentType: "RECEIPT",
      },
      manager,
    );
    expect(ticket.status, ticket.text).toBe(201);
    document = ticket.body.id;
    const upload = await request(server)
      .put(ticket.body.uploadUrl)
      .set("Origin", origin)
      .set("Cookie", manager)
      .attach("file", bytes, {
        filename: "receipt.pdf",
        contentType: "application/pdf",
      });
    expect(upload.status, upload.text).toBe(200);
    const confirm = await call(
      "post",
      `/expenses/${expense}/documents/${document}/confirm`,
      { version: await ev() },
      manager,
    );
    expect(confirm.status, confirm.text).toBe(201);
    expect(
      (
        await call(
          "get",
          `/expenses/${expense}/documents/${document}/content`,
          undefined,
          manager,
        )
      ).status,
    ).toBe(200);
    expect(
      await db.expenseDocument.count({
        where: { expenseId: expense, documentType: "RECEIPT" },
      }),
    ).toBe(1);
  });
  it("only one concurrent expense edit succeeds", async () => {
    const version = await ev();
    const responses = await Promise.all([
      call(
        "patch",
        `/expenses/${expense}`,
        { version, description: "One" },
        manager,
      ),
      call(
        "patch",
        `/expenses/${expense}`,
        { version, description: "Two" },
        manager,
      ),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 409]);
  });
  it("submits and approves expense", async () => {
    expect(
      (
        await call(
          "post",
          `/expenses/${expense}/submit`,
          { version: await ev() },
          manager,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call("post", `/expenses/${expense}/approve`, {
          version: await ev(),
        })
      ).status,
    ).toBe(201);
  });
  it("approved expense immutable including database", async () => {
    expect(
      (
        await call("patch", `/expenses/${expense}`, {
          version: await ev(),
          subtotal: "1",
        })
      ).status,
    ).toBe(409);
    await expect(
      db.expense.update({
        where: { id: expense },
        data: { description: "No" },
      }),
    ).rejects.toThrow();
    await expect(
      db.expense.delete({ where: { id: expense } }),
    ).rejects.toThrow();
  });
  it("dashboard avoids double counting and warns overcontracting", async () => {
    const r = await call("get", "/costs/summary");
    expect(r.status, r.text).toBe(200);
    expect(r.body.currentContracted).toBe("11200000.00");
    expect(r.body.approvedExpenses).toBe("116000.00");
    expect(r.body.approvedDirectExpenses).toBe("0.00");
    expect(r.body.remainingBudget).toBe("-9875000.00");
    const items = await call("get", "/costs/items");
    expect(
      items.body.items.find(
        (x: { budgetItemId: string }) => x.budgetItemId === budgetItem,
      ).warnings,
    ).toContain("BUDGET_ITEM_OVERCONTRACTED");
  });
  it("counts approved direct expenses without requiring budget item", async () => {
    const e = await call(
      "post",
      "/expenses",
      {
        expenseNumber: "DIRECT",
        costCenterId: center,
        expenseDate: date,
        description: "Água",
        subtotal: "1000",
      },
      manager,
    );
    expect(e.status, e.text).toBe(201);
    await call(
      "post",
      `/expenses/${e.body.id}/submit`,
      { version: 0 },
      manager,
    );
    await call("post", `/expenses/${e.body.id}/approve`, { version: 1 });
    const r = await call("get", "/costs/summary");
    expect(r.body.approvedDirectExpenses).toBe("1000.00");
    expect(r.body.remainingBudget).toBe("-9876000.00");
  });
  it("reverses expense preserving history and document", async () => {
    const r = await call("post", `/expenses/${expense}/reverse`, {
      version: await ev(),
      reason: "Documento duplicado",
    });
    expect(r.status, r.text).toBe(201);
    expect(r.body.status).toBe("REVERSED");
    expect(
      await db.expenseReversal.count({ where: { expenseId: expense } }),
    ).toBe(1);
    expect((await call("get", "/costs/summary")).body.approvedExpenses).toBe(
      "1000.00",
    );
    expect(
      (await call("get", `/expenses/${expense}/documents/${document}/content`))
        .status,
    ).toBe(200);
    expect(
      (await call("get", `/expenses/${expense}/history`)).body.items.some(
        (x: { action: string }) => x.action === "EXPENSE_REVERSED",
      ),
    ).toBe(true);
  });
  it("enforces role policies", async () => {
    expect(
      (await call("get", `/contracts/${contract}`, undefined, financier))
        .status,
    ).toBe(200);
    expect(
      (
        await call(
          "patch",
          `/contracts/${contract}`,
          { version: await cv(), title: "No" },
          financier,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "post",
          "/expenses",
          {
            expenseNumber: "NO",
            costCenterId: center,
            expenseDate: date,
            description: "No",
            subtotal: "1",
          },
          client,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "post",
          `/contracts/${contract}/amendments/${addition}/approve`,
          { version: 2 },
          inspector,
        )
      ).status,
    ).toBe(403);
    expect((await call("get", "/expenses", undefined, inspector)).status).toBe(
      403,
    );
    expect(
      (await call("get", "/costs/summary", undefined, financier)).status,
    ).toBe(200);
    const a = await call(
      "get",
      `/contracts/${contract}/amendments`,
      undefined,
      financier,
    );
    expect(
      a.body.items.every((x: { status: string }) => x.status === "APPROVED"),
    ).toBe(true);
  });
  it("isolates routes and foreign associations", async () => {
    const foreignCenter = await db.costCenter.create({
      data: {
        tenantId: foreign,
        projectId: other,
        code: "X",
        name: "Foreign",
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    expect(
      (
        await call(
          "post",
          "/expenses",
          {
            expenseNumber: "X",
            costCenterId: foreignCenter.id,
            expenseDate: date,
            description: "No",
            subtotal: "1",
          },
          manager,
        )
      ).status,
    ).toBe(404);
    for (const path of [
      `/contracts/${contract}`,
      `/expenses/${expense}`,
      `/expenses/${expense}/documents/${document}/content`,
    ])
      expect((await call("get", path, undefined, cookie, other)).status).toBe(
        404,
      );
    const fs = await db.supplier.create({
      data: {
        tenantId: foreign,
        legalName: "Foreign",
        supplierType: "SUPPLIER",
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    expect(
      (
        await request(server)
          .get(`/api/v1/suppliers/${fs.id}`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(404);
  });
  it("rejects self-approved expenses and stale contract transitions", async () => {
    const e = await call("post", "/expenses", {
      expenseNumber: "SELF",
      costCenterId: center,
      expenseDate: date,
      description: "Self approval",
      subtotal: "1",
    });
    expect(e.status, e.text).toBe(201);
    await call("post", `/expenses/${e.body.id}/submit`, { version: 0 });
    const rejected = await call("post", `/expenses/${e.body.id}/approve`, {
      version: 1,
    });
    expect(rejected.status).toBe(403);
    expect(rejected.body.code).toBe("SELF_APPROVAL_NOT_ALLOWED");
    const c = await call("post", `/contracts/${contract}/suspend`, {
      version: 0,
    });
    expect(c.status).toBe(409);
    expect(c.body.code).toBe("RESOURCE_VERSION_CONFLICT");
  });
  it("blocks foreign IDs on owned project routes", async () => {
    const sc = {
      tenantId: foreign,
      projectId: other,
      createdBy: adminId,
      updatedBy: adminId,
    };
    const supplierB = await db.supplier.findFirstOrThrow({
      where: { tenantId: foreign },
    });
    const centerB = await db.costCenter.findFirstOrThrow({
      where: { projectId: other },
    });
    const contractB = await db.contract.create({
      data: {
        ...sc,
        supplierId: supplierB.id,
        contractNumber: "FOREIGN",
        title: "Foreign",
        contractType: "SUPPLY",
        originalValue: "1",
        currentValue: "1",
      },
    });
    const expenseB = await db.expense.create({
      data: {
        ...sc,
        costCenterId: centerB.id,
        expenseNumber: "FOREIGN",
        expenseDate: new Date(date),
        description: "Foreign",
        subtotal: "1",
        totalAmount: "1",
      },
    });
    expect((await call("get", `/contracts/${contractB.id}`)).status).toBe(404);
    expect(
      (
        await call("patch", `/contracts/${contractB.id}`, {
          version: 0,
          title: "No",
        })
      ).status,
    ).toBe(404);
    expect((await call("get", `/expenses/${expenseB.id}`)).status).toBe(404);
    const amendmentB = await db.contractAmendment.create({
      data: {
        ...sc,
        contractId: contractB.id,
        code: "FOREIGN",
        amendmentNumber: 1,
        amendmentType: "ADDITION",
        description: "Foreign",
        amount: "1",
        status: "SUBMITTED",
      },
    });
    expect(
      (
        await call(
          "post",
          `/contracts/${contract}/amendments/${amendmentB.id}/approve`,
          { version: 0 },
        )
      ).status,
    ).toBe(404);
    const docB = await db.document.create({
      data: {
        tenantId: foreign,
        projectId: other,
        expenseId: expenseB.id,
        createdBy: adminId,
        objectKey: `foreign-${suffix}`,
        fileName: "foreign.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1n,
        checksum: "0".repeat(64),
        expiresAt: new Date(),
        confirmedAt: new Date(),
      },
    });
    expect(
      (await call("get", `/expenses/${expense}/documents/${docB.id}/content`))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          "get",
          `/expenses/${expense}/documents/${document}/content`,
          undefined,
          financier,
        )
      ).status,
    ).toBe(403);
  });
  it("documents commercial requests and response decimals", async () => {
    const { DocumentBuilder, SwaggerModule } = await import("@nestjs/swagger");
    const { completeCommercialDocs } =
      await import("../../apps/api/src/commercial/docs.js");
    const spec = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("test").setVersion("4").build(),
    );
    completeCommercialDocs(spec);
    const operation =
      spec.paths["/api/v1/projects/{projectId}/costs/summary"].get!;
    expect(JSON.stringify(operation.responses)).toContain("remainingBudget");
    expect(
      JSON.stringify(
        spec.paths["/api/v1/projects/{projectId}/expenses"].post!.requestBody,
      ),
    ).toContain("100000.00");
  });
  it("serializes concurrent amendment approvals without losing additions", async () => {
    const ids: string[] = [];
    for (const amount of ["1", "2"]) {
      const r = await call(
        "post",
        `/contracts/${contract}/amendments`,
        { amendmentType: "ADDITION", description: "Concurrent", amount },
        manager,
      );
      expect(r.status, r.text).toBe(201);
      ids.push(r.body.id);
      expect(
        (
          await call(
            "post",
            `/contracts/${contract}/amendments/${r.body.id}/submit`,
            { version: 0 },
            manager,
          )
        ).status,
      ).toBe(201);
    }
    const results = await Promise.all(
      ids.map((id) =>
        call("post", `/contracts/${contract}/amendments/${id}/approve`, {
          version: 1,
        }),
      ),
    );
    expect(results.map((x) => x.status)).toEqual([201, 201]);
    expect(
      (await call("get", `/contracts/${contract}`)).body.currentValue,
    ).toBe("11200003");
  });
  it("records required financial audit events", async () => {
    for (const action of [
      "SUPPLIER_CREATED",
      "CONTRACT_CREATED",
      "CONTRACT_ITEM_CREATED",
      "CONTRACT_ACTIVATED",
      "CONTRACT_AMENDMENT_APPROVED",
      "COST_CENTER_CREATED",
      "EXPENSE_CREATED",
      "EXPENSE_APPROVED",
      "EXPENSE_REVERSED",
      "EXPENSE_DOCUMENT_ATTACHED",
    ])
      expect(
        await db.auditLog.count({ where: { tenantId: tenant, action } }),
        action,
      ).toBeGreaterThan(0);
  });
  it("paginates queries with 1000 contracts 10000 items and 20000 expenses", async () => {
    const start = performance.now(),
      scope = {
        tenantId: tenant,
        projectId: project,
        createdBy: adminId,
        updatedBy: adminId,
      };
    const ids = Array.from({ length: 1000 }, () => randomUUID());
    await db.contract.createMany({
      data: ids.map((id, i) => ({
        ...scope,
        id,
        supplierId: supplier,
        contractNumber: `PERF-${i}`,
        title: "Performance",
        contractType: "SUPPLY" as const,
        originalValue: "100",
        currentValue: "100",
      })),
    });
    for (let n = 0; n < 10; n++)
      await db.contractItem.createMany({
        data: ids.map((id) => ({
          ...scope,
          contractId: id,
          description: "Item",
          totalValue: "10",
        })),
      });
    for (let n = 0; n < 20; n++)
      await db.expense.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          ...scope,
          expenseNumber: `PERF-${n}-${i}`,
          expenseDate: new Date(date),
          costCenterId: center,
          description: "Performance",
          subtotal: "1",
          taxAmount: "0",
          totalAmount: "1",
        })),
      });
    const queryStart = performance.now();
    for (const path of [
      "/contracts?limit=50",
      "/expenses?limit=50",
      "/costs/items?limit=50",
      "/costs/summary",
    ]) {
      const r = await call("get", path);
      expect(r.status, r.text).toBe(200);
      if (r.body.items) expect(r.body.items.length).toBeLessThanOrEqual(50);
    }
    console.info(
      "COMMERCIAL_PERFORMANCE",
      JSON.stringify({
        contracts: 1000,
        items: 10000,
        expenses: 20000,
        queryMs: performance.now() - queryStart,
        totalMs: performance.now() - start,
      }),
    );
  }, 60000);
});
