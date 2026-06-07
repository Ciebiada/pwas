import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./mono/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "webkit-mobile",
      testMatch: /(checkbox-focus|folding-focus|header-button-active|line-reorder)\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
});
