/**
 * Walks the running site by links as one viewer and returns, for each view, the
 * first URL whose response named it in the development-only view header. It
 * fetches without rendering and submits no form, so it is fast and writes
 * nothing; the browser then renders only one page per view.
 */
import type { APIRequestContext } from '@playwright/test';
import { extractTargets, normalize } from '../../fixtures/crawl/core';
import { URLS_PER_SHAPE, urlShape, walkSkips } from '../../fixtures/pageLists';
import { VIEW_HEADER } from './renderedStyleCapture';

export interface WalkResult {
  /** View name to the first URL that rendered it. */
  views: Map<string, string>;
  fetched: number;
  /** True when the walk stopped at its page budget with URLs still queued. */
  capped: boolean;
}

/**
 * `cookie` is sent explicitly on every request: the session cookie is a
 * `__Host-` cookie and so always Secure, which the request API will not send
 * over the local stack's plain http although the browser will.
 */
export async function walkViews(request: APIRequestContext, seeds: readonly string[], cookie: string | null, maxPages = 1500): Promise<WalkResult> {
  const views = new Map<string, string>();
  const seen = new Set<string>();
  const perShape = new Map<string, number>();
  const queue = [...seeds];
  let fetched = 0;
  const enqueue = (url: string) => {
    if (seen.has(url) || walkSkips(url)) return;
    const shape = urlShape(url);
    const n = perShape.get(shape) ?? 0;
    if (n >= URLS_PER_SHAPE) return;
    perShape.set(shape, n + 1);
    seen.add(url);
    queue.push(url);
  };
  for (const s of seeds) seen.add(s);

  while (queue.length > 0 && fetched < maxPages) {
    const url = queue.shift() as string;
    fetched++;
    const res = await request.get(url, { maxRedirects: 0, failOnStatusCode: false, headers: cookie ? { cookie } : {} });
    const headers = res.headers();
    if (res.status() >= 300 && res.status() < 400) {
      // normalize keeps same-origin paths only, so an off-site redirect is not followed.
      const loc = headers.location ? normalize(headers.location) : null;
      if (loc) enqueue(loc);
      continue;
    }
    const view = headers[VIEW_HEADER];
    if (view && !views.has(view)) views.set(view, url);
    if (!(headers['content-type'] ?? '').includes('text/html')) continue;
    for (const target of extractTargets(await res.text(), url).gets) enqueue(target);
  }
  return { views, fetched, capped: queue.length > 0 };
}
