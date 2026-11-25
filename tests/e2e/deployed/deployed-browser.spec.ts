/**
 * Read-only browser check against a deployed environment.
 *
 * Contract: every page a visitor lands on first loads with nothing the browser
 * refuses or reports: no content-security-policy violation, no script error, no
 * console error, and no failed or 4xx/5xx request for the page's own assets.
 * These are the defects a status-code smoke cannot see: every URL still answers
 * 200 while a blocked script leaves a map, a video or the captcha dead.
 *
 * It also follows each cited old footbag.org address through its redirect.
 *
 * On staging and on production alike it loads anonymous pages only, signs in as
 * nobody and submits nothing, so it writes nothing on the deployed host. The one
 * request a browser would otherwise send on its own, the policy-violation report
 * POST, is aborted before it leaves: a violation is still caught, through the
 * page's own listener, and the host's log is left alone. Every other request
 * that is not a GET or HEAD, from the browser or from the API client, is
 * blocked before it is sent and fails the test that made it, so a later change
 * to this spec cannot make a production run write.
 *
 * Run through `npm run test:deployed -- --target <staging|production>`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../helpers/readOnlyGuard';
import { watchPageProblems } from '../helpers/pageProblems';
import { LEGACY_REDIRECT_PATHS } from '../../../src/lib/legacyRedirects';

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

test('each cited old footbag.org address redirects on the deployed host to a page that renders', async ({ request }) => {
  // A deploy that dropped the redirect route, or a target that exists locally but
  // not in the deployed data, sends a reader following an old Wikipedia or club
  // link to the not-found page. The addresses carry no host, so this holds on the
  // distribution's own name before the real names resolve.
  const wrong: string[] = [];
  for (const from of LEGACY_REDIRECT_PATHS) {
    const hop = await request.get(from, { maxRedirects: 0 });
    const to = hop.headers()['location'] ?? '';
    const landed = to.startsWith('/') ? await request.get(to.split('#')[0], { maxRedirects: 0 }) : null;
    if (hop.status() !== 301 || landed?.status() !== 200) {
      wrong.push(`${from} -> ${hop.status()} ${to} -> ${landed?.status() ?? 'no target'}`);
    }
  }
  expect(wrong, wrong.join('\n')).toEqual([]);
});
