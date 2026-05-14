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

  // ── Seeds for /freestyle/moves cross-link tests ─────────────────────────
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

describe('GET /freestyle/moves', () => {
  it('returns 200 with page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/moves');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Move Sets');
  });

  it('contains core set names', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/moves');
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
    const res = await request(app).get('/freestyle/moves');
    expect(res.text).toContain('<a href="/freestyle/tricks/pixie">Pixie</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/fairy">Fairy</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/stepping">Stepping</a>');
  });

  it('renders unmatched basic-set labels as plain text (no anchor)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/moves');
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
    const res = await request(app).get('/freestyle/moves');
    expect(res.text).toContain('Terraging (Double Pixie)');
    expect(res.text).not.toContain('/freestyle/tricks/terraging-double-pixie');
    expect(res.text).not.toMatch(/<a[^>]+href="\/freestyle\/tricks\/terraging"[^>]*>Terraging \(Double Pixie\)/);
  });

  it('keeps modifier-only labels plain (no link to hidden modifier surface)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/moves');
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
    const res = await request(app).get('/freestyle/moves');
    expect(res.text).toContain('<a href="/freestyle/tricks/surging">Surging</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/blazing">Blazing</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/pogo">Pogo</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/ducking">Ducking</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/spinning">Spinning</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/gyro">Gyro</a>');
  });

  it('emits stable move-<slug> anchor ids on every row and tag', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/moves');
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

  it('contains Jobs notation and foundational trick concepts', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('Jobs Notation');
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

describe('GET /freestyle/glossary — operator-board orientation in §3', () => {
  it('renders the glossary-surface operator-board heading and lede', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('The compositional vocabulary');
    expect(res.text).toContain('primitive movement modifiers of freestyle composition');
  });

  it('does not render the landing-surface operator-board prose', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).not.toContain('The operators of freestyle');
    expect(res.text).not.toContain('Freestyle footbag is a compositional movement language');
  });

  it('renders all 14 Tier-1 operator glyphs', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const glyphs = [
      'PIX', 'AT', 'Q', 'BL', 'FAIRY', 'STEP',
      'SPIN', 'GY', 'DUCK', 'PDX', 'SYMP',
      'XDEX', 'SAME', 'OP',
    ];
    for (const glyph of glyphs) {
      expect(res.text).toMatch(new RegExp(`<p class="operator-glyph">${glyph}</p>`));
    }
  });

  it('embeds the operator board between §3 heading and §4 heading', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const sec3Idx  = res.text.indexOf('3. How Tricks Are Built');
    const boardIdx = res.text.indexOf('class="operator-board');
    const sec4Idx  = res.text.indexOf('4. Naming');
    expect(sec3Idx).toBeGreaterThan(0);
    expect(boardIdx).toBeGreaterThan(sec3Idx);
    expect(sec4Idx).toBeGreaterThan(boardIdx);
  });

  it('renders ten restrained operator-card deep-links inside §3', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const matches = res.text.match(/class="operator-card-deeplink"/g) ?? [];
    expect(matches.length).toBe(10);
    expect(res.text).toContain('href="/freestyle/modifier/spinning"');
    expect(res.text).toContain('href="/freestyle/modifier/paradox"');
    expect(res.text).toContain('href="/freestyle/glossary#term-symposium"');
    expect(res.text).toContain('href="/freestyle/moves#move-pixie"');
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
