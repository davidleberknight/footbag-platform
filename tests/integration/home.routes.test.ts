import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3984');

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

const MOSAIC_LABELS = [
  'Toe Delay', 'Clipper', 'Around the World', 'Orbit',
  'Legover', 'Mirage', 'Pickup', 'Illusion',
  'Butterfly', 'Osis', 'Whirl', 'Swirl',
];

describe('home page foundational-tricks mosaic', () => {
  it('renders the 12-cell mosaic with every core-atom label', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The 12 Foundations of Freestyle');
    expect(res.text).toContain('class="tricks-mosaic"');
    for (const label of MOSAIC_LABELS) {
      expect(res.text).toContain(label);
    }
  });

  it('shows labelled empty-state cells before any clip is curated', async () => {
    const res = await request(createApp()).get('/');
    // No curated mosaic clips exist in the test DB, so each cell falls back to its
    // neutral labelled tile rather than a <video>.
    expect(res.text).toContain('tricks-mosaic-empty');
  });
});
