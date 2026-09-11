import { defineConfig } from "@playwright/test";
import path from "node:path";

const baseURL = "http://127.0.0.1:4173";
const databasePath = path.resolve(
  process.cwd(),
  ".data",
  `playwright-${process.pid}.sqlite`,
);

const viewports = {
  phone: { width: 360, height: 800 },
  desktop: { width: 1280, height: 800 },
} as const;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npm start",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      HOST: "127.0.0.1",
      PORT: "4173",
      VITE_GOOGLE_MAPS_API_KEY: "",
    },
  },
  projects: [
    {
      name: "chrome-phone",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: viewports.phone,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "chrome-desktop",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: viewports.desktop,
      },
    },
    {
      name: "webkit-phone",
      use: {
        browserName: "webkit",
        viewport: viewports.phone,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "webkit-desktop",
      use: { browserName: "webkit", viewport: viewports.desktop },
    },
  ],
});
