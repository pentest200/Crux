import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: process.env.BROWSER_BASE_URL || "http://127.0.0.1:5173",
    headless: true,
    channel: "chrome",
    acceptDownloads: true,
  },
  webServer: process.env.BROWSER_BASE_URL
    ? undefined
    : {
        command: "npm.cmd run dev -w client -- --host 127.0.0.1",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: false,
        timeout: 60000,
      },
});
