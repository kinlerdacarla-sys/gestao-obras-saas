import { describe, expect, it } from "vitest";
import { configuration } from "../../packages/config/src/index.js";
const production = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  APP_ENV: "staging",
  DATABASE_URL:
    "postgresql://obras:isolated-password@postgres:5432/obras_staging",
  REDIS_URL: "redis://:isolated-password@redis:6379",
  JWT_SECRET: "a8c3e4f5".repeat(8),
  INVITATION_ENCRYPTION_KEY: "b9c7f3a1".repeat(8),
  WEB_ORIGIN: "https://staging.example.com",
  DOCUMENT_STORAGE_PATH: "/data/documents",
  BUDGET_STORAGE_PATH: "/data/budgets",
  MAIL_TRANSPORT: "smtp",
  SMTP_URL: "smtps://smtp.example.com",
  MAIL_FROM: "obras@example.com",
  SALES_EMAIL: "sales@example.com",
  TERMS_URL: "https://example.com/terms",
  PRIVACY_URL: "https://example.com/privacy",
  TERMS_VERSION: "2026-10",
  PRIVACY_VERSION: "2026-10",
  TRUST_PROXY: "10.20.0.8/32",
});
describe("production startup contract", () => {
  it("accepts dedicated staging configuration", () =>
    expect(configuration(production()).APP_ENV).toBe("staging"));
  it.each([
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "INVITATION_ENCRYPTION_KEY",
    "WEB_ORIGIN",
    "DOCUMENT_STORAGE_PATH",
    "BUDGET_STORAGE_PATH",
    "SMTP_URL",
    "MAIL_FROM",
    "TERMS_URL",
    "PRIVACY_URL",
    "SALES_EMAIL",
  ])("fails safely when %s is absent", (key) => {
    const env = production();
    delete env[key];
    expect(() => configuration(env)).toThrow("ENVIRONMENT_INVALID");
  });
  it.each(["true", "1", "0.0.0.0/0", "::/0", "10.1.0.2/99"])(
    "rejects unsafe proxy trust %s",
    (value) =>
      expect(() =>
        configuration({ ...production(), TRUST_PROXY: value }),
      ).toThrow("TRUST_PROXY"),
  );
  it("rejects local email and HTTP shortcuts", () => {
    expect(() =>
      configuration({ ...production(), MAIL_TRANSPORT: "stream" }),
    ).toThrow();
    expect(() =>
      configuration({ ...production(), WEB_ORIGIN: "http://localhost:3000" }),
    ).toThrow();
  });
  it("does not echo environment secrets in a validation exception", () => {
    const env = {
      ...production(),
      JWT_SECRET: "private-short-key",
      SMTP_URL: "private-smtp-value",
    };
    try {
      configuration(env);
      throw Error("expected rejection");
    } catch (e) {
      expect(String(e)).not.toContain("private-short-key");
      expect(String(e)).not.toContain("private-smtp-value");
    }
  });
});
