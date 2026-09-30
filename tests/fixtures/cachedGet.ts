/**
 * One render per path per test file, for read-only suites that assert many
 * things about the same page.
 *
 * Why: a suite that issues a fresh GET in every `it` re-renders the page each
 * time, and on the large freestyle pages that render is most of the suite's
 * wall clock. A read-only GET against a database no test in the file writes
 * returns the same response every time, so the first response is shared and
 * every assertion still runs against it.
 *
 * Only for GET paths the file never mutates between tests. A suite that seeds
 * or writes rows inside a describe, or that chains `.set(...)` / `.query(...)`
 * onto the request, keeps its own `request(app).get(...)`. Every test sharing
 * a path receives the same response object, so it is frozen (with its headers
 * and body): a test that writes to it fails at the write instead of changing
 * what later tests read. A request that fails is not kept, so the next reader
 * issues it again rather than inheriting the failure.
 *
 * Usage:
 *   const page = cachedGet(() => createApp());
 *   const res = await page('/freestyle/concepts');
 */
import request from 'supertest';
import type { Response } from 'supertest';

type App = Parameters<typeof request>[0];

export function cachedGet(
  getApp: () => App | Promise<App>,
): (path: string) => Promise<Response> {
  const cache = new Map<string, Promise<Response>>();
  return (path: string) => {
    let pending = cache.get(path);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => getApp())
        .then((app) => request(app).get(path))
        .then((res) => {
          Object.freeze(res.headers);
          // A binary body is a Buffer, which cannot be frozen; it stays as is.
          if (res.body && typeof res.body === 'object' && !ArrayBuffer.isView(res.body)) {
            Object.freeze(res.body);
          }
          return Object.freeze(res);
        });
      pending.catch(() => {
        cache.delete(path);
      });
      cache.set(path, pending);
    }
    return pending;
  };
}
