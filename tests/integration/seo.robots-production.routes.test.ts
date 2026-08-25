/**
 * Crawl policy for robots.txt on the canonical public host.
 *
 * On the canonical host robots.txt allows every crawler and advertises the
 * sitemap; private content is kept out of search by per-response noindex
 * headers and per-page noindex meta, never by Disallow lines here. This file
 * boots a complete production-mode configuration AND points the public base URL
 * at the canonical host, because indexability follows the host a deployment is
 * configured to speak for rather than the environment name alone. The
 * disallow-all posture for staging and development is pinned in
 * seo.routes.test.ts, and the same posture for the temporary pre-cutover
 * hostname is pinned in seo.robots-preview.routes.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3081');

// The canonical public host, overriding the fixture's loopback default: a
// production build answering on any other name is deliberately not indexable.
const ORIGIN = 'https://www.footbag.org';
process.env.PUBLIC_BASE_URL = ORIGIN;

// Complete production wiring (mirrors the env-config success case) plus
// FOOTBAG_ENV=production. Adapters that would otherwise reach AWS stay on the
// stub/local implementations; only the env discriminator matters here.
process.env.NODE_ENV = 'production';
process.env.FOOTBAG_ENV = 'production';
process.env.SESSION_SECRET = 'a'.repeat(48);
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
  expect(cfg.config.footbagEnv).toBe('production');
  expect(cfg.config.searchIndexable).toBe(true);
  siteMetaService = (await import('../../src/services/siteMetaService')).siteMetaService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('robots.txt — canonical host policy', () => {
  it('allows every crawler', () => {
    const txt = siteMetaService.buildRobotsTxt();
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).not.toContain('Disallow:');
  });

  it('advertises the sitemap at an absolute canonical URL', () => {
    expect(siteMetaService.buildRobotsTxt()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});
