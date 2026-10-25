/**
 * Deep-link clearance under the sticky site header.
 *
 * The header's nav links wrap onto more rows as the viewport narrows and as
 * links are added, so its height changes. A section a link jumps to must land
 * below the header at every width, or the heading the reader asked for is
 * hidden behind it. Driven in a real browser because only a browser lays out
 * the wrapped header and performs the jump.
 */
import { test, expect, type Page } from '@playwright/test';

async function landedBelowHeader(page: Page, selector: string): Promise<boolean> {
  const { gap, atBottom } = await page.evaluate((sel) => {
    const header = document.querySelector('.site-header')!.getBoundingClientRect();
    const target = document.querySelector(sel)!.getBoundingClientRect();
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    return { gap: target.top - header.bottom, atBottom: window.scrollY >= maxScroll - 1 };
  }, selector);
  // A short page cannot scroll its last sections up to the header; scrolled to
  // its end, the jump went as far as it can.
  return gap >= 0 && (gap < 100 || atBottom);
}

for (const width of [390, 600, 1280]) {
  test(`a section address lands its section below the header at ${width}px`, { tag: ['@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/consecutives#competitions');
    // The jump scrolls smoothly, so poll until the heading settles just below
    // the header: a negative gap is hidden behind it, a large one means the
    // jump never reached it.
    await expect.poll(async () => landedBelowHeader(page, '#competitions h2')).toBe(true);
  });
}

test('an in-page jump lands its section below the header', { tag: ['@a11y'] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/consecutives');
  await page.evaluate(() => { window.location.hash = '#competitions'; });
  await expect.poll(async () => landedBelowHeader(page, '#competitions h2')).toBe(true);
});
