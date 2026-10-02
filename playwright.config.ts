import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

// End-to-end tests drive a real browser against a local copy of the site
// connected to the separate Neon *test* database (never dev or production).
try {
  loadEnvFile(".env.local");
} catch {}
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("TEST_DATABASE_URL must be set (in .env.local) to run end-to-end tests.");

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "tests/e2e/.output",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      // Settings already in the environment win over .env.local, so these
      // point the app at the test database and switch off real payments,
      // email, Turnstile and admin sign-in for the run.
      DATABASE_URL: testDb,
      DIRECT_BOOKING_ENABLED: "true",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      TURNSTILE_SECRET_KEY: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      CONTACT_MAILBOX: "",
      AUTH_MICROSOFT_ENTRA_ID_ID: "",
    },
  },
});
