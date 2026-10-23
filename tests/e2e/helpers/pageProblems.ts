/**
 * Collects what a browser refuses or reports while a page loads: a
 * content-security-policy violation, a script error, a console error, and a
 * failed or 4xx/5xx request for the site's own assets. These are the defects a
 * status-code check cannot see: every URL still answers 200 while a blocked
 * script leaves a map, a video or the captcha dead.
 *
 * The policy-violation report POST is aborted before it leaves, so a deployed
 * host's log is left alone; the violation is still caught through the page's own
 * listener.
 */
import type { Page } from '@playwright/test';

export interface PageProblems { list: string[] }

export interface WatchOptions {
  /**
   * Leaves the page's own HTTP status out, for a caller that judges the page
   * itself: the not-found page answers 404 by design, and only the assets it
   * loads are problems.
   */
  ignoreDocumentStatus?: boolean;
  /**
   * Leaves out requests the page abandons when the caller navigates on: a video
   * still streaming, an event stream that never ends. The deployed check waits
   * for the network to settle instead, so it keeps them.
   */
  ignoreAborted?: boolean;
  /** Same-origin URLs whose failures are expected where the caller runs, such as media files a seeded row names but no store holds. */
  ignoreUrl?: (url: string) => boolean;
}

export async function watchPageProblems(page: Page, origin: string, opts: WatchOptions = {}): Promise<PageProblems> {
  const ignored = (url: string) => !!url && !!opts.ignoreUrl?.(url);
  const problems: PageProblems = { list: [] };
  await page.route('**/csp-report', (route) => route.abort());
  await page.addInitScript(() => {
    // Init scripts run in every frame, cross-origin ones included. A violation
    // inside a vendor's frame (the captcha widget fetching a data: URL under
    // Cloudflare's own policy) is that vendor's policy, not this site's, so only
    // the top-level document, which this site's policy governs, reports.
    if (window !== window.top) return;
    document.addEventListener('securitypolicyviolation', (e) => {
      // eslint-disable-next-line no-console
      console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });
  // Errors a third-party frame logs about itself (the captcha widget, a video
  // player) are that vendor's noise, not this site's defect; a policy violation is
  // logged only from the top-level document above, so it always counts.
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location().url;
    if (source && new URL(source, origin).origin !== origin && !msg.text().startsWith('CSP violation')) return;
    // The browser's own line for a failed load names the resource as its source;
    // the response handler below already judges that load.
    if (msg.text().startsWith('Failed to load resource') && (ignored(source) || (opts.ignoreDocumentStatus && source === page.url()))) return;
    problems.list.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.list.push(`script error: ${err.message}`));
  page.on('requestfailed', (req) => {
    const url = new URL(req.url());
    // The report POST aborted above; the violation it reports is already counted.
    if (url.pathname === '/csp-report') return;
    if (ignored(req.url())) return;
    if (opts.ignoreAborted && req.failure()?.errorText === 'net::ERR_ABORTED') return;
    if (url.origin === origin) problems.list.push(`request failed: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`);
  });
  page.on('response', (res) => {
    if (opts.ignoreDocumentStatus && res.request().isNavigationRequest()) return;
    if (ignored(res.url())) return;
    if (new URL(res.url()).origin === origin && res.status() >= 400) problems.list.push(`${res.status()} for ${res.url()}`);
  });
  return problems;
}
