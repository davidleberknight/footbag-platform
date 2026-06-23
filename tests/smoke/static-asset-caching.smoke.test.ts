/**
 * Static-asset cache-busting edge probe.
 *
 * Long-term, opt-in smoke suite. Exercises the real staging CloudFront
 * distribution over HTTPS. The contract asserted here is permanent and cannot
 * be verified by the unit/integration suites, which only reach the origin:
 * every static asset (CSS, JS, images, fonts) is cache-busted by a `?v=<hash>`
 * query token, and the edge honors that token. Specifically:
 *
 *   - The served stylesheet is the rewritten copy: its `@font-face` url()
 *     references carry `?v=` tokens, so a font byte-change busts through the CDN
 *     (fonts cannot call the template asset helper, so the bytes are rewritten
 *     when served).
 *   - A versioned font and a versioned image are reachable through the edge and
 *     carry the one-year immutable Cache-Control set by the origin.
 *   - `/img/*` and `/fonts/*` ride the query-string cache policy, so a fresh
 *     token is a distinct cache entry rather than collapsing onto a query-less
 *     entry. The managed CachingOptimized policy strips the query string; this
 *     probe catches a regression back to it.
 *
 * Run with: npm run test:smoke (which uses scripts/test-smoke.sh to read
 * STAGING_CLOUDFRONT_DOMAIN from terraform output and gate behind
 * RUN_STAGING_SMOKE=1).
 *
 * Failure modes (each has a distinct cause):
 *   - STAGING_CLOUDFRONT_DOMAIN empty: the staging distribution is disabled or
 *     not yet applied. Operator: terraform -chdir=terraform/staging apply.
 *   - Stylesheet font url() carries no `?v=`: the app shipping the rewritten
 *     stylesheet is not deployed. Operator: ./deploy_to_aws.sh.
 *   - Versioned font/image lacks the immutable Cache-Control: the origin static
 *     middleware regressed, or a CloudFront response-headers policy strips it.
 *   - Fresh-token font returns a CloudFront Hit after a query-less warm: the
 *     /fonts/* (or /img/*) behavior reverted to a query-string-stripping policy,
 *     so a deploy's changed font would no longer edge-bust.
 *
 * Excluded from the default `npm test` suite via the test:smoke script's scope,
 * so dev and CI never reach the CDN.
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';

const RUN = process.env.RUN_STAGING_SMOKE === '1';
const domain = process.env.STAGING_CLOUDFRONT_DOMAIN ?? '';
const base = `https://${domain}`;

const freshToken = (): string => randomBytes(8).toString('hex');
const get = (url: string): Promise<Response> => fetch(url, { signal: AbortSignal.timeout(15_000) });

describe.skipIf(!RUN)('static-asset cache-busting reaches the staging CloudFront edge', () => {
  it('STAGING_CLOUDFRONT_DOMAIN is configured (non-empty)', () => {
    expect(
      domain.length > 0,
      'STAGING_CLOUDFRONT_DOMAIN is empty in the test runner. The staging ' +
        'CloudFront distribution is disabled or not yet applied. Operator: ' +
        'terraform -chdir=terraform/staging apply, then re-run npm run test:smoke.',
    ).toBe(true);
  });

  it('serves the rewritten stylesheet with versioned font url() references', async () => {
    if (!domain) return;
    const res = await get(`${base}/css/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/css');
    const body = await res.text();
    expect(body).toMatch(/url\("\/fonts\/Inter-Regular\.woff2\?v=[0-9a-f]{10}"\)/);
  }, 20_000);

  it('serves a versioned font as immutable with a one-year max-age', async () => {
    if (!domain) return;
    const res = await get(`${base}/fonts/Inter-Regular.woff2?v=${freshToken()}`);
    expect(res.status).toBe(200);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toContain('immutable');
    expect(cc).toContain('max-age=31536000');
  }, 20_000);

  it('serves a versioned image as immutable with a one-year max-age', async () => {
    if (!domain) return;
    const res = await get(`${base}/img/ifpa-logo.png?v=${freshToken()}`);
    expect(res.status).toBe(200);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toContain('immutable');
    expect(cc).toContain('max-age=31536000');
  }, 20_000);

  it('keys /fonts/* on the query string, so a fresh token is a distinct cache entry', async () => {
    if (!domain) return;
    // Warm a query-less-equivalent entry, then request a brand-new token. Under
    // the query-string cache policy the fresh token is a new key (a Miss); under
    // a query-stripping policy it would collapse onto the warmed entry (a Hit).
    const warm = `${base}/fonts/Inter-Regular.woff2?v=${freshToken()}`;
    await get(warm);
    await get(warm);
    const res = await get(`${base}/fonts/Inter-Regular.woff2?v=${freshToken()}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache') ?? '').not.toMatch(/^Hit from cloudfront/i);
  }, 30_000);
});
