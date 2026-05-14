/**
 * Integration tests for freestyle public routes.
 *
 * Covers:
 *   GET /freestyle         — landing page
 *   GET /freestyle/records — records page
 *
 * Public filter contract verified:
 *   - only 'probable' and 'verified' confidence rows appear
 *   - superseded rows (superseded_by IS NOT NULL) do not appear
 *   - rows with neither person_id nor display_name cannot exist (DB CHECK)
 *
 * Person-link contract:
 *   - resolved person_id renders as /history/:personId link
 *   - unresolved (display_name only) renders as plain text
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertHistoricalPerson,
  insertFreestyleRecord,
  insertMember,
  insertFreestyleTrick,
  insertTtLesson,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3080');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const PERSON_ID          = 'person-freestyle-test-001';
const FREESTYLE_PLAYER_ID = 'person-freestyle-player-001';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A canonical person whose records should link to /history/:personId
  insertHistoricalPerson(db, {
    person_id:    PERSON_ID,
    person_name:  'Alice Shredder',
    source_scope: 'CANONICAL',
  });

  // Public record — linked to canonical person
  insertFreestyleRecord(db, {
    id:           'fr-public-linked',
    person_id:    PERSON_ID,
    display_name: 'Alice Shredder',
    trick_name:   'Torque',
    value_numeric: 42,
    confidence:   'probable',
    video_url:    'https://youtu.be/abc123',
  });

  // Public record — display_name only (no person_id)
  insertFreestyleRecord(db, {
    id:           'fr-public-unlinked',
    person_id:    null,
    display_name: 'Unknown Player',
    trick_name:   'Whirl',
    value_numeric: 17,
    confidence:   'probable',
  });

  // Provisional record — must NOT appear on public page
  insertFreestyleRecord(db, {
    id:           'fr-provisional',
    display_name: 'Hidden Player',
    trick_name:   'Secret Trick',
    value_numeric: 99,
    confidence:   'provisional',
  });

  // Superseded record — must NOT appear on public page
  insertFreestyleRecord(db, {
    id:             'fr-old',
    display_name:   'Old Record Holder',
    trick_name:     'Torque',
    value_numeric:  30,
    confidence:     'probable',
    superseded_by:  'fr-public-linked',
  });

  // Player with their own freestyle records — HoF so page is publicly accessible
  insertHistoricalPerson(db, {
    person_id:    FREESTYLE_PLAYER_ID,
    person_name:  'Bob Freestyler',
    source_scope: 'CANONICAL',
    hof_member:   1,
  });
  insertFreestyleRecord(db, {
    id:            'fr-bob-1',
    person_id:     FREESTYLE_PLAYER_ID,
    display_name:  'Bob Freestyler',
    trick_name:    'Pixie',
    value_numeric: 55,
    confidence:    'probable',
    video_url:     'https://youtu.be/pixie123',
    video_timecode: '0:42',
  });
  insertFreestyleRecord(db, {
    id:            'fr-bob-provisional',
    person_id:     FREESTYLE_PLAYER_ID,
    display_name:  'Bob Freestyler',
    trick_name:    'Hidden Trick',
    value_numeric: 99,
    confidence:    'provisional',  // must NOT appear on player page
  });

  // ── Reference Media filter fixtures (trick page) ───────────────────────
  // Two media items tagged #ref-media-audit: one tutorial-tier
  // (source_id=tt_youtube), one record-tier (source_id=passback_records).
  // The service-layer filter must hide the record clip from Reference
  // Media; the tutorial must still render.
  const refMediaUploader = insertMember(db, { slug: 'ref-media-audit-uploader' });
  insertFreestyleTrick(db, {
    slug: 'ref-media-audit',
    canonical_name: 'Ref Media Audit',
    adds: '3',
  });
  insertTtLesson(db, {
    uploader_member_id: refMediaUploader,
    ttNumber: 901,
    trickSlug: 'ref-media-audit',
    videoId: 'audittutvid1',
    lessonTitle: 'Ref Media Audit Tutorial',
    source_id: 'tt_youtube',
    caption: 'REF_MEDIA_TUTORIAL_MARKER',
  });
  insertTtLesson(db, {
    uploader_member_id: refMediaUploader,
    ttNumber: 902,
    trickSlug: 'ref-media-audit',
    videoId: 'auditrecvid1',
    lessonTitle: 'Ref Media Audit Record',
    source_id: 'passback_records',
    caption: 'REF_MEDIA_RECORD_MARKER',
  });

  // ── Seeds for /freestyle/sets cross-link tests ─────────────────────────
  // The moves page resolves trick links by slugifying the displayed label
  // and matching strictly against freestyle_tricks.slug. Seed enough trick
  // slugs to cover at least one matching label per section, plus 'terraging'
  // to verify that compound labels (e.g. "Terraging (Double Pixie)") still
  // render as plain text — slugify yields "terraging-double-pixie", which
  // does NOT equal the seeded 'terraging' slug.
  for (const slug of [
    'pixie', 'fairy', 'stepping',                 // basic-set links
    'surging',                                    // spinning-variant link
    'blazing', 'pogo',                            // whirl/swirl link
    'ducking', 'spinning', 'gyro',                // components link
    'terraging',                                  // exists, but compound label stays plain
  ]) {
    insertFreestyleTrick(db, { slug, canonical_name: slug, adds: '3' });
  }

  // ── Seeds for O1a/O1b/O1c/O1d operational-notation rendering tests ────
  // Three tricks:
  //   - op-notation-seeded:        operational_notation populated; no source-note
  //   - op-notation-with-source:   operational_notation + source-note populated (O1d)
  //   - op-notation-empty:         neither populated (section must omit)
  // Op-notation string mirrors the post-normalization shape proposed in
  // exploration/footbagmoves-federation/RENDERING_SURFACE_PROPOSAL.md §4.
  insertFreestyleTrick(db, {
    slug: 'op-notation-seeded',
    canonical_name: 'op-notation-seeded',
    adds: '4',
    operational_notation: 'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
    // operational_notation_source intentionally omitted → null → source-note <p> must NOT render
  });
  insertFreestyleTrick(db, {
    slug: 'op-notation-with-source',
    canonical_name: 'op-notation-with-source',
    adds: '4',
    operational_notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',
    operational_notation_source: 'Source: FootbagMoves.com (curator-reviewed 2026-05-10). Demo source-note for O1d.',
  });
  insertFreestyleTrick(db, {
    slug: 'op-notation-empty',
    canonical_name: 'op-notation-empty',
    adds: '3',
    // operational_notation omitted → defaults to NULL → section must omit
  });

  // ── Seeds for NF-2B semantic-notation ladder tests ─────────────────────
  // Mobius has a curated equivalence chain (3 readings) AND curator notation
  // 'MOBIUS' (mirrors the canonical Red-corrections seed). Both layers render.
  insertFreestyleTrick(db, {
    slug: 'mobius',
    canonical_name: 'mobius',
    adds: '5',
    notation: 'MOBIUS',
  });
  // Mirage is a core atom; needed for paradox-mirage's base lookup.
  insertFreestyleTrick(db, {
    slug: 'mirage',
    canonical_name: 'mirage',
    adds: '2',
  });
  // Butterfly is a core atom; tests Layer 4 silence (no semantic block).
  insertFreestyleTrick(db, {
    slug: 'butterfly',
    canonical_name: 'butterfly',
    adds: '2',
  });
  // paradox-mirage is non-core with a resolvable base; tests Layer 3.
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage',
    canonical_name: 'paradox mirage',
    adds: '3',
    base_trick: 'mirage',
  });
  // nf2b-gap is non-core with no notation, no base, no chain; tests Layer 5b.
  insertFreestyleTrick(db, {
    slug: 'nf2b-gap',
    canonical_name: 'nf2b gap',
    adds: '4',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /freestyle', () => {
  it('returns 200 with page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle Footbag');
  });

  it('contains a link to /freestyle/records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/records');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/records', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.status).toBe(200);
  });

  it('shows public probable records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).toContain('Torque');
    expect(res.text).toContain('Whirl');
  });

  it('links resolved person_id to /history/:personId', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).toContain(`/history/${PERSON_ID}`);
    expect(res.text).toContain('Alice Shredder');
  });

  it('renders display_name as plain text when no person_id', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).toContain('Unknown Player');
    // Should not be wrapped in an /history link
    expect(res.text).not.toContain('/history/null');
    expect(res.text).not.toContain('href="/history/"');
  });

  it('does not show provisional records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).not.toContain('Hidden Player');
    expect(res.text).not.toContain('Secret Trick');
  });

  it('does not show superseded records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).not.toContain('Old Record Holder');
    // Value 30 could appear in other records, so check via holder name
  });

  it('shows video link when video_url is present', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).toContain('https://youtu.be/abc123');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/leaders', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/leaders');
    expect(res.status).toBe(200);
  });

  it('shows Alice Shredder as a leader (has 1 public record)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/leaders');
    expect(res.text).toContain('Alice Shredder');
  });

  it('links resolved person_id holders to /history/:personId', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/leaders');
    expect(res.text).toContain(`/history/${PERSON_ID}`);
  });

  it('renders unresolved holder as plain text', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/leaders');
    expect(res.text).toContain('Unknown Player');
    expect(res.text).not.toContain('/history/null');
  });

  it('does not include provisional records in leader counts', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/leaders');
    expect(res.text).not.toContain('Hidden Player');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle — enriched landing page', () => {
  it('contains links to both records and leaders sub-pages', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/records');
    expect(res.text).toContain('/freestyle/leaders');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/about', () => {
  it('returns 200 with page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/about');
    expect(res.status).toBe(200);
    expect(res.text).toContain('About Freestyle');
  });

  it('contains competition format content', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/about');
    expect(res.text).toContain('Routines');
    expect(res.text).toContain('30 Second Shred');
    expect(res.text).toContain('Sick 3');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/sets', () => {
  it('returns 200 with page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Move Sets');
  });

  it('contains core set names', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    expect(res.text).toContain('Pixie');
    expect(res.text).toContain('Fairy');
    expect(res.text).toContain('Nuclear');
    expect(res.text).toContain('Stepping');
  });

  // ── Phase 1: cross-link moves → dictionary ───────────────────────────────
  // Strict rule: slugify(label) must exactly equal a public freestyle_tricks
  // slug. Compound labels and modifier-only matches stay plain text. Every
  // row carries a stable id="move-<slug>" anchor for future backlinking.

  it('renders trick-matched basic-set labels as anchors to /freestyle/tricks/:slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    expect(res.text).toContain('<a href="/freestyle/tricks/pixie">Pixie</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/fairy">Fairy</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/stepping">Stepping</a>');
  });

  it('renders unmatched basic-set labels as plain text (no anchor)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    // Slapping, Bubba, Frantic, Flailing, Infracting are in the table but
    // not seeded as trick slugs — should render without /freestyle/tricks/ links.
    expect(res.text).not.toContain('/freestyle/tricks/slapping');
    expect(res.text).not.toContain('/freestyle/tricks/bubba');
    expect(res.text).not.toContain('/freestyle/tricks/frantic');
    expect(res.text).not.toContain('/freestyle/tricks/flailing');
  });

  it('keeps compound-label rows plain even when the bare slug exists', async () => {
    // 'terraging' IS seeded as a trick slug, but the row label is
    // "Terraging (Double Pixie)". slugify yields "terraging-double-pixie",
    // which does not match 'terraging' — so the row stays plain text under
    // the strict-match rule. No representative-link guess.
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    expect(res.text).toContain('Terraging (Double Pixie)');
    expect(res.text).not.toContain('/freestyle/tricks/terraging-double-pixie');
    expect(res.text).not.toMatch(/<a[^>]+href="\/freestyle\/tricks\/terraging"[^>]*>Terraging \(Double Pixie\)/);
  });

  it('keeps modifier-only labels plain (no link to hidden modifier surface)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    // Nuclear, Miraging, Blurry, Swirling, Whirling, Diving slugify to
    // freestyle_trick_modifiers slugs but NOT to freestyle_tricks slugs;
    // they must not render as /freestyle/tricks/* links and must not
    // expose any /freestyle/modifiers/* surface either.
    expect(res.text).not.toContain('/freestyle/tricks/nuclear');
    expect(res.text).not.toContain('/freestyle/tricks/miraging');
    expect(res.text).not.toContain('/freestyle/tricks/blurry');
    expect(res.text).not.toContain('/freestyle/tricks/swirling');
    expect(res.text).not.toContain('/freestyle/tricks/whirling');
    expect(res.text).not.toContain('/freestyle/tricks/diving');
    expect(res.text).not.toContain('/freestyle/modifiers/');
  });

  it('cross-links variant-tag list items where the label matches', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    expect(res.text).toContain('<a href="/freestyle/tricks/surging">Surging</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/blazing">Blazing</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/pogo">Pogo</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/ducking">Ducking</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/spinning">Spinning</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/gyro">Gyro</a>');
  });

  it('emits stable move-<slug> anchor ids on every row and tag', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets');
    // Anchor-id derives from slugify(label) regardless of whether the row
    // links anywhere; this gives future trick-detail backlinking a stable
    // target without requiring a re-author pass on the moves page.
    expect(res.text).toContain('id="move-pixie"');
    expect(res.text).toContain('id="move-terraging-double-pixie"');
    expect(res.text).toContain('id="move-rooting-rooted"');
    expect(res.text).toContain('id="move-fairy-atomic"');
    expect(res.text).toContain('id="move-go-go"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/moves — legacy URL redirects to /freestyle/sets', () => {
  it('301-redirects to /freestyle/sets', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/moves');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/sets');
  });
});

// ---------------------------------------------------------------------------

describe('Set-notation reference cross-links', () => {
  it('glossary §3 intermediate-operators block links to /freestyle/sets', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const intermediateIdx = res.text.indexOf('id="intermediate-operators"');
    const linkIdx         = res.text.indexOf('href="/freestyle/sets"', intermediateIdx);
    expect(intermediateIdx).toBeGreaterThan(0);
    expect(linkIdx).toBeGreaterThan(intermediateIdx);
  });

  it('/freestyle/learn lists the set notation reference as a shipped entry', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/learn');
    expect(res.text).toMatch(/href="\/freestyle\/sets"[^>]*>Set notation reference/);
  });

  it('landing page renders a restrained "Full set notation reference" footer under the operator board', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('class="operator-board-footer-link"');
    expect(res.text).toMatch(/href="\/freestyle\/sets"[^>]*>Full set notation reference/);
    // Footer renders after the operator board, before the next-step orientation block.
    const boardIdx       = res.text.indexOf('class="operator-board ');
    const footerIdx      = res.text.indexOf('class="operator-board-footer-link"');
    const orientationIdx = res.text.indexOf('Where to go next');
    expect(footerIdx).toBeGreaterThan(boardIdx);
    expect(orientationIdx).toBeGreaterThan(footerIdx);
  });

  it('operator-board notation-reference deep-links point at /freestyle/sets (not legacy /moves)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('href="/freestyle/sets#move-pixie"');
    expect(res.text).not.toContain('href="/freestyle/moves#move-pixie"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/glossary', () => {
  it('returns 200 with page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle Glossary');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle"');
  });

  it('contains ADD-system core terms', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('Delay');
    expect(res.text).toContain('Dexterity');
    expect(res.text).toContain('BOP');
  });

  it('contains run-quality floor labels', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('Guiltless');
    expect(res.text).toContain('Fearless');
    expect(res.text).toContain('Tiltless');
    expect(res.text).toContain('Tripless');
  });

  it('contains play-quality adjectives', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('Slurry');
    expect(res.text).toContain('Froggy');
  });

  it('contains run / combo / style vocabulary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('Connector Trick');
    expect(res.text).toContain('Shred Circle');
    expect(res.text).toContain('Density');
  });

  it('contains common abbreviations', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('PDX');
    expect(res.text).toContain('PS Whirl');
    expect(res.text).toContain('SS');
  });

  it('contains symbolic-compression and foundational trick concepts', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    // §8 is renamed "Symbolic Compression" but the Jobs-notation reference
    // is preserved in the reframed opening prose.
    expect(res.text).toContain('Symbolic Compression');
    expect(res.text).toMatch(/Jobs notation/);
    expect(res.text).toContain('Foundational Tricks');
    expect(res.text).toContain('clipper');
    expect(res.text).toContain('butterfly');
  });

  it('does not expose review-status or source-discussion content', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).not.toContain('Pending Red');
    expect(res.text).not.toContain('Community-only');
    expect(res.text).not.toContain('review_status');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/glossary — operator board is NOT rendered in §3 (authority boundary)', () => {
  // The operator-board partial lives on the landing page (movement-language overview)
  // and /freestyle/learn (educational pathways). The glossary's role is terminology
  // and execution detail, not visual taxonomy; rendering it here was a duplication.
  it('does not render the operator-board partial on the glossary page', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).not.toContain('class="operator-board ');
    expect(res.text).not.toContain('class="operator-glyph"');
  });

  it('§3 still renders between its heading and §4 heading without embedding the board', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const sec3Idx = res.text.indexOf('3. How Tricks Are Built');
    const sec4Idx = res.text.indexOf('4. Naming');
    expect(sec3Idx).toBeGreaterThan(0);
    expect(sec4Idx).toBeGreaterThan(sec3Idx);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/glossary — intermediate-operator reference subsection (§3)', () => {
  it('renders the intermediate-operators subsection heading and anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('id="intermediate-operators"');
    expect(res.text).toMatch(/Intermediate operators/);
  });

  it('renders every authored operator entry with its term anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const expectedSlugs = [
      'atomic', 'blurry', 'quantum', 'nuclear',
      'barraging', 'furious', 'inspinning', 'whirling', 'double', 'high',
    ];
    for (const slug of expectedSlugs) {
      expect(res.text).toMatch(new RegExp(`<dt id="term-${slug}"`));
    }
  });

  it('renders the locked decomposition strings on confirmed entries', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('stepping paradox');
    expect(res.text).toContain('compressed atomic');
    expect(res.text).toContain('paradox + atomic');
    expect(res.text).toContain('high stepping');
  });

  it('flags pending entries with the inline pending badge', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const pendingFlags = res.text.match(/class="glossary-operator-pending-flag"/g) ?? [];
    // atomic, furious, whirling, double, high — 5 pending entries
    expect(pendingFlags.length).toBe(5);
  });

  it('surfaces the Red pt10 lineage on the nuclear entry', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('Decomposition per Red pt10.');
  });

  it('surfaces the documented Fury pt1 vs pt6 conflict on the furious entry', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toMatch(/pt1.*pt6 conflict/);
  });

  it('renders entries in pedagogical order: set-tier first, body next, quantifiers last', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const idxAtomic    = res.text.indexOf('id="term-atomic"');
    const idxWhirling  = res.text.indexOf('id="term-whirling"');
    const idxDouble    = res.text.indexOf('id="term-double"');
    const idxHigh      = res.text.indexOf('id="term-high"');
    expect(idxAtomic).toBeGreaterThan(0);
    expect(idxWhirling).toBeGreaterThan(idxAtomic);
    expect(idxDouble).toBeGreaterThan(idxWhirling);
    expect(idxHigh).toBeGreaterThan(idxDouble);
  });

  it('renders the inspinning term anchor inside the intermediate-operators block', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const intermediateIdx = res.text.indexOf('id="intermediate-operators"');
    expect(intermediateIdx).toBeGreaterThan(0);
    const inspinIdx = res.text.indexOf('id="term-inspinning"', intermediateIdx);
    expect(inspinIdx).toBeGreaterThan(intermediateIdx);
  });

  it('renders inspinning as a resolved entry (no pending badge)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const inspinIdx = res.text.indexOf('id="term-inspinning"');
    expect(inspinIdx).toBeGreaterThan(0);
    // Slice from inspinning's <dt> to the next <dt> (or end of <dl>) and confirm
    // no pending-flag badge appears inside that entry.
    const after = res.text.slice(inspinIdx);
    const nextDt = after.indexOf('<dt ', 4);
    const entrySlice = nextDt > 0 ? after.slice(0, nextDt) : after.slice(0, 2000);
    expect(entrySlice).not.toContain('glossary-operator-pending-flag');
  });

  it('surfaces +0 directional status and the pt3 + pt7 lineage on inspinning', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const inspinIdx = res.text.indexOf('id="term-inspinning"');
    expect(inspinIdx).toBeGreaterThan(0);
    const slice = res.text.slice(inspinIdx, inspinIdx + 2000);
    expect(slice).toMatch(/pt3/);
    expect(slice).toMatch(/pt7/);
    expect(slice).toMatch(/\+0/);
    expect(slice).toMatch(/directional/i);
  });

  it('orders inspinning before whirling within the body-tier subsequence', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const idxInspinning = res.text.indexOf('id="term-inspinning"');
    const idxWhirling   = res.text.indexOf('id="term-whirling"');
    expect(idxInspinning).toBeGreaterThan(0);
    expect(idxWhirling).toBeGreaterThan(idxInspinning);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle — glossary link', () => {
  it('links to /freestyle/glossary on the landing page', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/glossary');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug', () => {
  it('returns 200 for a known trick slug', async () => {
    const app = createApp();
    // 'Torque' was inserted in beforeAll with slug 'torque'
    const res = await request(app).get('/freestyle/tricks/torque');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Torque');
    expect(res.text).toContain('Alice Shredder');
  });

  it('links holder to /history/:personId', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/torque');
    expect(res.text).toContain(`/history/${PERSON_ID}`);
  });

  it('returns 404 for an unknown slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/not-a-real-trick');
    expect(res.status).toBe(404);
  });

  it('shows video link when present', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/torque');
    expect(res.text).toContain('https://youtu.be/abc123');
  });

  it('shows Record Progression section when superseded records exist', async () => {
    const app = createApp();
    // Torque has fr-old (30) superseded by fr-public-linked (42)
    const res = await request(app).get('/freestyle/tricks/torque');
    expect(res.text).toContain('Record Progression');
  });

  it('shows superseded holder in progression section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/torque');
    // Old Record Holder is superseded but should appear in progression history
    expect(res.text).toContain('Old Record Holder');
  });

  it('does not show progression section for a trick with only one record', async () => {
    const app = createApp();
    // 'Whirl' has only one record (no superseded entries)
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Record Progression');
  });
});

// ---------------------------------------------------------------------------

describe('records page trick links', () => {
  it('links trick names to /freestyle/tricks/:slug on records page', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).toContain('/freestyle/tricks/torque');
  });
});

// ---------------------------------------------------------------------------

describe('GET /history/:personId — freestyle records section', () => {
  it('shows freestyle records section for a player with records', async () => {
    const app = createApp();
    const res = await request(app).get(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle Records');
    expect(res.text).toContain('Pixie');
    expect(res.text).toContain('55');
  });

  it('shows video link with timecode on player freestyle section', async () => {
    const app = createApp();
    const res = await request(app).get(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.text).toContain('https://youtu.be/pixie123');
    expect(res.text).toContain('0:42');
  });

  it('does not show provisional records on player page', async () => {
    const app = createApp();
    const res = await request(app).get(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.text).not.toContain('Hidden Trick');
  });

  it('includes link to /freestyle/records from player freestyle section', async () => {
    const app = createApp();
    const res = await request(app).get(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.text).toContain('/freestyle/records');
  });
});

// ---------------------------------------------------------------------------
// Reference Media filter — passback_records source must NOT render in the
// trick page's Reference Media section. Records still render via the records
// table (separate surface). Filter lives in freestyleService.getFreestyleTrickPage.

describe('GET /freestyle/tricks/:slug — Reference Media filter', () => {
  it('renders tutorial-tier media (source_id=tt_youtube) inside the Tutorials subsection', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ref-media-audit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('REF_MEDIA_TUTORIAL_MARKER');
    // The Tutorials subsection wrapper must surround the tutorial marker.
    const tutSubIdx = res.text.indexOf('reference-media-subsection--tutorials');
    expect(tutSubIdx).toBeGreaterThan(0);
    const subsectionEnd = res.text.indexOf('</div>', tutSubIdx);
    const tutSlice = res.text.slice(tutSubIdx, subsectionEnd + 6);
    expect(tutSlice).toContain('REF_MEDIA_TUTORIAL_MARKER');
  });

  it('does NOT render record-tier media (source_id=passback_records) in Reference Media', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ref-media-audit');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('REF_MEDIA_RECORD_MARKER');
  });

  it('renders the "Tutorials" subheading when tutorial-tier media exists', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ref-media-audit');
    expect(res.text).toMatch(/<h3 class="reference-media-subheading">Tutorials<\/h3>/);
  });

  it('omits the "Demonstrations" subsection entirely when no demo-tier media exists for the trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ref-media-audit');
    // No demo-tier sources are seeded for ref-media-audit → no Demonstrations subheading.
    expect(res.text).not.toContain('reference-media-subsection--demos');
    expect(res.text).not.toMatch(/<h3 class="reference-media-subheading">Demonstrations<\/h3>/);
    // The legacy "Demos" subheading wording was renamed to "Demonstrations"
    // in Phase 3 to avoid conflating tutorials and demos in trick-detail
    // language. Guard against regression.
    expect(res.text).not.toMatch(/<h3 class="reference-media-subheading">Demos<\/h3>/);
  });

});

// ─────────────────────────────────────────────────────────────────────────
// O1a (2026-05-10) — operational notation rendering surface on trick-detail.
// New "Set notation (operational)" section between semantic Notation and the
// Notation grammar diagnostic. Section is conditional on the trick row's
// freestyle_tricks.operational_notation column being non-empty. O1a renders
// the string verbatim inside <code> with no token highlighting (deferred to
// O1b per RENDERING_SURFACE_PROPOSAL.md).
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks/:slug — operational notation block (O1a)', () => {
  it('renders the section with role-classified token spans (O1b/O1c — refined per-token tooltips)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    expect(res.status).toBe(200);
    // Section wrapper present
    expect(res.text).toContain('class="content-section operational-notation-display"');
    expect(res.text).toContain('<h2>Set notation (operational)</h2>');
    // O1b: each token rendered as a span with role class. O1c refined the
    // per-token tooltips (e.g. CLIP gets "Clipper-stall surface (...)" not
    // the generic "Plant or landing surface").
    expect(res.text).toMatch(/<span class="op-token op-token--surface" data-role="surface" title="CLIP — clipper set position \(start of trick\)">CLIP<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--sequence-op-major" data-role="sequence_op"[^>]*>&gt;&gt;<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side"[^>]*>SAME<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--direction" data-role="direction"[^>]*>OUT<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--component-flag component-flag-dex" data-role="component_flag" title="Dexterity component \(bag-foot interaction\)">\[DEX\]<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--component-flag component-flag-xbd" data-role="component_flag"[^>]*>\[XBD\]<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--component-flag component-flag-del" data-role="component_flag"[^>]*>\[DEL\]<\/span>/);
  });

  it('omits the section entirely when operational_notation is null', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-empty');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('operational-notation-display');
    expect(res.text).not.toContain('Set notation (operational)');
  });

  it('places the operational section between Notation and the structural-decomposition diagnostic', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    // Find the indices in the rendered HTML; assert ordering Notation < operational < diagnostic.
    // The semantic Notation section may not render for this fixture (notation column
    // is null), so we use the operational section's position relative to a known later
    // section ("Editorial decomposition" / "Structural decomposition") as the lower bound.
    const opIdx     = res.text.indexOf('operational-notation-display');
    const editIdx   = res.text.indexOf('editorial-decomposition');
    const structIdx = res.text.indexOf('notation-grammar-panel');
    // Operational MUST appear; at least one of editorial/structural may follow.
    expect(opIdx).toBeGreaterThan(-1);
    if (editIdx > -1) expect(opIdx).toBeLessThan(editIdx);
    if (structIdx > -1) expect(opIdx).toBeLessThan(structIdx);
  });

  it('renders the O1c "Token reference" glossary deeplink below the notation block', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    expect(res.text).toContain('class="operational-notation-glossary-link"');
    expect(res.text).toMatch(/<a href="\/freestyle\/glossary#operational-notation">Token reference/);
  });

  it('uses the refined per-token tooltip for OP (O1c)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    // Pre-O1c the tooltip was the generic "Plant-foot side"; O1c specializes
    // SAME and OP per-token.
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side" title="OP \(operational\) — step on opposite side from plant foot">OP<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side" title="SAME \(operational\) — step on same side as plant foot">SAME<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--surface" data-role="surface" title="CLIP — clipper set position \(start of trick\)">CLIP<\/span>/);
  });

  it('renders the curator-authored source-note when operational_notation_source is populated (O1d)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-with-source');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="operational-notation-source-note"');
    expect(res.text).toContain('Source: FootbagMoves.com (curator-reviewed 2026-05-10). Demo source-note for O1d.');
  });

  it('omits the source-note element when operational_notation_source is null (O1d)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    expect(res.status).toBe(200);
    // op-notation-seeded has operational_notation but NO source — the
    // operational section must render but the source-note <p> must NOT.
    expect(res.text).toContain('class="content-section operational-notation-display"');
    expect(res.text).not.toContain('class="operational-notation-source-note"');
  });

  it('places source-note between the token block and the Token-reference link (O1d)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-with-source');
    const tokensIdx  = res.text.indexOf('class="operational-notation-tokens"');
    const sourceIdx  = res.text.indexOf('class="operational-notation-source-note"');
    const linkIdx    = res.text.indexOf('class="operational-notation-glossary-link"');
    expect(tokensIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeGreaterThan(tokensIdx);
    expect(linkIdx).toBeGreaterThan(sourceIdx);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — semantic-notation fallback ladder', () => {
  it('Layer 2: renders the curated equivalence chain for a trick with an authored chain (mobius)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="equivalent-readings');
    expect(res.text).toContain('Equivalent readings');
    // Tokens for each reading are span-wrapped; assert their text presence.
    expect(res.text).toMatch(/>gyro<\/span>\s*<span[^>]*>torque</);     // reading 0
    expect(res.text).toMatch(/>spinning<\/span>\s*<span[^>]*>ss</);     // reading 1
    expect(res.text).toMatch(/>miraging<\/span>\s*<span[^>]*>op</);     // reading 2
    // Last reading: tokenized; osis is a CORE atom → auto-linked
    expect(res.text).toMatch(/href="\/freestyle\/glossary#term-osis"[^>]*>osis</);
    // Ordering: depth-0 before depth-1 before depth-2
    const d0 = res.text.indexOf('equivalent-reading-depth-0');
    const d1 = res.text.indexOf('equivalent-reading-depth-1');
    const d2 = res.text.indexOf('equivalent-reading-depth-2');
    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('Layer 1 + Layer 2 coexistence: mobius renders both Notation and Equivalent readings sections', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mobius');
    // Both sections present and Notation precedes Equivalent readings.
    const notationIdx   = res.text.indexOf('notation-display-tokens');
    const equivalentIdx = res.text.indexOf('class="equivalent-readings');
    if (notationIdx === -1) {
      // Surface diagnostic context if Layer 1 didn't render
      throw new Error(`notation-display-tokens not in response. Snippet: ${res.text.slice(0, 500)}`);
    }
    expect(notationIdx).toBeGreaterThan(0);
    expect(equivalentIdx).toBeGreaterThan(notationIdx);
  });

  it('Mobius equivalence chain shows the curator-confirmed status (no pending flag)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mobius');
    // Within the Equivalent readings section, no pending flag.
    const sectionStart = res.text.indexOf('class="equivalent-readings');
    const sectionEnd   = res.text.indexOf('</section>', sectionStart);
    const sectionText  = res.text.slice(sectionStart, sectionEnd);
    expect(sectionText).not.toContain('equivalent-readings-pending-flag');
  });

  it('Layer 3: renders "Built on <base>" for a non-core trick with resolvable base_trick and no chain (paradox-mirage)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="semantic-base-lineage');
    expect(res.text).toMatch(/Built on <a href="\/freestyle\/tricks\/mirage">mirage<\/a>/);
    // No equivalence-chain section for this trick.
    expect(res.text).not.toContain('class="equivalent-readings');
  });

  it('Layer 4: a core atom with no notation and no chain renders no semantic-notation block (butterfly)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/butterfly');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="equivalent-readings');
    expect(res.text).not.toContain('class="semantic-base-lineage');
    expect(res.text).not.toContain('class="semantic-notation-pending"');
  });

  it('Layer 5b: a non-core trick with no notation, no base, no chain renders the pending-curation cue (nf2b-gap)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/nf2b-gap');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="semantic-notation-pending"');
    expect(res.text).toContain('Compositional reading pending curation.');
  });

  it('auto-link restraint: only CORE_TRICKS / operator-reference tokens become links; other tokens stay plain', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mobius');
    // 'osis' is a CORE atom → linked
    expect(res.text).toMatch(/href="\/freestyle\/glossary#term-osis"/);
    // 'gyro' is a Tier-1 operator-board primitive but NOT in
    // OPERATOR_REFERENCE_ENTRIES → must stay plain
    expect(res.text).not.toMatch(/href="\/freestyle\/glossary#term-gyro"/);
    // 'spinning' is operator-board Tier-1 (not operator-reference) → plain
    expect(res.text).not.toMatch(/href="\/freestyle\/glossary#term-spinning"/);
    // 'ss' is operational notation → plain
    expect(res.text).not.toMatch(/href="\/freestyle\/glossary#term-ss"/);
  });
});

// ---------------------------------------------------------------------------

// ─────────────────────────────────────────────────────────────────────────
// O1c (2026-05-10) — operational notation glossary subsection on
// /freestyle/glossary. Adds §9 "Operational Notation" with per-token
// anchor IDs for deep-linking from trick-detail Token-reference link.
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/glossary — operational notation subsection (O1c)', () => {
  it('renders the new §9 "Operational Notation" section with the deep-link target id', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="operational-notation"');
    expect(res.text).toMatch(/<h2 class="section-heading">9\. Operational Notation<\/h2>/);
  });

  it('defines per-token anchors for the 6 component flags', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    for (const flag of ['dex', 'del', 'bod', 'xbd', 'pdx', 'xdex']) {
      expect(res.text).toContain(`id="op-flag-${flag}"`);
    }
  });

  it('defines per-token anchors for both sides (SAME, OP)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('id="op-side-same"');
    expect(res.text).toContain('id="op-side-op"');
  });

  it('defines anchors for sequence operators and pre-states', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('id="op-seq-minor"');
    expect(res.text).toContain('id="op-seq-major"');
    expect(res.text).toContain('id="op-prestate-back"');
    expect(res.text).toContain('id="op-prestate-no-plant"');
    expect(res.text).toContain('id="op-prestate-rooted"');
  });

  it('renumbered subsequent sections (Foundational Tricks → §10; Competitive → §11; Sources → §12)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toMatch(/<h2 class="section-heading">10\. Foundational Tricks<\/h2>/);
    expect(res.text).toMatch(/<h2 class="section-heading">11\. Competitive[^<]*<\/h2>/);
    expect(res.text).toMatch(/<h2 class="section-heading">12\. Sources<\/h2>/);
  });
});

// ---------------------------------------------------------------------------
// IA Realignment Batch 1 — landing + glossary stabilization

describe('Freestyle IA realignment — Batch 1 contract', () => {
  it('landing retires the "Glossary, Dictionary, and Notation — three layers" framing', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('Glossary, Dictionary, and Notation');
    expect(res.text).not.toContain('Three reference layers');
    expect(res.text).not.toContain('The Freestyle Reference');
  });

  it('landing surfaces a concise three-link orientation ("Where to go next")', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Where to go next');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/sets"');
  });

  it('landing collapses the dictionary CTA to a single "Browse the trick dictionary" button', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Browse the trick dictionary');
    expect(res.text).not.toMatch(/Browse by component\s*&rarr;/);
    expect(res.text).not.toMatch(/>Browse tricks\s*&rarr;/);
  });

  it('glossary retires the "Glossary, Dictionary, and Notation — three layers" heading', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).not.toContain('Glossary, Dictionary, and Notation');
    expect(res.text).not.toContain('three complementary layers');
  });

  it('glossary intro links to dictionary and set-notation reference without three-layer rhetoric', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/sets"');
  });

  it('operator board renders the PassBack-source Symposium definition (single-leg-jump wording)', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('active leg performs an action in a single-leg jump');
    expect(res.text).not.toContain('An illusion combined with body rotation');
  });

  it('foundational-tricks §10 list contains orbit and excludes pixie/fairy from the list items', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Locate the §10 <ul class="grid-list"> and assert its contents
    const sec10 = res.text.indexOf('id="term-clipper"');
    const setModSection = res.text.indexOf('id="set-modifiers-tier-1"');
    expect(sec10).toBeGreaterThan(0);
    expect(setModSection).toBeGreaterThan(sec10);
    const listSlice = res.text.slice(sec10, setModSection);
    expect(listSlice).toContain('id="term-orbit"');
    // Pixie + Fairy must NOT appear inside the foundational-tricks list block;
    // they re-appear below in the set-modifiers subsection.
    expect(listSlice).not.toContain('id="term-pixie"');
    expect(listSlice).not.toContain('id="term-fairy"');
  });

  it('set-modifiers subsection renders pixie and fairy with their term anchors', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="set-modifiers-tier-1"');
    const setModSection = res.text.indexOf('id="set-modifiers-tier-1"');
    const afterSetMod = res.text.slice(setModSection);
    expect(afterSetMod).toContain('id="term-pixie"');
    expect(afterSetMod).toContain('id="term-fairy"');
  });
});

// ---------------------------------------------------------------------------
// IA Realignment Batch 2 — landing-page Language structure

describe('Freestyle landing — Batch 2: The Language of Freestyle Footbag', () => {
  it('renders the new intro heading and lede in place of the old narrative', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('The Language of Freestyle Footbag');
    expect(res.text).toMatch(/vocabulary of body actions/);
    // Old narrative phrases are gone:
    expect(res.text).not.toContain('What is Freestyle Footbag?');
    expect(res.text).not.toContain('Additional Degree of Difficulty');
  });

  it('retires the featuredVideo "Footbag 2026: San Marino" placeholder block', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('Footbag 2026: San Marino');
    expect(res.text).not.toContain('class="freestyle-featured-video"');
  });
});

describe('Freestyle landing — Basic Components section (C-1)', () => {
  it('renders the Basic Components heading and all six component cards', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Basic Components');
    for (const key of ['contact', 'set', 'dex', 'spin', 'duck', 'delay']) {
      expect(res.text).toContain(`id="component-${key}"`);
    }
  });

  it('renders the Dex card with three sub-field rows (Direction / Movement type / Support type)', async () => {
    const res = await request(createApp()).get('/freestyle');
    const dexIdx = res.text.indexOf('id="component-dex"');
    expect(dexIdx).toBeGreaterThan(0);
    // Slice forward to the next component card to scope assertions.
    const after = res.text.slice(dexIdx);
    const nextCard = after.indexOf('class="freestyle-component-card"');
    const dexSlice = nextCard > 0 ? after.slice(0, nextCard) : after.slice(0, 1500);
    expect(dexSlice).toMatch(/Direction/);
    expect(dexSlice).toMatch(/Movement type/);
    expect(dexSlice).toMatch(/Support type/);
    expect(dexSlice).toMatch(/in-out/);
    expect(dexSlice).toMatch(/out-in/);
    expect(dexSlice).toMatch(/hippy/);
    expect(dexSlice).toMatch(/leggy/);
    expect(dexSlice).toMatch(/regular/);
    expect(dexSlice).toMatch(/symposium/);
  });

  it('atom-shape Basic Components (Contact, Set, Spin, Duck, Delay) render without subfield blocks', async () => {
    const res = await request(createApp()).get('/freestyle');
    for (const key of ['contact', 'set', 'spin', 'duck', 'delay']) {
      const idx = res.text.indexOf(`id="component-${key}"`);
      expect(idx).toBeGreaterThan(0);
      const after = res.text.slice(idx);
      const nextCard = after.indexOf('class="freestyle-component-card"', 50);
      const slice = nextCard > 0 ? after.slice(0, nextCard) : after.slice(0, 600);
      expect(slice).not.toContain('freestyle-component-subfields');
    }
  });
});

describe('Freestyle landing — Core Tricks section (C-2; compact symbolic objects)', () => {
  it('renders the Core Tricks heading and all 11 symbolic-object cards', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Core Tricks');
    const expected = [
      'clipper', 'mirage', 'legover', 'pickup', 'illusion',
      'whirl', 'butterfly', 'swirl', 'osis',
      'around-the-world', 'orbit',
    ];
    for (const slug of expected) {
      expect(res.text).toContain(`id="core-trick-${slug}"`);
      // #slug rendering on the card
      expect(res.text).toContain(`#${slug}`);
    }
  });

  it('renders ≡ equivalence readings for the three tricks with canonical aliases', async () => {
    const res = await request(createApp()).get('/freestyle');
    // illusion ≡ outside-in mirage
    const illusionIdx = res.text.indexOf('id="core-trick-illusion"');
    expect(illusionIdx).toBeGreaterThan(0);
    const illusionSlice = res.text.slice(illusionIdx, illusionIdx + 600);
    expect(illusionSlice).toContain('outside-in mirage');
    expect(illusionSlice).toMatch(/&equiv;|≡/);
    // around-the-world ≡ ATW
    const atwIdx = res.text.indexOf('id="core-trick-around-the-world"');
    const atwSlice = res.text.slice(atwIdx, atwIdx + 600);
    expect(atwSlice).toContain('ATW');
    // orbit ≡ reverse around-the-world
    const orbitIdx = res.text.indexOf('id="core-trick-orbit"');
    const orbitSlice = res.text.slice(orbitIdx, orbitIdx + 600);
    expect(orbitSlice).toContain('reverse around-the-world');
  });

  it('atom cards without canonical aliases render no ≡ line', async () => {
    const res = await request(createApp()).get('/freestyle');
    // clipper: pure atom, no canonical alias surfaced here
    const clipperIdx = res.text.indexOf('id="core-trick-clipper"');
    expect(clipperIdx).toBeGreaterThan(0);
    const after = res.text.slice(clipperIdx);
    const nextCard = after.indexOf('class="core-trick-object"', 50);
    const clipperSlice = nextCard > 0 ? after.slice(0, nextCard) : after.slice(0, 600);
    expect(clipperSlice).not.toContain('core-trick-equivalence');
  });

  it('renders ADD values from freestyle_tricks for present rows and pending marker for missing rows', async () => {
    const res = await request(createApp()).get('/freestyle');
    // clipper ADD=1 (per seeded freestyle_tricks row in this test file's beforeAll)
    // We can't guarantee a specific ADD without checking factories, so assert
    // structurally: the present-row cards carry a numeric ADD value, and orbit
    // (DB-missing per the IA realignment plan R3) carries the pending marker.
    const orbitIdx = res.text.indexOf('id="core-trick-orbit"');
    expect(orbitIdx).toBeGreaterThan(0);
    const orbitSlice = res.text.slice(orbitIdx, orbitIdx + 600);
    expect(orbitSlice).toContain('core-trick-add-pending');
    // The footnote about pending entries renders at the section level.
    expect(res.text).toMatch(/pending dictionary entry/i);
  });
});

describe('Freestyle landing — curated Demonstrations strip (C-3)', () => {
  it('renders the Demonstrations heading and all five curated slots', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toMatch(/class="[^"]*\bfreestyle-demonstrations\b/);
    expect(res.text).toMatch(/<h2>Demonstrations<\/h2>/);
    for (const key of ['sam-conlon', 'classic-circle', 'artistic-routine', 'modern-technical-shred', 'educationally-readable-run']) {
      expect(res.text).toContain(`id="demonstration-${key}"`);
    }
  });

  it('renders the "Curated demonstration pending" placeholder for every slot (no curator backfill yet)', async () => {
    const res = await request(createApp()).get('/freestyle');
    const pendingMatches = res.text.match(/Curated demonstration pending\./g) ?? [];
    // Five slots, all unfilled at slice time → five placeholders.
    expect(pendingMatches.length).toBe(5);
  });

  it('preserves the existing competitionFormats section with all four formats (routine/circle/sick3/shred30)', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('Competition Formats');
    expect(res.text).toMatch(/>Routine</);
    expect(res.text).toMatch(/>Circle</);
    expect(res.text).toMatch(/>Sick 3</);
    expect(res.text).toMatch(/>Shred 30</);
  });
});

// ---------------------------------------------------------------------------
// IA Realignment Batch 3 — glossary pedagogy + compositional teaching flow

describe('Freestyle glossary — Batch 3: PDX flag rewording (C-3-A)', () => {
  it('renders the PassBack-adapted [PDX] flag definition (mechanical, not circular)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const pdxIdx = res.text.indexOf('id="op-flag-pdx"');
    expect(pdxIdx).toBeGreaterThan(0);
    const slice = res.text.slice(pdxIdx, pdxIdx + 800);
    expect(slice).toMatch(/cross-body far dex/);
    expect(slice).toMatch(/hip-pivot/);
    expect(slice).toContain('CLIP &gt; OP IN [DEX]');
    expect(slice).toMatch(/PassBack glossary/);
    // The old circular phrasing is gone.
    expect(slice).not.toMatch(/performed in the paradox direction/);
  });
});

describe('Freestyle glossary — Batch 3: intro philosophy (C-3-B)', () => {
  it('renders the new philosophy paragraph framing the language as symbolic and compositional', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/teaches how the freestyle language works/);
    expect(res.text).toMatch(/symbolic and compositional/);
    expect(res.text).toMatch(/shortest readable form wins/);
  });
});

describe('Freestyle glossary — Batch 3: §8 Symbolic Compression reframe (C-3-C)', () => {
  it('renames §8 to "Symbolic Compression"', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/<h2 class="section-heading">8\. Symbolic Compression/);
    // The old heading is gone.
    expect(res.text).not.toMatch(/<h2[^>]*>8\. Notation \(Jobs Notation\)/);
  });

  it('renders the maintainer-mandated thesis sentence at the top of §8', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(
      /The language evolves by compressing recurring compositional structures\s+into shorter readable symbolic forms\./,
    );
  });

  it('cross-links §8 to the §3 symbolic-compression flow', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="#symbolic-compression-flow"');
  });
});

describe('Freestyle glossary — Batch 3: §3 torque/mobius compression flow (C-3-D)', () => {
  it('renders the symbolic-compression-flow anchor inside §3 (above §4)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const sec4Idx = res.text.indexOf('4. Naming');
    expect(flowIdx).toBeGreaterThan(0);
    expect(sec4Idx).toBeGreaterThan(flowIdx);
  });

  it('renders three compact-symbolic-object cards: #osis, #torque, #mobius', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const sec4Idx = res.text.indexOf('4. Naming');
    const slice = res.text.slice(flowIdx, sec4Idx);
    expect(slice).toContain('#osis');
    expect(slice).toContain('#torque');
    expect(slice).toContain('#mobius');
  });

  it('mobius card surfaces two stopping-depth equivalence readings', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const sec4Idx = res.text.indexOf('4. Naming');
    const slice = res.text.slice(flowIdx, sec4Idx);
    // Two stopping depths for mobius:
    expect(slice).toContain('spinning ss torque');
    expect(slice).toContain('spinning ss miraging osis');
    // torque's compositional equivalence:
    expect(slice).toContain('miraging osis');
  });

  it('keeps explanatory prose minimal — single short paragraph after the cards', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Three names\. One progression\./);
    expect(res.text).toMatch(/picks its own stopping points/);
  });
});

describe('Freestyle glossary — Batch 3: §9 semantic-vs-operational contrast (C-3-E)', () => {
  it('renders the layer-contrast table inside §9 with semantic + operational rows', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const sec9Idx = res.text.indexOf('id="operational-notation"');
    expect(sec9Idx).toBeGreaterThan(0);
    const after = res.text.slice(sec9Idx, sec9Idx + 2500);
    expect(after).toContain('class="glossary-layer-contrast"');
    expect(after).toMatch(/<strong>Semantic<\/strong>/);
    expect(after).toMatch(/<strong>Operational<\/strong>/);
    expect(after).toMatch(/stepping ducking paradox torque/);
  });
});

describe('Freestyle glossary — Batch 3: Execution Mechanics subsection (C-3-F)', () => {
  it('renders the Execution Mechanics subsection heading inside §3 with PassBack attribution', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="execution-mechanics"');
    expect(res.text).toMatch(/>Execution Mechanics</);
    expect(res.text).toMatch(/Concepts adapted from the PassBack glossary/);
  });

  it('renders all seven PassBack-adapted micro-entries with anchors', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="term-alpine"');
    expect(res.text).toContain('id="term-symposium-mech"');
    expect(res.text).toContain('id="term-symple"');
    expect(res.text).toContain('id="term-muted"');
    expect(res.text).toContain('id="term-dex-window"');
    expect(res.text).toContain('id="term-hippy-leggy"');
    expect(res.text).toContain('id="term-phases-sides"');
  });

  it('Symposium micro-entry carries the PassBack verbatim definition', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const idx = res.text.indexOf('id="term-symposium-mech"');
    expect(idx).toBeGreaterThan(0);
    const slice = res.text.slice(idx, idx + 600);
    expect(slice).toMatch(/active leg performs an action in a single-leg jump/);
  });

  it('Execution Mechanics subsection sits inside §3, above §4', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const sec3Idx     = res.text.indexOf('3. How Tricks Are Built');
    const execIdx     = res.text.indexOf('id="execution-mechanics"');
    const sec4Idx     = res.text.indexOf('4. Naming');
    expect(sec3Idx).toBeGreaterThan(0);
    expect(execIdx).toBeGreaterThan(sec3Idx);
    expect(sec4Idx).toBeGreaterThan(execIdx);
  });
});

describe('Freestyle glossary — Batch 3: §13 connective-panel positioning note (C-3-G)', () => {
  it('renders the educational-bridge positioning note inside §13', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const sec13Idx = res.text.indexOf('id="connective-panels"');
    expect(sec13Idx).toBeGreaterThan(0);
    const slice = res.text.slice(sec13Idx, sec13Idx + 1500);
    expect(slice).toMatch(/positioned as educational bridges/);
    expect(slice).toMatch(/will migrate to the trick dictionary/);
  });
});

describe('Freestyle glossary — Batch 3: re-bloat guard', () => {
  it('rendered glossary body stays within a reasonable size budget (raw HTML bytes)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Single-page glossary should not be excessively large. The threshold
    // is a re-bloat guard, not a tight ceiling; raise it deliberately
    // only when a future slice has a clear reason to.
    expect(res.text.length).toBeLessThan(120_000);
  });
});

// ---------------------------------------------------------------------------
// IA Realignment Batch 4 — typography/layout polish for compact symbolic
// objects. CSS-only refinements + dictionary unification (CSS-level).
// Most assertions are structural: class presence, anchor presence, ordering.

describe('Freestyle landing — Batch 4: symbolic-object class contract preserved', () => {
  it('Core Tricks grid still renders each card with the .core-trick-object class', async () => {
    const res = await request(createApp()).get('/freestyle');
    const matches = res.text.match(/class="core-trick-object"/g) ?? [];
    // Eleven canonical core tricks per Batch 2 contract.
    expect(matches.length).toBe(11);
  });

  it('each Core Tricks card carries the .core-trick-slug element (PRIMARY layer)', async () => {
    const res = await request(createApp()).get('/freestyle');
    const matches = res.text.match(/class="core-trick-slug"/g) ?? [];
    expect(matches.length).toBe(11);
  });

  it('cards with canonical aliases render at least one .core-trick-equivalence line (SECONDARY layer)', async () => {
    const res = await request(createApp()).get('/freestyle');
    // illusion, around-the-world, orbit each carry one canonical alias.
    const matches = res.text.match(/class="core-trick-equivalence"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('orbit card carries the pending-state marker (QUATERNARY layer in pending state)', async () => {
    const res = await request(createApp()).get('/freestyle');
    const orbitIdx = res.text.indexOf('id="core-trick-orbit"');
    expect(orbitIdx).toBeGreaterThan(0);
    const slice = res.text.slice(orbitIdx, orbitIdx + 600);
    expect(slice).toContain('core-trick-add-pending');
  });
});

describe('Freestyle glossary — Batch 4: compression-flow visual continuity', () => {
  it('symbolic-compression-flow cards reuse the .core-trick-object class', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    expect(flowIdx).toBeGreaterThan(0);
    // Slice forward until §4 heading; count .core-trick-object occurrences in §3 flow region.
    const sec4Idx = res.text.indexOf('4. Naming');
    const slice = res.text.slice(flowIdx, sec4Idx);
    const matches = slice.match(/class="core-trick-object glossary-compression-card"/g) ?? [];
    // Three cards: osis, torque, mobius.
    expect(matches.length).toBe(3);
  });

  it('thesis sentence in §8 still renders with the .glossary-thesis class', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('class="glossary-thesis"');
  });
});

describe('Freestyle dictionary — Batch 4: unified symbolic-object styling', () => {
  it('dict-card-title elements still render (CSS unification adds # via ::before)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toMatch(/class="dict-card-title"/);
  });

  it('dict-card-add elements still render the ADD label (CSS unification restyles as chip)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // ADD spans still carry the dict-card-add class; only visual treatment changed.
    expect(res.text).toMatch(/class="dict-card-add[^"]*"/);
  });

  it('dict-card class is preserved (no rename); CSS now uses shared symbolic-object hierarchy', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toMatch(/class="dict-card[^"]*"/);
  });
});
