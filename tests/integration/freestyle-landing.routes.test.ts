import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3986');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, insertCuratorVideo } from '../fixtures/factories';

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

  it('places the Featured videos showcase below the mosaic and by-the-numbers', async () => {
    const res = await request(createApp()).get('/freestyle');
    const featuredAt = res.text.indexOf('id="featured"');
    const mosaicAt = res.text.indexOf('The 12 Foundations of Freestyle');
    expect(mosaicAt).toBeGreaterThan(-1);
    expect(featuredAt).toBeGreaterThan(mosaicAt);
  });

  it('renders the two reference banners and retires Start Here / Go Deeper', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('The Language of Freestyle');
    expect(res.text).toContain('Analysis &amp; Competition');
    expect(res.text).not.toContain('Start Here');
    expect(res.text).not.toContain('Go Deeper');
    // Insights renamed to Freestyle Patterns (route unchanged)
    expect(res.text).toContain('Freestyle Patterns');
    expect(res.text).toContain('href="/freestyle/insights"');
    expect(res.text).toContain('href="/freestyle/partnerships"');
    // supporting sections moved below the educational core
    expect(res.text).toContain('Freestyle Media');
    expect(res.text).toContain('History of Freestyle');
    expect(res.text).toContain('href="/freestyle/media"');
  });

  it('falls back to quiet empty-state cells when no clip is loaded', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('tricks-mosaic-empty');
    expect(res.text).toContain('tricks-mosaic-section--placeholder');
  });

  it('Freestyle Media section is a single invite into the consolidated media page', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Browse Freestyle Media');
    expect(res.text).toContain('href="/freestyle/media"');
    // The per-collection sub-tiles live on /freestyle/media now; the landing no
    // longer lists them separately (they previously duplicated the section).
    expect(res.text).not.toContain('Freestyle Records Videos');
    expect(res.text).not.toContain('Individual Shred Videos');
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

  // Seeds one clip cell (runs last: the seeded clip would otherwise flip the
  // no-clips placeholder state the empty-state test above relies on).
  it('does not autoplay; each clip cell is a click-to-play toggle with an accessible label', async () => {
    const seedDb = new BetterSqlite3(dbPath);
    try {
      const fhId = insertMember(seedDb, { is_system: 1, slug: 'fh-mosaic' });
      insertCuratorVideo(seedDb, {
        uploaderMemberId: fhId,
        sourceFilename: 'mosaic-toe-stall.mp4',
        slotTag: '#freestyle',
        caption: 'Toe delay',
      });
    } finally {
      seedDb.close();
    }

    const res = await request(createApp()).get('/freestyle');
    const start = res.text.indexOf('class="tricks-mosaic"');
    const mosaic = res.text.slice(start, res.text.indexOf('</section>', start));

    // the seeded clip renders a <video> that does NOT autoplay
    expect(mosaic).toContain('class="tricks-mosaic-media"');
    expect(mosaic).not.toContain('autoplay');
    // click-to-play toggle button with a Play/Pause accessible label
    expect(mosaic).toContain('class="tricks-mosaic-toggle"');
    expect(mosaic).toContain('aria-label="Play Toe Delay"');
    expect(mosaic).toContain('aria-pressed="false"');
    // resting playback attributes preserved
    expect(mosaic).toContain('loop');
    expect(mosaic).toContain('muted');
    expect(mosaic).toContain('playsinline');
    // the click-to-play driver is loaded (content-hash versioned asset URL)
    expect(res.text).toMatch(/\/js\/freestyle-mosaic\.js\?v=[0-9a-f]{10}/);
  });
});
