import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3115');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /ifpa — IFPA governance hub', () => {
  it('returns 200 and renders the IFPA page body (not an empty/wrong template)', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('IFPA Bylaws');
  });

  it('shows the page heading', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa');
    expect(res.text).toContain('<h1>IFPA</h1>');
  });

  it('renders all three governance doc cards with hrefs', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa');
    expect(res.text).toContain('IFPA Membership Rules');
    expect(res.text).toContain('IFPA Bylaws');
    expect(res.text).toContain('Articles of Incorporation');
    expect(res.text).toContain('href="/ifpa/membership-structure"');
    expect(res.text).toContain('href="/ifpa/bylaws"');
    expect(res.text).toContain('href="/ifpa/articles"');
  });

  it('links out to /rules for sport rules', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa');
    expect(res.text).toContain('href="/rules"');
  });

  it('highlights the IFPA nav entry as active', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa');
    expect(res.text).toMatch(/<a href="\/ifpa" class="active">IFPA<\/a>/);
  });
});

describe('GET /ifpa/membership-structure', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa/membership-structure');
    expect(res.status).toBe(200);
  });

  it('renders the markdown body with at least one h2 anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa/membership-structure');
    expect(res.text).toMatch(/<h2 id="[^"]+">/);
  });

  it('contains the canonical tier names', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa/membership-structure');
    expect(res.text).toContain('Tier 0');
    expect(res.text).toContain('IFPA Director');
  });

  it('renders the TOC nav with h2 entries', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa/membership-structure');
    expect(res.text).toContain('On this page');
  });
});

describe('GET /ifpa/bylaws', () => {
  it('returns 200 and renders the IFPA name', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa/bylaws');
    expect(res.status).toBe(200);
    expect(res.text).toContain('International Footbag Players');
  });
});

describe('GET /ifpa/articles', () => {
  it('returns 200 and renders incorporation language', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa/articles');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Articles of Incorporation');
  });
});

describe('GET /ifpa/:unknown', () => {
  it('returns 404 for an unknown doc slug', async () => {
    const app = createApp();
    const res = await request(app).get('/ifpa/nonexistent-doc');
    expect(res.status).toBe(404);
  });
});
