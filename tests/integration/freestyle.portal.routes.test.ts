/**
 * Integration tests for freestyle portal pages.
 *
 * Covers:
 *   GET /freestyle/competition  — results-derived competition history
 *   GET /freestyle/history      — editorial history, pioneers, eras
 *   GET /freestyle              — two-band landing (Start Here / Go Deeper)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertHistoricalPerson,
  insertEvent,
  insertDiscipline,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
  insertMember,
  insertFreestyleRecord,
  insertFreestyleTrick,
  insertCuratorVideo,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3111');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const PERSON_A = 'person-portal-001';
const PERSON_B = 'person-portal-002';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Two persons in canonical DB
  insertHistoricalPerson(db, { person_id: PERSON_A, person_name: 'Vera Champion', source_scope: 'CANONICAL', country: 'DE' });
  insertHistoricalPerson(db, { person_id: PERSON_B, person_name: 'Tom Runner', source_scope: 'CANONICAL', country: 'US' });

  // Need a member to own the results upload
  const memberId = insertMember(db);

  // An event with a freestyle discipline
  const eventId = insertEvent(db, {
    title: 'Test Freestyle Open',
    start_date: '2015-06-01',
    end_date: '2015-06-03',
    city: 'Berlin',
    country: 'DE',
  });
  const discId  = insertDiscipline(db, eventId, { name: 'Open Singles Freestyle' });
  const upload1 = insertResultsUpload(db, eventId, memberId);

  // Vera wins, Tom is second
  const entryA = insertResultEntry(db, eventId, upload1, discId, { placement: 1 });
  insertResultParticipant(db, entryA, 'Vera Champion', { historical_person_id: PERSON_A });

  const entryB = insertResultEntry(db, eventId, upload1, discId, { placement: 2 });
  insertResultParticipant(db, entryB, 'Tom Runner', { historical_person_id: PERSON_B });

  // A second event — Vera wins again
  const event2Id = insertEvent(db, {
    title: 'Test Freestyle Cup',
    start_date: '2018-09-10',
    end_date: '2018-09-12',
    city: 'Vienna',
    country: 'AT',
  });
  const disc2Id  = insertDiscipline(db, event2Id, { name: 'Open Singles Freestyle' });
  const upload2  = insertResultsUpload(db, event2Id, memberId);
  const entry2   = insertResultEntry(db, event2Id, upload2, disc2Id, { placement: 1 });
  insertResultParticipant(db, entry2, 'Vera Champion', { historical_person_id: PERSON_A });

  // A doubles event — should NOT count for singles competition page
  const event3Id = insertEvent(db, {
    title: 'Test Doubles',
    start_date: '2018-09-10',
    end_date: '2018-09-12',
    city: 'Vienna',
    country: 'AT',
  });
  const disc3Id  = insertDiscipline(db, event3Id, { name: 'Open Doubles Freestyle', team_type: 'doubles', discipline_category: 'freestyle' });
  const upload3  = insertResultsUpload(db, event3Id, memberId);
  const entry3   = insertResultEntry(db, event3Id, upload3, disc3Id, { placement: 1 });
  insertResultParticipant(db, entry3, 'Vera Champion', { historical_person_id: PERSON_A, participant_order: 1 });
  insertResultParticipant(db, entry3, 'Tom Runner', { historical_person_id: PERSON_B, participant_order: 2 });

  // Second doubles entry at a different event (gives Vera+Tom >=2 appearances)
  const event4Id = insertEvent(db, {
    title: 'Test Doubles Cup',
    start_date: '2019-07-01',
    city: 'Prague',
    country: 'CZ',
  });
  const disc4Id  = insertDiscipline(db, event4Id, { name: 'Open Doubles Freestyle', team_type: 'doubles', discipline_category: 'freestyle' });
  const upload4  = insertResultsUpload(db, event4Id, memberId);
  const entry4   = insertResultEntry(db, event4Id, upload4, disc4Id, { placement: 2 });
  insertResultParticipant(db, entry4, 'Vera Champion', { historical_person_id: PERSON_A, participant_order: 1 });
  insertResultParticipant(db, entry4, 'Tom Runner', { historical_person_id: PERSON_B, participant_order: 2 });

  // Trick and passback record for the landing. Seed `whirl` plus three
  // additional foundational atoms with §13.9 atom-layer operational
  // notation so the Bridge 1 surface tests (core-trick-notation slot on
  // landing) have data to assert against.
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3', category: 'dex', sort_order: 0,
    operational_notation: '[set] > leggy in dex > ss clipper',
  });
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2', category: 'dex', sort_order: 1,
    operational_notation: '[set] > hippy in dex > op toe',
  });
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly', adds: '3', category: 'dex', sort_order: 2,
    operational_notation: '[set] > hippy out dex > ss clipper',
  });
  insertFreestyleTrick(db, {
    slug: 'around-the-world', canonical_name: 'around the world', adds: '2', category: 'dex', sort_order: 3,
    operational_notation: 'toe > ss leggy in dex > ss toe',
  });
  insertFreestyleRecord(db, {
    id: 'fr-portal-1',
    display_name: 'Vera Champion',
    trick_name: 'whirl',
    value_numeric: 50,
    confidence: 'probable',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /freestyle/competition', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.status).toBe(200);
  });

  it('shows page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Freestyle Competition');
  });

  it('shows top singles competitor (Vera — 2 golds)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Vera Champion');
    expect(res.text).toContain(`/history/${PERSON_A}`);
  });

  it('shows silver medalist (Tom — 1 silver)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Tom Runner');
    expect(res.text).toContain(`/history/${PERSON_B}`);
  });

  it('shows the Documented Competitors section, honestly framed', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Documented Competitors');
    expect(res.text).toContain('not a definitive all-time ranking');
  });

  it('shows Events by Era section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Events by Era');
    // Both test events are in the 2010s
    expect(res.text).toContain('2010s');
  });

  it('shows recent events section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Test Freestyle Open');
  });

  it('does NOT count doubles discipline in singles competition table', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    // Vera has 2 singles golds; the doubles win should not inflate this
    // We verify by checking that the data note mentions "singles only"
    expect(res.text).toContain('Freestyle singles only');
  });

  it('shows source data note', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('documented event results');
  });

  it('shows the Competition Formats section with beginner descriptions', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Competition Formats');
    expect(res.text).toContain('Routines');
    expect(res.text).toContain('Sick 3');
  });

  it('shows Competition Milestones with golds and podiums buckets', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Competition Milestones');
    expect(res.text).toContain('Most Documented Golds');
    expect(res.text).toContain('Most Documented Podiums');
  });

  it('shows Most Successful Nations by medalist nationality', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Most Successful Nations');
  });

  it('shows the Freestyle Around the World geographic section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Freestyle Around the World');
  });

  it('contains breadcrumb back to /freestyle', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('/freestyle');
  });

  it('lede links unfamiliar terms to the glossary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('href="/freestyle/glossary"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/history', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.status).toBe(200);
  });

  it('shows page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('Freestyle History');
  });

  it('shows Competitive Eras section with known eras', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('Competitive Eras');
    // Era labels per the post-2026-05-10 editorial refinement (softened from
    // the prior absolutist phrasing). Foundation Era is preserved; the others
    // gained more historically-grounded names.
    expect(res.text).toContain('Foundation Era');
    expect(res.text).toContain('Codifying the Language');
    expect(res.text).toContain('Technical Acceleration');
    expect(res.text).toContain('European Center of Gravity');
    expect(res.text).toContain('Refinement &amp; Reconnection');
  });

  it('shows era dates', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('1980');
    expect(res.text).toContain('2000');
  });

  it('shows Founders & Pioneers section with known names', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('Founders');
    expect(res.text).toContain('Kenny Shults');
    expect(res.text).toContain('Eric Wulff');
  });

  it('links pioneers with known person IDs to /history/:personId', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    // Kenny Shults and Eric Wulff have profileHrefs in the service constants
    expect(res.text).toContain('/history/2a6a7c9e-1d8a-4f9a-a8f5-6f3a3c1e9b0f'); // Kenny Shults
    expect(res.text).toContain('/history/e8b82661-4428-5e51-a786-29bf7a23728f'); // Eric Wulff
  });

  it('shows ADD System section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('ADD System');
    expect(res.text).toContain('modifier');
  });

  it('shows Geographic Shift section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('Geographic Shift');
    expect(res.text).toContain('European');
  });

  it('mentions Václav Klouda in context', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('Klouda');
  });

  it('shows source note with event count', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('774 documented competitive events');
  });

  it('contains cross-links to competition and tricks pages', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/history');
    expect(res.text).toContain('/freestyle/competition');
    expect(res.text).toContain('/freestyle/tricks');
  });
});

// ---------------------------------------------------------------------------
// GET /freestyle — two-band landing
//
// Structure (Phase C, 2026-05-22): hero → "What is Freestyle?" lede +
// demo video → Start Here band (beginner paths) → Go Deeper band
// (reference / archive / analysis) → Featured strip. The prior portal-card
// grid, Movement Reference shelf, Get Started tiles, and under-hero
// jump-nav were retired.
// ---------------------------------------------------------------------------

describe('GET /freestyle — two-band landing', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
  });

  it('renders the hero with a movement-first title + subtitle', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('<h1>Freestyle Footbag</h1>');
    expect(res.text).toContain('Learn the movements, watch the sport, and explore the trick vocabulary.');
  });

  it('shows the mascot image', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('/img/freestyle-mascot.svg');
    expect(res.text).toContain('Freestyle footbag mascot icon');
  });

  it('opens with the "What is Freestyle Footbag?" intro lede', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toMatch(/class="content-section freestyle-portal-lede"/);
    expect(res.text).toContain('freestyle-portal-lede-paragraph');
    expect(res.text).toContain('What is Freestyle Footbag?');
  });

  // ── Banner 1 — The Language of Freestyle ────────────────────────────────
  it('renders Banner 1 (The Language of Freestyle) and retires Start Here', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('>The Language of Freestyle<');
    expect(res.text).not.toContain('>Start Here<');
    for (const href of [
      '/freestyle/tricks',
      '/freestyle/glossary',
      '/freestyle/sets',
      '/freestyle/operators',
      '/freestyle/observational',
      '/freestyle/about',
    ]) {
      expect(res.text, `Banner 1 href ${href}`).toContain(`href="${href}"`);
    }
  });

  // ── Banner 2 — Analysis & Competition ───────────────────────────────────
  it('renders Banner 2 (Analysis & Competition), retires Go Deeper, renames Insights to Freestyle Patterns', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Analysis &amp; Competition');
    expect(res.text).not.toContain('>Go Deeper<');
    expect(res.text).toContain('Freestyle Patterns');
    expect(res.text).not.toContain('>Insights<');
    for (const href of [
      '/freestyle/records',
      '/freestyle/competition',
      '/freestyle/partnerships',
      '/freestyle/combo-analysis',
      '/freestyle/add-analysis',
      '/freestyle/insights',
    ]) {
      expect(res.text, `Banner 2 href ${href}`).toContain(`href="${href}"`);
    }
  });

  it('records are framed as "Trick Records", never "World Records"', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Trick Records');
    expect(res.text).not.toContain('World Records');
  });

  it('orders sections: lede → Banner 1 → Banner 2 → mosaic → Featured', async () => {
    const res = await request(createApp()).get('/freestyle');
    const ledeIdx     = res.text.indexOf('freestyle-portal-lede');
    const banner1Idx  = res.text.indexOf('>The Language of Freestyle<');
    const banner2Idx  = res.text.indexOf('Analysis &amp; Competition');
    const mosaicIdx   = res.text.indexOf('The 12 Foundations of Freestyle');
    const featuredIdx = res.text.indexOf('class="content-section freestyle-featured"');
    expect(ledeIdx).toBeGreaterThan(0);
    expect(banner1Idx).toBeGreaterThan(ledeIdx);
    expect(banner2Idx).toBeGreaterThan(banner1Idx);
    expect(mosaicIdx).toBeGreaterThan(banner2Idx);
    expect(featuredIdx).toBeGreaterThan(mosaicIdx);
  });

  // ── Featured videos showcase ────────────────────────────────────────────
  it('renders the Featured videos showcase with the curated demonstrations', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('>Featured Videos<');
    for (const name of ['Routine', 'Circle', 'Sick 3', 'Shred 30']) {
      expect(res.text).toContain(name);
    }
    for (const key of ['routine', 'circle', 'sick3', 'shred30', 'reese-1988', 'conlon-1998', 'worlds-2023-team', 'san-marino-2026']) {
      expect(res.text).toContain(`id="featured-${key}"`);
    }
  });

  it('Featured format cards use one-line captions, not paragraph prose', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Choreographed performance to music.');
    expect(res.text).toContain('Thirty-second technical scoring.');
    expect(res.text).not.toContain('Routine is a timed event in which');
  });

  it('lazy-loads the featured competition-format videos via the video-facade partial', async () => {
    const res = await request(createApp()).get('/freestyle');
    // No eager YouTube iframe on initial load — the facade swaps it in on click.
    expect(res.text).not.toMatch(/<iframe[^>]+src=["']https:\/\/www\.youtube(-nocookie)?\.com\/embed\//);
    for (const videoId of ['Z-KkyOpoBhM', 'aMr5e5wlgeE', 'h6F0aPIpC1o', 'wb75xzvAs68']) {
      expect(res.text).toContain(`href="https://www.youtube.com/watch?v&#x3D;${videoId}"`);
      expect(res.text).toContain(`data-embed-url="https://www.youtube-nocookie.com/embed/${videoId}?rel&#x3D;0"`);
    }
    expect(res.text).toContain('class="video-facade"');
    expect(res.text).toContain('target="_blank"');
    expect(res.text).toContain('rel="noopener noreferrer"');
  });

  it('F3 — curated demonstrations render in the Featured strip', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('1998 World Footbag Championships');
    expect(res.text).toContain('Samantha Conlon and Carol Wedemeyer');
    expect(res.text).toContain('Footbag 2026: San Marino');
    expect(res.text).toContain('Featuring Jim Penske');
    expect(res.text).toContain('id="featured-conlon-1998"');
    expect(res.text).toContain('id="featured-san-marino-2026"');
  });

  it('F7 — only curated demonstrations carry hashtag chip strips', async () => {
    const res = await request(createApp()).get('/freestyle');
    const startIdx = res.text.indexOf('class="freestyle-featured-grid"');
    expect(startIdx).toBeGreaterThan(0);
    const slice = res.text.slice(startIdx);
    // Four chip strips: Reese-1988 + Conlon-1998 + Worlds-2023-Team + San Marino.
    // Format cards carry no chips — the title is the format anchor.
    const stripCount = (slice.match(/class="media-tag-strip"/g) ?? []).length;
    expect(stripCount).toBe(4);
    expect(slice).toContain('media-tag-chip--source');
    expect(slice).toContain('media-tag-chip--creator');
  });

  // ── Demo video ──────────────────────────────────────────────────────────
  it('omits the curator demo-video native player when no FH media is seeded', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toMatch(/<video[^>]*\bautoplay\b[^>]*\bloop\b[^>]*\bmuted\b/);
    expect(res.text).not.toContain('/media-store/');
  });

  it('renders the curator demo video when an FH-owned #demo_freestyle item is seeded', async () => {
    const seedDb = new BetterSqlite3(dbPath);
    try {
      const fhId = insertMember(seedDb, { is_system: 1, slug: 'fh-freestyle' });
      insertCuratorVideo(seedDb, {
        uploaderMemberId: fhId,
        sourceFilename: 'demo-freestyle.mp4',
        slotTag: '#demo_freestyle',
        caption: 'Demonstration of freestyle footbag',
      });
    } finally {
      seedDb.close();
    }

    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('class="demo-video"');
    expect(res.text).toMatch(/\/media-store\/[^"]+-video\.mp4\?v(?:=|&#x3D;)[^"]+/);
    expect(res.text).toContain('Demonstration of freestyle footbag');
    expect(res.text).toContain('autoplay');
    expect(res.text).toContain('playsinline');
  });

  // ── Removed surfaces — must not regress back onto the landing ────────────
  it('does not render the retired Get Started tiles', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('Where to buy footbags');
    expect(res.text).not.toContain('Where to buy shoes');
    expect(res.text).not.toContain('>Get Started<');
  });

  it('does not render the retired Movement Reference shelf or jump-nav', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('freestyle-movement-reference');
    expect(res.text).not.toContain('Movement Reference');
    expect(res.text).not.toContain('class="page-jump-nav"');
    expect(res.text).not.toContain('Reference Shelf');
  });

  it('does not render embedded encyclopedias or numeric stat strips', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('class="operator-board ');
    expect(res.text).not.toContain('class="freestyle-basic-components-grid"');
    expect(res.text).not.toContain('class="freestyle-core-trick-grid"');
    expect(res.text).not.toContain('stats-strip');
    expect(res.text).not.toMatch(/\d+\s+canonical tricks/);
  });

  it('retired routes do not surface as landing links', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('href="/freestyle/notation"');
  });
});

// ---------------------------------------------------------------------------
// GET /freestyle/partnerships
// ---------------------------------------------------------------------------

describe('GET /freestyle/partnerships', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.status).toBe(200);
  });

  it('shows the page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.text).toContain('Freestyle Partnerships');
  });

  it('shows partnership with both partner names', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    // Vera + Tom have 2 doubles appearances → should appear
    expect(res.text).toContain('Vera Champion');
    expect(res.text).toContain('Tom Runner');
  });

  it('links partner names to history pages', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.text).toContain(`/history/${PERSON_A}`);
    expect(res.text).toContain(`/history/${PERSON_B}`);
  });

  it('shows appearances count', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.text).toContain('Appearances');
  });

  it('shows data note', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.text).toContain('Freestyle doubles and team routines only');
  });

  it('shows All Partnerships section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.text).toContain('All Partnerships');
  });

  it('renders a breadcrumb back to /freestyle in the hero', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.text).toMatch(/class="breadcrumb"/);
    expect(res.text).toMatch(/href="\/freestyle">Freestyle</);
  });

  it('opens with a lede that links unfamiliar terms to the glossary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/partnerships');
    expect(res.text).toContain('Doubles freestyle pairs two players');
    expect(res.text).toContain('href="/freestyle/glossary"');
  });
});
