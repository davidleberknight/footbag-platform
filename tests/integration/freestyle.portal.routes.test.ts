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

  it('exposes a freestyle-portal-lede content-section containing at least one freestyle-portal-lede-paragraph', async () => {
    // Structural invariant: the landing renders the lede surface with
    // the documented class hooks. Paragraph copy is supplied by the
    // service and is not pinned by this test.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toMatch(/class="content-section freestyle-portal-lede"/);
    expect(res.text).toMatch(/class="freestyle-portal-lede-paragraph"/);
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
    // Competition Formats + Demonstrations sections merged into one compact
    // `Featured` strip. Format names preserved as card titles (cultural +
    // navigational anchors).
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

  it('renders every href in the locked portal-card manifest and no /freestyle/notation anchor', async () => {
    // Structural invariant: the portal grid exposes a fixed set of
    // outbound routes. Each route in the manifest must appear at least
    // once on the page. /freestyle/notation is retired and must not
    // surface as a portal-card anchor.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const requiredHrefs = [
      '/freestyle/tricks',
      '/freestyle/glossary',
      '/freestyle/records',
      '/freestyle/leaders',
      '/freestyle/competition',
      '/freestyle/partnerships',
      '/freestyle/history',
      '/freestyle/add-analysis',
      '/freestyle/combo-analysis',
      '/freestyle/insights',
      '/freestyle/operators',
    ];
    for (const href of requiredHrefs) {
      expect(res.text, `expected portal link to ${href}`).toContain(`href="${href}"`);
    }
    expect(res.text).not.toContain('href="/freestyle/notation"');
  });

  it('Tutorials card lists the curated tutorial series; Glossary lives on its own peer card (no longer a subordinate link)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    // All TT/AnzTrikz/PassBack tutorial-series links remain present on the page.
    expect(res.text).toContain('/media/gallery_tricks_of_the_trade');
    expect(res.text).toContain('/media/gallery_passback_tutorials');
    expect(res.text).toContain('/media/gallery_anz_trikz');
    expect(res.text).toContain('/freestyle/glossary');
    // The TT + PassBack + AnzTrikz links sit inside the Tutorials & Learning card.
    const tutIdx = res.text.indexOf('Tutorials &amp; Learning');
    const glossaryCardIdx = res.text.indexOf('<div class="card-title">Glossary</div>');
    expect(tutIdx).toBeGreaterThan(0);
    expect(glossaryCardIdx).toBeGreaterThan(tutIdx);
    const tutSlice = res.text.slice(tutIdx, glossaryCardIdx);
    expect(tutSlice).toContain('/media/gallery_tricks_of_the_trade');
    expect(tutSlice).toContain('/media/gallery_passback_tutorials');
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

  // ── Landing operator-board absence + lightweight preview ────────────────
  // Second-pass landing-page cleanup (2026-05-20): the embedded operator
  // encyclopedia is removed from /freestyle. The landing page acknowledges
  // operators with a single preview panel (3 chips + one CTA) and points
  // readers at the canonical reference at /freestyle/operators. The
  // operator-board partial still renders on /freestyle/learn.
  it('does NOT render the embedded operator-board encyclopedia on the landing page', async () => {
    const res = await request(createApp()).get('/freestyle');
    // Operator-board grid markup absent.
    expect(res.text).not.toContain('class="operator-board ');
    expect(res.text).not.toMatch(/<p class="operator-glyph">/);
    expect(res.text).not.toMatch(/<p class="operator-name">/);
    expect(res.text).not.toMatch(/<p class="operator-action">/);
    expect(res.text).not.toContain('class="operator-card-deeplink"');
    expect(res.text).not.toContain('class="operator-board-footer-link"');
    // Operator-board prose absent.
    expect(res.text).not.toContain('The operators of freestyle');
    expect(res.text).not.toContain('Fourteen primitives');
    expect(res.text).not.toContain('I · Sets');
    expect(res.text).not.toContain('II · Body');
    expect(res.text).not.toContain('III · Structure');
  });

  it('renders the lightweight operators-modifiers card inside the Movement Reference section', async () => {
    // Landing Page Phase 1 (2026-05-21): the prior shelf-panel was
    // lifted upward into the unified Movement Reference section. The
    // Operators & Modifiers card retains its lightweight teaser shape:
    // three example chips (pixie · spinning · paradox) + single CTA
    // pointing at /freestyle/operators. The card uses the standardized
    // .glossary-outward-link class for the CTA (GA-6 convention) and
    // the new "Operator reference →" phrasing.
    const res = await request(createApp()).get('/freestyle');
    const cardStart = res.text.indexOf('id="movement-ref-operators-modifiers"');
    expect(cardStart).toBeGreaterThan(0);
    const cardEnd = res.text.indexOf('</article>', cardStart);
    const card    = res.text.slice(cardStart, cardEnd);
    // Three non-interactive example chips: pixie · spinning · paradox.
    expect(card).toContain('class="freestyle-movement-reference-card-chips"');
    for (const slug of ['pixie', 'spinning', 'paradox']) {
      expect(card).toMatch(new RegExp(`data-token-slug="${slug}"`));
    }
    // Single CTA pointing at /freestyle/operators with the standardized
    // Phase 6 vocabulary ("Operator reference →").
    expect(card).toContain('href="/freestyle/operators"');
    expect(card).toMatch(/Operator reference\s*&rarr;/);
    // No duplicate /freestyle/sets CTA (the dual-CTA footer is retired).
    expect(card).not.toContain('href="/freestyle/sets"');
  });

  it('does NOT render the Operators & Modifiers portal-card "Advanced Reference" tag/badge', async () => {
    // The "Advanced reference" sub-label on the portal card was a second
    // place where the same phrase appeared. The card now carries only its
    // title and one-line framing prose.
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('class="freestyle-portal-card-advanced-tag"');
    expect(res.text).not.toMatch(/Operators &amp; Modifiers <span[^>]*>Advanced reference/);
  });

  it('Operators & Modifiers card appears exactly once on /freestyle (Movement Reference; no portal-card duplicate)', async () => {
    // Landing Page Phase 1 (2026-05-21): the duplicated standalone
    // "Operators & Modifiers" portal card was retired. The single
    // Operators & Modifiers surface on /freestyle now lives inside the
    // Movement Reference section. The card's CTA label is "Operator
    // reference" (matching the GA-6 standardized outward-link
    // vocabulary).
    const res = await request(createApp()).get('/freestyle');
    // Verify the new CTA label appears.
    expect(res.text).toMatch(/Operator reference\s*&rarr;/);
    // The pre-cleanup demoted-portal-card class must not appear.
    expect(res.text).not.toContain('freestyle-portal-card-advanced');
    // The pre-cleanup "Open full operator reference" CTA was tied to
    // the demoted portal card; the new Movement Reference card uses
    // the standardized "Operator reference →" phrasing instead.
  });

  it('/freestyle/operators still owns the exhaustive operator reference', async () => {
    // Sanity check: removing the embedded encyclopedia from /freestyle does
    // not affect the canonical operator surface.
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Operators &amp; Modifiers');
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
  // F1 sub-tests (core-trick ADD numeric rendering + orbit ADD-pending
  // marker) were pinned to the embedded landing Core Tricks grid.
  // Landing Page Phase 1 (2026-05-21) retired that grid from /freestyle;
  // Core Tricks now renders as a flat teaser card in the Movement
  // Reference section linking to /freestyle/tricks?view=family where
  // the rich grid lives. The "[object Object]" helper-shadow guard +
  // ADD-pending contract migrate with the grid to its destination page
  // tests (freestyle.family-view-identity.routes.test.ts +
  // freestyle.glossary-derivation-atlas.routes.test.ts).

  // F2 sub-tests (BL=Blurry semantic + Atomic/Quantum/Fairy dex-direction
  // actions) were pinned to the embedded landing operator-board grid.
  // Second-pass landing cleanup (2026-05-20) removed the grid from
  // /freestyle. The same semantic invariants still hold on the operator-
  // board partial wherever it renders (/freestyle/learn), tested in
  // tests/integration/freestyle.symbolic-discoverability.routes.test.ts.

  it('F3 — curated demonstrations (Conlon 1998 + San Marino 2026) render in the merged Featured strip', async () => {
    // Demonstrations live inside the merged Featured strip with stable
    // `featured-{key}` anchor ids.
    // Post-Slice-K (2026-05-16): San Marino caption now leads with the
    // Jim Penske credit; "Footage by jay7bah" remains in the same line.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('1998 World Footbag Championships');
    expect(res.text).toContain('Samantha Conlon and Carol Wedemeyer');
    expect(res.text).toContain('Footbag 2026: San Marino');
    expect(res.text).toContain('Featuring Jim Penske');
    expect(res.text).toContain('2URvZFuxBls');
    expect(res.text).toContain('U6J2LXxUWro');
    expect(res.text).toContain('id="featured-conlon-1998"');
    expect(res.text).toContain('id="featured-san-marino-2026"');
    expect(res.text).not.toContain('Curated demonstration pending');
  });

  it('F7 — only curated demonstrations carry hashtag chip strips inside the merged Featured grid', async () => {
    // Slice K (2026-05-16): #curated chip removed from displayed tags
    // since every Featured item is curated by definition (the
    // media-tag-chip--quality chip is no longer asserted). Other chips
    // (source: footbag_hof_archive, creator: by_jay7bah) preserved.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    const startIdx = res.text.indexOf('class="freestyle-featured-grid"');
    // Second-pass landing cleanup (2026-05-20): the embedded operator-board
    // was removed from /freestyle, so the previous endIdx marker
    // ('operator-board') is no longer present. The Reference Shelf section
    // is the natural lower bound of the Featured grid region.
    const endIdx   = res.text.indexOf('class="content-section freestyle-movement-reference"', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    const slice = res.text.slice(startIdx, endIdx > 0 ? endIdx : startIdx + 12000);
    // Four chip strips: one each for Reese-1988 + Conlon-1998 + Worlds-2023-Team
    // + San Marino-2026. Format cards (Routine / Circle / Sick3 / Shred30)
    // carry no chips — the title is the format anchor.
    const stripCount = (slice.match(/class="media-tag-strip"/g) ?? []).length;
    expect(stripCount).toBe(4);
    expect(slice).toContain('media-tag-chip--source');     // #footbag_hof_archive
    expect(slice).toContain('media-tag-chip--creator');    // #by_jay7bah
    // #curated is intentionally NOT in the displayed tag set.
    expect(slice).not.toMatch(/<li class="media-tag-chip[^"]*">#curated<\/li>/);
    expect(slice).not.toMatch(/<li class="media-tag-chip[^"]*">#freestyle<\/li>/);
    expect(slice).not.toMatch(/<li class="media-tag-chip[^"]*">#trick<\/li>/);
  });
});

// ── Landing compression + under-hero jump nav invariants ─────────────────────
describe('SURFACE-COMPRESSION-REALIGNMENT-1 — landing compression invariants', () => {
  it('renders the under-hero jump nav with two anchors (Featured + Movement reference)', async () => {
    // Landing Page Phase 1 (2026-05-21): the prior #reference-shelf
    // anchor was retired when the reference shelf was lifted upward
    // into the Movement Reference section. Jump-nav anchors are now
    // Featured + Movement reference.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('class="page-jump-nav"');
    expect(res.text).toContain('aria-label="On this page"');
    for (const anchor of ['#featured', '#movement-reference']) {
      expect(res.text).toContain(`href="${anchor}"`);
    }
    // Matching section ids are present.
    for (const id of ['featured', 'movement-reference']) {
      expect(res.text).toMatch(new RegExp(`id="${id}"`));
    }
    // The retired anchors (legacy three-anchor list + reference shelf)
    // must not reappear.
    expect(res.text).not.toContain('href="#basic-components"');
    expect(res.text).not.toContain('href="#operators"');
    expect(res.text).not.toContain('href="#core-tricks"');
    expect(res.text).not.toContain('href="#reference-shelf"');
    // The retired "#where-next" anchor + id must not appear.
    expect(res.text).not.toContain('href="#where-next"');
    expect(res.text).not.toContain('id="where-next"');
  });

  // Operator-board landing tests retired here (lede, action ≤10 words, card
  // hierarchy, deeplink aria-label): second-pass landing cleanup
  // (2026-05-20) removed the embedded board from /freestyle. The same
  // compression / structure invariants still apply to the operator-board
  // partial wherever it renders (/freestyle/learn), tested in
  // tests/integration/freestyle.symbolic-discoverability.routes.test.ts.

  it('Phase 1 contract: the basic-components grid does NOT render on /freestyle', async () => {
    // Landing Page Phase 1 (2026-05-21): the Basic Components rich grid
    // (six component cards with subfield rows) was retired from the
    // landing. The Movement Reference card for Basic Components is a
    // flat teaser linking to /freestyle/glossary#section-surfaces, where
    // the components content lives canonically. This test guards
    // against regression — the rich grid must not return to the landing.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).not.toContain('class="freestyle-basic-components-grid"');
    expect(res.text).not.toContain('class="freestyle-component-card"');
    expect(res.text).not.toContain('class="freestyle-component-desc"');
  });
});

// Phase 2 + NCR-3 describe blocks retired by Landing Page Phase 1
// (2026-05-21). The embedded Core Tricks grid no longer renders on the
// landing surface; the Movement Reference Core Tricks card teases the
// concept and links to /freestyle/tricks?view=family where the family-
// anchor cohort lives. The 4-tier rendering hierarchy contract
// (NCR-3 Tier-2 operational notation + Tier-1 descriptive prose) still
// applies on the destination pages and is tested there:
//   - First-class Notation summary contract: freestyle.first-class-pilot
//   - Family-view operational chain rendering: freestyle.glossary-
//     derivation-atlas (the derivation atlas surfaces the same chains)
//   - ATOMIC_FLAG_DECOMPOSITIONS data: freestyleConvergenceRule unit tests

describe('Landing Page Phase 1 — Core Tricks grid retired from landing', () => {
  it('the legacy .freestyle-core-trick-grid does NOT render on /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('class="freestyle-core-trick-grid"');
    expect(res.text).not.toContain('class="core-trick-object"');
    // The Core Tricks card now lives in Movement Reference; verify the
    // teaser card exists and links to /freestyle/tricks?view=family.
    expect(res.text).toContain('id="movement-ref-core-tricks"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view&#x3D;family"/);
  });
});

// ---------------------------------------------------------------------------
// Notation Normalization Wave — Slice N3 (NCR-4)
// Landing section order + jump nav
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Landing Page Phase 1 (2026-05-21) — Movement Reference section
// The prior Reference Shelf <details> stack + duplicated standalone
// "Operators & Modifiers" portal card were retired. The six reference
// entries (Basic Components / Core Tricks / Operators & Modifiers /
// ADD & Scoring / Notation Basics / Learning Path) now render as uniform
// teaser cards in a 3-col grid in a unified Movement Reference section
// between the portal cards and Featured. Each card is a porch (title +
// summary + optional chips + single outbound CTA); depth lives on the
// destination page.
// ---------------------------------------------------------------------------

describe('Landing Page Phase 1 — Movement Reference section', () => {
  it('renders the Movement Reference section ABOVE Featured (lifted upward from the prior shelf position)', async () => {
    const res = await request(createApp()).get('/freestyle');
    const refIdx      = res.text.indexOf('class="content-section freestyle-movement-reference"');
    const featuredIdx = res.text.indexOf('class="content-section freestyle-featured"');
    expect(refIdx).toBeGreaterThan(0);
    expect(featuredIdx).toBeGreaterThan(refIdx);
  });

  it('the prior lower Reference Shelf section is retired', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('class="content-section freestyle-reference-shelf"');
    expect(res.text).not.toMatch(/id="shelf-panel-/);
    expect(res.text).not.toMatch(/freestyle-reference-shelf-summary/);
  });

  it('renders six Movement Reference cards with stable slug-anchor ids', async () => {
    const res = await request(createApp()).get('/freestyle');
    for (const slug of [
      'basic-components', 'core-tricks', 'operators-modifiers',
      'add-scoring', 'notation-basics', 'learning-path',
    ]) {
      expect(res.text).toMatch(new RegExp(`id="movement-ref-${slug}"`));
    }
  });

  it('cards are flat (not <details> collapsibles) — depth lives on destination pages', async () => {
    const res = await request(createApp()).get('/freestyle');
    const startIdx = res.text.indexOf('class="content-section freestyle-movement-reference"');
    const endIdx   = res.text.indexOf('class="content-section freestyle-featured"', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    const region = res.text.slice(startIdx, endIdx);
    // No <details> inside the Movement Reference section.
    expect(region).not.toMatch(/<details/);
    expect(region).not.toMatch(/<summary/);
  });

  it('Operators & Modifiers card renders preview chips (pixie / spinning / paradox)', async () => {
    const res = await request(createApp()).get('/freestyle');
    const cardStart = res.text.indexOf('id="movement-ref-operators-modifiers"');
    const cardEnd   = res.text.indexOf('</article>', cardStart);
    expect(cardStart).toBeGreaterThan(0);
    const region = res.text.slice(cardStart, cardEnd);
    expect(region).toContain('class="freestyle-movement-reference-chip"');
    expect(region).toMatch(/data-token-slug="pixie"/);
    expect(region).toMatch(/data-token-slug="spinning"/);
    expect(region).toMatch(/data-token-slug="paradox"/);
  });

  it('every card carries a single outbound CTA using the standardized .glossary-outward-link class', async () => {
    const res = await request(createApp()).get('/freestyle');
    const slugToDestination: Record<string, string> = {
      'basic-components':     '/freestyle/glossary#section-surfaces',
      'core-tricks':          '/freestyle/tricks?view=family',
      'operators-modifiers':  '/freestyle/operators',
      'add-scoring':          '/freestyle/add-analysis',
      'notation-basics':      '/freestyle/glossary#section-notation',
      'learning-path':        '/freestyle/learn',
    };
    for (const [slug, dest] of Object.entries(slugToDestination)) {
      const cardStart = res.text.indexOf(`id="movement-ref-${slug}"`);
      expect(cardStart, `card ${slug} missing`).toBeGreaterThan(0);
      const cardEnd = res.text.indexOf('</article>', cardStart);
      const region  = res.text.slice(cardStart, cardEnd);
      // Each card has one (and only one) glossary-outward-link CTA.
      const linkMatches = region.match(/class="glossary-outward-link"/g) ?? [];
      expect(linkMatches.length, `card ${slug} CTA count`).toBe(1);
      // Handlebars HTML-escapes '=' to '&#x3D;' in href attributes.
      const escapedDest = dest.replace(/=/g, '&#x3D;');
      expect(region, `card ${slug} destination`).toContain(`href="${escapedDest}"`);
    }
  });

  it('Movement Reference section appears immediately after the portal-card grid (between portal grid and Featured)', async () => {
    const res = await request(createApp()).get('/freestyle');
    const portalGridIdx = res.text.indexOf('class="card-grid card-grid-2col"');
    const refIdx        = res.text.indexOf('class="content-section freestyle-movement-reference"');
    const featuredIdx   = res.text.indexOf('class="content-section freestyle-featured"');
    expect(portalGridIdx).toBeGreaterThan(0);
    expect(refIdx).toBeGreaterThan(portalGridIdx);
    expect(featuredIdx).toBeGreaterThan(refIdx);
  });

  it('the duplicated standalone "Operators & Modifiers" portal card is retired', async () => {
    const res = await request(createApp()).get('/freestyle');
    // The freestyle-portal-card-advanced demoted-card modifier class
    // is no longer in use anywhere on the page.
    expect(res.text).not.toContain('freestyle-portal-card-advanced');
    // The standalone-card "Advanced movement vocabulary" framing prose
    // is no longer present.
    expect(res.text).not.toMatch(/Advanced movement vocabulary and decomposition theory/i);
    // The Operators & Modifiers entry exists only once on the page —
    // inside the Movement Reference section.
    const cardTitleMatches = res.text.match(/freestyle-movement-reference-card-title">Operators &amp; Modifiers</g) ?? [];
    expect(cardTitleMatches.length).toBe(1);
  });

  it('section title + lede frame the cards as the freestyle-language home', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toMatch(/freestyle-movement-reference-title[^>]*>\s*Movement Reference\s*</);
    expect(res.text).toMatch(/freestyle-movement-reference-lede/);
    // Lede mentions the freestyle language framing.
    expect(res.text).toMatch(/The freestyle language/i);
  });
});

describe('Trick Dictionary and Operators are sibling portal cards', () => {
  it('/freestyle/tricks and /freestyle/operators render in distinct portal-card chunks', async () => {
    // Structural invariant: Operators & Modifiers is its own portal-card
    // sibling of the Trick Dictionary card, not a child link inside it.
    // Scope to the portal card-grid section (between the grid opener and
    // the next </section>) so links elsewhere on the page (reference
    // shelf, footer) are not counted. Split the grid by `<div class="card`
    // to isolate each portal card chunk; both target hrefs must appear
    // exactly once and in different chunks.
    const res = await request(createApp()).get('/freestyle');
    const gridStart = res.text.indexOf('<div class="card-grid card-grid-2col">');
    expect(gridStart, 'portal card-grid not found').toBeGreaterThan(-1);
    const gridEnd = res.text.indexOf('</section>', gridStart);
    const portalGrid = res.text.slice(gridStart, gridEnd);
    const cards = portalGrid.split('<div class="card');
    const dictCards = cards.filter((c) => c.includes('href="/freestyle/tricks"'));
    const opCards = cards.filter((c) => c.includes('href="/freestyle/operators"'));
    expect(dictCards).toHaveLength(1);
    expect(opCards).toHaveLength(1);
    expect(dictCards[0]).not.toBe(opCards[0]);
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
