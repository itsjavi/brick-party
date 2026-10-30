import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1360, height: 860 },
  },
  webServer: {
    command: "pnpm --dir apps/web dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
