import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Config lives in tests/; webServer scripts live at repo root.
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Playwright config for the E2E click-through layer at tests/e2e/.
 *
 * The stack (web 3000 + image worker 4001) is booted by
 * `scripts/e2e/start-stack.sh`, which provisions an ephemeral test DB,
 * applies the schema, exports the env the dev stack expects, and execs
 * `bash scripts/dev.sh`. Playwright waits on /health/ready before the
 * first test.
 *
 * Single worker so SQLite WAL stays sequential and the per-test persona
 * seeders don't race the running app's writes.
 *
 * When PLAYWRIGHT_BASE_URL is set, the suite targets that deployed
 * environment instead (the post-deploy browser smoke): the URL becomes
 * baseURL and no local stack is booted.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const DEPLOYED_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;

// Every budget below is a ceiling that only a hung or broken application should
// ever reach, never a performance assertion. They are sized for an old, slow, or
// heavily loaded machine, because a budget tuned to a fast developer box turns
// ordinary slowness into a failure that looks like a defect, and the whole suite
// runs behind the deploy preflight where image builds compete for the CPU. The
// heaviest navigation is registration, whose response waits on a deliberately
// slow password hash and on the verification email being enqueued.
//
// E2E_TIMEOUT_FACTOR multiplies all of them for a box slower still, mirroring
// how VITEST_MAX_FORKS lets a slow machine throttle the unit suite without
// editing config.
const TIMEOUT_FACTOR = Math.max(1, Number(process.env.E2E_TIMEOUT_FACTOR ?? 1));
const budget = (ms: number): number => Math.round(ms * TIMEOUT_FACTOR);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Quarantined tests never run by default; select explicitly with --grep @quarantined.
  grepInvert: /@quarantined/,
  timeout: budget(90_000),
  expect: { timeout: budget(10_000) },
  outputDir: path.resolve(__dirname, 'test-results'),
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: DEPLOYED_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: budget(15_000),
    navigationTimeout: budget(30_000),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Local runs boot the throwaway stack; a deployed-target run must not.
  ...(DEPLOYED_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'bash scripts/e2e/start-stack.sh',
          cwd: REPO_ROOT,
          url: `http://127.0.0.1:${PORT}/health/ready`,
          reuseExistingServer: false,
          // Boot provisions a database, applies the schema, seeds it, and cold-starts
          // three processes through a TypeScript loader; on a slow disk that is minutes.
          timeout: budget(240_000),
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      }),
});
