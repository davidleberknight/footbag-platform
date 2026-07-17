/**
 * The /media hub Member galleries category and the member-galleries list page in
 * the empty state: no member-owned named galleries exist. The hub hides the
 * category until at least one gallery exists (no placeholder), and the list page
 * renders its empty state.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3128');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media (hub) with no member galleries', () => {
  it('hides the Member galleries category when none exist, with no placeholder or link', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('None yet');
    expect(res.text).not.toContain('href="/media/member-galleries"');
  });
});

describe('GET /media/member-galleries with no member galleries', () => {
  it('renders the empty state', async () => {
    const app = createApp();
    const res = await request(app).get('/media/member-galleries');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No member galleries yet.');
  });
});
