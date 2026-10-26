import { describe, expect, it } from "vitest";
import {
  assertDowngrade,
  assertOperationalMutation,
  assertQuota,
  assertSubscriptionTransition,
  billingPeriodEnd,
  effectiveSubscriptionStatus,
  limitQuantity,
  operationalFlag,
  usagePeriod,
  type PlanLimit,
  type LimitKey,
} from "../../packages/domain/src/saas.js";
const limit = (limitKey: LimitKey, limitValue: number): PlanLimit => ({
  limitKey,
  limitValue,
  unlimited: false,
});
describe("SaaS commercial policies", () => {
  it("blocks the fourth Starter project and eleventh user", () => {
    expect(() => assertQuota(limit("ACTIVE_PROJECTS", 3), 3n)).toThrow(
      "PROJECT_LIMIT_EXCEEDED",
    );
    expect(() => assertQuota(limit("USERS", 10), 10n)).toThrow(
      "USER_LIMIT_EXCEEDED",
    );
    expect(() => assertQuota(limit("ACTIVE_PROJECTS", 3), 2n)).not.toThrow();
  });
  it("measures storage in bytes without floating point loss", () => {
    const storage = limit("STORAGE_GB", 10);
    expect(limitQuantity(storage)).toBe(10737418240n);
    expect(() => assertQuota(storage, 10737418239n, 1n)).not.toThrow();
    expect(() => assertQuota(storage, 10737418240n, 1n)).toThrow(
      "STORAGE_LIMIT_EXCEEDED",
    );
  });
  it("distinguishes zero, unlimited and an invalid missing quota", () => {
    expect(() => assertQuota(limit("MONTHLY_REPORTS", 0), 0n)).toThrow(
      "PLAN_LIMIT_EXCEEDED",
    );
    expect(() =>
      assertQuota({ ...limit("USERS", 0), unlimited: true }, 9007199254740993n),
    ).not.toThrow();
    expect(() =>
      limitQuantity({ ...limit("USERS", 0), limitValue: null }),
    ).toThrow("INVALID_PLAN_LIMIT");
    expect(() => assertQuota(limit("USERS", 1), -1n)).toThrow("INVALID_USAGE");
  });
  it("rejects downgrade with twelve projects and allows a sufficient plan", () => {
    const usage = {
      ACTIVE_PROJECTS: 12n,
      USERS: 8n,
      STORAGE_GB: 0n,
      MONTHLY_REPORTS: 0n,
      MONTHLY_AI_ACTIONS: 0n,
    };
    expect(() => assertDowngrade([limit("ACTIVE_PROJECTS", 3)], usage)).toThrow(
      "PLAN_DOWNGRADE_BLOCKED_BY_USAGE",
    );
    expect(() =>
      assertDowngrade([limit("ACTIVE_PROJECTS", 20)], usage),
    ).not.toThrow();
  });
  it("restricts subscription transitions and preserves terminal cancellation", () => {
    expect(() =>
      assertSubscriptionTransition("TRIALING", "ACTIVE"),
    ).not.toThrow();
    expect(() =>
      assertSubscriptionTransition("ACTIVE", "PAST_DUE"),
    ).not.toThrow();
    expect(() => assertSubscriptionTransition("CANCELLED", "ACTIVE")).toThrow(
      "INVALID_SUBSCRIPTION_TRANSITION",
    );
    expect(() => assertSubscriptionTransition("ACTIVE", "TRIALING")).toThrow(
      "INVALID_SUBSCRIPTION_TRANSITION",
    );
  });
  it("enforces trial expiration even before a worker runs", () => {
    const now = new Date("2026-10-26T00:00:00Z");
    expect(
      effectiveSubscriptionStatus(
        {
          status: "TRIALING",
          trialEnd: now,
          currentPeriodEnd: now,
          cancelAtPeriodEnd: false,
        },
        now,
      ),
    ).toBe("EXPIRED");
    expect(
      effectiveSubscriptionStatus(
        {
          status: "ACTIVE",
          trialEnd: null,
          currentPeriodEnd: now,
          cancelAtPeriodEnd: true,
        },
        now,
      ),
    ).toBe("CANCELLED");
  });
  it("denies mutations for suspended tenants and expired or unpaid subscriptions", () => {
    expect(() => assertOperationalMutation("SUSPENDED", "ACTIVE")).toThrow(
      "SUBSCRIPTION_READ_ONLY",
    );
    for (const status of [
      "PAST_DUE",
      "EXPIRED",
      "CANCELLED",
      "SUSPENDED",
    ] as const)
      expect(() => assertOperationalMutation("ACTIVE", status)).toThrow(
        "SUBSCRIPTION_READ_ONLY",
      );
    expect(() => assertOperationalMutation("ACTIVE", "TRIALING")).not.toThrow();
  });
  it("handles end of month and leap year periods", () => {
    expect(
      billingPeriodEnd(
        new Date("2026-01-31T12:00:00Z"),
        "MONTHLY",
      ).toISOString(),
    ).toBe("2026-02-28T12:00:00.000Z");
    expect(
      billingPeriodEnd(
        new Date("2024-02-29T00:00:00Z"),
        "ANNUAL",
      ).toISOString(),
    ).toBe("2025-02-28T00:00:00.000Z");
    expect(
      usagePeriod(new Date("2026-12-31T23:59:59Z")).end.toISOString(),
    ).toBe("2027-01-01T00:00:00.000Z");
  });
  it("applies deterministic rollout boundaries and explicit overrides", () => {
    expect(operationalFlag(true, 20, 19)).toBe(true);
    expect(operationalFlag(true, 20, 20)).toBe(false);
    expect(operationalFlag(false, 100, 0)).toBe(false);
    expect(operationalFlag(true, 100, 0, false)).toBe(false);
  });
});
