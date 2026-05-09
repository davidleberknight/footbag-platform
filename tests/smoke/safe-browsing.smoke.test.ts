/**
 * Safe Browsing live-API readiness probe (DD §3.17).
 *
 * Long-term, opt-in smoke suite. Exercises the real Google Safe Browsing
 * v4 threatMatches:find endpoint. The contract asserted here is permanent:
 * the configured `SAFE_BROWSING_API_KEY` reaches Google, the threatMatches
 * endpoint accepts the request shape, and the response wire format matches
 * what `LiveSafeBrowsingAdapter` parses.
 *
 * Run with: npm run test:smoke (gated behind RUN_STAGING_SMOKE=1).
 * Requires SAFE_BROWSING_API_KEY in the environment.
 *
 * Failure modes:
 *   - HTTP 400 PERMISSION_DENIED: API key is invalid or revoked.
 *   - HTTP 403: Safe Browsing API not enabled on the GCP project, or quota
 *     exceeded.
 *   - HTTP 429: rate limit exceeded; back off.
 *   - Network error: outbound HTTPS to safebrowsing.googleapis.com is
 *     blocked from the staging host (NAT / security group / firewall).
 *   - Empty matches against the canonical Google malware-test URL:
 *     Google has rotated test-corpus URLs; pin to the current test URL.
 *
 * Excluded from the default `npm test` suite via the test:smoke script's
 * scope, so dev and CI never reach Google.
 */
import { describe, it, expect } from 'vitest';
import { createLiveSafeBrowsingAdapter } from '../../src/adapters/safeBrowsingAdapter';

const RUN = process.env.RUN_STAGING_SMOKE === '1';
const apiKey = process.env.SAFE_BROWSING_API_KEY;

// Google publishes a stable test URL that always returns a MALWARE match.
// Source: https://developers.google.com/safe-browsing/v4/lookup-api
const KNOWN_MALWARE_TEST_URL = 'http://malware.testing.google.test/testing/malware/';
const KNOWN_SAFE_URL = 'https://example.com/';

describe.skipIf(!RUN)('Safe Browsing live API: threatMatches:find', () => {
  it('SAFE_BROWSING_API_KEY is configured', () => {
    expect(apiKey).toBeDefined();
    expect(apiKey?.length ?? 0).toBeGreaterThan(0);
  });

  it('returns safe=true for a benign URL', async () => {
    if (!apiKey) return;
    const adapter = createLiveSafeBrowsingAdapter({ apiKey });
    const result = await adapter.lookup(KNOWN_SAFE_URL);
    expect(result.safe).toBe(true);
    expect(result.threatTypes).toEqual([]);
  });

  it('returns safe=false with MALWARE for the canonical Google test URL', async () => {
    if (!apiKey) return;
    const adapter = createLiveSafeBrowsingAdapter({ apiKey });
    const result = await adapter.lookup(KNOWN_MALWARE_TEST_URL);
    expect(result.safe).toBe(false);
    expect(result.threatTypes).toContain('MALWARE');
  });
});
