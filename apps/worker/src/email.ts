import { notificationCategory } from "../../../packages/domain/src/notifications.js";
export { notificationCategory } from "../../../packages/domain/src/notifications.js";
import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Queue } from "bullmq";
import type { Database } from "../../api/src/platform.js";
import { redisConnection } from "../../../packages/config/src/redis.js";
import { configuration } from "../../../packages/config/src/index.js";
export async function queueNotificationEmail(db: Database) {
  const queue = new Queue("email-notification", {
    connection: redisConnection(),
  });
  let queued = 0;
  try {
    let cursor: string | undefined;
    for (;;) {
      const rows = await db.notification.findMany({
        where: {
          emailedAt: null,
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: 500,
      });
      for (const row of rows) {
        const pref = await db.notificationPreference.findUnique({
          where: {
            tenantId_userId: { tenantId: row.tenantId, userId: row.userId },
          },
        });
        const setting = await db.alertSetting.findUnique({
          where: { tenantId: row.tenantId },
        });
        if (
          pref?.emailEnabled &&
          pref[notificationCategory(row.type)] &&
          setting?.enableEmail
        ) {
          await queue.add(
            "notification",
            { id: row.id },
            {
              jobId: `email-${row.id}`,
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: 1000,
              removeOnFail: 1000,
            },
          );
          queued++;
        }
      }
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1].id;
    }
  } finally {
    await queue.close();
  }
  return { queued };
}
export async function deliverNotificationEmail(db: Database, id: string) {
  const row = await db.notification.findUnique({ where: { id } });
  if (!row || row.emailedAt) return { skipped: true };
  const [member, assignment, pref, settings] = await Promise.all([
    db.tenantUser.findFirst({
      where: {
        tenantId: row.tenantId,
        userId: row.userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        tenant: { status: "ACTIVE" },
      },
      include: { user: { select: { email: true } } },
    }),
    db.projectUser.findFirst({
      where: {
        tenantId: row.tenantId,
        projectId: row.projectId,
        userId: row.userId,
        status: "ACTIVE",
      },
    }),
    db.notificationPreference.findUnique({
      where: {
        tenantId_userId: { tenantId: row.tenantId, userId: row.userId },
      },
    }),
    db.alertSetting.findUnique({ where: { tenantId: row.tenantId } }),
  ]);
  const role = member?.role === "ADMIN" ? "ADMIN" : assignment?.role;
  if (
    !member ||
    !role ||
    !pref?.emailEnabled ||
    !settings?.enableEmail ||
    !pref[notificationCategory(row.type)]
  )
    return { skipped: true };
  if (
    role === "INSPECTOR" &&
    notificationCategory(row.type) === "financialNotifications"
  )
    return { skipped: true };
  // E-mail intentionally carries no project/financial/photo contents; the linked app reauthorizes all data.
  const message = {
    from: process.env.MAIL_FROM ?? "obras@example.test",
    to: member.user.email,
    subject: "Obras: nova notificação",
    text: `Tem uma nova notificação na plataforma Obras. Consulte ${configuration().WEB_ORIGIN}/notifications`,
  };
  if (process.env.MAIL_TRANSPORT === "stream") {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });
    const result = await transport.sendMail(message);
    const directory = path.resolve(
      process.env.MAIL_OUTBOX_PATH ?? "work/mail-outbox",
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${row.id}.eml`), result.message);
  } else if (process.env.SMTP_URL) {
    await nodemailer
      .createTransport(process.env.SMTP_URL, {
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      .sendMail(message);
  } else throw Error("MAIL_TRANSPORT_NOT_CONFIGURED");
  await db.notification.update({
    where: { id },
    data: { emailedAt: new Date() },
  });
  return { delivered: true };
}
export async function dailyDigest(db: Database) {
  const day = new Date().toLocaleDateString("en-CA", {
    timeZone: "Africa/Maputo",
  });
  let created = 0;
  const preferences = await db.notificationPreference.findMany({
    where: { dailyDigestEnabled: true },
    take: 10000,
  });
  for (const pref of preferences) {
    const member = await db.tenantUser.findFirst({
      where: {
        tenantId: pref.tenantId,
        userId: pref.userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
    });
    if (!member) continue;
    const projects = await db.project.findMany({
      where: {
        tenantId: pref.tenantId,
        ...(member.role === "ADMIN"
          ? {}
          : {
              users: {
                some: {
                  tenantId: pref.tenantId,
                  userId: pref.userId,
                  status: "ACTIVE",
                },
              },
            }),
      },
      select: {
        id: true,
        users: {
          where: { userId: pref.userId, status: "ACTIVE" },
          select: { role: true },
        },
      },
      orderBy: { id: "asc" },
    });
    if (!projects.length) continue;
    const visibleAlerts = await db.alert.findMany({
      where: {
        tenantId: pref.tenantId,
        status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
        OR: projects.map((project) => {
          const role =
            member.role === "ADMIN" ? "ADMIN" : project.users[0]?.role;
          return {
            projectId: project.id,
            ...(role === "CLIENT"
              ? { alertType: { in: ["NCR_CRITICAL", "SCHEDULE_DELAY"] } }
              : role === "INSPECTOR"
                ? {
                    alertType: {
                      in: [
                        "NCR_CRITICAL",
                        "NCR_OVERDUE",
                        "SCHEDULE_DELAY",
                        "INSPECTION_PENDING",
                        "DAILY_LOG_MISSING",
                        "MEASUREMENT_PENDING_APPROVAL",
                      ],
                    },
                  }
                : {}),
          };
        }),
      },
      select: { projectId: true, alertType: true, severity: true },
    });
    const count = visibleAlerts.length;
    const byType = (type: string) =>
      visibleAlerts.filter((x) => x.alertType === type).length;
    const riskProjects = new Set(
      visibleAlerts
        .filter((x) => ["HIGH", "CRITICAL"].includes(x.severity))
        .map((x) => x.projectId),
    ).size;
    const row = await db.notification.createMany({
      data: {
        tenantId: pref.tenantId,
        projectId: projects[0].id,
        userId: pref.userId,
        createdBy: pref.userId,
        eventKey: `daily-digest:${day}`,
        type: "DAILY_DIGEST",
        title: `Resumo diário: ${count} alertas nas suas obras`,
        message: `Obras com alertas de risco: ${riskProjects}. Medições pendentes: ${byType("MEASUREMENT_PENDING_APPROVAL")}. NCR vencidas: ${byType("NCR_OVERDUE")}. Obras com atividades atrasadas: ${byType("SCHEDULE_DELAY")}. Pagamentos pendentes: ${byType("PAYMENT_OVERDUE")}. Consulte os alertas para abrir as ações autorizadas.`,
        resourcePath: "/alerts",
        inAppVisible: pref.inAppEnabled,
      },
      skipDuplicates: true,
    });
    created += row.count;
  }
  await queueNotificationEmail(db);
  return { created };
}
