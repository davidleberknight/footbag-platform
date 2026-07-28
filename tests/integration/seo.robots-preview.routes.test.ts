/**
 * Crawl policy for robots.txt on the temporary pre-cutover hostname.
 *
 * Before the canonical host takes over, the production build also answers on a
 * temporary preview hostname so the platform can be exercised end to end while
 * the old site is still live. That name is withdrawn at cutover, so anything a
 * crawler indexed under it would become a search result that no longer
 * resolves. The environment discriminator cannot catch this on its own, because
 * the environment genuinely is production; the edge does not forward the
 * viewer's Host header to the origin either, so the host a deployment is
 * configured to speak for is the signal. This file boots the same complete
 * production configuration as the canonical-host suite and changes only the
 * public base URL, which is exactly the difference that must flip the policy.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3107');

// The temporary pre-cutover host, overriding the fixture's loopback default.
const ORIGIN = 'https://preview.footbag.org';
process.env.PUBLIC_BASE_URL = ORIGIN;

// Identical production wiring to the canonical-host suite. Adapters that would
// otherwise reach AWS stay on the stub/local implementations; only the public
// base URL differs, so any behaviour change here is attributable to it alone.
process.env.NODE_ENV = 'production';
process.env.FOOTBAG_ENV = 'production';
process.env.SESSION_SECRET = 'a'.repeat(48);
process.env.SES_FEEDBACK_WEBHOOK_KEY = 'b'.repeat(48);
process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);
process.env.JWT_SIGNER = 'kms';
process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
process.env.SES_ADAPTER = 'live';
process.env.SES_FROM_IDENTITY = 'noreply@footbag.org';
process.env.SAFE_BROWSING_ADAPTER = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER = 'stub';
process.env.AWS_REGION = 'us-east-1';
process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER = 'local';
process.env.PAYMENT_ADAPTER = 'live';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
process.env.CAPTCHA_ADAPTER = 'live'; // production boot rejects the captcha stub
process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA'; // required with the live adapter; its secret resolves lazily and is never touched here
delete process.env.ALLOW_CURATED_SIDECAR_WRITES;

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let siteMetaService: typeof import('../../src/services/siteMetaService').siteMetaService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const cfg = await import('../../src/config/env');
  // The environment really is production; only the host makes it unindexable.
  expect(cfg.config.footbagEnv).toBe('production');
  expect(cfg.config.searchIndexable).toBe(false);
  siteMetaService = (await import('../../src/services/siteMetaService')).siteMetaService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('robots.txt — pre-cutover hostname policy', () => {
  it('keeps the whole URL space out of every index', () => {
    const txt = siteMetaService.buildRobotsTxt();
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Disallow: /');
    expect(txt).not.toContain('Allow: /');
  });

  it('advertises no sitemap, so the temporary host is never submitted for crawling', () => {
    expect(siteMetaService.buildRobotsTxt()).not.toContain('Sitemap:');
  });
});
