import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Playwright config for the read-only browser check against a deployed
 * environment (tests/e2e/deployed). Run it through `npm run test:deployed --
 * <staging|production>`, which resolves the environment's address and names the
 * target; this config refuses to run without both.
 *
 * It boots nothing and writes nothing: it loads anonymous pages as a visitor
 * would and fails on what only a browser sees (a script or style the content
 * security policy refuses, a script error, a console error, a failed request).
 */
const BASE_URL = process.env.DEPLOYED_BASE_URL;
const TARGET = process.env.DEPLOYED_TARGET;
if (!BASE_URL || (TARGET !== 'staging' && TARGET !== 'production')) {
  throw new Error('Run the deployed browser check through: npm run test:deployed -- <staging|production>');
}

export default defineConfig({
  testDir: 'e2e/deployed',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: path.resolve(__dirname, 'test-results', 'deployed'),
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
