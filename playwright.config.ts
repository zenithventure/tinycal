import { defineConfig } from "@playwright/test"

// Default to local dev server. Set BASE_URL when running against a Vercel
// preview deployment (e.g., BASE_URL=https://tinycal-pr-NN-zenithventure.vercel.app)
const BASE_URL = process.env.BASE_URL || "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
})
