// External-URL rejections that shape alone decides, with no network and no
// configuration.
//
// Separate from the full validator because two callers need the same answer and
// only one of them can afford the validator's dependencies: the validator pulls
// in the Safe Browsing and reachability adapters, which read deploy config at
// module load, while the seed-URL verification pass runs as a script and keeps
// its pure core loadable without config or network. Restating the rules in the
// second place is what would let the two drift apart, so they live here once.
//
// Only `node:net`, through the IP blocklist, sits behind this module.

import { isLiteralIp, stripIpv6Brackets } from './ipBlocklist';

export const MAX_URL_LENGTH = 2048;
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Returns the caller-facing rejection message, or null when the URL survives to
 * the network checks. Expects an already-trimmed, non-empty string; an absent or
 * blank URL is an accepted optional field and never reaches here.
 */
export function structuralUrlRejection(trimmed: string): string | null {
  if (trimmed.length > MAX_URL_LENGTH) {
    return `URL exceeds the maximum length of ${MAX_URL_LENGTH} characters.`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Invalid URL format.';
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return 'This URL appears to use a disallowed protocol.';
  }

  // Reject a malformed or repeated scheme and an incomplete scheme with no host.
  // The WHATWG parser slips both past the allowlist above: a double scheme like
  // "http://https://host" parses with the literal host "https", and a bare
  // "https:" (or "https://") parses with an empty host.
  if (!parsed.hostname) {
    return 'URL is missing a host.';
  }
  if (parsed.hostname === 'http' || parsed.hostname === 'https'
      || /^https?:\/\/https?:\/\//i.test(trimmed)) {
    return 'URL has a malformed or repeated scheme.';
  }

  // A public website's host always carries a dot: a registrable domain needs at
  // least one label plus a suffix. A single label is therefore either an intranet
  // name or, as the legacy club seed shows, a word someone typed into a website
  // field, which the parser accepts as a host and which can even resolve through
  // a resolver's search list. Neither belongs on a public page, and nothing
  // downstream catches it: an unresolvable host is deliberately not rejected, and
  // the reachability probe is optional. A literal IP is exempt, dotless IPv6
  // included, because the IP guards decide those and their refusal means
  // something different from a malformed address.
  const bareHost = stripIpv6Brackets(parsed.hostname);
  if (!isLiteralIp(bareHost) && !bareHost.includes('.')) {
    return 'URL needs a full website address, such as example.com.';
  }

  return null;
}
