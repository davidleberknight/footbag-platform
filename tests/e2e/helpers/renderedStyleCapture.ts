/**
 * Playwright glue for the rendered-style helper: installs the in-page capture
 * script, measures a page at a viewport, and reads which view rendered it.
 *
 * The script is loaded by path, never serialised from a function, so the
 * browser runs exactly the file the shape test checked.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { Capture } from './renderedStyle';

export const MEASURE_SCRIPT = path.resolve(__dirname, 'renderedStyle.browser.js');

/** The development-only response header naming the view that rendered a page. */
export const VIEW_HEADER = 'x-footbag-view';

export const PHONE = { width: 390, height: 844 } as const;
export const DESKTOP = { width: 1280, height: 800 } as const;

/** Installs the capture script for every document the page loads from now on. */
export async function installMeasure(page: Page): Promise<void> {
  await page.addInitScript({ path: MEASURE_SCRIPT });
}

/**
 * Captures the page as currently drawn; defines the script first if this
 * document has not got it. The site's content security policy refuses an
 * injected script tag, as it should, so the source is evaluated directly, which
 * the policy does not govern.
 */
export async function capture(page: Page, template: string | null = null): Promise<Capture> {
  const present = await page.evaluate(() => typeof (globalThis as { __footbagMeasure?: unknown }).__footbagMeasure === 'function');
  if (!present) await page.evaluate(fs.readFileSync(MEASURE_SCRIPT, 'utf8'));
  return page.evaluate(
    (t) => (globalThis as unknown as { __footbagMeasure: (o: { template: string | null }) => Promise<Capture> }).__footbagMeasure({ template: t }),
    template,
  );
}

/** Navigates to a URL at a viewport and captures it, naming the view from the response header when the server sends one. */
export async function measureUrl(page: Page, url: string, viewport: { width: number; height: number }): Promise<Capture> {
  await page.setViewportSize(viewport);
  const response = await page.goto(url, { waitUntil: 'load' });
  const template = response?.headers()[VIEW_HEADER] ?? null;
  return capture(page, template);
}
