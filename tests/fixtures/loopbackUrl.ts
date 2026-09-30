/**
 * Whether a base URL points at this machine and nowhere else.
 *
 * The real-claim crawl registers, verifies and claims an account through the
 * development build route, so it may only ever be pointed at a stack running on
 * this machine. A crawl aimed at a deployed site would leave a permanent claimed
 * account against a real migrated record there. The runner's gate refuses a
 * non-loopback address before it boots anything, and the crawl itself refuses
 * again, so an address exported in a shell cannot reach a deployed host by either
 * route.
 *
 * Loopback means the host is exactly `localhost`, `127.0.0.1` or `[::1]`, over
 * http or https, with any port and path. A name that merely starts with one of
 * those (`localhost.example.test`, `127.0.0.1.example.test`) resolves wherever its
 * owner says and is refused, as is anything carrying credentials.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return LOOPBACK_HOSTS.has(url.hostname);
}
