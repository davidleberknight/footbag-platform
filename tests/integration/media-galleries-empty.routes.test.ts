/**
 * Zero-member-galleries boundary for the /media surface. A fresh deploy seeds
 * no member-owned named gallery, so this asserts the empty edge case holds: the
 * hub still renders the Member galleries card (as a non-linked "None yet" note,
 * not a missing card), and the list page renders its own empty state. Member
 * galleries only appear once a member uploads and creates one, so the empty
 * shape is the deployed first-run state and must render cleanly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3184');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // Schema only — no member_galleries rows, mirroring a fresh deploy.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media (hub) with zero member galleries', () => {
  it('still renders the Member galleries card as a non-linked "None yet" note', async () => {
    const app = createApp();
    const res = await request(app).get('/media');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Member galleries');
    expect(res.text).toContain('None yet');
    // No member gallery exists yet, so the card does not link to the list page.
    expect(res.text).not.toContain('href="/media/member-galleries"');
  });
});

describe('GET /media/member-galleries with zero member galleries', () => {
  it('renders the empty state', async () => {
    const app = createApp();
    const res = await request(app).get('/media/member-galleries');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No member galleries yet.');
  });
});
