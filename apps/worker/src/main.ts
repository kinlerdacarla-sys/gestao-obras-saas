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
import { Database } from "../../api/src/platform.js";
import { processBudgetImport } from "../../api/src/budget/import-stage.js";
const db = new Database();
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
emailWorker.on("error", (e) => console.error("Email worker", e.message));
emailWorker.on("failed", (_job, e) =>
  console.error("Email delivery failed", e.message),
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
digestWorker.on("error", (e) => console.error("Daily digest", e.message));
digestWorker.on("failed", (_job, e) =>
  console.error("Daily digest failed", e.message),
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
reportWorker.on("error", (e) => console.error("Report worker", e.message));
reportWorker.on("failed", (job, e) =>
  console.error("Report failed", job?.id, e.message),
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
kpiWorker.on("error", (e) => console.error("KPI snapshot", e.message));
kpiWorker.on("failed", (_job, e) =>
  console.error("KPI snapshot failed", e.message),
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
qualityWorker.on("error", (e) => console.error("Quality deadlines", e.message));
qualityWorker.on("failed", (_job, e) =>
  console.error("Quality deadline failed", e.message),
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
progressWorker.on("error", (error) =>
  console.error("Progress snapshot", error.message),
);
progressWorker.on("failed", (_job, error) =>
  console.error("Progress snapshot failed", error.message),
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
budgetWorker.on("failed", (job, error) =>
  console.error("Budget import failed", job?.id, error.message),
);
budgetWorker.on("error", (error) => console.error(error.message));
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
worker.on("failed", (job, error) =>
  console.error("Job failed", job?.id, error.message),
);
worker.on("error", (error) => console.error(error.message));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
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
    await db.$disconnect();
    process.exit(0);
  });
console.info("Worker ready: notifications");
await budgetWorker.waitUntilReady();
const health = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ worker: "up", queue: "budget-import" }));
});
health.listen(Number(process.env.WORKER_HEALTH_PORT ?? 3003), "0.0.0.0");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => health.close());
