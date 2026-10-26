/** Commercial SaaS policy. No dependency on project currency or tenant roles. */
export const subscriptionStatuses = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export const featureCodes = [
  "ADVANCED_REPORTS",
  "PORTFOLIO_ANALYTICS",
  "CLIENT_PORTAL",
  "FINANCIER_PORTAL",
  "ADVANCED_QUALITY",
  "API_ACCESS",
  "CUSTOM_BRANDING",
  "PRIORITY_SUPPORT",
] as const;
export const limitKeys = [
  "ACTIVE_PROJECTS",
  "USERS",
  "STORAGE_GB",
  "MONTHLY_REPORTS",
  "MONTHLY_AI_ACTIONS",
] as const;
export type LimitKey = (typeof limitKeys)[number];
export interface PlanLimit {
  limitKey: LimitKey;
  limitValue: number | null;
  unlimited: boolean;
}
export class SaasPolicyError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: unknown = [],
  ) {
    super(code);
    this.name = "SaasPolicyError";
  }
}
export function limitQuantity(limit: PlanLimit): bigint | null {
  if (limit.unlimited) return null;
  if (
    limit.limitValue === null ||
    !Number.isSafeInteger(limit.limitValue) ||
    limit.limitValue < 0
  )
    throw new SaasPolicyError("INVALID_PLAN_LIMIT");
  return (
    BigInt(limit.limitValue) *
    (limit.limitKey === "STORAGE_GB" ? 1073741824n : 1n)
  );
}
export function assertQuota(limit: PlanLimit, used: bigint, requested = 1n) {
  if (used < 0n || requested < 0n) throw new SaasPolicyError("INVALID_USAGE");
  const maximum = limitQuantity(limit);
  if (maximum !== null && used + requested > maximum) {
    const code =
      limit.limitKey === "USERS"
        ? "USER_LIMIT_EXCEEDED"
        : limit.limitKey === "ACTIVE_PROJECTS"
          ? "PROJECT_LIMIT_EXCEEDED"
          : limit.limitKey === "STORAGE_GB"
            ? "STORAGE_LIMIT_EXCEEDED"
            : "PLAN_LIMIT_EXCEEDED";
    throw new SaasPolicyError(code, {
      key: limit.limitKey,
      used: used.toString(),
      requested: requested.toString(),
      maximum: maximum.toString(),
    });
  }
}
export function assertDowngrade(
  limits: PlanLimit[],
  usage: Record<LimitKey, bigint>,
) {
  const exceeded = limits.flatMap((limit) => {
    const maximum = limitQuantity(limit);
    return maximum !== null && usage[limit.limitKey] > maximum
      ? [
          {
            key: limit.limitKey,
            used: usage[limit.limitKey].toString(),
            maximum: maximum.toString(),
          },
        ]
      : [];
  });
  if (exceeded.length)
    throw new SaasPolicyError("PLAN_DOWNGRADE_BLOCKED_BY_USAGE", exceeded);
}
const transitions: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "SUSPENDED", "CANCELLED"],
  PAST_DUE: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  SUSPENDED: ["ACTIVE", "CANCELLED"],
  CANCELLED: [],
  EXPIRED: ["ACTIVE", "CANCELLED"],
};
export function assertSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
) {
  if (!transitions[from].includes(to))
    throw new SaasPolicyError("INVALID_SUBSCRIPTION_TRANSITION", { from, to });
}
export function effectiveSubscriptionStatus(
  subscription: {
    status: SubscriptionStatus;
    trialEnd: Date | null;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  },
  now = new Date(),
): SubscriptionStatus {
  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd <= now)
    return "CANCELLED";
  if (
    subscription.status === "TRIALING" &&
    (!subscription.trialEnd || subscription.trialEnd <= now)
  )
    return "EXPIRED";
  return subscription.status;
}
export function assertOperationalMutation(
  tenantStatus: string,
  subscriptionStatus: SubscriptionStatus,
) {
  if (
    tenantStatus !== "ACTIVE" ||
    !["TRIALING", "ACTIVE"].includes(subscriptionStatus)
  )
    throw new SaasPolicyError("SUBSCRIPTION_READ_ONLY");
}
/** Stable UTC month: billing counters do not depend on a request's locale. */
export function usagePeriod(now = new Date()) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
/** Clamp to the last day of the destination month, including leap years. */
export function billingPeriodEnd(
  start: Date,
  cycle: "MONTHLY" | "ANNUAL" | "MANUAL",
) {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (cycle === "ANNUAL" ? 12 : 1));
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}
/** Operational rollout never grants a commercial entitlement. */
export function operationalFlag(
  enabled: boolean,
  percentage: number | null,
  bucket: number,
  override?: boolean,
) {
  if (override !== undefined) return override;
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= 100)
    throw new SaasPolicyError("INVALID_ROLLOUT_BUCKET");
  if (
    percentage !== null &&
    (!Number.isInteger(percentage) || percentage < 0 || percentage > 100)
  )
    throw new SaasPolicyError("INVALID_ROLLOUT_PERCENTAGE");
  return enabled && (percentage === null || bucket < percentage);
}
