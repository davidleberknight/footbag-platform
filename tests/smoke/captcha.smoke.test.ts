/**
 * Cloudflare Turnstile live-API readiness probe.
 *
 * Long-term, opt-in smoke suite. Exercises the real Turnstile siteverify
 * endpoint. The contract asserted here is permanent: the deployed
 * `turnstile_secret_key` is a secret Cloudflare accepts, the siteverify
 * endpoint accepts the request shape the live captcha adapter sends, and the
 * adapter fails closed on a token Cloudflare rejects.
 *
 * A passing captcha cannot be asserted here. A valid Turnstile token is minted
 * only by a browser solving the widget challenge, so the success path is not
 * reachable from a test runner. The secret's validity is instead proved by the
 * error code Cloudflare returns: a rejected token yields
 * `invalid-input-response`, while a bad secret yields `invalid-input-secret`.
 * Asserting the first and the absence of the second is what distinguishes "the
 * secret works and the token was bad" from "the secret is wrong", a
 * distinction the adapter's boolean result deliberately discards.
 *
 * Run with: SMOKE_TARGET_ENV=production npm run test:smoke (gated behind
 * RUN_STAGING_SMOKE=1). Requires TURNSTILE_SECRET_KEY in the environment,
 * sourced by scripts/test-smoke.sh from the SSM SecureString
 * /footbag/production/secrets/turnstile_secret_key. A staging-targeted run
 * skips this suite: the captcha runs live in production only.
 *
 * Failure modes:
 *   - secret empty: SSM parameter does not exist. Operator: terraform apply
 *     (creates the SecureString shell), then aws ssm put-parameter.
 *   - secret starts with "TODO-": SSM parameter still has the bootstrap
 *     placeholder. Operator: aws ssm put-parameter --value file://path-to-key
 *     --overwrite.
 *   - error-codes contains "invalid-input-secret": the stored secret is not a
 *     key Cloudflare recognizes. Operator: re-copy the secret key from the
 *     Turnstile dashboard for the site this environment serves; a secret from
 *     another site or another environment fails exactly this way.
 *   - Network error: outbound HTTPS to challenges.cloudflare.com is blocked
 *     from the host running the smoke suite.
 *   - Adapter returns ok=true for a garbage token: the adapter is no longer
 *     reading `success` from the response and is failing open.
 *
 * Excluded from the default `npm test` suite via the test:smoke script's
 * scope, so dev and CI never reach Cloudflare.
 */
import { describe, it, expect } from 'vitest';
import { createLiveCaptchaAdapter } from '../../src/adapters/captchaAdapter';
import { createStubSecretsAdapter } from '../../src/adapters/secretsAdapter';

// Production-only. Every environment below production serves the captcha stub
// by design, so no lower environment holds a Turnstile secret to verify and
// there is nothing here for a staging run to assert. This suite therefore runs
// as part of the pre-cutover production wiring check, not the routine staging
// smoke.
const RUN =
  process.env.RUN_STAGING_SMOKE === '1' &&
  process.env.SMOKE_TARGET_ENV === 'production';
const secret = process.env.TURNSTILE_SECRET_KEY;

const SITEVERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Any string Cloudflare cannot resolve to an issued challenge. Deliberately not
// a plausible token shape, so a rejection can only mean "unknown token".
const REJECTED_TOKEN = 'smoke-probe-not-a-real-turnstile-token';

function secretUsable(): boolean {
  return !!secret && !secret.startsWith('TODO-');
}

describe.skipIf(!RUN)('Cloudflare Turnstile live API: siteverify', () => {
  it('TURNSTILE_SECRET_KEY is configured (non-empty, non-placeholder)', () => {
    const present = !!secret && secret.length > 0;
    expect(
      present,
      'TURNSTILE_SECRET_KEY is empty in the test runner. Operator runbook: ' +
        '(1) create the Turnstile site in the Cloudflare dashboard and copy its secret key. ' +
        '(2) cd terraform/staging && terraform apply — creates the SSM SecureString shell. ' +
        '(3) printf %s "<key>" > /tmp/ts-key && chmod 600 /tmp/ts-key. ' +
        '(4) AWS_PROFILE=footbag-staging-runtime aws ssm put-parameter --name /footbag/staging/secrets/turnstile_secret_key --value file:///tmp/ts-key --type SecureString --key-id alias/footbag-staging --overwrite. ' +
        '(5) shred -u /tmp/ts-key. ' +
        '(6) re-run npm run test:smoke.',
    ).toBe(true);
    const isPlaceholder = !!secret && secret.startsWith('TODO-');
    expect(
      isPlaceholder,
      'TURNSTILE_SECRET_KEY still has the bootstrap placeholder. Operator: aws ssm put-parameter --value file://path-to-key --overwrite',
    ).toBe(false);
  });

  it('Cloudflare accepts the configured secret and rejects an unknown token', async () => {
    if (!secretUsable()) return;
    const form = new URLSearchParams();
    form.set('secret', secret as string);
    form.set('response', REJECTED_TOKEN);
    const res = await fetch(SITEVERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };
    const errorCodes = json['error-codes'] ?? [];
    expect(json.success).toBe(false);
    expect(
      errorCodes,
      `Cloudflare rejected the stored secret itself (error-codes: ${errorCodes.join(', ')}). ` +
        'The parameter holds a key Cloudflare does not recognize for this site.',
    ).not.toContain('invalid-input-secret');
    expect(errorCodes).toContain('invalid-input-response');
  });

  it('live adapter fails closed against the real endpoint', async () => {
    if (!secretUsable()) return;
    const secrets = createStubSecretsAdapter();
    secrets.setSecret('turnstile_secret_key', secret as string);
    const adapter = createLiveCaptchaAdapter({ secrets });
    const result = await adapter.verify(REJECTED_TOKEN);
    expect(result.ok).toBe(false);
  });
});
