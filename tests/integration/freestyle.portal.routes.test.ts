/**
 * Integration tests for freestyle portal pages.
 *
 * Covers:
 *   GET /freestyle/competition  — results-derived competition history
 *   GET /freestyle/history      — the encyclopedia's introduction: how freestyle became a language
 *   GET /freestyle              — two-band landing (Start Here / Go Deeper)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';

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
// Shared only for pages no test seeds between requests. The landing is
// re-seeded with a demo video partway through, so the requests from that point
// on fetch it fresh.
// cachedGet-writes: the demo-video case seeds after the cached reads and
// fetches /freestyle fresh.
const page = cachedGet(() => createApp());

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

  // A second event, a world championship: Vera wins again, her one world title.
  const event2Id = insertEvent(db, {
    title: 'Test World Freestyle Championships',
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
  // A world-championship doubles win, which must not count as a singles world
  // title for either partner.
  const event3Id = insertEvent(db, {
    title: 'Test World Doubles',
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
  it('shows page title', async () => {
    const res = await page('/freestyle/competition');
    expect(res.text).toContain('Freestyle Competition');
  });

  it('lists singles world titles, linked to the champion, without counting doubles', async () => {
    const res = await page('/freestyle/competition');
    expect(res.status).toBe(200);
    const start = res.text.indexOf('<h2>Most World Titles</h2>');
    expect(start, 'the world titles section renders').toBeGreaterThan(-1);
    const section = res.text.slice(start, res.text.indexOf('</section>', start));
    // Vera won the singles title and the doubles title at world events; only
    // the singles one is a world title here.
    expect(section).toMatch(new RegExp(`href="/history/${PERSON_A}">Vera Champion</a>[\\s\\S]*?col-num">1<`));
    // Tom's only world win is the doubles one.
    expect(section).not.toContain('Tom Runner');
  });

  it('carries no podium leaderboards, era counts or nation tables', async () => {
    // The page keeps the formats, recent events and world titles; the wider
    // statistics pages were cut as page furniture.
    const res = await page('/freestyle/competition');
    for (const cut of [
      'Documented Competitors', 'Events by Era', 'Competition Milestones',
      'Most Successful Nations', 'Freestyle Around the World',
    ]) {
      expect(res.text, `${cut} renders`).not.toContain(cut);
    }
  });

  it('shows recent events section', async () => {
    const res = await page('/freestyle/competition');
    expect(res.text).toContain('Test Freestyle Open');
  });

  it('links recent events to their canonical event page, not a fragment', async () => {
    const res = await page('/freestyle/competition');
    // The stored hashtag form carries a leading '#'; the public event route keys
    // on the bare form. Interpolating the tag raw produced '/events/#event_...',
    // a dead in-page fragment instead of a link to the event page.
    expect(res.text).not.toContain('href="/events/#');
    expect(res.text).toMatch(/href="\/events\/event_[a-z0-9_]+"/);
  });

  it('does NOT count doubles discipline in singles competition table', async () => {
    const res = await page('/freestyle/competition');
    // Vera has 2 singles golds; the doubles win should not inflate this
    // We verify by checking that the data note mentions "singles only"
    expect(res.text).toContain('Freestyle singles only');
  });

  it('shows source data note', async () => {
    const res = await page('/freestyle/competition');
    expect(res.text).toContain('documented event results');
  });

  it('shows the Competition Formats section with beginner descriptions, without event counts', async () => {
    const res = await page('/freestyle/competition');
    expect(res.text).toContain('Competition Formats');
    expect(res.text).toContain('Routines');
    expect(res.text).toContain('Sick 3');
    expect(res.text).not.toContain('<th class="col-num">Documented events</th>');
  });

  it('contains breadcrumb back to /freestyle', async () => {
    const res = await page('/freestyle/competition');
    expect(res.text).toContain('/freestyle');
  });

  it('lede links unfamiliar terms to the glossary', async () => {
    const res = await page('/freestyle/competition');
    expect(res.text).toContain('href="/freestyle/glossary"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/history', () => {
  it('shows the page heading and browser title', async () => {
    const res = await page('/freestyle/history');
    // The displayed h1 is the narrative headline; the browser <title> keeps the
    // stable "Freestyle History" label for search and bookmarks.
    expect(res.text).toContain('How Freestyle Became a Language');
    expect(res.text).toContain('Freestyle History');
  });

  it('opens with the thesis and the language framing', async () => {
    const res = await page('/freestyle/history');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="history-thesis"');
    expect(res.text).toMatch(/expanded the shared vocabulary/);
    expect(res.text).toMatch(/Freestyle footbag is a language/);
  });

  it('renders the narrative sections with their anchors', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('id="origins"');
    expect(res.text).toContain('id="vocabulary"');
    expect(res.text).toContain('id="structure"');
    expect(res.text).toContain('id="institutions"');
    expect(res.text).toContain('id="this-encyclopedia"');
    expect(res.text).toMatch(/The vocabulary expanded by composition/);
    expect(res.text).toMatch(/Institutions preserved and spread the language/);
  });

  it('names the founders as historical record', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('Marshall');
    expect(res.text).toContain('Stalberger');
  });

  it('presents Klouda as evidence of an internationalized field', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('Klouda');
    expect(res.text).toMatch(/Czech Republic/);
  });

  it('integrates the recognition institutions with links', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('Hall of Fame');
    expect(res.text).toContain('Big Add Posse');
    expect(res.text).toContain('href="/hof"');
    expect(res.text).toContain('href="/bap"');
  });

  it('contains cross-links to competition and the dictionary', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('/freestyle/competition');
    expect(res.text).toContain('/freestyle/tricks');
  });

  it('grounds the notation section in Ben Job\'s structural proposal', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('Ben Job');
    expect(res.text).toContain('By the Way, Not the Name');
    expect(res.text).toContain('href="/freestyle/notation-article"');
  });

  it('points the reader onward to the learning path', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/learn"');
  });
});

// ---------------------------------------------------------------------------
// GET /freestyle — two-band landing
//
// Structure: hero → "What is Freestyle?" lede + demo video → Start Here
// band (beginner paths) → Go Deeper band (reference / archive / analysis)
// → Featured strip. No portal-card grid, Movement Reference shelf, Get
// Started tiles, or under-hero jump-nav.
// ---------------------------------------------------------------------------

describe('GET /freestyle — two-band landing', () => {
  it('renders the hero with a movement-first title + subtitle', async () => {
    const res = await page('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Freestyle Footbag</h1>');
    expect(res.text).toContain('Learn the movements, watch videos, and explore the vocabulary.');
  });

  it('shows the mascot image', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('/img/freestyle-mascot.svg');
    expect(res.text).toContain('Freestyle footbag mascot icon');
  });

  it('opens with the "What is Freestyle Footbag?" intro lede', async () => {
    const res = await page('/freestyle');
    expect(res.text).toMatch(/class="content-section freestyle-portal-lede"/);
    expect(res.text).toContain('freestyle-portal-lede-paragraph');
    expect(res.text).toContain('What is Freestyle Footbag?');
  });

  // ── Banner 1 — The Language of Freestyle ────────────────────────────────
  it('renders Banner 1 (The Language of Freestyle) and retires Start Here', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('>The Language of Freestyle<');
    // The retired card was headed "Start Here". Anchored on a heading rather
    // than the bare string, because the beginner on-ramp is a button reading
    // "Start Here" and that control is not the retired card.
    expect(res.text).not.toMatch(/<h[1-6][^>]*>\s*Start Here\s*<\/h[1-6]>/);
    for (const href of [
      '/freestyle/tricks',
      '/freestyle/glossary',
      '/freestyle/concepts',
      '/freestyle/sets',
      '/freestyle/operators',
      '/freestyle/observational',
      '/freestyle/about',
    ]) {
      expect(res.text, `Banner 1 href ${href}`).toContain(`href="${href}"`);
    }
  });

  // ── Banner 2 — Analysis & Competition ───────────────────────────────────
  it('renders Banner 2 (Analysis & Competition) and retires Go Deeper', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('Analysis &amp; Competition');
    expect(res.text).not.toContain('>Go Deeper<');
    for (const href of [
      '/freestyle/records',
      '/freestyle/competition',
      '/freestyle/partnerships',
      '/freestyle/about',
      '/freestyle/by-the-numbers',
    ]) {
      expect(res.text, `Banner 2 href ${href}`).toContain(`href="${href}"`);
    }
  });

  it('keeps the landing to one tile per destination, and Record Leaders stays reachable from Records', async () => {
    // Merged or dropped tiles: a second tile for a page another tile already
    // covers, or for a page well linked elsewhere, is what made the landing a
    // wall of near-duplicates.
    const landing = await page('/freestyle');
    for (const href of [
      '/freestyle/leaders',
      '/freestyle/add-analysis',
      '/freestyle/combo-analysis',
      '/media/browse?tag=freestyle',
    ]) {
      expect(landing.text, `landing tile for ${href}`).not.toContain(`href="${href}"`);
    }
    // Emerging Vocabulary keeps its tile: no other page links to it.
    expect(landing.text).toContain('href="/freestyle/observational"');
    // The Leaders page lost its landing tile, so Records must carry the way in.
    const records = await page('/freestyle/records');
    expect(records.status).toBe(200);
    expect(records.text).toContain('href="/freestyle/leaders"');
  });

  it('the retired Insights address redirects permanently to By the Numbers and nothing links to it', async () => {
    const res = await request(createApp()).get('/freestyle/insights');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/by-the-numbers');
    for (const path of ['/freestyle', '/freestyle/history', '/freestyle/combo-analysis']) {
      const linking = await page(path);
      expect(linking.text, `${path} links to the retired Insights page`).not.toContain('href="/freestyle/insights"');
    }
  });

  it('records are framed as "Trick Records", never "World Records"', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('Trick Records');
    expect(res.text).not.toContain('World Records');
  });

  it('orders sections: lede → vocabulary → Featured → Media → History → analysis', async () => {
    const res = await page('/freestyle');
    const ledeIdx     = res.text.indexOf('freestyle-portal-lede');
    const languageIdx = res.text.indexOf('>The Language of Freestyle<');
    const featuredIdx = res.text.indexOf('class="content-section freestyle-featured"');
    const mediaIdx    = res.text.indexOf('>Freestyle Media<');
    const historyIdx  = res.text.indexOf('>History of Freestyle<');
    const analysisIdx = res.text.indexOf('Analysis &amp; Competition');
    expect(ledeIdx).toBeGreaterThan(0);
    expect(languageIdx).toBeGreaterThan(ledeIdx);
    expect(featuredIdx).toBeGreaterThan(languageIdx);
    expect(mediaIdx).toBeGreaterThan(featuredIdx);
    expect(historyIdx).toBeGreaterThan(mediaIdx);
    // The deeper analysis reference closes the page, below the video sections.
    expect(analysisIdx).toBeGreaterThan(historyIdx);
  });

  it('carries the By the Numbers link inside the analysis group', async () => {
    const res = await page('/freestyle');
    const analysisIdx = res.text.indexOf('Analysis &amp; Competition');
    const numbersIdx  = res.text.indexOf('href="/freestyle/by-the-numbers"');
    expect(analysisIdx).toBeGreaterThan(0);
    expect(numbersIdx).toBeGreaterThan(analysisIdx);
  });

  // ── Featured videos showcase ────────────────────────────────────────────
  it('renders the Featured videos showcase with the curated demonstrations', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('>Featured Videos<');
    for (const name of ['Circle', 'Sick 3', 'Shred 30']) {
      expect(res.text).toContain(name);
    }
    for (const key of ['circle', 'sick3', 'shred30', 'reese-1988', 'conlon-1998', 'worlds-2023-team', 'san-marino-2026']) {
      expect(res.text).toContain(`id="featured-${key}"`);
    }
    expect(res.text).not.toContain('id="featured-routine"');
  });

  it('Featured format cards use one-line captions, not paragraph prose', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('Turn-based show-off format.');
    expect(res.text).toContain('Thirty-second technical scoring.');
    expect(res.text).not.toContain('Routine is a timed event in which');
  });

  it('shows no hashtag chips on the featured cards', async () => {
    const res = await page('/freestyle');
    const start = res.text.indexOf('freestyle-featured-grid');
    const strip = res.text.slice(start, res.text.indexOf('</section>', start));
    expect(start).toBeGreaterThan(-1);
    expect(strip).not.toContain('media-tag');
    expect(strip).not.toContain('#worlds_2023');
    expect(strip).not.toContain('#by_jay7bah');
  });

  it('lazy-loads the featured competition-format videos via the video-facade partial', async () => {
    const res = await page('/freestyle');
    // No eager YouTube iframe on initial load — the facade swaps it in on click.
    expect(res.text).not.toMatch(/<iframe[^>]+src=["']https:\/\/www\.youtube(-nocookie)?\.com\/embed\//);
    for (const videoId of ['aMr5e5wlgeE', 'h6F0aPIpC1o', 'wb75xzvAs68']) {
      expect(res.text).toContain(`href="https://www.youtube.com/watch?v&#x3D;${videoId}"`);
      expect(res.text).toContain(`data-embed-url="https://www.youtube-nocookie.com/embed/${videoId}?rel&#x3D;0"`);
    }
    expect(res.text).toContain('class="video-facade"');
    expect(res.text).toContain('target="_blank"');
    expect(res.text).toContain('rel="noopener noreferrer"');
  });

  it('F3 — curated demonstrations render in the Featured strip', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('1998 World Footbag Championships');
    expect(res.text).toContain('Samantha Conlon and Carol Wedemeyer');
    expect(res.text).toContain('Footbag 2026: San Marino');
    expect(res.text).toContain('Featuring Jim Penske');
    expect(res.text).toContain('id="featured-conlon-1998"');
    expect(res.text).toContain('id="featured-san-marino-2026"');
  });

  // ── Demo video ──────────────────────────────────────────────────────────
  it('omits the curator demo-video native player when no FH media is seeded', async () => {
    const res = await page('/freestyle');
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

  // The demo clip starts on its own and loops forever, so the visitor needs a
  // way to stop it; the native controls are that mechanism. The clip renders
  // on the freestyle landing alone: the start page deliberately carries no
  // copy of it, so the two pages a newcomer crosses in sequence never repeat
  // the same video.
  it('gives the looping demo clip controls on the landing, and keeps the start page video-free', async () => {
    const landing = await request(createApp()).get('/freestyle');
    expect(landing.text).toMatch(/<video[^>]*\bautoplay\b[^>]*\bcontrols\b/);

    const start = await request(createApp()).get('/freestyle/start');
    expect(start.text).not.toContain('<video');
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
  it('shows the page title', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.text).toContain('Freestyle Partnerships');
  });

  it('shows partnership with both partner names', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.status).toBe(200);
    // Vera + Tom have 2 doubles appearances → should appear
    expect(res.text).toContain('Vera Champion');
    expect(res.text).toContain('Tom Runner');
  });

  it('links partner names to history pages', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.text).toContain(`/history/${PERSON_A}`);
    expect(res.text).toContain(`/history/${PERSON_B}`);
  });

  it('shows appearances count', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.text).toContain('Appearances');
  });

  it('shows data note', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.text).toContain('Freestyle doubles and team routines only');
  });

  it('shows All Partnerships section', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.text).toContain('All Partnerships');
  });

  it('renders a breadcrumb back to /freestyle in the hero', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.text).toMatch(/class="breadcrumb"/);
    expect(res.text).toMatch(/href="\/freestyle">Freestyle</);
  });

  it('opens with a lede that links unfamiliar terms to the glossary', async () => {
    const res = await page('/freestyle/partnerships');
    expect(res.text).toContain('Doubles freestyle pairs two players');
    expect(res.text).toContain('href="/freestyle/glossary"');
  });
});
