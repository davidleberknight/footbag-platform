/**
 * CSP varies by media storage adapter mode: when MEDIA_STORAGE_ADAPTER=s3, the
 * CSP `connect-src` directive must whitelist the configured bucket origin so
 * the admin curator video upload flow can XHR-PUT source bytes directly to S3
 * via a presigned URL. Without this, browsers block the cross-origin request
 * and surface it as a network error before the PUT leaves the page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3088');

process.env.MEDIA_STORAGE_ADAPTER  = 's3';
process.env.MEDIA_STORAGE_S3_BUCKET = 'footbag-test-media';
process.env.AWS_REGION             = 'us-east-1';
process.env.INTERNAL_EVENT_SECRET  = 'test-internal-event-secret';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  delete process.env.MEDIA_STORAGE_ADAPTER;
  delete process.env.MEDIA_STORAGE_S3_BUCKET;
  delete process.env.AWS_REGION;
  delete process.env.INTERNAL_EVENT_SECRET;
});

describe('Security headers: connect-src under MEDIA_STORAGE_ADAPTER=s3', () => {
  it('connect-src includes the configured S3 bucket virtual-hosted origin', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain(
      "connect-src 'self' https://challenges.cloudflare.com https://footbag-test-media.s3.us-east-1.amazonaws.com",
    );
  });
});
