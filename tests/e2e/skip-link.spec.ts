/**
 * Skip-link keyboard contract.
 *
 * The site header is fourteen tab stops for a visitor and sixteen for a
 * logged-in administrator (the logo, twelve section links, and the auth group),
 * and every page renders it. Without a skip link a keyboard, switch, or voice
 * user crosses all of them before reaching content, on every navigation. The
 * automated accessibility scan cannot see this: its bypass-blocks rule is
 * satisfied by the presence of a main landmark, which helps screen-reader users
 * and does nothing for a sighted keyboard user.
 *
 * So the contract is asserted here, by driving the keyboard: the link is the
 * first tab stop, it is invisible until it takes focus, and activating it moves
 * real focus into the content rather than only scrolling the viewport. That
 * last point is the one that silently regresses — without tabindex="-1" on the
 * main element the browser scrolls but leaves focus behind, so the next Tab
 * lands back at the top of the nav and the control accomplishes nothing.
 */
import { test, expect } from '@playwright/test';
import { seedAdmin } from '../fixtures/personas';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';

test('skip link is the first tab stop and moves focus into content', { tag: ['@smoke', '@a11y'] }, async ({ page }) => {
  await page.goto('/');

  const skip = page.locator('.skip-link');

  // Off-screen at rest: present in the DOM and reachable, but not shown.
  expect(await skip.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);

  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();

  // Visible once focused, and inside the viewport rather than clipped at its edge.
  const box = await skip.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);

  await page.keyboard.press('Enter');

  // Focus itself moved, not just the scroll position.
  await expect(page.locator('#main-content')).toBeFocused();

  // And the next Tab continues into the content rather than returning to the nav.
  await page.keyboard.press('Tab');
  const landedInsideMain = await page.evaluate(() => {
    const active = document.activeElement;
    const main = document.querySelector('#main-content');
    return !!active && !!main && main.contains(active);
  });
  expect(landedInsideMain).toBe(true);
});

test('skip link clears the sticky header when it lands', { tag: ['@a11y'] }, async ({ page }) => {
  await page.goto('/freestyle/tricks');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  const { headerBottom, mainTop } = await page.evaluate(() => {
    const header = document.querySelector('.site-header')!.getBoundingClientRect();
    const main = document.querySelector('#main-content')!.getBoundingClientRect();
    return { headerBottom: header.bottom, mainTop: main.top };
  });

  // The header is sticky, so a target that lands at viewport top is underneath it.
  expect(mainTop).toBeGreaterThanOrEqual(headerBottom);
});

test('skip link works for a logged-in administrator, whose header is longer', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const admin = seedAdmin(db, { slug: `skiplink_admin_${Math.random().toString(36).slice(2, 10)}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, admin);
  const page = await context.newPage();
  await page.goto('/');

  const navStops = await page.evaluate(() => {
    const main = document.querySelector('#main-content')!;
    const sel = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll(sel)).filter(
      (el) => main.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING,
    ).length;
  });
  // The skip link plus the header's own controls; the admin header is the long one.
  expect(navStops).toBeGreaterThan(14);

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await context.close();
});
