import { afterAll, beforeAll, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../apps/api/src/app.js";
import { Database, Cache } from "../../apps/api/src/platform.js";
import {
  opaqueToken,
  tokenHash,
  hashPassword,
} from "../../apps/api/src/auth/crypto.js";
let app: Awaited<ReturnType<typeof createApp>>, db: Database, cookie: string[];
const origin = process.env.WEB_ORIGIN!,
  email = "launch-" + randomUUID() + "@example.test",
  password = "Isolated-Launch!2026";
beforeAll(async () => {
  if (
    process.env.NODE_ENV !== "test" ||
    !process.env.DATABASE_URL?.includes("test")
  )
    throw Error("Test database required");
  app = await createApp();
  await app.init();
  db = app.get(Database);
  await app
    .get(Cache)
    .del("platform:login:ip:::ffff:127.0.0.1", "auth:ip:::ffff:127.0.0.1");
});
afterAll(async () => {
  if (db)
    await db.platformControl.deleteMany({ where: { key: "maintenance" } });
  if (app) await app.close();
});
it("activates the isolated platform identity once and verifies email without any tenant membership", async () => {
  const user = await db.user.create({
    data: {
      email,
      name: "Launch",
      status: "INVITED",
      passwordHash: await hashPassword(opaqueToken()),
    },
  });
  await db.platformUser.create({
    data: { userId: user.id, role: "SUPER_ADMIN" },
  });
  const token = opaqueToken();
  await db.platformInvitation.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const activate = () =>
    request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .set("Origin", origin)
      .send({ token, password });
  expect((await activate()).status).toBe(200);
  expect((await activate()).status).toBe(400);
  expect(await db.tenantUser.count({ where: { userId: user.id } })).toBe(0);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
      .emailVerifiedAt,
  ).not.toBeNull();
  const login = await request(app.getHttpServer())
    .post("/api/v1/platform/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  expect(login.status).toBe(201);
  cookie = (login.headers["set-cookie"] as unknown as string[]).map(
    (v) => v.split(";")[0],
  );
});
it("requires a platform session to change maintenance, keeps health live and audits the transition", async () => {
  const body = {
    enabled: true,
    version: 0,
    minutes: 5,
    reason: "Test isolated maintenance controls",
  };
  const set = (cookies: string[], data: typeof body) =>
    request(app.getHttpServer())
      .post("/api/v1/platform/maintenance")
      .set("Origin", origin)
      .set("Cookie", cookies)
      .send(data);
  expect((await set([], body)).status).toBe(401);
  expect((await set(cookie, body)).status).toBe(201);
  expect((await request(app.getHttpServer()).get("/health/ready")).status).toBe(
    200,
  );
  expect(
    (
      await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set("Origin", origin)
        .send({})
    ).body.code,
  ).toBe("MAINTENANCE_MODE");
  expect((await set(cookie, body)).status).toBe(409);
  expect(
    (await set(cookie, { ...body, enabled: false, version: 1 })).status,
  ).toBe(201);
  expect(
    (await request(app.getHttpServer()).get("/api/v1/service-info")).body
      .maintenance,
  ).toBe(false);
  expect(
    await db.platformAuditLog.count({ where: { action: "MAINTENANCE_ENDED" } }),
  ).toBeGreaterThan(0);
});
