import { defineConfig } from "vitest/config";
import "dotenv/config";
const redis = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
redis.pathname = "/15";
export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    env: { NODE_ENV: "test", REDIS_URL: redis.toString() },
  },
});
