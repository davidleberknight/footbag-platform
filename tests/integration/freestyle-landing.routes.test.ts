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

describe('freestyle landing foundations gallery link', () => {
  it('embeds no foundations mosaic: the clips live in their own gallery', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="tricks-mosaic"');
    expect(res.text).not.toContain('tricks-mosaic-cell');
    expect(res.text).not.toContain('See All Foundations');
  });

  it('withholds the gallery card until a clip is curated, so it never opens an empty gallery', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('href="/media/gallery_foundations_of_freestyle"');
  });

  it('renders the two reference banners and retires Start Here / Go Deeper', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('The Language of Freestyle');
    expect(res.text).toContain('Analysis &amp; Competition');
    // The retired cards were headed "Start Here" and "Go Deeper". Anchored on
    // a heading rather than the bare strings, because the beginner on-ramp is
    // a button reading "Start Here" and that control is not a portal card.
    expect(res.text).not.toMatch(/<h[1-6][^>]*>\s*Start Here\s*<\/h[1-6]>/);
    expect(res.text).not.toMatch(/<h[1-6][^>]*>\s*Go Deeper\s*<\/h[1-6]>/);
    // Insights renamed to Freestyle Patterns (route unchanged)
    expect(res.text).toContain('Freestyle Patterns');
    expect(res.text).toContain('href="/freestyle/insights"');
    expect(res.text).toContain('href="/freestyle/partnerships"');
    // supporting sections moved below the educational core
    expect(res.text).toContain('Freestyle Media');
    expect(res.text).toContain('History of Freestyle');
    expect(res.text).toContain('href="/freestyle/media"');
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

  it('links to Freestyle by the Numbers as a card and embeds none of it', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle by the Numbers');
    expect(res.text).toContain('href="/freestyle/by-the-numbers"');
    // The histograms and their shared denominator note live on that page; the
    // landing links into the surface rather than embedding it.
    expect(res.text).not.toContain('by-numbers-grid');
    expect(res.text).not.toContain('Counts cover');
  });

  it('places the Freestyle by the Numbers card below the Featured videos showcase', async () => {
    const res = await request(createApp()).get('/freestyle');
    const featuredAt = res.text.indexOf('id="featured"');
    const cardAt = res.text.indexOf('href="/freestyle/by-the-numbers"');
    expect(featuredAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(featuredAt);
  });

  // Seeds one clip (runs last: the seeded clip flips the no-clips state the
  // withheld-card test above relies on).
  it('offers the gallery card in the vocabulary group once a clip is curated', async () => {
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
    expect(res.text).toContain('href="/media/gallery_foundations_of_freestyle"');
    // The card names the gallery it opens and says what the clips show.
    expect(res.text).toContain('Media Gallery: Foundations of Freestyle');
    expect(res.text).toContain('Almost every trick is built from one of these core movements.');
    // The card sits in the vocabulary group, not in a band of its own.
    const languageAt = res.text.indexOf('>The Language of Freestyle<');
    const cardAt     = res.text.indexOf('href="/media/gallery_foundations_of_freestyle"');
    const featuredAt = res.text.indexOf('id="featured"');
    expect(cardAt).toBeGreaterThan(languageAt);
    expect(featuredAt).toBeGreaterThan(cardAt);
  });
});

describe('freestyle landing beginner on-ramp', () => {
  it('funnels newcomers to the getting-started page, below the intro prose', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    // The on-ramp is a plain line and a standard outline button. It carries no
    // callout panel: a one-line pointer does not need chrome around it to be
    // seen.
    expect(res.text).toMatch(/New to freestyle\?/i);
    expect(res.text).toMatch(/<a class="btn btn-outline" href="\/freestyle\/start">/);
    const introAt   = res.text.indexOf('What is Freestyle Footbag?');
    const pointerAt = res.text.indexOf('href="/freestyle/start"');
    const bannerAt  = res.text.indexOf('>The Language of Freestyle<');
    expect(introAt).toBeGreaterThan(-1);
    expect(pointerAt).toBeGreaterThan(introAt);
    expect(bannerAt).toBeGreaterThan(pointerAt);
  });
});
