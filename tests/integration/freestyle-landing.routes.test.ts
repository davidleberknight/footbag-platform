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

  it('links each link-ready foundation caption to its page: family parents to the family page, standalone atoms to the trick page', async () => {
    const res = await request(createApp()).get('/freestyle');
    // Foundations that are their own family parent route to the family page.
    for (const slug of ['mirage', 'osis', 'whirl', 'swirl', 'butterfly', 'legover', 'illusion', 'pickup']) {
      expect(res.text, slug).toContain(`href="/freestyle/families/${slug}" class="tricks-mosaic-learn"`);
    }
    // Standalone-atom foundations route to their trick page.
    for (const slug of ['toe_stall', 'clipper_stall', 'around_the_world', 'orbit']) {
      expect(res.text, slug).toContain(`href="/freestyle/tricks/${slug}" class="tricks-mosaic-learn"`);
    }
  });

  it('links every foundation now that orbit has an authored page: all twelve captions carry a Learn link', async () => {
    const res = await request(createApp()).get('/freestyle');
    // Orbit, formerly a stub, now links like the rest.
    expect(res.text).toContain('href="/freestyle/tricks/orbit" class="tricks-mosaic-learn"');
    // The 12-cell mosaic emits exactly 12 Learn links; none is left plain.
    const learnLinks = res.text.match(/class="tricks-mosaic-learn"/g) ?? [];
    expect(learnLinks.length).toBe(12);
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
    for (const title of ['ADD', 'Dexterity', 'Entry sets', 'Family endings', 'Body movements']) {
      expect(res.text).toContain(title);
    }
    // The Components card was dropped: it was a strict superset of Entry + Body
    // and its only destination was the soft-retired component view.
    expect(res.text).not.toContain('view=component');
    // each card is a gateway into its matching browse axis
    for (const view of ['view=add', 'view=dex-count', 'view=family', 'view=sets', 'view=movement-system']) {
      expect(res.text).toContain(`/freestyle/tricks?${view}`);
    }
    // shared denominator note states the counted population + Family endings
    // leads with the catch-surface roots
    expect(res.text).toContain('Counts are out of');
    expect(res.text).toContain('active canonical tricks');
    expect(res.text).toContain('Clipper Stall');
    expect(res.text).toContain('Toe Stall');
  });

  // Seeds one clip cell (runs last: the seeded clip would otherwise flip the
  // no-clips placeholder state the empty-state test above relies on).
  it('renders each seeded clip cell as a link into the Foundations of Freestyle gallery (no inline play)', async () => {
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

    // The cell is a link into the named gallery's item viewer; playback happens
    // there, like every other gallery video. No inline <video>, no autoplay.
    expect(mosaic).toContain('class="tricks-mosaic-link"');
    expect(mosaic).toContain('href="/media/gallery_foundations_of_freestyle/');
    expect(mosaic).toContain('aria-label="Watch Toe Delay"');
    expect(mosaic).toContain('class="tricks-mosaic-media"');
    expect(mosaic).not.toContain('<video');
    expect(mosaic).not.toContain('autoplay');
    // A section-level link surfaces the full gallery beyond the twelve cells.
    expect(mosaic).toContain('href="/media/gallery_foundations_of_freestyle"');
    expect(mosaic).toContain('See All Foundations');
    // No play-toggle driver is loaded anymore.
    expect(res.text).not.toMatch(/freestyle-mosaic\.js/);
  });
});

describe('freestyle landing beginner on-ramp', () => {
  it('funnels newcomers to the getting-started page above the foundations mosaic', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="freestyle-learn-pointer"');
    expect(res.text).toMatch(/New to freestyle\?/i);
    expect(res.text).toContain('href="/freestyle/start"');
    const pointerAt = res.text.indexOf('freestyle-learn-pointer');
    const mosaicAt = res.text.indexOf('The 12 Foundations of Freestyle');
    expect(pointerAt).toBeGreaterThan(-1);
    expect(mosaicAt).toBeGreaterThan(pointerAt);
  });
});
