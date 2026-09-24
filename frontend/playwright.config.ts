import { defineConfig, devices } from "@playwright/test";

// Runs the real frontend + backend, with the backend in mock mode (no API key, no cost).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // Throwaway SQLite database: e2e runs never touch the real (Neon) database.
      command: "rm -f .e2e.sqlite && uv run uvicorn app.main:app --port 8100",
      cwd: "../backend",
      url: "http://localhost:8100/api/health",
      env: {
        AI_MOCK: "true",
        CORS_ORIGINS: "http://localhost:3100",
        DATABASE_URL: "sqlite+aiosqlite:///./.e2e.sqlite",
        DB_AUTO_CREATE: "true",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npx next dev --port 3100",
      url: "http://localhost:3100",
      env: { NEXT_PUBLIC_API_URL: "http://localhost:8100" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
