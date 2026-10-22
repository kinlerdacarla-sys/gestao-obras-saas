import type { Prisma } from "../generated/prisma/client.js";
import type { Scope } from "../schedule/access.js";
// Shared durable in-app notification delivery. Transactional with the source event.
export async function notifyQuality(
  tx: Prisma.TransactionClient,
  s: Scope,
  actor: string,
  eventKey: string,
  type: string,
  title: string,
  resourcePath: string,
  userIds?: string[],
) {
  const recipients =
    userIds ??
    (
      await tx.projectUser.findMany({
        where: {
          ...s,
          status: "ACTIVE",
          role: { in: ["ADMIN", "MANAGER", "INSPECTOR"] },
        },
        select: { userId: true },
      })
    ).map((x) => x.userId);
  const admins = await tx.tenantUser.findMany({
    where: { tenantId: s.tenantId, status: "ACTIVE", role: "ADMIN" },
    select: { userId: true },
  });
  await tx.notification.createMany({
    data: [...new Set([...recipients, ...admins.map((x) => x.userId)])].map(
      (userId) => ({
        ...s,
        createdBy: actor,
        userId,
        eventKey,
        type,
        title,
        resourcePath,
      }),
    ),
    skipDuplicates: true,
  });
}
