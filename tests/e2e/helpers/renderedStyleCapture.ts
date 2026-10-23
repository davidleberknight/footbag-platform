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
import type { Capture, FocusRecord } from './renderedStyle';

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

/** Well above the controls on the site's longest pages; a page with more is judged on its first ones. */
export const FOCUS_STOPS = 150;

/**
 * Presses Tab through the page from the top, as a keyboard reader would, and
 * records each element focus lands on, until focus leaves the page, comes back
 * round to an element already seen, or reaches the stop limit. Run after the
 * capture, because focusing scrolls the page and can open what a script shows
 * on focus.
 */
export async function walkFocus(page: Page, maxStops = FOCUS_STOPS): Promise<FocusRecord[]> {
  const present = await page.evaluate(() => typeof (globalThis as { __footbagFocusState?: unknown }).__footbagFocusState === 'function');
  if (!present) await page.evaluate(fs.readFileSync(MEASURE_SCRIPT, 'utf8'));
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
  const out: FocusRecord[] = [];
  const seen = new Set<string>();
  for (let k = 0; k < maxStops; k++) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => (globalThis as unknown as { __footbagFocusState: () => FocusRecord | null }).__footbagFocusState());
    if (!state || seen.has(state.key)) break;
    seen.add(state.key);
    out.push(state);
  }
  return out;
}

/**
 * Navigates to a URL at a viewport and captures it, naming the view from the
 * response header when the server sends one. At desktop width it also walks
 * keyboard focus, which looks the same at every width.
 */
export async function measureUrl(page: Page, url: string, viewport: { width: number; height: number }): Promise<Capture> {
  await page.setViewportSize(viewport);
  const response = await page.goto(url, { waitUntil: 'load' });
  const template = response?.headers()[VIEW_HEADER] ?? null;
  const cap = await capture(page, template);
  if (viewport.width >= DESKTOP.width) cap.focus = await walkFocus(page);
  return cap;
}
