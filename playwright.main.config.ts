import { defineConfig, devices } from "@playwright/test";

// Neuron MAIN spine — attack A5.
//
// Lives in this repo because Playwright is installed here and Main's repos have
// no test harness. Adding one would mean editing Main's package.json, which is
// product source and outside our authority (SAFETY-TETHER.md §1). Odd filing,
// clean line.
//
// No `webServer` block on purpose: the default config's webServer starts THIS
// app on :3000. Main's stack (API :3000 in its own process, Qwik :5173) is
// started by hand and must not be spawned or killed by a test run.
export default defineConfig({
  testDir: "./tests/e2e/main",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
