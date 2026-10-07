import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signAccess,
  verifyAccess,
  tokenHash,
  opaqueToken,
} from "../../apps/api/src/auth/crypto.js";
import {
  canEditProject,
  canReadProject,
  sameTenant,
  roles,
} from "../../packages/domain/src/index.js";
import {
  password,
  projectSchema,
  loginSchema,
} from "../../packages/validation/src/index.js";
import { TenantScope } from "../../apps/api/src/tenant/tenant.module.js";
describe("Password and credentials", () => {
  it("hashes with Argon2id and verifies only the correct password", async () => {
    const hash = await hashPassword("Correct-test!2026");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "Correct-test!2026")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
  it.each(["", "1234567890", "password1234", "abcdefghij", "onlyletterslong"])(
    "rejects weak password %s",
    (value) => expect(password.safeParse(value).success).toBe(false),
  );
  it("accepts a strong password", () =>
    expect(password.safeParse("Build-Secure!2026").success).toBe(true));
  it("stores only a digest of a random refresh credential", () => {
    const token = opaqueToken();
    expect(token).toHaveLength(64);
    expect(tokenHash(token)).not.toBe(token);
    expect(tokenHash(token)).toBe(tokenHash(token));
  });
});
describe("JWT", () => {
  const secret = "test-signing-secret-with-more-than-32-characters";
  it("verifies issuer, audience, tenant, session and 15-minute expiration", async () => {
    const claims = await verifyAccess(
      secret,
      await signAccess(secret, "user", "tenant", "session"),
    );
    expect(claims.tenantId).toBe("tenant");
    expect(claims.sessionId).toBe("session");
    expect(claims.exp! - claims.iat!).toBe(900);
  });
  it("rejects tampering and a different signing secret", async () => {
    const token = await signAccess(secret, "user", "tenant", "session");
    await expect(verifyAccess("wrong", token)).rejects.toThrow();
    await expect(verifyAccess(secret, token + "a")).rejects.toThrow();
  });
});
describe("Tenant and project authorization", () => {
  it("compares tenant identity", () => {
    expect(sameTenant("A", "A")).toBe(true);
    expect(sameTenant("A", "B")).toBe(false);
  });
  it("refuses empty tenant context", () =>
    expect(() =>
      new TenantScope().where({
        tenantId: "",
        userId: "x",
        sessionId: "s",
        role: "ADMIN",
      }),
    ).toThrow());
  it.each(roles)("only admin or an assigned manager may edit: %s", (role) => {
    expect(canEditProject(role, "MANAGER")).toBe(
      role === "ADMIN" || role === "MANAGER",
    );
    expect(canEditProject(role)).toBe(role === "ADMIN");
  });
  it.each(roles)("requires a project assignment for non-admin: %s", (role) => {
    expect(canReadProject(role, false)).toBe(role === "ADMIN");
    expect(canReadProject(role, true)).toBe(true);
  });
  it("rejects frontend tenant injection", () =>
    expect(
      projectSchema.safeParse({ name: "Test", code: "T", tenantId: "other" })
        .success,
    ).toBe(false));
  it("rejects non-MZN and numeric floating point money", () => {
    expect(
      projectSchema.safeParse({ name: "Test", code: "T", currency: "USD" })
        .success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ name: "Test", code: "T", contractValue: 0.1 })
        .success,
    ).toBe(false);
  });
  it("rejects invalid dates and email", () => {
    expect(
      projectSchema.safeParse({
        name: "Test",
        code: "T",
        startDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({
        email: "not-email",
        password: "x",
        tenantSlug: "demo",
      }).success,
    ).toBe(false);
  });
});
