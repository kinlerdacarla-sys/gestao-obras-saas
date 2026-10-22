import type { Database } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import type { Prisma } from "../generated/prisma/client.js";
export async function notificationScope(
  db: Database,
  r: ApiRequest,
): Promise<Prisma.NotificationWhereInput> {
  const base = {
    tenantId: r.auth.tenantId,
    userId: r.auth.userId,
    inAppVisible: true,
  };
  if (r.auth.role === "ADMIN") return base;
  const assignments = await db.projectUser.findMany({
    where: {
      tenantId: r.auth.tenantId,
      userId: r.auth.userId,
      status: "ACTIVE",
    },
    select: { projectId: true, role: true },
  });
  return {
    ...base,
    OR: assignments.map((x) => ({
      projectId: x.projectId,
      ...(x.role === "INSPECTOR"
        ? {
            OR: [
              { type: { startsWith: "NCR" } },
              { type: { startsWith: "INSPECTION" } },
              { type: { startsWith: "CORRECTIVE" } },
              { type: { startsWith: "SCHEDULE" } },
              { type: { startsWith: "MEASUREMENT" } },
              { type: { in: ["DAILY_LOG_MISSING", "DAILY_DIGEST"] } },
            ],
          }
        : x.role === "CLIENT"
          ? { type: { in: ["NCR_CRITICAL", "SCHEDULE_DELAY", "DAILY_DIGEST"] } }
          : {}),
    })),
  };
}
