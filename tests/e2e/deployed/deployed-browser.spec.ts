/**
 * Read-only browser check against a deployed environment.
 *
 * Contract: every page a visitor lands on first loads with nothing the browser
 * refuses or reports: no content-security-policy violation, no script error, no
 * console error, and no failed or 4xx/5xx request for the page's own assets.
 * These are the defects a status-code smoke cannot see: every URL still answers
 * 200 while a blocked script leaves a map, a video or the captcha dead.
 *
 * On staging and on production alike it loads anonymous pages only, signs in as
 * nobody and submits nothing, so it writes nothing on the deployed host. The one
 * request a browser would otherwise send on its own, the policy-violation report
 * POST, is aborted before it leaves: a violation is still caught, through the
 * page's own listener, and the host's log is left alone.
 *
 * Run through `npm run test:deployed -- --target <staging|production>`.
 */
import { test, expect, type Page } from '@playwright/test';
import { watchPageProblems } from '../helpers/pageProblems';

const TARGET = process.env.DEPLOYED_TARGET;

function watch(page: Page) {
  return watchPageProblems(page, new URL(process.env.DEPLOYED_BASE_URL as string).origin);
}

async function visit(page: Page, path: string): Promise<void> {
  const res = await page.goto(path, { waitUntil: 'load' });
  expect(res?.status(), `${path} status`).toBe(200);
  await expect(page.locator('h1').first(), `${path} rendered its heading`).toBeVisible();
  // A script's own fetch after load (the clubs map's SVG) must finish here: the
  // next navigation would abort it, reporting a failure the visitor never sees and
  // hiding a real one.
  await page.waitForLoadState('networkidle');
}

const ANONYMOUS_PAGES = ['/', '/freestyle/tricks', '/clubs', '/media', '/login'];

test('anonymous landing pages load with nothing refused, thrown or failed', async ({ page }) => {
  const problems = await watch(page);
  const pages = TARGET === 'production' ? [...ANONYMOUS_PAGES, '/register'] : ANONYMOUS_PAGES;
  for (const path of pages) await visit(page, path);

  // One trick page, reached the way a visitor reaches it, so its video facade and
  // notation scripts load under the deployed policy too.
  await visit(page, '/freestyle/tricks');
  const trickHref = await page.locator('a[href^="/freestyle/tricks/"]').first().getAttribute('href');
  expect(trickHref, 'the dictionary links at least one trick').toBeTruthy();
  await visit(page, trickHref!);

  expect(problems.list, problems.list.join('\n')).toEqual([]);
});
