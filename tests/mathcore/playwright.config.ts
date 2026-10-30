/**
 * Mathcore browser tests (STEPS.md §10). Locally: `pnpm run build && pnpm run e2e` (serves dist with vite preview).
 * Against a deployment: PLAYWRIGHT_BASE_URL=<preview URL> pnpm run e2e (the pipeline does this, step 6).
 * MATHCORE_CHROMIUM points at a pre-installed Chromium when the bundled browsers are not downloaded.
 */
import { defineConfig } from "@playwright/test";

const base = process.env.PLAYWRIGHT_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: base ?? "http://localhost:4173",
    viewport: { width: 1400, height: 900 },
    // Protected preview deployments need the bypass header; it is sent only to the preview under test.
    extraHTTPHeaders: base && bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
    launchOptions: process.env.MATHCORE_CHROMIUM ? { executablePath: process.env.MATHCORE_CHROMIUM } : {},
  },
  webServer: base
    ? undefined
    : { command: "pnpm exec vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 60_000 },
});
