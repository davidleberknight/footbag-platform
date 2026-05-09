// User-supplied external URL validator (DD §3.17).
// Implements:
//   - empty/null acceptance (the field is optional everywhere)
//   - length cap (rejects abusive payloads early)
//   - URL parse (rejects malformed input)
//   - scheme allowlist http/https (blocks javascript:, data:, file:, ftp:)
//   - SSRF block: literal-IP rejection (private, loopback, link-local; v4 + v6)
//     followed by DNS resolution and re-check of the resolved IP
//   - Safe Browsing lookup via SafeBrowsingAdapter (stub or live Google v4)
//
// Deferred to a later slice (tracked in IP):
//   - redirect-follow re-resolution at each hop
//   - reachability HEAD with 24-hour cache
//   - Handlebars helper for safe link rendering
//
// Service-layer use: call at the service boundary, throw ValidationError
// with the returned `error` message on invalid input. Persist
// `normalizedUrl` and stamp `external_url_validated_at` on accept.

import { isIPv4, isIPv6 } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import {
  getSafeBrowsingAdapter,
  type SafeBrowsingAdapter,
} from '../adapters/safeBrowsingAdapter';

const MAX_URL_LENGTH = 2048;
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

export interface ValidatedExternalUrl {
  valid: boolean;
  normalizedUrl: string | null;
  error?: string;
}

/**
 * DNS lookup function shape compatible with `node:dns/promises.lookup`. The
 * validator uses this seam so unit tests can inject a deterministic resolver
 * without going to the network. Default is the real `node:dns/promises.lookup`.
 */
export type DnsLookupFn = (
  hostname: string,
) => Promise<{ address: string; family: number }>;

export interface ValidateExternalUrlOptions {
  lookup?: DnsLookupFn;
  safeBrowsing?: SafeBrowsingAdapter;
}

export async function validateExternalUrl(
  input: string | null | undefined,
  options: ValidateExternalUrlOptions = {},
): Promise<ValidatedExternalUrl> {
  if (input === null || input === undefined) {
    return { valid: true, normalizedUrl: null };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { valid: true, normalizedUrl: null };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      normalizedUrl: null,
      error: `URL exceeds the maximum length of ${MAX_URL_LENGTH} characters.`,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'Invalid URL format.',
    };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'This URL appears to use a disallowed protocol.',
    };
  }

  // SSRF guard, layer 1: hostname is a literal IP in a blocked range. The
  // WHATWG URL parser keeps brackets around IPv6 hostnames (hostname for
  // [::1] is "[::1]"), so strip outer brackets before testing.
  const hostname = stripIpv6Brackets(parsed.hostname);
  if (isLiteralIp(hostname) && isBlockedIp(hostname)) {
    return notAllowed();
  }

  // SSRF guard, layer 2: resolve hostname (when not a literal IP) and
  // re-check the resolved IP. DD §3.17 calls this a snapshot, not an
  // ongoing guarantee against later DNS changes — run once at submit.
  if (!isLiteralIp(hostname)) {
    const lookup = options.lookup ?? dnsLookup;
    let resolved: { address: string; family: number };
    try {
      resolved = await lookup(hostname);
    } catch {
      // Unresolvable hostnames don't get pre-rejected here; they will fail
      // any reachability check (deferred) or 404 at click-through. DD does
      // not mandate rejection on lookup failure, only on resolution to a
      // blocked range.
      resolved = { address: '', family: 0 };
    }
    if (resolved.address && isBlockedIp(resolved.address)) {
      return notAllowed();
    }
  }

  // Safe Browsing lookup. A positive match is rejected with the same
  // generic message used for SSRF rejections (DD §3.17 error responses).
  const safeBrowsing = options.safeBrowsing ?? getSafeBrowsingAdapter();
  const sbResult = await safeBrowsing.lookup(parsed.toString());
  if (!sbResult.safe) {
    return notAllowed();
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

function notAllowed(): ValidatedExternalUrl {
  return {
    valid: false,
    normalizedUrl: null,
    error: 'This URL is not allowed.',
  };
}

function isLiteralIp(hostname: string): boolean {
  return isIPv4(hostname) || isIPv6(hostname);
}

/**
 * Blocks the IP ranges enumerated in DD §3.17 plus IPv6 equivalents.
 *   IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16.
 *   IPv6: ::1 (loopback), fc00::/7 (unique local), fe80::/10 (link-local),
 *         and IPv4-mapped form ::ffff:a.b.c.d that re-enters an IPv4 range.
 */
function isBlockedIp(address: string): boolean {
  if (isIPv4(address)) return isBlockedIpv4(address);
  if (isIPv6(address)) return isBlockedIpv6(address);
  return false;
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(o => Number.parseInt(o, 10));
  if (octets.length !== 4 || octets.some(o => Number.isNaN(o))) return false;
  const [a, b] = octets;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12 → 172.16.x.x through 172.31.x.x
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  return false;
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isBlockedIpv6(address: string): boolean {
  const bytes = ipv6ToBytes(address);
  if (bytes === null) return false;
  // Loopback ::1 — first 15 bytes zero, last byte 0x01.
  if (bytes.slice(0, 15).every(b => b === 0) && bytes[15] === 1) return true;
  // Unique local fc00::/7 — first byte top 7 bits == 1111110 → 0xfc or 0xfd.
  if (bytes[0] === 0xfc || bytes[0] === 0xfd) return true;
  // Link-local fe80::/10 — first byte 0xfe and top 2 bits of byte 1 == 10.
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  // IPv4-mapped ::ffff:0:0/96 — first 10 bytes zero, next 2 bytes 0xff,0xff.
  // Re-check the embedded v4 against the v4 blocklist.
  if (
    bytes.slice(0, 10).every(b => b === 0) &&
    bytes[10] === 0xff && bytes[11] === 0xff
  ) {
    const v4 = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    if (isBlockedIpv4(v4)) return true;
  }
  return false;
}

/**
 * Parses an IPv6 address into its 16-byte representation, handling the
 * `::` shorthand and the IPv4-mapped trailing form (`::ffff:127.0.0.1`).
 * Returns null on malformed input. Caller should pre-validate via
 * `node:net.isIPv6` for normal flow; this parser tolerates valid forms.
 */
function ipv6ToBytes(address: string): Uint8Array | null {
  const lower = address.toLowerCase();
  // Split on '::' (at most one occurrence).
  const doubleColonParts = lower.split('::');
  if (doubleColonParts.length > 2) return null;
  let leftStr: string, rightStr: string;
  if (doubleColonParts.length === 2) {
    [leftStr, rightStr] = doubleColonParts;
  } else {
    leftStr = lower;
    rightStr = '';
  }
  const leftGroups = leftStr.length > 0 ? leftStr.split(':') : [];
  const rightGroups = rightStr.length > 0 ? rightStr.split(':') : [];
  // Trailing IPv4 dotted-quad (e.g. ::ffff:127.0.0.1). Convert to two 16-bit groups.
  const lastRight = rightGroups[rightGroups.length - 1];
  const lastLeft = leftStr === lower ? leftGroups[leftGroups.length - 1] : undefined;
  const trailingV4 = (rightGroups.length > 0 ? lastRight : lastLeft) ?? '';
  if (trailingV4.includes('.')) {
    const v4Octets = trailingV4.split('.').map(o => Number.parseInt(o, 10));
    if (v4Octets.length !== 4 || v4Octets.some(o => Number.isNaN(o) || o < 0 || o > 255)) {
      return null;
    }
    const hi = ((v4Octets[0] << 8) | v4Octets[1]).toString(16);
    const lo = ((v4Octets[2] << 8) | v4Octets[3]).toString(16);
    if (rightGroups.length > 0) {
      rightGroups.splice(-1, 1, hi, lo);
    } else {
      leftGroups.splice(-1, 1, hi, lo);
    }
  }
  const totalGroups = leftGroups.length + rightGroups.length;
  if (totalGroups > 8) return null;
  const fillCount = doubleColonParts.length === 2 ? 8 - totalGroups : 0;
  if (doubleColonParts.length !== 2 && totalGroups !== 8) return null;
  const allGroups = [
    ...leftGroups,
    ...Array(fillCount).fill('0'),
    ...rightGroups,
  ];
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const g = allGroups[i];
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = Number.parseInt(g, 16);
    bytes[i * 2] = (v >> 8) & 0xff;
    bytes[i * 2 + 1] = v & 0xff;
  }
  return bytes;
}
