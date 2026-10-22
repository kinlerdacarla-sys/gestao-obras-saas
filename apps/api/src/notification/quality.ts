import { notificationChannels } from "../../../../packages/domain/src/notifications.js";
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
  const preferences = await tx.notificationPreference.findMany({
    where: { tenantId: s.tenantId },
  });
  const ids = [...new Set([...recipients, ...admins.map((x) => x.userId)])];
  await tx.notification.createMany({
    data: ids.flatMap((userId) => {
      const channels = notificationChannels(
        type,
        preferences.find((x) => x.userId === userId) ?? null,
      );
      return channels.inApp || channels.email
        ? [
            {
              ...s,
              createdBy: actor,
              userId,
              eventKey,
              type,
              title,
              resourcePath,
              inAppVisible: channels.inApp,
            },
          ]
        : [];
    }),
    skipDuplicates: true,
  });
}
