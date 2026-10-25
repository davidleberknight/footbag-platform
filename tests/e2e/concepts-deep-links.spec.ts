/**
 * Freestyle Concepts deep-link reveal contract.
 *
 * Concepts keeps its content in closed chapters and boxes (<details>). A link to
 * an id inside a closed one lands on hidden content unless every enclosing box
 * opens and the target is scrolled into view. Only a real browser shows that:
 * the opener runs on load and on hashchange, the page scrolls smoothly, and an
 * opened chapter reflows the grid around it. The ids each link resolves to are
 * checked at integration speed; this checks that following one reveals it.
 *
 * Chromium also expands a closed <details> itself when a page loads with a
 * fragment inside it, so the two address-bar cases prove the outcome a visitor
 * gets rather than the opener alone; the in-page link case is the one that fails
 * without the opener, because a same-page hashchange gets no native expansion.
 */
import { test, expect, type Page } from '@playwright/test';

/** Every <details> enclosing the element is open. */
async function allAncestorsOpen(page: Page, id: string): Promise<boolean> {
  return page.evaluate((targetId) => {
    const el = document.getElementById(targetId);
    if (!el) return false;
    let d = el.closest('details');
    while (d) {
      if (!d.open) return false;
      d = d.parentElement ? d.parentElement.closest('details') : null;
    }
    return true;
  }, id);
}

test('a retired panel id typed into the address bar opens its chapter and shows the entry', async ({ page }) => {
  await page.goto('/freestyle/concepts#glossary-panel-ducking');
  expect(await allAncestorsOpen(page, 'glossary-panel-ducking')).toBe(true);
  // The empty legacy anchor sits inside the Ducking term, which must be on screen.
  await expect(page.locator('#term-ducking')).toBeInViewport();
});

test('a target two boxes deep opens both the chapter and the box inside it', async ({ page }) => {
  await page.goto('/freestyle/concepts#term-pixie');
  expect(await allAncestorsOpen(page, 'term-pixie')).toBe(true);
  await expect(page.locator('#term-pixie')).toBeInViewport();
});

test('an in-page link into a closed chapter opens that chapter and scrolls to it', async ({ page }) => {
  await page.goto('/freestyle/concepts');
  await page.locator('#chapter-operators-modifiers > summary').click();
  await page.locator('#chapter-operators-modifiers a[href="#section-timing-sets"]').first().click();
  await expect(page).toHaveURL(/#section-timing-sets$/);
  expect(await allAncestorsOpen(page, 'section-timing-sets')).toBe(true);
  await expect(page.locator('#section-timing-sets')).toBeInViewport();
});
