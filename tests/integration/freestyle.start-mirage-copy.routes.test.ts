/**
 * The beginner freestyle lesson introduces the Mirage, and its wording is the
 * public teaching contract for the trick: the bag returns to the toe that set
 * it and the circling (dexterity) leg does not make the catch. This renders the
 * page and asserts that approved copy reaches the visitor, and that the page
 * never tells a beginner the mirage is caught on the opposite foot.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3987');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
});

describe('GET /freestyle/start Mirage beginner copy', () => {
  it('renders the approved same-toe Mirage paragraph', async () => {
    const res = await request(createApp()).get('/freestyle/start');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/catch the bag back on the same toe\s+that made the set/i);
    expect(res.text).toMatch(/circling leg performs the dexterity but does not\s+make the catch/i);
  });

  it('does not tell a beginner the Mirage catches on the opposite foot', async () => {
    const res = await request(createApp()).get('/freestyle/start');
    expect(res.text).not.toMatch(/opposite[- ](toe|foot)/i);
  });
});
