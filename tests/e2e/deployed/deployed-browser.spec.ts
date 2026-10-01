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

const TARGET = process.env.DEPLOYED_TARGET;

interface Problems { list: string[] }

async function watch(page: Page): Promise<Problems> {
  const problems: Problems = { list: [] };
  const origin = new URL(process.env.DEPLOYED_BASE_URL as string).origin;
  await page.route('**/csp-report', (route) => route.abort());
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      // eslint-disable-next-line no-console
      console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });
  // Errors a third-party frame logs about itself (the captcha widget, a video
  // player) are that vendor's noise, not this site's defect; a policy violation is
  // logged from the page itself and always counts.
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location().url;
    if (source && new URL(source, origin).origin !== origin && !msg.text().startsWith('CSP violation')) return;
    problems.list.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.list.push(`script error: ${err.message}`));
  page.on('requestfailed', (req) => {
    const url = new URL(req.url());
    // The report POST aborted above; the violation it reports is already counted.
    if (url.pathname === '/csp-report') return;
    if (url.origin === origin) problems.list.push(`request failed: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`);
  });
  page.on('response', (res) => {
    if (new URL(res.url()).origin === origin && res.status() >= 400) problems.list.push(`${res.status()} for ${res.url()}`);
  });
  return problems;
}

async function visit(page: Page, path: string): Promise<void> {
  const res = await page.goto(path, { waitUntil: 'load' });
  expect(res?.status(), `${path} status`).toBe(200);
  await expect(page.locator('h1').first(), `${path} rendered its heading`).toBeVisible();
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
