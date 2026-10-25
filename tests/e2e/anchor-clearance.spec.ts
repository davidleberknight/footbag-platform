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

test('a section address still lands below the header when the header grows after the jump', { tag: ['@a11y'] }, async ({ page }) => {
  // When the webfont arrives after the jump and its letters are wider than the
  // fallback's, the nav wraps onto another row and the sticky header grows
  // over the heading the browser already scrolled to. Whether a machine's
  // fallback font fits one row fewer than the webfont varies, so the nav's
  // text is widened directly once the jump has landed.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/consecutives#competitions');
  await expect.poll(async () => landedBelowHeader(page, '#competitions h2')).toBe(true);
  const headerHeight = () => page.evaluate(() => document.querySelector('.site-header')!.getBoundingClientRect().height);
  const before = await headerHeight();
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('.main-nav a').forEach((link) => { link.style.letterSpacing = '0.2em'; });
  });
  await expect.poll(headerHeight).toBeGreaterThan(before);
  await expect.poll(async () => landedBelowHeader(page, '#competitions h2')).toBe(true);
});

test('a reader who has scrolled away is not pulled back when the header grows', { tag: ['@a11y'] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/consecutives#competitions');
  await expect.poll(async () => landedBelowHeader(page, '#competitions h2')).toBe(true);
  const scrollY = () => page.evaluate(() => window.scrollY);
  const landedAt = await scrollY();
  await page.mouse.wheel(0, -600);
  await expect.poll(scrollY).toBeLessThan(landedAt);
  // Let the wheel's own smooth scroll finish before taking the reader's spot.
  let readerAt = await scrollY();
  await expect.poll(async () => { const now = await scrollY(); const settled = now === readerAt; readerAt = now; return settled; }).toBe(true);
  const header = () => page.evaluate(() => document.querySelector('.site-header')!.getBoundingClientRect().height);
  const before = await header();
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('.main-nav a').forEach((link) => { link.style.letterSpacing = '0.2em'; });
  });
  await expect.poll(header).toBeGreaterThan(before);
  // Once the script has measured the grown header, any re-landing would have
  // begun by the next frame; the reader's own position must hold.
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--anchor-offset')))
    .toBe(`${Math.ceil(await header()) + 8}px`);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await scrollY()).toBe(readerAt);
});

test('an in-page jump lands its section below the header', { tag: ['@a11y'] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/consecutives');
  await page.evaluate(() => { window.location.hash = '#competitions'; });
  await expect.poll(async () => landedBelowHeader(page, '#competitions h2')).toBe(true);
});
