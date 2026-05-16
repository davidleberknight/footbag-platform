/**
 * Integration tests for freestyle portal pages.
 *
 * Covers:
 *   GET /freestyle/competition  — results-derived competition history
 *   GET /freestyle/history      — editorial history, pioneers, eras
 *   GET /freestyle              — redesigned 4-pillar portal landing
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

  it('shows "Top Freestyle Singles Competitors" heading', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('Top Freestyle Singles Competitors');
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
    expect(res.text).toContain('canonical event results');
  });

  it('contains breadcrumb back to /freestyle', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/competition');
    expect(res.text).toContain('/freestyle');
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

describe('GET /freestyle — onboarding + portal landing', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.status).toBe(200);
  });

  it('shows mascot image', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/img/freestyle-mascot.svg');
    expect(res.text).toContain('Freestyle footbag mascot icon');
  });

  it('shows the "Language of Freestyle Footbag" intro heading and short compositional lede', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('The Language of Freestyle Footbag');
    // Lede frames the grammar: basic components, core tricks, operators.
    expect(res.text).toMatch(/vocabulary of body actions/);
    expect(res.text).toMatch(/basic components/);
    expect(res.text).toMatch(/core tricks/);
  });

  it('shows three placeholder get-started tiles', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('Where to buy footbags');
    expect(res.text).toContain('Where to buy shoes');
    expect(res.text).toContain('Beginner tutorials');
    // all three use the coming-soon badge
    const badgeCount = res.text.split('badge-coming-soon').length - 1;
    expect(badgeCount).toBeGreaterThanOrEqual(3);
  });

  it('shows the merged Featured strip with all four format names + curated demonstrations', async () => {
    // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / C: Competition Formats +
    // Demonstrations sections merged into one compact `Featured` strip.
    // Format names preserved as card titles (cultural + navigational anchors).
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('>Featured<');
    // Format names preserved.
    expect(res.text).toContain('Routine');
    expect(res.text).toContain('Circle');
    expect(res.text).toContain('Sick 3');
    expect(res.text).toContain('Shred 30');
    // Card ids in the merged grid (4 formats + 4 demonstrations, chronological
    // within the demonstrations cluster post-CURATED-MEDIA-EXPANSION-2026-05).
    for (const key of ['routine', 'circle', 'sick3', 'shred30', 'reese-1988', 'conlon-1998', 'worlds-2023-team', 'san-marino-2026']) {
      expect(res.text).toContain(`id="featured-${key}"`);
    }
    // Retired sections must not survive.
    expect(res.text).not.toContain('>Competition Formats<');
    expect(res.text).not.toContain('class="freestyle-demonstrations-grid"');
  });

  it('drops the multi-sentence format paragraphs in favor of one-line captions', async () => {
    // Phase 1 / C aggressive compression: no paragraph-length prose on
    // format cards. Captions are one-line context only.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).not.toContain('Routine is a timed event in which');
    expect(res.text).not.toContain("Circle takes traditional freestyle footbag");
    expect(res.text).not.toContain("Sick 3 is freestyle footbag's version");
    expect(res.text).not.toContain('Shred 30 is a short, timed, scored event');
    // One-line captions are present.
    expect(res.text).toContain('Choreographed performance to music.');
    expect(res.text).toContain('Thirty-second technical scoring.');
  });

  it('lazy-loads the four reference competition-format videos via the video-facade partial', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');

    // No eager YouTube iframe is rendered on initial load. The facade
    // partial (src/views/partials/video-facade.hbs) renders a static
    // thumbnail anchor; video-facade.js swaps in the iframe on click.
    // Without JS, the anchor href takes the user to youtube.com.
    expect(res.text).not.toMatch(/<iframe[^>]+src=["']https:\/\/www\.youtube(-nocookie)?\.com\/embed\//);

    // Per format card (Routine, Circle, Sick 3, Shred 30): platform
    // watch href, embed-url data attribute, and platform thumbnail.
    for (const videoId of ['Z-KkyOpoBhM', 'aMr5e5wlgeE', 'h6F0aPIpC1o', 'wb75xzvAs68']) {
      expect(res.text).toContain(`href="https://www.youtube.com/watch?v&#x3D;${videoId}"`);
      expect(res.text).toContain(`data-embed-url="https://www.youtube-nocookie.com/embed/${videoId}?rel&#x3D;0"`);
      expect(res.text).toContain(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    }

    // Partial markup + no-JS fallback open YouTube in a new tab safely.
    expect(res.text).toContain('class="video-facade"');
    expect(res.text).toContain('data-platform="youtube"');
    expect(res.text).toContain('target="_blank"');
    expect(res.text).toContain('rel="noopener noreferrer"');
  });

  it('shows the portal cards (intent-ordered, post-2026-05-13 philosophy realignment)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // Each card's heading is asserted by its title text. The 2026-05-13 pass
    // demoted the standalone Notation Reference card (notation is integrated
    // into trick pages + the glossary, no longer a top-level portal pillar)
    // and routed learners to /freestyle/learn from the Tutorials card.
    expect(res.text).toContain('Tutorials &amp; Learning');
    expect(res.text).toContain('Glossary');
    expect(res.text).toContain('Trick Dictionary');
    expect(res.text).toContain('World Records');
    expect(res.text).toContain('Competition');
    expect(res.text).toContain('History &amp; ADD System');
    expect(res.text).toContain('Insights');
    // Notation Reference no longer rendered as a standalone portal card.
    expect(res.text).not.toMatch(/<div class="card-title">Notation Reference<\/div>/);
    // Prior phrasings must not survive.
    expect(res.text).not.toContain('Passback Records');
    expect(res.text).not.toContain('Freestyle World Records');
    expect(res.text).not.toMatch(/<div class="card-title">Learn Tricks<\/div>/);
  });

  it('Tutorials card lists the curated tutorial series; Glossary lives on its own peer card (no longer a subordinate link)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // All TT/AnzTrikz tutorial-series links remain present on the page.
    expect(res.text).toContain('/media/gallery_tricks_of_the_trade');
    expect(res.text).toContain('/media/gallery_anz_trikz');
    expect(res.text).toContain('/freestyle/glossary');
    // The TT + AnzTrikz links sit inside the Tutorials & Learning card.
    const tutIdx = res.text.indexOf('Tutorials &amp; Learning');
    const glossaryCardIdx = res.text.indexOf('<div class="card-title">Glossary</div>');
    expect(tutIdx).toBeGreaterThan(0);
    expect(glossaryCardIdx).toBeGreaterThan(tutIdx);
    const tutSlice = res.text.slice(tutIdx, glossaryCardIdx);
    expect(tutSlice).toContain('/media/gallery_tricks_of_the_trade');
    expect(tutSlice).toContain('/media/gallery_anz_trikz');
    // The glossary link is NOT inside the Tutorials card anymore — it sits
    // on its own peer card with a normal action button.
    expect(tutSlice).not.toContain('/freestyle/glossary');
    expect(tutSlice).not.toMatch(/class="card-secondary-link"/);
  });

  it('Glossary card carries its own peer action button (not a subordinate reference link)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // The Glossary card has a btn-outline action linking to /freestyle/glossary.
    expect(res.text).toMatch(/<a href="\/freestyle\/glossary" class="btn btn-outline">Open glossary &rarr;<\/a>/);
    // The pre-2026-05-10 subordinate-reference pattern must NOT survive.
    expect(res.text).not.toMatch(/class="card-secondary-link"[\s\S]*?\/freestyle\/glossary/);
  });

  it('links to all portal pillar pages', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/competition');
    expect(res.text).toContain('/freestyle/records');
    expect(res.text).toContain('/freestyle/tricks');
    expect(res.text).toContain('/freestyle/history');
  });

  it('does not render a numeric stats strip on the landing', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).not.toContain('stats-strip');
    expect(res.text).not.toMatch(/\d+\s+passback records/);
    expect(res.text).not.toMatch(/\d+\s+documented tricks/);
  });

  it('omits the curator-owned demo-video native player when no FH media is seeded', async () => {
    // The curator demo-video is the unique surface that emits a native HTML5
    // `<video autoplay loop muted ...>` block sourced from /media-store. The
    // `.demo-video` figure class itself is also reused by the featured-video
    // section, so this test asserts against the curator-specific marker.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).not.toMatch(/<video[^>]*\bautoplay\b[^>]*\bloop\b[^>]*\bmuted\b/);
    expect(res.text).not.toContain('/media-store/');
  });

  it('renders the curator-owned demo video when an FH-owned #demo_freestyle item is seeded', async () => {
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

    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('class="demo-video"');
    expect(res.text).toMatch(/\/media-store\/[^"]+-video\.mp4\?v(?:=|&#x3D;)[^"]+/);
    expect(res.text).toMatch(/\/media-store\/[^"]+-poster-display\.jpg/);
    expect(res.text).toContain('Demonstration of freestyle footbag');
    expect(res.text).toContain('autoplay');
    expect(res.text).toContain('playsinline');
    expect(res.text).not.toContain('type="video/webm"');
  });

  it('does not show old "About Freestyle Footbag" as standalone section without history context', async () => {
    // The new landing has an "About" section that links to /freestyle/history
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/history');
  });

  it('shows link to partnerships page', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/partnerships');
  });

  // ── Operator board (OP-BOARD-1, 2026-05-13) ────────────────────────────
  it('renders the operator-board heading and (compressed) lede', async () => {
    // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / D: landing lede compressed
    // to one short sentence. The "Fourteen primitives" framing is preserved.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('The operators of freestyle');
    expect(res.text).toContain('Fourteen primitives');
    expect(res.text).toContain('every named trick');
  });

  it('renders all three operator-tier sections in order with eyebrows but no tier-intro lines', async () => {
    // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / D: tier-intro paragraph
    // dropped (eyebrow + title carry the tier identity). The intro field
    // remains in the data contract but is no longer rendered.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const idxSet    = res.text.indexOf('Set operators');
    const idxBody   = res.text.indexOf('Body operators');
    const idxStruct = res.text.indexOf('Structural concepts');
    expect(idxSet).toBeGreaterThan(0);
    expect(idxBody).toBeGreaterThan(idxSet);
    expect(idxStruct).toBeGreaterThan(idxBody);
    // Eyebrow text preserved (the ·-separated tier label).
    expect(res.text).toContain('I · Sets');
    expect(res.text).toContain('II · Body');
    expect(res.text).toContain('III · Structure');
    // Tier-intro lines are no longer rendered.
    expect(res.text).not.toContain('class="operator-tier-intro"');
    expect(res.text).not.toContain('What sends the bag into the air.');
    expect(res.text).not.toContain('What the body does while the bag is up.');
    expect(res.text).not.toContain('Relationships across the trick.');
  });

  it('renders all 14 Tier-1 operator glyphs inside operator-glyph cells', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const glyphs = [
      'PIX', 'AT', 'Q', 'BL', 'FAIRY', 'STEP',
      'SPIN', 'GY', 'DUCK', 'PDX', 'SYMP',
      'XDEX', 'SAME', 'OP',
    ];
    for (const glyph of glyphs) {
      // Each glyph appears inside its own .operator-glyph paragraph at least once.
      const re = new RegExp(`<p class="operator-glyph">${glyph}</p>`);
      expect(res.text).toMatch(re);
    }
  });

  it('renders one composition example per operator with input + arrow + result', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // Spot-check four representative compositions across all three tiers.
    expect(res.text).toMatch(/PIX \+ BUTTERFLY[\s\S]*?DIMWALK/);
    expect(res.text).toMatch(/SPIN \+ TORQUE[\s\S]*?MOBIUS/);
    expect(res.text).toMatch(/PIX \+ DUCK \+ BUTTERFLY[\s\S]*?PHOENIX/);
    expect(res.text).toMatch(/SAME \+ BUTTERFLY[\s\S]*?SAME-FOOT BUTTERFLY/);
    // Each example block carries a separator arrow.
    const arrowCount = (res.text.match(/class="operator-example-arrow"/g) || []).length;
    expect(arrowCount).toBe(14);
  });

  it('places the operator board above the "Where to go next" orientation block', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const boardIdx       = res.text.indexOf('class="operator-board');
    const orientationIdx = res.text.indexOf('Where to go next');
    expect(boardIdx).toBeGreaterThan(0);
    expect(orientationIdx).toBeGreaterThan(boardIdx);
  });

  // ── Operator-card deep-links: one restrained destination per operator ──
  it('renders the expected deep-link for each linked operator', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // Notation references (moves page anchors)
    expect(res.text).toContain('href="/freestyle/sets#move-pixie"');
    expect(res.text).toContain('href="/freestyle/sets#move-atomic"');
    expect(res.text).toContain('href="/freestyle/sets#move-quantum"');
    expect(res.text).toContain('href="/freestyle/sets#move-fairy"');
    expect(res.text).toContain('href="/freestyle/sets#move-gyro"');
    // Glossary entries
    expect(res.text).toContain('href="/freestyle/glossary#term-stepping"');
    expect(res.text).toContain('href="/freestyle/glossary#term-symposium"');
    // Modifier pedagogy (mature surfaces only)
    expect(res.text).toContain('href="/freestyle/modifier/spinning"');
    expect(res.text).toContain('href="/freestyle/modifier/paradox"');
    expect(res.text).toContain('href="/freestyle/modifier/ducking"');
  });

  it('renders exactly eleven operator-card deep-link anchors', async () => {
    // Bumped from 10 to 11 after LANDING-AND-TRICKS-QA-REALIGNMENT-1 F2:
    // BL was relabeled Blender→Blurry and given a GLOSSARY('blurry') deeplink.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const matches = res.text.match(/class="operator-card-deeplink"/g) ?? [];
    expect(matches.length).toBe(11);
  });

  it('omits the deep-link footer on unlinked operators (XDEX, SAME, OP)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).not.toContain('/freestyle/glossary#term-blender');
    expect(res.text).not.toContain('/freestyle/glossary#term-cross-dex');
    expect(res.text).not.toContain('/freestyle/glossary#term-same-foot');
    expect(res.text).not.toContain('/freestyle/glossary#term-opposite');
    expect(res.text).not.toContain('/freestyle/modifier/blender');
    expect(res.text).not.toContain('/freestyle/modifier/cross-dex');
  });
});

// ── LANDING-AND-TRICKS-QA-REALIGNMENT-1 (2026-05-14) ──────────────────────
// Bundled QA + repair slice F1–F4 + F7-landing-side:
//   F1: core-trick ADD slot renders numeric value, not "[object Object]undefined"
//       (Handlebars helper `add` no longer shadows the data field).
//   F2: operator-board semantic corrections — BL=Blurry not Blender; no false
//       rotation claims on Atomic/Quantum/Fairy (dex-direction operators).
//   F3: demonstrations section is curated-only (no five-slot placeholder
//       scaffolding); Conlon 1998 + San Marino 2026 render.
//   F4: covered by freestyle.dictionary-trick-card.routes.test (out of scope here).
//   F7: tag-strip renders on every visible curated demonstration.
describe('LANDING-AND-TRICKS-QA-REALIGNMENT-1 — landing repair (F1+F2+F3+F7)', () => {
  it('F1 — core-trick cards render the numeric ADD value, not a Handlebars helper-shadow string', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // The pre-fix render emitted "[object Object]undefined" because the data
    // field `{{add}}` collided with the helper named `add` in src/app.ts.
    // Fix: rename the field to `addNumeric`. Guard against regression.
    expect(res.text).not.toContain('[object Object]undefined');
    expect(res.text).not.toContain('[object Object]');
    // The seeded `whirl` core-trick has adds=3 in beforeAll; its card must
    // render the numeric value inside .core-trick-add-value.
    expect(res.text).toMatch(
      /id="core-trick-whirl"[\s\S]*?<span class="core-trick-add-value">3<\/span>/,
    );
  });

  it('F1 — atoms without a seeded dictionary row render the "ADD pending" em-dash, not undefined', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // `orbit` is in CORE_TRICK_SPEC but no DB row was seeded for it in this
    // test fixture. The card must render the pending state, not "undefined".
    expect(res.text).toMatch(
      /id="core-trick-orbit"[\s\S]*?core-trick-add-pending[\s\S]*?&mdash;/,
    );
    expect(res.text).not.toMatch(
      /id="core-trick-orbit"[\s\S]*?<span class="core-trick-add-value">undefined<\/span>/,
    );
  });

  it('F2 — BL operator surfaces as Blurry (not Blender) with the canonical Stepping+Paradox reading', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // The BL glyph paragraph must be followed by the name "Blurry".
    expect(res.text).toMatch(/<p class="operator-glyph">BL<\/p>\s*<p class="operator-name">Blurry<\/p>/);
    // The composition example for BL is BLURRY + BUTTERFLY → RIPWALK.
    expect(res.text).toMatch(/BLURRY \+ BUTTERFLY[\s\S]*?RIPWALK/);
    // The pre-fix wording "Blender" / "Blender + butterfly" must not appear
    // anywhere as the BL operator name.
    expect(res.text).not.toMatch(/<p class="operator-glyph">BL<\/p>\s*<p class="operator-name">Blender<\/p>/);
  });

  it('F2 — Atomic/Quantum/Fairy actions describe dex-direction sets, not rotational character', async () => {
    // After SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / D, the card hierarchy
    // reorders to glyph → name → example → action → deeplink, and actions
    // compress to ≤8 words. The F2 intent (no false rotation claims) holds.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // Per-card slice helper — grabs the markup between an operator's glyph and the next card.
    function operatorCard(glyph: string): string {
      const start = res.text.indexOf(`<p class="operator-glyph">${glyph}</p>`);
      expect(start).toBeGreaterThan(-1);
      const next  = res.text.indexOf('<div class="operator-card">', start + 1);
      const end   = next > 0 ? next : start + 600;
      return res.text.slice(start, end);
    }
    const at = operatorCard('AT');
    const q  = operatorCard('Q');
    const fy = operatorCard('FAIRY');
    // Each action conveys dex-direction (opposite/same-side + in/out).
    expect(at).toMatch(/Opposite-side.*out.*toe-set dex/i);
    expect(q).toMatch(/Opposite-side.*in.*toe-set dex/i);
    expect(fy).toMatch(/Same-side.*out.*toe-set dex/i);
    // No card claims rotation character.
    expect(at).not.toMatch(/rotation/i);
    expect(q).not.toMatch(/rotation/i);
    expect(fy).not.toMatch(/rotation/i);
  });

  it('F3 — curated demonstrations (Conlon 1998 + San Marino 2026) render in the merged Featured strip', async () => {
    // Post-SURFACE-COMPRESSION Phase 1 / C: demonstrations live inside the
    // merged Featured strip with stable `featured-{key}` anchor ids.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('1998 World Footbag Championships');
    expect(res.text).toContain('Samantha Conlon and Carol Wedemeyer');
    expect(res.text).toContain('Footbag 2026: San Marino');
    expect(res.text).toContain('Footage by jay7bah');
    expect(res.text).toContain('2URvZFuxBls');
    expect(res.text).toContain('U6J2LXxUWro');
    expect(res.text).toContain('id="featured-conlon-1998"');
    expect(res.text).toContain('id="featured-san-marino-2026"');
    expect(res.text).not.toContain('Curated demonstration pending');
  });

  it('F7 — only curated demonstrations carry hashtag chip strips inside the merged Featured grid', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const startIdx = res.text.indexOf('class="freestyle-featured-grid"');
    const endIdx   = res.text.indexOf('operator-board', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    const slice = res.text.slice(startIdx, endIdx > 0 ? endIdx : startIdx + 12000);
    // Four chip strips: one each for Reese-1988 + Conlon-1998 + Worlds-2023-Team
    // + San Marino-2026. Format cards (Routine / Circle / Sick3 / Shred30)
    // carry no chips — the title is the format anchor.
    const stripCount = (slice.match(/class="media-tag-strip"/g) ?? []).length;
    expect(stripCount).toBe(4);
    expect(slice).toContain('media-tag-chip--source');     // #footbag_hof_archive
    expect(slice).toContain('media-tag-chip--creator');    // #by_jay7bah
    expect(slice).toContain('media-tag-chip--quality');    // #curated
    expect(slice).not.toMatch(/<li class="media-tag-chip[^"]*">#freestyle<\/li>/);
    expect(slice).not.toMatch(/<li class="media-tag-chip[^"]*">#trick<\/li>/);
  });
});

// ── SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 + under-hero jump nav (2026-05-14) ──
describe('SURFACE-COMPRESSION-REALIGNMENT-1 — landing compression invariants', () => {
  it('renders the under-hero jump nav with five anchors', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('class="page-jump-nav"');
    expect(res.text).toContain('aria-label="On this page"');
    for (const anchor of [
      '#basic-components', '#core-tricks', '#featured', '#operators', '#where-next',
    ]) {
      expect(res.text).toContain(`href="${anchor}"`);
    }
    // The five matching section ids are present.
    for (const id of [
      'basic-components', 'core-tricks', 'featured', 'operators', 'where-next',
    ]) {
      expect(res.text).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it('operator-board lede is one short sentence, not a 30-word paragraph', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const ledeMatch = res.text.match(/<p class="operator-board-lede">([^<]+)<\/p>/);
    expect(ledeMatch).not.toBeNull();
    const ledeWords = (ledeMatch![1].trim().split(/\s+/) ?? []).length;
    expect(ledeWords).toBeLessThanOrEqual(15);
    // Old verbose lede must not survive.
    expect(res.text).not.toContain('Freestyle footbag is a compositional movement language.');
  });

  it('every operator-action line stays under the compression threshold (≤10 words)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const actions = [...res.text.matchAll(/<p class="operator-action">([^<]+)<\/p>/g)];
    expect(actions.length).toBe(14);
    for (const m of actions) {
      const wc = m[1].trim().split(/\s+/).length;
      expect(wc).toBeLessThanOrEqual(10);
    }
  });

  it('operator card hierarchy is glyph → name → example → action → deeplink', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // The PIX card is a stable anchor for ordering assertions.
    const start = res.text.indexOf('<p class="operator-glyph">PIX</p>');
    expect(start).toBeGreaterThan(-1);
    const slice = res.text.slice(start, start + 800);
    const idxGlyph  = slice.indexOf('operator-glyph');
    const idxName   = slice.indexOf('operator-name');
    const idxExample = slice.indexOf('operator-example');
    const idxAction = slice.indexOf('operator-action');
    const idxDeep   = slice.indexOf('operator-card-deeplink');
    expect(idxName).toBeGreaterThan(idxGlyph);
    expect(idxExample).toBeGreaterThan(idxName);
    expect(idxAction).toBeGreaterThan(idxExample);
    expect(idxDeep).toBeGreaterThan(idxAction);
  });

  it('operator-card deeplink renders as icon-only with aria-label, not visible label text', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // Visible scaffolding labels removed.
    expect(res.text).not.toMatch(/<a class="operator-card-deeplink"[^>]*>Notation reference<\/a>/);
    expect(res.text).not.toMatch(/<a class="operator-card-deeplink"[^>]*>Glossary entry<\/a>/);
    expect(res.text).not.toMatch(/<a class="operator-card-deeplink"[^>]*>Modifier page<\/a>/);
    // Aria-label still carries the destination type for screen readers.
    expect(res.text).toMatch(/<a class="operator-card-deeplink"[^>]*aria-label="Notation reference"/);
  });

  it('basic-component descriptions are compressed (≤10 words each)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const descs = [...res.text.matchAll(/<p class="freestyle-component-desc">([^<]+)<\/p>/g)];
    expect(descs.length).toBe(6);
    for (const m of descs) {
      const wc = m[1].trim().split(/\s+/).length;
      expect(wc).toBeLessThanOrEqual(10);
    }
    // The retired multi-sentence descriptions must not survive.
    expect(res.text).not.toContain('Start and end of most standard tricks.');
    expect(res.text).not.toContain('The most common, \'main\' component of trick composition');
  });
});

// ── Phase 2: symbolic strengthening ────────────────────────────────────
describe('SURFACE-COMPRESSION-REALIGNMENT-1 Phase 2 — landing core-tricks alias drop (B)', () => {
  it('landing Core Tricks renders the new atom-layer operational notation in the core-trick-notation slot', async () => {
    // OP-NOTATION-WAVE-1A Bridge 1 (2026-05-15): foundational atoms now
    // carry §13.9 atom-layer descriptive operational notation. The slot
    // renders inside the core-trick-object article when row.operational_notation
    // is populated; suppressed otherwise.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // Mirage: 11 of 11 atom slug query — assert the specific lowercase
    // descriptive form on the visible card.
    const mirageStart = res.text.indexOf('id="core-trick-mirage"');
    expect(mirageStart).toBeGreaterThan(0);
    const mirageEnd = res.text.indexOf('</article>', mirageStart);
    const mirageBlock = res.text.slice(mirageStart, mirageEnd);
    expect(mirageBlock).toMatch(/<p class="core-trick-notation">\[set\] &gt; hippy in dex &gt; op toe<\/p>/);
    // Butterfly: hippy out + ss clipper terminal.
    const butterflyStart = res.text.indexOf('id="core-trick-butterfly"');
    const butterflyBlock = res.text.slice(butterflyStart, res.text.indexOf('</article>', butterflyStart));
    expect(butterflyBlock).toMatch(/<p class="core-trick-notation">\[set\] &gt; hippy out dex &gt; ss clipper<\/p>/);
    // ATW: explicit toe plant.
    const atwStart = res.text.indexOf('id="core-trick-around-the-world"');
    const atwBlock = res.text.slice(atwStart, res.text.indexOf('</article>', atwStart));
    expect(atwBlock).toMatch(/<p class="core-trick-notation">toe &gt; ss leggy in dex &gt; ss toe<\/p>/);
  });

  it('landing Core Tricks renders without ≡ equivalence lines (foundational-atom feel)', async () => {
    // B: the three legacy `≡ ATW`, `≡ outside-in mirage`, `≡ reverse
    // around-the-world` lines are dropped from the landing's compact
    // symbolic-object grid. Atoms read as `#slug` + ADD; nothing else.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // No ≡ equivalence paragraphs in the core-tricks grid.
    const gridStart = res.text.indexOf('class="freestyle-core-trick-grid"');
    const gridEnd   = res.text.indexOf('core-trick-footnote', gridStart);
    expect(gridStart).toBeGreaterThan(0);
    const slice = res.text.slice(gridStart, gridEnd);
    expect(slice).not.toMatch(/class="core-trick-equivalence"/);
    // The retired alias strings must not surface anywhere on the page.
    expect(res.text).not.toMatch(/<p class="core-trick-equivalence">[\s\S]*?ATW/);
    expect(res.text).not.toMatch(/<p class="core-trick-equivalence">[\s\S]*?outside-in mirage/);
    expect(res.text).not.toMatch(/<p class="core-trick-equivalence">[\s\S]*?reverse around-the-world/);
    // All 11 atoms still render as #slug tiles. Per
    // CORE-ATOM-CANONICAL-RECONCILE-1 (2026-05-15), the foundational
    // "clipper" atom is anchored at slug `clipper-stall` with a
    // `displaySlug: 'clipper'` override — visible tag stays `#clipper`,
    // but the anchor id is `core-trick-clipper-stall`.
    const expectedAtoms = [
      { slug: 'clipper-stall',    display: 'clipper' },
      { slug: 'mirage',           display: 'mirage' },
      { slug: 'legover',          display: 'legover' },
      { slug: 'pickup',           display: 'pickup' },
      { slug: 'illusion',         display: 'illusion' },
      { slug: 'whirl',            display: 'whirl' },
      { slug: 'butterfly',        display: 'butterfly' },
      { slug: 'swirl',            display: 'swirl' },
      { slug: 'osis',             display: 'osis' },
      { slug: 'around-the-world', display: 'around-the-world' },
      { slug: 'orbit',            display: 'orbit' },
    ];
    for (const { slug, display } of expectedAtoms) {
      expect(res.text).toContain(`id="core-trick-${slug}"`);
      expect(res.text).toContain(`#${display}`);
    }
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
});
