/**
 * HttpReachabilityAdapter: HEAD-based URL reachability check with
 * redirect-follow re-resolution and a 24-hour result cache.
 *
 * Per DD §3.17: HEAD up to 5 redirects, 10-second total budget, IP-block
 * check re-applied at every redirect hop (closes DNS-rebinding and
 * redirect-to-private-IP attacks). 2xx is reachable; 4xx/5xx warn-but-allow
 * (returned reachable=true with status); network/timeout failures return
 * reachable=false with the DD-verbatim "URL could not be reached" message.
 *
 * `live` performs real HEAD; `stub` consults in-memory state for tests
 * and dev; `disabled` returns reachable=true unconditionally to satisfy
 * the DD's "optional, configurable" clause for deployments that want no
 * outbound HTTP.
 *
 * Per DD §5.3 + tests rule "Dev↔staging adapter parity": live accepts an
 * injected fetchClient (and lookup) so the parity test can stand in fakes
 * without mocking globalThis.fetch.
 */
import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { config } from '../config/env';
import { logger } from '../config/logger';
import {
  isLiteralIp,
  isBlockedIp,
  stripIpv6Brackets,
} from '../lib/ipBlocklist';

const MAX_REDIRECTS = 5;
const TOTAL_BUDGET_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReachabilityResult {
  reachable: boolean;
  status?: number;
  finalUrl?: string;
  error?: string;
}

export interface HttpReachabilityAdapter {
  check(url: string): Promise<ReachabilityResult>;
}

export interface StubHttpReachabilityAdapter extends HttpReachabilityAdapter {
  /** Marks a URL as reachable with the given status (default 200). */
  setReachable(url: string, status?: number): void;
  /** Marks a URL as unreachable with an error message. */
  setUnreachable(url: string, error?: string): void;
  /** Forces the next check call to throw. Cleared after one use. */
  failNext(error: Error): void;
  /** Removes all entries and any pending error. */
  clear(): void;
}

type DnsLookupFn = (
  hostname: string,
) => Promise<{ address: string; family: number }>;

interface CacheEntry {
  result: ReachabilityResult;
  expiresAt: number;
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

export function createLiveHttpReachabilityAdapter(opts: {
  fetchClient?: typeof fetch;
  lookup?: DnsLookupFn;
  now?: () => number;
} = {}): HttpReachabilityAdapter {
  const httpFetch = opts.fetchClient ?? fetch;
  const lookup = opts.lookup ?? dnsLookup;
  const now = opts.now ?? (() => Date.now());
  const cache = new Map<string, CacheEntry>();

  async function hostIsBlocked(hostname: string): Promise<boolean> {
    const stripped = stripIpv6Brackets(hostname);
    if (isLiteralIp(stripped)) return isBlockedIp(stripped);
    try {
      const resolved = await lookup(stripped);
      return Boolean(resolved.address) && isBlockedIp(resolved.address);
    } catch {
      return false;
    }
  }

  return {
    async check(url) {
      const startCacheKey = hashUrl(url);
      const cached = cache.get(startCacheKey);
      if (cached && cached.expiresAt > now()) {
        return cached.result;
      }

      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);

      let currentUrl: string;
      try {
        currentUrl = new URL(url).toString();
      } catch {
        clearTimeout(deadline);
        const result: ReachabilityResult = {
          reachable: false,
          error: 'invalid URL',
        };
        cache.set(startCacheKey, { result, expiresAt: now() + CACHE_TTL_MS });
        return result;
      }

      let result: ReachabilityResult;
      try {
        let lastStatus = 0;
        let hops = 0;
        while (true) {
          const parsed = new URL(currentUrl);
          if (await hostIsBlocked(parsed.hostname)) {
            result = {
              reachable: false,
              error: 'redirect to blocked IP range',
              finalUrl: currentUrl,
            };
            break;
          }

          const res = await httpFetch(currentUrl, {
            method: 'HEAD',
            redirect: 'manual',
            signal: controller.signal,
          });
          lastStatus = res.status;

          if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (!location) {
              result = {
                reachable: false,
                error: `redirect with no Location header (HTTP ${res.status})`,
                finalUrl: currentUrl,
              };
              break;
            }
            hops += 1;
            if (hops > MAX_REDIRECTS) {
              result = {
                reachable: false,
                error: `too many redirects (>${MAX_REDIRECTS})`,
                finalUrl: currentUrl,
              };
              break;
            }
            currentUrl = new URL(location, currentUrl).toString();
            continue;
          }

          if (res.status >= 400) {
            // 4xx/5xx are warn-but-allow: an error response still proves the
            // host is reachable, so we log through the structured logger (not
            // console) and treat the URL as reachable.
            logger.warn('reachability: warn-but-allow', {
              url: currentUrl,
              status: res.status,
            });
          }
          result = {
            reachable: true,
            status: lastStatus,
            finalUrl: currentUrl,
          };
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        result = {
          reachable: false,
          error: isAbort ? 'timeout' : message,
          finalUrl: currentUrl,
        };
      } finally {
        clearTimeout(deadline);
      }

      const finalKey = result.finalUrl ? hashUrl(result.finalUrl) : startCacheKey;
      const entry: CacheEntry = { result, expiresAt: now() + CACHE_TTL_MS };
      cache.set(startCacheKey, entry);
      if (finalKey !== startCacheKey) cache.set(finalKey, entry);
      return result;
    },
  };
}

export function createStubHttpReachabilityAdapter(): StubHttpReachabilityAdapter {
  const reachable = new Map<string, number>();
  const unreachable = new Map<string, string>();
  let pendingError: Error | null = null;
  return {
    setReachable(url, status = 200) {
      reachable.set(url, status);
      unreachable.delete(url);
    },
    setUnreachable(url, error = 'unreachable') {
      unreachable.set(url, error);
      reachable.delete(url);
    },
    failNext(err) {
      pendingError = err;
    },
    clear() {
      reachable.clear();
      unreachable.clear();
      pendingError = null;
    },
    async check(url) {
      if (pendingError) {
        const err = pendingError;
        pendingError = null;
        throw err;
      }
      if (unreachable.has(url)) {
        return { reachable: false, error: unreachable.get(url), finalUrl: url };
      }
      const status = reachable.get(url) ?? 200;
      return { reachable: true, status, finalUrl: url };
    },
  };
}

export function createDisabledHttpReachabilityAdapter(): HttpReachabilityAdapter {
  return {
    async check() {
      return { reachable: true };
    },
  };
}

let singleton: HttpReachabilityAdapter | null = null;
let stubSingleton: StubHttpReachabilityAdapter | null = null;

export function getHttpReachabilityAdapter(): HttpReachabilityAdapter {
  if (singleton) return singleton;
  switch (config.httpReachabilityAdapter) {
    case 'live':
      singleton = createLiveHttpReachabilityAdapter();
      break;
    case 'disabled':
      singleton = createDisabledHttpReachabilityAdapter();
      break;
    case 'stub':
    default:
      stubSingleton = createStubHttpReachabilityAdapter();
      singleton = stubSingleton;
      break;
  }
  return singleton;
}

export function getStubHttpReachabilityAdapterForTests(): StubHttpReachabilityAdapter | null {
  return stubSingleton;
}

export function resetHttpReachabilityAdapterForTests(): void {
  singleton = null;
  stubSingleton = null;
}
