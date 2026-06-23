/**
 * Static-asset caching contract: a versioned request (`?v=<hash>`) is served
 * immutable with a one-year max-age, an unversioned request is not, and rendered
 * pages reference CSS, JS, images, and fonts (the last rewritten into the served
 * stylesheet) with a version token so deploys self-bust the CloudFront cache.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3081');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('static asset caching + fingerprinting', () => {
  it('serves a versioned CSS request as immutable with a one-year max-age', async () => {
    const res = await request(createApp()).get('/css/style.css?v=abc1234567');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
  });

  it('does not mark an unversioned CSS request immutable', async () => {
    const res = await request(createApp()).get('/css/style.css');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control'] ?? '').not.toContain('immutable');
  });

  it('renders the stylesheet link with a content-hash version token', async () => {
    const res = await request(createApp()).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/\/css\/style\.css\?v=[0-9a-f]{10}/);
  });

  it('serves the stylesheet with versioned font url() references', async () => {
    const res = await request(createApp()).get('/css/style.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
    expect(res.text).toMatch(/url\("\/fonts\/Inter-Regular\.woff2\?v=[0-9a-f]{10}"\)/);
  });

  it('serves a versioned font request as immutable with a one-year max-age', async () => {
    const res = await request(createApp()).get('/fonts/Inter-Regular.woff2?v=abc1234567');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
  });

  it('serves a versioned image request as immutable with a one-year max-age', async () => {
    const res = await request(createApp()).get('/img/ifpa-logo.png?v=abc1234567');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
  });

  it('renders template images (favicon, footer logo) with a version token', async () => {
    const res = await request(createApp()).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/\/img\/ifpa-logo\.png\?v=[0-9a-f]{10}/);
  });

  it('renders a service-shaped landing image (mascot) with a version token', async () => {
    const res = await request(createApp()).get('/sideline');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/\/img\/sideline-hackysack-hero\.svg\?v=[0-9a-f]{10}/);
  });
});
