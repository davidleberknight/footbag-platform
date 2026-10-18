import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Playwright config for the rendered-style check (`e2e/rendered-style.spec.ts`):
 * every page view measured against the layout standard on the same local
 * throwaway stack the browser suite boots. It is its own config and its own CI
 * job because it walks the whole site and renders every view twice, which
 * would double the browser suite's run time if folded into it.
 */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['rendered-style.spec.ts'],
});
