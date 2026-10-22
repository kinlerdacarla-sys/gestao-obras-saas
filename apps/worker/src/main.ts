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
