import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev:worker",
      url: "http://localhost:3003/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "npm run dev:api",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "npm run dev:web",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
