/**
 * Safe Browsing live-API readiness probe.
 *
 * Long-term, opt-in smoke suite. Exercises the real Google Safe Browsing
 * v4 threatMatches:find endpoint. The contract asserted here is permanent:
 * the configured `SAFE_BROWSING_API_KEY` reaches Google, the threatMatches
 * endpoint accepts the request shape, and the response wire format matches
 * what `LiveSafeBrowsingAdapter` parses.
 *
 * Run with: npm run test:smoke (gated behind RUN_STAGING_SMOKE=1).
 * Requires SAFE_BROWSING_API_KEY in the environment, sourced by
 * scripts/test-smoke.sh from the SSM SecureString
 * /footbag/<target>/secrets/safe_browsing_api_key. The runner resolves the
 * target from SMOKE_TARGET_ENV, so this suite runs against production as well:
 * SMOKE_TARGET_ENV=production npm run test:smoke -- safe-browsing exercises the
 * production key rather than staging's.
 *
 * Failure modes:
 *   - apiKey empty: SSM parameter does not exist. Operator: terraform apply
 *     (creates the SecureString shell), then
 *     scripts/provision-url-screening-key.sh --env both store.
 *   - apiKey starts with "TODO-": SSM parameter still has the bootstrap
 *     placeholder. Operator: the same store command.
 *   - HTTP 400 PERMISSION_DENIED: API key is invalid or revoked.
 *   - HTTP 403: Safe Browsing API not enabled on the GCP project, or quota
 *     exceeded.
 *   - HTTP 429: rate limit exceeded; back off.
 *   - Network error: outbound HTTPS to safebrowsing.googleapis.com is
 *     blocked from the staging host.
 *   - Empty matches against the canonical Google malware-test URL:
 *     Google has rotated test-corpus URLs; pin to the current test URL.
 *
 * Excluded from the default `npm test` suite via the test:smoke script's
 * scope, so dev and CI never reach Google.
 */
import { describe, it, expect } from 'vitest';
import { createLiveSafeBrowsingAdapter } from '../../src/adapters/safeBrowsingAdapter';
import { createStubSecretsAdapter } from '../../src/adapters/secretsAdapter';

const RUN = process.env.RUN_STAGING_SMOKE === '1';
const apiKey = process.env.SAFE_BROWSING_API_KEY;

// Google publishes a stable test URL that always returns a MALWARE match.
// Source: https://developers.google.com/safe-browsing/v4/lookup-api
const KNOWN_MALWARE_TEST_URL = 'http://malware.testing.google.test/testing/malware/';
const KNOWN_SAFE_URL = 'https://example.com/';

describe.skipIf(!RUN)('Safe Browsing live API: threatMatches:find', () => {
  it('SAFE_BROWSING_API_KEY is configured (non-empty, non-placeholder)', () => {
    const present = !!apiKey && apiKey.length > 0;
    expect(
      present,
      'SAFE_BROWSING_API_KEY is empty in the test runner. Operator runbook: ' +
        '(1) terraform -chdir=terraform/staging apply — creates the SSM SecureString shell. ' +
        '(2) scripts/provision-url-screening-key.sh --env both store — prompts for the key, ' +
        'writes it to both environments, and shreds its own temporary copy. ' +
        '(3) re-run npm run test:smoke.',
    ).toBe(true);
    const isPlaceholder = !!apiKey && apiKey.startsWith('TODO-');
    expect(
      isPlaceholder,
      `SAFE_BROWSING_API_KEY still has the bootstrap placeholder ("${apiKey}"). Operator: scripts/provision-url-screening-key.sh --env both store`,
    ).toBe(false);
  });

  it('returns safe=true for a benign URL', async () => {
    if (!apiKey || apiKey.startsWith('TODO-')) return;
    const secrets = createStubSecretsAdapter();
    secrets.setSecret('safe_browsing_api_key', apiKey);
    const adapter = createLiveSafeBrowsingAdapter({ secrets });
    const result = await adapter.lookup(KNOWN_SAFE_URL);
    expect(result.safe).toBe(true);
    expect(result.threatTypes).toEqual([]);
  });

  it('returns safe=false with MALWARE for the canonical Google test URL', async () => {
    if (!apiKey || apiKey.startsWith('TODO-')) return;
    const secrets = createStubSecretsAdapter();
    secrets.setSecret('safe_browsing_api_key', apiKey);
    const adapter = createLiveSafeBrowsingAdapter({ secrets });
    const result = await adapter.lookup(KNOWN_MALWARE_TEST_URL);
    expect(result.safe).toBe(false);
    expect(result.threatTypes).toContain('MALWARE');
  });
});
