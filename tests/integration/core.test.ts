import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Server } from "node:http";
import { createApp } from "../../apps/api/src/app.js";
import { Cache, Database } from "../../apps/api/src/platform.js";
import {
  hashPassword,
  opaqueToken,
  tokenHash,
} from "../../apps/api/src/auth/crypto.js";
import { NotificationService } from "../../apps/api/src/notification/notification.module.js";
import type { Role } from "../../packages/domain/src/index.js";

describe("Core SaaS real PostgreSQL + Redis API", () => {
  let app: INestApplication, db: Database, server: Server;
  const suffix = randomUUID(),
    pass = "Integration-Secure!2026",
    origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  let tenantA: string,
    tenantB: string,
    userA: string,
    userB: string,
    projectA: string,
    projectB: string,
    organizationB: string,
    managerId: string,
    clientId: string;
  let cookieA: string[],
    cookieB: string[],
    managerCookie: string[],
    clientCookie: string[];
  const cookies = (res: request.Response) =>
    res.headers["set-cookie"] as unknown as string[];
  const call = (
    method: "get" | "post" | "patch" | "delete",
    path: string,
    cookie = cookieA,
  ) => {
    const client = request(server);
    return client[method](`/api/v1${path}`)
      .set("Origin", origin)
      .set("Cookie", cookie);
  };
  async function login(email: string, slug: string) {
    return request(server)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email, password: pass, tenantSlug: slug });
  }
  async function person(tenantId: string, key: string, role: Role) {
    const u = await db.user.create({
      data: {
        name: key,
        email: `${key}-${suffix}@example.test`,
        passwordHash: await hashPassword(pass),
        status: "ACTIVE",
      },
    });
    await db.tenantUser.create({
      data: { tenantId, userId: u.id, role, status: "ACTIVE" },
    });
    return u;
  }
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("test"))
      throw new Error(
        "Integration requires a dedicated database URL containing test",
      );
    app = await createApp();
    await app.init();
    server = app.getHttpServer() as Server;
    db = app.get(Database);
    await app.get(Cache).del("auth:ip:::ffff:127.0.0.1", "auth:ip:127.0.0.1");
    tenantA = (
      await db.tenant.create({
        data: { name: "Tenant A", slug: `a-${suffix}` },
      })
    ).id;
    tenantB = (
      await db.tenant.create({
        data: { name: "Tenant B", slug: `b-${suffix}` },
      })
    ).id;
    const a = await person(tenantA, "admin-a", "ADMIN"),
      b = await person(tenantB, "admin-b", "ADMIN"),
      manager = await person(tenantA, "manager", "MANAGER"),
      client = await person(tenantA, "client", "CLIENT");
    userA = a.id;
    userB = b.id;
    managerId = manager.id;
    clientId = client.id;
    projectA = (
      await db.project.create({
        data: {
          tenantId: tenantA,
          code: "A-001",
          name: "Obra A",
          createdBy: userA,
          updatedBy: userA,
        },
      })
    ).id;
    projectB = (
      await db.project.create({
        data: {
          tenantId: tenantB,
          code: "B-001",
          name: "Obra B",
          createdBy: userB,
          updatedBy: userB,
        },
      })
    ).id;
    organizationB = (
      await db.organization.create({
        data: {
          tenantId: tenantB,
          legalName: "Organization B",
          organizationType: "CLIENT",
        },
      })
    ).id;
    cookieA = cookies(await login(a.email, `a-${suffix}`));
    cookieB = cookies(await login(b.email, `b-${suffix}`));
    managerCookie = cookies(await login(manager.email, `a-${suffix}`));
    clientCookie = cookies(await login(client.email, `a-${suffix}`));
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it("authenticates with HttpOnly cookies and never returns credentials", async () => {
    const res = await call("get", "/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userA);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieA.join(";")).toContain("HttpOnly");
  });
  it("rejects invalid credentials and records LOGIN_FAILED", async () => {
    const res = await request(server)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({
        email: `admin-a-${suffix}@example.test`,
        password: "wrong",
        tenantSlug: `a-${suffix}`,
      });
    expect(res.status).toBe(401);
    expect(
      await db.auditLog.count({
        where: { tenantId: tenantA, action: "LOGIN_FAILED" },
      }),
    ).toBe(1);
  });
  it("rejects state changes from an untrusted origin", async () => {
    expect(
      (
        await request(server)
          .post("/api/v1/projects")
          .set("Cookie", cookieA)
          .set("Origin", "https://evil.test")
          .send({ code: "x", name: "x" })
      ).status,
    ).toBe(403);
  });
  it("rotates refresh tokens atomically and rejects replay", async () => {
    const old = cookieA;
    const res = await call("post", "/auth/refresh", old);
    expect(res.status).toBe(200);
    cookieA = cookies(res);
    expect(cookieA).not.toEqual(old);
    expect((await call("post", "/auth/refresh", old)).status).toBe(401);
  });
  it("permits only one winner for concurrent refresh requests", async () => {
    const responses = await Promise.all([
      call("post", "/auth/refresh"),
      call("post", "/auth/refresh"),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    cookieA = cookies(responses.find((r) => r.status === 200)!);
  });
  it("creates organization and audit atomically", async () => {
    const res = await call("post", "/organizations").send({
      legalName: "Construtora Teste",
      organizationType: "CONTRACTOR",
    });
    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBe(tenantA);
    expect(
      await db.auditLog.count({
        where: {
          tenantId: tenantA,
          entityId: res.body.id,
          action: "ORGANIZATION_CREATED",
        },
      }),
    ).toBe(1);
  });
  it("creates a project preserving exact decimal amounts", async () => {
    const res = await call("post", "/projects").send({
      code: "NEW",
      name: "Nova Obra",
      contractValue: "9999999999999999.99",
    });
    expect(res.status).toBe(201);
    expect(res.body.contractValue).toBe("9999999999999999.99");
  });
  it("rejects dates in reverse order", async () =>
    expect(
      (
        await call("post", "/projects").send({
          code: "DATE",
          name: "Invalid",
          startDate: "2026-10-10",
          plannedEndDate: "2026-10-01",
        })
      ).status,
    ).toBe(400));
  it("rejects tenant injection", async () =>
    expect(
      (
        await call("post", "/projects").send({
          code: "INJECT",
          name: "Injection",
          tenantId: tenantB,
        })
      ).status,
    ).toBe(400));
  it("adds a user to the project", async () => {
    const res = await call("post", `/projects/${projectA}/users`).send({
      userId: managerId,
      role: "MANAGER",
    });
    expect(res.status).toBe(201);
  });
  it("allows the assigned manager to edit operational fields", async () => {
    expect(
      (
        await call("patch", `/projects/${projectA}`, managerCookie).send({
          location: "Maputo",
        })
      ).status,
    ).toBe(200);
  });
  it("rejects manager changes to contract amount", async () =>
    expect(
      (
        await call("patch", `/projects/${projectA}`, managerCookie).send({
          contractValue: "100.00",
        })
      ).status,
    ).toBe(403));
  it("does not grant tenant managers visibility of all projects", async () => {
    const res = await call("get", "/projects", managerCookie);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual([projectA]);
  });
  it("client cannot access administrative users", async () =>
    expect((await call("get", "/users", clientCookie)).status).toBe(403));
  it("unassigned client sees no projects", async () =>
    expect((await call("get", "/projects", clientCookie)).body).toEqual([]));
  it("assigned client can view but cannot edit", async () => {
    await call("post", `/projects/${projectA}/users`).send({
      userId: clientId,
      role: "CLIENT",
    });
    expect(
      (await call("get", `/projects/${projectA}`, clientCookie)).status,
    ).toBe(200);
    expect(
      (
        await call("patch", `/projects/${projectA}`, clientCookie).send({
          name: "Hack",
        })
      ).status,
    ).toBe(403);
  });
  it("User A cannot GET Project B", async () =>
    expect((await call("get", `/projects/${projectB}`)).status).toBe(404));
  it("User A cannot PATCH Project B", async () =>
    expect(
      (await call("patch", `/projects/${projectB}`).send({ name: "Hack" }))
        .status,
    ).toBe(404));
  it("User A cannot discover Organization B by known ID", async () =>
    expect((await call("get", `/organizations/${organizationB}`)).status).toBe(
      404,
    ));
  it("User A cannot associate User B to Project A", async () =>
    expect(
      (
        await call("post", `/projects/${projectA}/users`).send({
          userId: userB,
          role: "CLIENT",
        })
      ).status,
    ).toBe(404));
  it("User A cannot associate Organization B to Project A", async () =>
    expect(
      (
        await call("post", `/projects/${projectA}/organizations`).send({
          organizationId: organizationB,
          relationshipType: "OWNER",
        })
      ).status,
    ).toBe(404));
  it("User B cannot read Tenant A audit entries", async () => {
    const res = await call("get", "/audit-logs", cookieB);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      res.body.every((row: { tenantId: string }) => row.tenantId === tenantB),
    ).toBe(true);
    const a = (
      await db.auditLog.findFirstOrThrow({ where: { tenantId: tenantA } })
    ).id;
    expect((await call("get", `/audit-logs/${a}`, cookieB)).status).toBe(404);
  });
  it("database rejects cross-tenant foreign keys independently of API", async () => {
    await expect(
      db.projectUser.create({
        data: {
          tenantId: tenantA,
          projectId: projectA,
          userId: userB,
          role: "CLIENT",
        },
      }),
    ).rejects.toThrow();
  });
  it("audit records cannot be changed or removed even by application database access", async () => {
    const row = await db.auditLog.findFirstOrThrow({
      where: { tenantId: tenantA },
    });
    await expect(
      db.auditLog.updateMany({
        where: { id: row.id, tenantId: tenantA },
        data: { action: "ALTERED" },
      }),
    ).rejects.toThrow();
    await expect(
      db.auditLog.deleteMany({ where: { id: row.id, tenantId: tenantA } }),
    ).rejects.toThrow();
  });
  it("removes an association while retaining global user", async () => {
    expect(
      (await call("delete", `/projects/${projectA}/users/${clientId}`)).status,
    ).toBe(200);
    expect(
      await db.user.findUnique({ where: { id: clientId } }),
    ).not.toBeNull();
    expect(
      (await call("get", `/projects/${projectA}`, clientCookie)).status,
    ).toBe(404);
  });
  it("invites a user without exposing a password or activation token", async () => {
    const delivery = vi
      .spyOn(app.get(NotificationService), "deliverReset")
      .mockResolvedValue();
    const res = await call("post", "/users/invite").send({
      name: "Invited",
      email: `invite-${suffix}@example.test`,
      role: "CLIENT",
    });
    expect(res.status).toBe(201);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(delivery).toHaveBeenCalledOnce();
    delivery.mockRestore();
  });
  it("password reset is one-time and revokes previous sessions", async () => {
    const raw = opaqueToken();
    await db.passwordReset.create({
      data: {
        tenantId: tenantA,
        userId: clientId,
        tokenHash: tokenHash(raw),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const result = await call(
      "post",
      "/auth/reset-password",
      clientCookie,
    ).send({ token: raw, password: "Changed-Secure!2026" });
    expect(result.status).toBe(200);
    expect((await call("get", "/auth/me", clientCookie)).status).toBe(401);
    expect(
      (
        await call("post", "/auth/reset-password", clientCookie).send({
          token: raw,
          password: "Changed-Secure!2026",
        })
      ).status,
    ).toBe(400);
  });
  it("disabling membership revokes access immediately", async () => {
    expect((await call("post", `/users/${managerId}/disable`)).status).toBe(
      201,
    );
    expect((await call("get", "/projects", managerCookie)).status).toBe(401);
  });
  it("serves health and Swagger", async () => {
    expect((await request(server).get("/health")).body).toEqual({
      api: "up",
      postgresql: "up",
      redis: "up",
    });
    const res = await request(server).get("/api/docs-json");
    expect(res.status).toBe(200);
    expect(res.body.paths["/api/v1/projects"]).toBeDefined();
  });
  it("logs out and immediately revokes access and refresh", async () => {
    expect((await call("post", "/auth/logout")).status).toBe(200);
    expect((await call("get", "/auth/me")).status).toBe(401);
    expect((await call("post", "/auth/refresh")).status).toBe(401);
  });
  it("rate limits repeated login attempts", async () => {
    let status = 0;
    for (let i = 0; i < 21 && status !== 429; i++) {
      status = (
        await request(server)
          .post("/api/v1/auth/login")
          .set("Origin", origin)
          .send({
            email: `nobody-${suffix}@example.test`,
            password: "invalid",
            tenantSlug: `a-${suffix}`,
          })
      ).status;
    }
    expect(status).toBe(429);
  });
});
