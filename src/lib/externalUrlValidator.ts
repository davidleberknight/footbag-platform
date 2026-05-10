// User-supplied external URL validator (DD §3.17).
// Implements:
//   - empty/null acceptance (the field is optional everywhere)
//   - length cap (rejects abusive payloads early)
//   - URL parse (rejects malformed input)
//   - scheme allowlist http/https (blocks javascript:, data:, file:, ftp:)
//   - SSRF block: literal-IP rejection (private, loopback, link-local; v4 + v6)
//     followed by DNS resolution and re-check of the resolved IP
//   - Safe Browsing lookup via SafeBrowsingAdapter (stub or live Google v4)
//   - Reachability HEAD with redirect-follow + per-hop SSRF re-check and
//     24h result cache via HttpReachabilityAdapter (DD §3.17, optional).
//
// Service-layer use: call at the service boundary, throw ValidationError
// with the returned `error` message on invalid input. Persist
// `normalizedUrl` and stamp `external_url_validated_at` on accept.

import { lookup as dnsLookup } from 'node:dns/promises';
import { isLiteralIp, isBlockedIp, stripIpv6Brackets } from './ipBlocklist';
import {
  getSafeBrowsingAdapter,
  type SafeBrowsingAdapter,
} from '../adapters/safeBrowsingAdapter';
import {
  getHttpReachabilityAdapter,
  type HttpReachabilityAdapter,
} from '../adapters/httpReachabilityAdapter';

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
  reachability?: HttpReachabilityAdapter;
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
      // the reachability check below or 404 at click-through. DD does not
      // mandate rejection on lookup failure, only on resolution to a
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

  // Reachability check (DD §3.17). The adapter does redirect-follow with
  // per-hop SSRF re-check and warn-but-allow on 4xx/5xx; only network
  // failures (timeout, connection refused, redirect-to-blocked-IP) are
  // rejected. The 'disabled' adapter returns reachable=true unconditionally.
  const reachability = options.reachability ?? getHttpReachabilityAdapter();
  const reach = await reachability.check(parsed.toString());
  if (!reach.reachable) {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'URL could not be reached. Please verify the link.',
    };
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
