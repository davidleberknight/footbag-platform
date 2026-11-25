/**
 * Holds a browser run against a deployed environment to reads only: any request
 * other than GET or HEAD is aborted before it leaves the browser and recorded,
 * and the test that made it fails. The deployed check loads production, so a
 * spec change that clicked a submit button or posted a form would otherwise
 * write there with nothing to stop it.
 *
 * Blocking, not observing, is the point: a check that only noticed a write
 * would notice it after the host had already acted on it.
 *
 * The browser side is guarded on the context, not the page, for two reasons
 * Playwright documents. A page route never sees the first request of a popup,
 * and a context route covers every page the context opens. And page routes take
 * precedence over context routes, so the page-level abort of the
 * policy-violation report in the page-problems watcher always runs before this
 * guard, whichever was registered first. That report is the one exempt write:
 * this guard aborts it too but does not count it, because a violation is
 * already caught through the page's own listener and its report reaching the
 * host would only write a log line there.
 *
 * Service workers are blocked in the deployed config, because a request a
 * service worker makes is invisible to routing.
 *
 * The `request` fixture talks to the host without the browser, so routing never
 * sees it; it is wrapped so that only `get` and `head` (and `fetch` with one of
 * those methods) reach the host, and anything else throws before sending and
 * is recorded.
 */
import { test as base, expect, type APIRequestContext, type BrowserContext, type Request } from '@playwright/test';

const READ_METHODS = new Set(['GET', 'HEAD']);

export interface WriteGuard {
  /** One line per write the run attempted, each blocked before it was sent. */
  blocked: string[];
}

function isPolicyReport(url: string): boolean {
  try {
    return new URL(url).pathname === '/csp-report';
  } catch {
    return false;
  }
}

/**
 * Blocks every non-GET/HEAD request any page in the context makes. A request
 * the route could not see (one the browser sent outside routing) is still
 * recorded from the context's request event, so it fails the test even though
 * it could not be stopped.
 */
export async function guardContextReads(context: BrowserContext, guard: WriteGuard): Promise<void> {
  const counted = new Set<Request>();
  const record = (req: Request) => {
    if (counted.has(req) || READ_METHODS.has(req.method()) || isPolicyReport(req.url())) return;
    counted.add(req);
    guard.blocked.push(`browser ${req.method()} ${req.url()}`);
  };
  context.on('request', record);
  await context.route('**/*', async (route) => {
    const req = route.request();
    if (READ_METHODS.has(req.method())) {
      await route.fallback();
      return;
    }
    record(req);
    await route.abort('blockedbyclient');
  });
}

const API_WRITES = new Set(['post', 'put', 'patch', 'delete']);

/** The API client with every verb but GET and HEAD refused before it sends. */
export function guardRequestReads(request: APIRequestContext, guard: WriteGuard): APIRequestContext {
  // A rejected promise, not a synchronous throw, so the refusal arrives where
  // the real call's failure would: at the caller's await.
  const refuse = (method: string, url: unknown): Promise<never> => {
    const line = `request ${method.toUpperCase()} ${String(url)}`;
    guard.blocked.push(line);
    return Promise.reject(new Error(`the deployed check is read-only: ${line} was refused before it was sent`));
  };
  return new Proxy(request, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === 'string' && API_WRITES.has(prop)) {
        return (url: unknown) => refuse(prop, url);
      }
      if (prop === 'fetch') {
        return (urlOrRequest: string | Request, options?: { method?: string }) => {
          const method = (
            options?.method ?? (typeof urlOrRequest === 'string' ? 'GET' : urlOrRequest.method())
          ).toUpperCase();
          if (!READ_METHODS.has(method)) {
            return refuse(method, typeof urlOrRequest === 'string' ? urlOrRequest : urlOrRequest.url());
          }
          return target.fetch(urlOrRequest, options);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * The deployed check's `test`: `page` and `request` come guarded, and a test
 * that attempted any write fails at teardown, naming each one, even when the
 * body caught the refusal.
 */
export const test = base.extend<{ writeGuard: WriteGuard }>({
  writeGuard: async ({}, use) => {
    const guard: WriteGuard = { blocked: [] };
    await use(guard);
    expect(guard.blocked, `writes attempted by a read-only check:\n${guard.blocked.join('\n')}`).toEqual([]);
  },
  context: async ({ context, writeGuard }, use) => {
    await guardContextReads(context, writeGuard);
    await use(context);
  },
  request: async ({ request, writeGuard }, use) => {
    await use(guardRequestReads(request, writeGuard));
  },
});

export { expect };
