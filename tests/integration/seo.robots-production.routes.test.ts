/**
 * Production crawl policy for robots.txt.
 *
 * In production (FOOTBAG_ENV=production) robots.txt allows every crawler and
 * advertises the sitemap; private content is kept out of search by per-response
 * noindex headers and per-page noindex meta, never by Disallow lines here. This
 * file boots a complete production-mode configuration so config.footbagEnv
 * resolves to 'production' and siteMetaService serves the live policy. The
 * staging/development disallow-all posture is pinned in seo.routes.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3081');
const ORIGIN = 'http://localhost:3081';

// Complete production wiring (mirrors the env-config success case) plus
// FOOTBAG_ENV=production. Adapters that would otherwise reach AWS stay on the
// stub/local implementations; only the env discriminator matters here.
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
delete process.env.ALLOW_CURATED_SIDECAR_WRITES;

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let siteMetaService: typeof import('../../src/services/siteMetaService').siteMetaService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const cfg = await import('../../src/config/env');
  expect(cfg.config.footbagEnv).toBe('production');
  siteMetaService = (await import('../../src/services/siteMetaService')).siteMetaService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('robots.txt — production policy', () => {
  it('allows every crawler', () => {
    const txt = siteMetaService.buildRobotsTxt();
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).not.toContain('Disallow:');
  });

  it('advertises the sitemap at an absolute production URL', () => {
    expect(siteMetaService.buildRobotsTxt()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});
