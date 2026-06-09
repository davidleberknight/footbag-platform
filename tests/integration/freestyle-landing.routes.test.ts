import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3986');

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

describe('freestyle landing foundational-tricks mosaic', () => {
  it('renders the 12-cell mosaic with every core-atom label', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The 12 Foundations of Freestyle');
    expect(res.text).toContain('class="tricks-mosaic"');
    for (const label of MOSAIC_LABELS) {
      expect(res.text).toContain(label);
    }
  });

  it('keeps the Featured videos band and sits below it as a lower enrichment section', async () => {
    const res = await request(createApp()).get('/freestyle');
    const featuredAt = res.text.indexOf('id="featured"');
    const mosaicAt = res.text.indexOf('The 12 Foundations of Freestyle');
    expect(featuredAt).toBeGreaterThan(-1);
    expect(mosaicAt).toBeGreaterThan(featuredAt);
  });

  it('falls back to quiet empty-state cells when no clip is loaded', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('tricks-mosaic-empty');
    expect(res.text).toContain('tricks-mosaic-section--placeholder');
  });

  it('renders the Freestyle by the Numbers band with six gateway cards', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle by the Numbers');
    for (const title of ['Difficulty', 'Dexterity', 'Entry sets', 'Family endings', 'Body movements', 'Components']) {
      expect(res.text).toContain(title);
    }
    // each card is a gateway into its matching browse axis
    for (const view of ['view=add', 'view=dex-count', 'view=family', 'view=sets', 'view=movement-system', 'view=component']) {
      expect(res.text).toContain(`/freestyle/tricks?${view}`);
    }
    // shared denominator note + Family endings leads with the catch-surface roots
    expect(res.text).toContain('Counts shown out of');
    expect(res.text).toContain('pending notation');
    expect(res.text).toContain('Clipper Stall');
    expect(res.text).toContain('Toe Stall');
  });

});
