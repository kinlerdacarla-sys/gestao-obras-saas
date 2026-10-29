import { InvitationService } from "../../api/src/saas/invitations.js";
import { DataExportService } from "../../api/src/saas/exports.js";
import { scanInvitations, maintainSaas } from "./saas.js";
import {
  dailyDigest,
  queueNotificationEmail,
  deliverNotificationEmail,
} from "./email.js";
import { ReportService } from "../../api/src/report/report.service.js";
import { intelligenceContext } from "./intelligence.js";
import { snapshotProjectKpis, closeIntelligence } from "./intelligence.js";
import { monitorQualityDeadlines } from "./quality.js";
import "dotenv/config";
import { Worker, Queue } from "bullmq";
import { snapshotProgress } from "./progress.js";
import { createServer } from "node:http";
import { configuration } from "../../../packages/config/src/index.js";
import { redisConnection } from "../../../packages/config/src/redis.js";
import { Database, Cache } from "../../api/src/platform.js";
import { processBudgetImport } from "../../api/src/budget/import-stage.js";
const db = new Database();
const healthCache = new Cache();
const invitationQueue = new Queue("tenant-invitation", {
  connection: redisConnection(),
});
const invitationWorker = new Worker(
  "tenant-invitation",
  async (job) =>
    job.name === "scan"
      ? scanInvitations(db)
      : (await intelligenceContext())
          .get(InvitationService)
          .process(job.data.id),
  { connection: redisConnection(), concurrency: 2 },
);
await invitationQueue.upsertJobScheduler(
  "invitation-outbox",
  { every: 10000 },
  { name: "scan", data: {}, opts: { removeOnComplete: 10, removeOnFail: 10 } },
);
const exportWorker = new Worker(
  "tenant-data-export",
  async (job) =>
    (await intelligenceContext()).get(DataExportService).process(job.data.id),
  { connection: redisConnection(), concurrency: 1 },
);
const maintenanceQueue = new Queue("storage-usage-reconciliation", {
  connection: redisConnection(),
});
const maintenanceWorker = new Worker(
  "storage-usage-reconciliation",
  () => maintainSaas(db),
  { connection: redisConnection(), concurrency: 1 },
);
await maintenanceQueue.upsertJobScheduler(
  "saas-hourly",
  { every: 3600000 },
  {
    name: "reconcile",
    data: {},
    opts: { removeOnComplete: 24, removeOnFail: 24 },
  },
);
for (const worker of [invitationWorker, exportWorker, maintenanceWorker]) {
  worker.on("error", () =>
    console.error(
      JSON.stringify({
        event: "worker_error",
        queue: worker.name,
        environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      }),
    ),
  );
  worker.on("failed", (job) =>
    console.error(
      JSON.stringify({
        event: "worker_failed",
        queue: worker.name,
        environment: configuration().APP_ENV ?? configuration().NODE_ENV,
        jobId: job?.id,
      }),
    ),
  );
}
const emailQueue = new Queue("email-notification", {
  connection: redisConnection(),
});
const emailWorker = new Worker(
  "email-notification",
  async (job) =>
    job.name === "scan"
      ? queueNotificationEmail(db)
      : deliverNotificationEmail(db, job.data.id),
  { connection: redisConnection(), concurrency: 2 },
);
emailWorker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: emailWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
emailWorker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: emailWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
await emailQueue.upsertJobScheduler(
  "email-outbox",
  { every: 60000 },
  {
    name: "scan",
    data: {},
    opts: { removeOnComplete: 100, removeOnFail: 100 },
  },
);
const digestQueue = new Queue("daily-digest", {
  connection: redisConnection(),
});
const digestWorker = new Worker("daily-digest", () => dailyDigest(db), {
  connection: redisConnection(),
  concurrency: 1,
});
digestWorker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: digestWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
digestWorker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: digestWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
await digestQueue.upsertJobScheduler(
  "daily-digest",
  { pattern: "0 7 * * *", tz: "Africa/Maputo" },
  {
    name: "daily-digest",
    data: {},
    opts: { attempts: 3, removeOnComplete: 100, removeOnFail: 100 },
  },
);
const reportWorker = new Worker(
  "report-generation",
  async (job) =>
    (await intelligenceContext()).get(ReportService).process(job.data.id),
  { connection: redisConnection(), concurrency: 2 },
);
reportWorker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: reportWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
reportWorker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: reportWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
const kpiQueue = new Queue("project-kpi-snapshot", {
  connection: redisConnection(),
});
const kpiWorker = new Worker(
  "project-kpi-snapshot",
  async (job) => snapshotProjectKpis(job.data),
  {
    connection: redisConnection(),
    concurrency: 1,
  },
);
kpiWorker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: kpiWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
kpiWorker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: kpiWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
await kpiQueue.upsertJobScheduler(
  "daily-kpi",
  { pattern: "15 23 * * *", tz: "Africa/Maputo" },
  {
    name: "project-kpi-snapshot",
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
);
const qualityQueue = new Queue("quality-deadline-monitor", {
  connection: redisConnection(),
});
const qualityWorker = new Worker(
  "quality-deadline-monitor",
  async () => monitorQualityDeadlines(db),
  { connection: redisConnection(), concurrency: 1 },
);
qualityWorker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: qualityWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
qualityWorker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: qualityWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
await qualityQueue.upsertJobScheduler(
  "quality-deadlines",
  { pattern: "0 7 * * *", tz: "Africa/Maputo" },
  {
    name: "quality-deadline-monitor",
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
);
const progressQueue = new Queue("project-progress-snapshot", {
  connection: redisConnection(),
});
const progressWorker = new Worker(
  "project-progress-snapshot",
  async () => snapshotProgress(db),
  { connection: redisConnection(), concurrency: 1 },
);
progressWorker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: progressWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
progressWorker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: progressWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
await progressQueue.upsertJobScheduler(
  "daily-progress",
  { pattern: "0 23 * * *", tz: "Africa/Maputo" },
  {
    name: "project-progress-snapshot",
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
);
const budgetWorker = new Worker(
  "budget-import",
  async (job) => {
    if (job.name !== "parse-budget-xlsx") throw new Error("Unknown budget job");
    console.info("Processing budget import", job.id);
    await job.updateProgress(10);
    await processBudgetImport(db, job.data);
    await job.updateProgress(100);
  },
  { connection: redisConnection(), concurrency: 2 },
);
budgetWorker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: budgetWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
budgetWorker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: budgetWorker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
const url = new URL(configuration().REDIS_URL);
const worker = new Worker(
  "notifications",
  async (job) => {
    if (job.name !== "health")
      throw new Error("Tipo de tarefa não suportado na M1");
    return { ok: true };
  },
  {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      db: Number(url.pathname.slice(1) || 0),
      password: url.password || undefined,
      username: url.username || undefined,
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    },
  },
);
worker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "worker_failed",
      queue: worker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
      jobId: job?.id,
    }),
  ),
);
worker.on("error", () =>
  console.error(
    JSON.stringify({
      event: "worker_error",
      queue: worker.name,
      environment: configuration().APP_ENV ?? configuration().NODE_ENV,
    }),
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await invitationWorker.close();
    await invitationQueue.close();
    await exportWorker.close();
    await maintenanceWorker.close();
    await maintenanceQueue.close();
    await emailWorker.close();
    await emailQueue.close();
    await digestWorker.close();
    await digestQueue.close();
    await reportWorker.close();
    await kpiWorker.close();
    await kpiQueue.close();
    await closeIntelligence();
    await qualityWorker.close();
    await qualityQueue.close();
    await worker.close();
    await budgetWorker.close();
    await progressWorker.close();
    await progressQueue.close();
    await healthCache.quit();
    await db.$disconnect();
    process.exit(0);
  });
console.info("Worker ready: notifications");
await budgetWorker.waitUntilReady();
const health = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health/live") {
    res.end(JSON.stringify({ worker: "up" }));
    return;
  }
  if (req.url !== "/health" && req.url !== "/health/ready") {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    await Promise.all([
      db.$queryRaw`SELECT 1`,
      healthCache.ping(),
    ]);
    const running = [
      invitationWorker,
      exportWorker,
      maintenanceWorker,
      emailWorker,
      digestWorker,
      reportWorker,
      kpiWorker,
      qualityWorker,
      progressWorker,
      budgetWorker,
      worker,
    ].every((w) => w.isRunning());
    if (!running) throw Error("WORKER_NOT_READY");
    res.end(
      JSON.stringify({
        worker: "up",
        postgres: "up",
        redis: "up",
        queues: "up",
      }),
    );
  } catch {
    res.writeHead(503);
    res.end(JSON.stringify({ worker: "not-ready" }));
  }
});
health.listen(Number(process.env.WORKER_HEALTH_PORT ?? 3003), "0.0.0.0");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => health.close());
