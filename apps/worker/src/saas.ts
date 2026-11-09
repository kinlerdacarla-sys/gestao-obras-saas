import { Queue } from "bullmq";
import { documentStorage } from "../../../packages/config/src/storage.js";
import { Database } from "../../api/src/platform.js";
import { QuotaService } from "../../api/src/saas/entitlements.js";
import { effectiveSubscriptionStatus } from "../../../packages/domain/src/saas.js";
import { redisConnection } from "../../../packages/config/src/redis.js";
import { intelligenceContext } from "./intelligence.js";
const remove = (key: string) => documentStorage().remove(key);
export async function scanInvitations(db: Database) {
  const queue = new Queue("tenant-invitation", {
    connection: redisConnection(),
  });
  queue.on("error", () =>
    console.error(
      JSON.stringify({ event: "queue_error", queue: "tenant-invitation" }),
    ),
  );
  try {
    await queue.waitUntilReady();
    const platform = await db.platformInvitation.findMany({
      where: {
        sentAt: null,
        usedAt: null,
        attempts: { lt: 5 },
        expiresAt: { gt: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      take: 20,
    });
    for (const row of platform)
      await queue.add(
        "platform",
        { id: row.id },
        {
          jobId: "platform-" + row.id,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    await db.platformInvitation.updateMany({
      where: { expiresAt: { lte: new Date() }, ciphertext: { not: null } },
      data: { ciphertext: null },
    });
    const rows = await db.invitationDelivery.findMany({
      where: {
        sentAt: null,
        attempts: { lt: 5 },
        expiresAt: { gt: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      take: 100,
      orderBy: { createdAt: "asc" },
    });
    for (const row of rows)
      await queue.add(
        "send",
        { id: row.id },
        {
          jobId: row.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    await db.invitationDelivery.updateMany({
      where: { expiresAt: { lte: new Date() }, ciphertext: { not: null } },
      data: { ciphertext: null },
    });
    const exports = new Queue("tenant-data-export", {
      connection: redisConnection(),
    });
    exports.on("error", () =>
      console.error(
        JSON.stringify({ event: "queue_error", queue: "tenant-data-export" }),
      ),
    );
    try {
      await exports.waitUntilReady();
      const pending = await db.dataExportJob.findMany({
        where: {
          expiresAt: { gt: new Date() },
          OR: [
            {
              status: "QUEUED",
              createdAt: { lt: new Date(Date.now() - 60000) },
            },
            {
              status: "PROCESSING",
              startedAt: { lt: new Date(Date.now() - 10 * 60000) },
            },
          ],
        },
        take: 100,
      });
      for (const row of pending) {
        const prior = await exports.getJob(row.id);
        if (prior) {
          const state = await prior.getState();
          if (state === "completed" || state === "failed") await prior.remove();
          else continue;
        }
        await exports.add(
          "export",
          { id: row.id },
          {
            jobId: row.id,
            attempts: 3,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );
      }
    } finally {
      await exports.close();
    }
    return { queued: rows.length };
  } finally {
    await queue.close();
  }
}
export async function maintainSaas(db: Database) {
  let cursor: string | undefined;
  const quota = (await intelligenceContext()).get(QuotaService);
  for (;;) {
    const rows = await db.subscription.findMany({
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM tenants WHERE id=${row.tenantId}::uuid FOR UPDATE`;
        const current = await tx.subscription.findUniqueOrThrow({
          where: { id: row.id },
        });
        const status = effectiveSubscriptionStatus(current);
        const ending =
          status === "TRIALING" &&
          current.trialEnd &&
          current.trialEnd.getTime() - Date.now() <= 3 * 86400000;
        const action =
          status !== current.status
            ? `SUBSCRIPTION_${status}`
            : ending
              ? "TRIAL_ENDING"
              : null;
        if (
          action &&
          !(await tx.platformAuditLog.findFirst({
            where: { tenantId: row.tenantId, entityId: row.id, action },
          }))
        )
          await tx.platformAuditLog.create({
            data: {
              tenantId: row.tenantId,
              action,
              entityType: "Subscription",
              entityId: row.id,
              newValues: { status },
            },
          });
        if (status !== current.status)
          await tx.subscription.update({
            where: { id: row.id },
            data: {
              status,
              version: { increment: 1 },
              ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
            },
          });
      });
      await quota.recordUsage(row.tenantId);
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].id;
  }
  for (const doc of await db.document.findMany({
    where: {
      confirmedAt: null,
      deletedAt: null,
      expiresAt: { lt: new Date() },
    },
    take: 1000,
    orderBy: { expiresAt: "asc" },
  })) {
    await remove(doc.objectKey);
    await db.document.update({
      where: { id: doc.id },
      data: { deletedAt: doc.deletedAt ?? new Date() },
    });
  }
  for (const row of await db.reportJob.findMany({
    where: { expiresAt: { lt: new Date() }, objectKey: { not: null } },
    take: 1000,
  })) {
    await remove(row.objectKey!);
    await db.reportJob.update({
      where: { id: row.id },
      data: { status: "EXPIRED", objectKey: null, sizeBytes: 0n },
    });
  }
  for (const row of await db.dataExportJob.findMany({
    where: { expiresAt: { lt: new Date() }, objectKey: { not: null } },
    take: 1000,
  })) {
    await remove(row.objectKey!);
    await db.dataExportJob.update({
      where: { id: row.id },
      data: { status: "EXPIRED", objectKey: null, sizeBytes: 0n },
    });
  }
  for (const session of await db.supportSession.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    take: 1000,
  })) {
    await db.$transaction(async (tx) => {
      const updated = await tx.supportSession.updateMany({
        where: { id: session.id, status: "ACTIVE" },
        data: { status: "EXPIRED", endedAt: new Date() },
      });
      if (updated.count)
        await tx.platformAuditLog.create({
          data: {
            platformUserId: session.platformUserId,
            tenantId: session.tenantId,
            entityType: "SupportSession",
            entityId: session.id,
            action: "SUPPORT_SESSION_EXPIRED",
          },
        });
    });
  }
  return { ok: true };
}
