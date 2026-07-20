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
  insertFreestyleTrickAlias,
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
  // Op-notation string mirrors the post-normalization operational-notation
  // shape.
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
  // paradox-mirage is non-core with a resolvable base; surfaces both a
  // chain reading AND the base_trick lineage.
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage',
    canonical_name: 'paradox mirage',
    adds: '3',
    base_trick: 'mirage',
  });
  // Synthetic test fixture: non-core with a resolvable base and
  // intentionally NO chain entry — tests Layer 3 lineage rendering.
  // A synthetic slug (rather than a real trick such as parkwalk, which
  // carries a chain entry: FM+PB agree on 'pixie butterfly') can never
  // collide with chain-registry growth, matching the nf2b-gap
  // convention used for the Layer-5b fixture below.
  insertFreestyleTrick(db, {
    slug: 'nf3-layer3-fixture',
    canonical_name: 'nf3 layer3 fixture',
    adds: '4',
    base_trick: 'butterfly',
  });
  // nf2b-gap is non-core with no notation, no base, no chain; tests Layer 5b.
  insertFreestyleTrick(db, {
    slug: 'nf2b-gap',
    canonical_name: 'nf2b gap',
    adds: '4',
  });

  // ── Seeds for CANONICAL-SURFACE-REALIGNMENT-1 S2 + S3 tests ──────────
  // S2: canon-locked compound rows for ≡ chain readings (torque, blender,
  //     drifter all in freestyleSymbolicEquivalences.ts after S2).
  // S3: around-the-world + 'atw' alias to verify allow-list rendering as
  //     'ATW' (uppercase displayAs per freestyleAliasGovernance.ts).
  insertFreestyleTrick(db, { slug: 'torque',   canonical_name: 'torque',   adds: '4', notation: 'TORQUE'   });
  insertFreestyleTrick(db, { slug: 'blender',  canonical_name: 'blender',  adds: '4', notation: 'BLENDER'  });
  insertFreestyleTrick(db, { slug: 'drifter',  canonical_name: 'drifter',  adds: '3', notation: 'DRIFTER'  });
  insertFreestyleTrick(db, { slug: 'around_the_world', canonical_name: 'around the world', adds: '2', notation: 'ATW' });
  insertFreestyleTrickAlias(db, 'atw', 'around_the_world', 'atw');

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

  it('notes that some record names are not in the current dictionary when a record is unlinked', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/records');
    expect(res.text).toMatch(/not match a[\s\S]*trick in the current dictionary/i);
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
  it('surfaces the records page (leaders is reachable from there)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/records');
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
    expect(res.text).toContain('Circle Contest');
    expect(res.text).toContain('a variety phase');
    expect(res.text).toContain('a density phase');
  });

  it('names the four routine judging axes as the rules score them, with variety inside composition', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/about');
    expect(res.text).toContain('composition (the variety and breadth of distinct');
    expect(res.text).not.toContain('variety (breadth of tricks');
  });

  it('links onward to the trick dictionary, glossary, and learn pages', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/about');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('href="/freestyle/learn"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/sets/reference (flat Holden table, moved from /freestyle/sets in Phase B)', () => {
  it('returns 200 with page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets/reference');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Move Sets');
  });

  it('contains core set names', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets/reference');
    expect(res.text).toContain('Pixie');
    expect(res.text).toContain('Fairy');
    expect(res.text).toContain('Nuclear');
    expect(res.text).toContain('Stepping');
  });

  // ── cross-link moves → dictionary ───────────────────────────────
  // Strict rule: slugify(label) must exactly equal a public freestyle_tricks
  // slug. Compound labels and modifier-only matches stay plain text. Every
  // row carries a stable id="move-<slug>" anchor for future backlinking.

  it('renders trick-matched basic-set labels as anchors to /freestyle/tricks/:slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets/reference');
    expect(res.text).toContain('<a href="/freestyle/tricks/pixie">Pixie</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/fairy">Fairy</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/stepping">Stepping</a>');
  });

  it('renders unmatched basic-set labels as plain text (no anchor)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets/reference');
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
    const res = await request(app).get('/freestyle/sets/reference');
    expect(res.text).toContain('Terraging (Double Pixie)');
    expect(res.text).not.toContain('/freestyle/tricks/terraging_double_pixie');
    expect(res.text).not.toMatch(/<a[^>]+href="\/freestyle\/tricks\/terraging"[^>]*>Terraging \(Double Pixie\)/);
  });

  it('keeps modifier-only labels plain (no link to hidden modifier surface)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets/reference');
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
    const res = await request(app).get('/freestyle/sets/reference');
    expect(res.text).toContain('<a href="/freestyle/tricks/surging">Surging</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/blazing">Blazing</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/pogo">Pogo</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/ducking">Ducking</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/spinning">Spinning</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/gyro">Gyro</a>');
  });

  it('emits stable move-<slug> anchor ids on every row and tag', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/sets/reference');
    // Anchor-id derives from slugify(label) regardless of whether the row
    // links anywhere; this gives future trick-detail backlinking a stable
    // target without requiring a re-author pass on the moves page.
    expect(res.text).toContain('id="move-pixie"');
    expect(res.text).toContain('id="move-terraging_double_pixie"');
    expect(res.text).toContain('id="move-rooting_rooted"');
    expect(res.text).toContain('id="move-fairy_atomic"');
    expect(res.text).toContain('id="move-gogo"');
  });
});

// ---------------------------------------------------------------------------

describe('Set-notation reference cross-links', () => {
  it('glossary §3 intermediate-operators block links to /freestyle/sets/reference', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const intermediateIdx = res.text.indexOf('id="intermediate-operators"');
    const linkIdx         = res.text.indexOf('href="/freestyle/sets/reference"', intermediateIdx);
    expect(intermediateIdx).toBeGreaterThan(0);
    expect(linkIdx).toBeGreaterThan(intermediateIdx);
  });

  it('/freestyle/learn lists the set notation reference as a shipped entry', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/learn');
    expect(res.text).toMatch(/href="\/freestyle\/sets\/reference"[^>]*>Set notation reference/);
  });

  it('landing surfaces Operators & Modifiers as a banner tile linking to /freestyle/operators', async () => {
    // The Language banner carries an "Operators & Modifiers" tile with a single
    // outbound link to /freestyle/operators. No embedded operator-board.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('Operators &amp; Modifiers');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).not.toContain('class="operator-board ');
    expect(res.text).not.toContain('class="operator-board-footer-link"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/operators — compact modifier index + advanced reference', () => {
  // The operators page is a compact, browseable index of the modifier
  // vocabulary (in the shared dict-trick-row idiom) with the advanced
  // decomposition reference retained below it via a shared sub-partial. The
  // modifier feel cards now live only in glossary §6.

  it('returns 200 with page title', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Operators &amp; Modifiers');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.text).toMatch(/<a href="\/freestyle">Freestyle<\/a>/);
  });

  it('renders the compact index and a minimal cross-cutting decomposition tail', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    // Compact index rows (not the old feel-card scroll).
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).toContain('id="operator-paradox"');
    expect(res.text).not.toContain('class="glossary-modifier-card"');
    // Tail keeps only the cross-cutting notes (how operators combine + alpine +
    // notation components labelled as non-operators); per-modifier depth moved to
    // the detail pages.
    expect(res.text).toContain('id="how-operators-combine"');
    expect(res.text).toContain('id="alpine"');
    expect(res.text).toContain('id="notation-components"');
    // The per-modifier reference dl/grid no longer renders on the operators page.
    expect(res.text).not.toContain('id="intermediate-operators"');
    expect(res.text).not.toContain('id="set-modifiers-tier-1"');
    expect(res.text).not.toContain('class="glossary-intermediate-operators"');
  });

  it('cross-links the dictionary movement-system view and the set encyclopedia', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
    expect(res.text).toContain('href="/freestyle/sets"');
  });
});

describe('GET /freestyle/observational — observational-layer trick entries', () => {
  // Layer separation contract: observational entries never cross into
  // canonical surfaces; they surface only on this route. Cards are
  // visually distinct (no hashtag, no trick-detail link, observational
  // badge).

  it('returns 200 with page title', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    // The public label for the observational layer is "Emerging Vocabulary".
    expect(res.text).toContain('Emerging Vocabulary');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toMatch(/<a href="\/freestyle">Freestyle<\/a>/);
  });

  it('renders the observational layer note + canonical references', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toContain('class="observational-layer-note"');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });

  it('previously-canonicalized entries (assassin / big-apple / mantis) do NOT appear in the observational layer', async () => {
    // Layer-coexistence regression: these three slugs are canonical
    // (freestyle_tricks.slug), and their observational entries must
    // stay removed — the canonical-promotion process documented in the
    // content module's JSDoc says "move the row to inputs/
    // curated/tricks/<slug>.txt + re-run loader + REMOVE the
    // observational entry", and that third step has been skipped before.
    //
    // Layer separation contract requires:
    //   observational.folkSlug != canonical freestyle_tricks.slug
    //
    // This test fails if any future PR re-adds these entries to the
    // observational module.
    const res = await request(createApp()).get('/freestyle/observational');
    // Check the card-name <h3> elements specifically, not the full
    // card region — observational readings legitimately reference
    // canonical tricks by name (e.g. Big Orange has reading
    // 'Rev. Big Apple'). The forever-invariant is that no card
    // *title* matches a canonicalized name.
    for (const canonicalized of ['Assassin', 'Big Apple', 'Mantis']) {
      const titlePattern = new RegExp(
        `class="observed-card-name"[^>]*>\\s*${canonicalized}\\s*<`,
        'i',
      );
      expect(res.text, `${canonicalized} card title appears in observational layer (should be canonical-only)`)
        .not.toMatch(titlePattern);
    }
  });

  it('every card carries a two-letter source badge with tooltip attribution', async () => {
    // Compact-card pattern: each card carries a 2-letter source badge
    // with title/aria-label carrying the full source citation, rather
    // than verbose "observational · {sourceLabel}" prose. Badge
    // variants are PB / FM / SG / FF / FB / OTHER
    // (FB covers the footbag.org /newmoves source).
    const res = await request(createApp()).get('/freestyle/observational');
    const badgeMatches = res.text.match(
      /class="observed-card-source-badge observed-card-source-badge--(PB|FM|SG|FF|FB|OTHER)"[^>]*title="[^"]+"[^>]*>(PB|FM|SG|FF|FB|OTHER)</g,
    ) ?? [];
    // At least one PB badge present (PassBack is the dominant source).
    expect(badgeMatches.length).toBeGreaterThanOrEqual(1);
    expect(res.text).toMatch(/observed-card-source-badge--PB/);
  });

  it('renders the source-summary chip strip beneath canonical references', async () => {
    // content.sources collects unique source badges represented across
    // the page. Renders only when content.sources.length > 0.
    // Chip labels are human-readable source names (PassBack /
    // FootbagMoves / Stanford shorthand), not raw badge codes
    // (PB/FM/SG). The CSS class carries the badge code.
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toMatch(/class="observed-source-strip"/);
    expect(res.text).toMatch(
      /class="observed-source-strip-item observed-source-strip-item--PB"[^>]*>PassBack</,
    );
  });

  it('observational cards have NO hashtag chip (canonical-only convention)', async () => {
    // Identity-layer forever-invariant: observational entries never get
    // #-tag chips.
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).not.toContain('class="dict-card-hashtag"');
    expect(res.text).not.toMatch(/<span[^>]*class="[^"]*hashtag[^"]*"[^>]*>#/);
  });

  it('observational cards have NO trick-detail href (no /freestyle/tricks/{folkSlug})', async () => {
    // Forever-invariant: observational entries never get a
    // /freestyle/tricks/{slug} route.
    const res = await request(createApp()).get('/freestyle/observational');
    // Pull the observational card region (first observed-card-grid through
    // the observational-footer). Multiple grids exist (one per ADD
    // bucket); slicing from the first to the footer captures them all.
    const cardsStart = res.text.indexOf('class="observed-card-grid"');
    const footerStart = res.text.indexOf('class="observational-footer"');
    expect(cardsStart).toBeGreaterThan(0);
    const cardsRegion = res.text.slice(cardsStart, footerStart);
    // Inside the card region, no card links to /freestyle/tricks/blizzard
    // or any other folk slug. Sample covers seeds + Batch B expansion
    // (apostrophe-derived slugs, all-caps acronyms, multi-word).
    // Note: assassin / big-apple / mantis are NOT in this iteration —
    // they are canonical-only and absent from the observational module.
    for (const folkSlug of [
      'blizzard', 'blaze', 'bedwetter', 'sole-survivor',
      'anonymous', 'bladerunner', 'gdlo', 'gybas',
      'pandora-s-box', 'scorpion-s-tail', 'your-mom',
    ]) {
      expect(cardsRegion, `forbidden detail-page link for observational ${folkSlug}`)
        .not.toContain(`/freestyle/tricks/${folkSlug}`);
    }
  });

  it('observational entries do NOT appear on canonical /freestyle/tricks index', async () => {
    // The single most important forever-invariant: no canonical
    // cross-contamination. Folk slugs from the observational content
    // module must NEVER surface on /freestyle/tricks.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // None of the observational folk names appear as cards on the
    // canonical trick dictionary index. Sample drawn from original
    // seeds + Batch B expansion.
    for (const name of [
      // Observational-only names that must NOT appear on canonical surfaces.
      // 'Assassin' / 'Big Apple' / 'Mantis' are NOT in this list — they are
      // canonical and legitimately appear on those pages.
      'Blizzard', 'Blaze', 'Bedwetter', 'Sole Survivor',
      'Anonymous', 'Bladerunner', 'Flurricane', 'Locomotion', 'Your Mom',
    ]) {
      // Use a card-region match to avoid false positives from
      // descriptions / footnotes that happen to mention the word.
      const dictMatch = new RegExp(`class="dict-card[^"]*"[^>]*>[\\s\\S]{0,500}${name}`, 'i');
      expect(res.text, `observational ${name} leaked onto canonical /freestyle/tricks`)
        .not.toMatch(dictMatch);
    }
  });

  it('observational entries do NOT appear on /freestyle/operators', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    for (const name of [
      // Observational-only names that must NOT appear on canonical surfaces.
      // 'Assassin' / 'Big Apple' / 'Mantis' are NOT in this list — they are
      // canonical and legitimately appear on those pages.
      'Blizzard', 'Blaze', 'Bedwetter', 'Sole Survivor',
      'Anonymous', 'Bladerunner', 'Flurricane', 'Locomotion', 'Your Mom',
    ]) {
      expect(res.text, `observational ${name} leaked onto /freestyle/operators`)
        .not.toContain(name);
    }
  });

  it('observational entries do NOT appear on landing /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle');
    for (const name of [
      // Observational-only names that must NOT appear on canonical surfaces.
      // 'Assassin' / 'Big Apple' / 'Mantis' are NOT in this list — they are
      // canonical and legitimately appear on those pages.
      'Blizzard', 'Blaze', 'Bedwetter', 'Sole Survivor',
      'Anonymous', 'Bladerunner', 'Flurricane', 'Locomotion', 'Your Mom',
    ]) {
      expect(res.text, `observational ${name} leaked onto landing`)
        .not.toContain(name);
    }
  });

  it('expansion-cohort entries with null proposedAddFormula render without the formula block', async () => {
    // Expansion-cohort contract: the 65 Batch B expansion entries set
    // proposedAddFormula=null. The template's {{#if proposedAddFormula}}
    // guard means the formula <code> block does not render for these
    // entries. Cards still render the proposedAddTotal where present.
    const res = await request(createApp()).get('/freestyle/observational');
    // The expansion cohort still renders cards (count assertion in
    // earlier test). For null-formula entries, the formula <code>
    // block must NOT carry a placeholder marker like "null" or "TBD".
    expect(res.text).not.toMatch(/<code>null<\/code>/);
    expect(res.text).not.toMatch(/<code>undefined<\/code>/);
  });

  it('expansion-cohort entries with null proposedAddTotal omit the external-claim label entirely', async () => {
    // Entries with null proposedAddTotal (Ghost, Id, Johnny Vodka, Kiwi,
    // Monster, Rotor, Wauxspin, Bladerunner's merged form) have no
    // numeric claim from PassBack. After the ADD-bucket refactor the
    // external-claim label is null and the span simply does not render
    // (the template's {{#if externalClaimLabel}} guard suppresses it).
    const res = await request(createApp()).get('/freestyle/observational');
    // No literal null leaks through
    expect(res.text).not.toMatch(/class="observed-card-external-claim"[^>]*>\s*null/);
    // Em-dash framing no longer used
    expect(res.text).not.toMatch(/—\s*ADD/);
  });

  it('a folk-layer entry is documented by name in the Folk / Unresolved archive', async () => {
    // The page is driven by the generated observational universe: folk
    // entries whose structure is not yet understood (Leaning Jowler) render
    // by name in the Folk / Unresolved full list. Proposed readings are
    // not rendered on this surface; they stay curator-internal until a
    // structural reading is adjudicated.
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toContain('Leaning Jowler');
  });
});

describe('GET /freestyle/operators — orientation lede', () => {
  it('orientation lede cross-links to the By Movement System dictionary view', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
  });
});

describe('GET /freestyle/glossary §6 is the per-modifier reference home (operators is the index)', () => {
  it('glossary §6 keeps the full per-modifier reference + anchors; operators carries only the minimal tail', async () => {
    const glossary  = await request(createApp()).get('/freestyle/glossary');
    const operators = await request(createApp()).get('/freestyle/operators');
    // The full per-modifier reference + its #term-{slug} anchors live in the
    // glossary (the load-bearing anchor home that semantic tokens link to).
    for (const anchor of [
      'id="term-paradox"',
      'id="intermediate-operators"',
      'id="set-modifiers-tier-1"',
    ]) {
      expect(glossary.text,  `glossary missing ${anchor}`).toContain(anchor);
      expect(operators.text, `operators should not carry ${anchor}`).not.toContain(anchor);
    }
    // The operators page keeps only the cross-cutting tail.
    expect(operators.text).toContain('id="how-operators-combine"');
    expect(operators.text).toContain('id="notation-components"');
    // Feel cards are glossary-only.
    expect(glossary.text).toContain('class="glossary-modifier-card"');
    expect(operators.text).not.toContain('class="glossary-modifier-card"');
  });

  it('glossary §6 heading carries an "Open standalone" link to /freestyle/operators', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/<a class="glossary-section-canonical-link" href="\/freestyle\/operators">/);
  });
});

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

  it('contains structural-compression and core-trick concepts', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    // §7 carries the notation thesis (with Jobs notation reference
    // preserved as the historical name of the semantic layer); §composition
    // hosts the worked structural-compression treatment as part of the
    // Vocabulary Relationships subsection. §5 hosts the core trick
    // structures grid.
    expect(res.text).toMatch(/Structural compression/);
    expect(res.text).toMatch(/Jobs notation/);
    expect(res.text).toContain('Core Trick Families');
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

  it('§6 (Modifiers & Operators) renders without embedding the operator-board partial', async () => {
    // V5: the operator-board orientation strip is intentionally left to the
    // landing page and /freestyle/learn. The glossary's §6 carries the
    // modifier-reference + intermediate-operator + execution-mechanics
    // content without the operator-board visual taxonomy.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const sec6Idx = res.text.indexOf('id="section-modifiers"');
    const sec7Idx = res.text.indexOf('id="section-notation"');
    expect(sec6Idx).toBeGreaterThan(0);
    expect(sec7Idx).toBeGreaterThan(sec6Idx);
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
      'barraging', 'inspinning', 'whirling', 'double',
    ];
    for (const slug of expectedSlugs) {
      expect(res.text).toMatch(new RegExp(`<dt id="term-${slug}"`));
    }
    // Furious folds into barraging; high folds into the barraging explanation.
    expect(res.text).not.toMatch(/<dt id="term-furious"/);
    expect(res.text).not.toMatch(/<dt id="term-high"/);
  });

  it('renders the locked decomposition strings on confirmed entries', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('stepping paradox');
    expect(res.text).toContain('compressed atomic');
    expect(res.text).toContain('paradox + illusion');
  });

  it('flags pending entries with the inline pending badge', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const pendingFlags = res.text.match(/class="glossary-operator-pending-flag"/g) ?? [];
    // double is the one remaining pending entry (high folded into barraging).
    expect(pendingFlags.length).toBe(1);
  });

  it('renders a plain lineage line on the nuclear entry (no curator-workflow language)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('A settled decomposition.');
    expect(res.text).not.toContain('Curator-adjudicated');
  });

  it('frames barraging as a historical name for the furious set, not a canonical set', async () => {
    // Settled doctrine: Furious is the canonical set; Barraging is not a set but a
    // historical name for it. The entry names Furious as the set and does not
    // reintroduce the old "distinct by timing, pending audit" framing.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const idx = res.text.indexOf('id="term-barraging"');
    expect(idx).toBeGreaterThan(0);
    const slice = res.text.slice(idx, idx + 2000);
    expect(slice).toMatch(/historical name for the Furious set/i);
    expect(slice).not.toMatch(/distinct by timing/i);
  });

  it('tags the historical nickname patterns (barraging, miraging) in the operator reference', async () => {
    // The reference makes the official-set-vs-nickname split explicit: Barraging
    // and Miraging carry a "historical name" flag; official sets do not.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const entry = (slug: string) => {
      const i = res.text.indexOf(`id="term-${slug}"`);
      return i < 0 ? '' : res.text.slice(i, i + 500);
    };
    expect(entry('barraging')).toContain('glossary-operator-nickname-flag');
    expect(entry('miraging')).toContain('glossary-operator-nickname-flag');
  });

  it('renders entries in pedagogical order: set-tier first, body next, quantifier last', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const idxAtomic    = res.text.indexOf('id="term-atomic"');
    const idxWhirling  = res.text.indexOf('id="term-whirling"');
    const idxDouble    = res.text.indexOf('id="term-double"');
    expect(idxAtomic).toBeGreaterThan(0);
    expect(idxWhirling).toBeGreaterThan(idxAtomic);
    expect(idxDouble).toBeGreaterThan(idxWhirling);
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

  it('surfaces +1 spin status on inspinning', async () => {
    // Any spin contributes +1 ADD, so inspinning (a forward-rotation spin)
    // renders as +1 — superseding the earlier +0 directional-only reading.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const inspinIdx = res.text.indexOf('id="term-inspinning"');
    expect(inspinIdx).toBeGreaterThan(0);
    const slice = res.text.slice(inspinIdx, inspinIdx + 2000);
    expect(slice).toMatch(/\+1/);
    expect(slice).toMatch(/spin/i);
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
  it('renders a Media section that links to the trick gallery, not inline clips', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ref-media-audit');
    expect(res.status).toBe(200);
    // Links to the trick's full video gallery (locked-context convention).
    expect(res.text).toContain('href="/media/browse?context&#x3D;ref-media-audit"');
    expect(res.text).toContain('See All Videos for');
    // No reference media is embedded on the trick page anymore: neither
    // tutorial- nor record-tier clips, and no Tutorials/Demonstrations subsections.
    expect(res.text).not.toContain('REF_MEDIA_TUTORIAL_MARKER');
    expect(res.text).not.toContain('REF_MEDIA_RECORD_MARKER');
    expect(res.text).not.toContain('reference-media-subsection');
    expect(res.text).not.toMatch(/<h3 class="reference-media-subheading">/);
  });

});

// ─────────────────────────────────────────────────────────────────────────
// O1a — operational notation rendering surface on trick-detail.
// New "Set notation (operational)" section between semantic Notation and the
// Notation grammar diagnostic. Section is conditional on the trick row's
// freestyle_tricks.operational_notation column being non-empty. O1a renders
// the string verbatim inside <code> with no token highlighting (deferred to
// O1b).
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks/:slug — operational notation block (O1a)', () => {
  it('renders the section with role-classified token spans (O1b/O1c — refined per-token tooltips)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    expect(res.status).toBe(200);
    // Operational tokens render in their own Execution notation section
    // (operational-notation-display class preserved), only for non-first-class
    // tricks (the trick-notation-summary card carries the compact JOB row on
    // first-class pages). This fixture has notation=null, so only the Execution
    // notation section renders (no Movement notation section).
    expect(res.text).toContain('operational-notation-display');
    expect(res.text).toContain('<h2>Execution notation</h2>');
    // O1b: each token rendered as a span with role class. O1c refined the
    // per-token tooltips (e.g. CLIP gets "Clipper-stall surface (...)" not
    // the generic "Plant or landing surface").
    expect(res.text).toMatch(/<span class="op-token op-token--surface" data-role="surface" title="CLIP: clipper set position \(start of trick\)">CLIP<\/span>/);
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
    expect(res.text).not.toContain('JOB notation');
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

  it('renders the "Token reference" glossary deeplink below the notation block', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    expect(res.text).toContain('class="notation-glossary-link"');
    // The deeplink targets the glossary's notation section anchor, which
    // must exist in glossary.hbs (a missing anchor lands at the page top).
    expect(res.text).toMatch(/<a href="\/freestyle\/glossary#section-notation">Token reference/);
  });

  it('uses the refined per-token tooltip for OP (O1c)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    // The per-token tooltip states the component-relative SAME/OP meaning:
    // each side reads against the most recent side-bearing component, not a
    // fixed plant foot.
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side" title="OP \(operational\): opposite leg from the most recent side-bearing component">OP<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side" title="SAME \(operational\): same leg as the most recent side-bearing component">SAME<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--surface" data-role="surface" title="CLIP: clipper set position \(start of trick\)">CLIP<\/span>/);
  });

  it('never renders source-provenance prose, even when operational_notation_source is populated', async () => {
    // Source provenance is curator-internal metadata, not public detail-card
    // copy: the Execution notation block must never surface it.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-with-source');
    expect(res.status).toBe(200);
    // The operational/Execution notation block still renders its tokens.
    expect(res.text).toContain('operational-notation-display');
    // But the provenance line and its text never reach the page.
    expect(res.text).not.toContain('class="operational-notation-source-note"');
    expect(res.text).not.toContain('Source: FootbagMoves.com');
  });

  it('omits the source-note element when operational_notation_source is null', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-seeded');
    expect(res.status).toBe(200);
    expect(res.text).toContain('operational-notation-display');
    expect(res.text).not.toContain('class="operational-notation-source-note"');
  });

  it('places the Token-reference link directly after the token block (no source-note between)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/op-notation-with-source');
    const tokensIdx  = res.text.indexOf('class="operational-notation-tokens"');
    const linkIdx    = res.text.indexOf('class="notation-glossary-link"');
    expect(tokensIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(tokensIdx);
    expect(res.text).not.toContain('class="operational-notation-source-note"');
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
    // The S5 tokenizer expands
    // `ss → same-side` and `op → opposite` at render time so the
    // chain reading vocabulary matches the JOB notation register. The
    // underlying chain data still stores the short forms; only the
    // rendered text changes.
    expect(res.text).toMatch(/>gyro<\/span>\s*<span[^>]*>torque</);            // reading 0 (no abbreviations)
    expect(res.text).toMatch(/>spinning<\/span>\s*<span[^>]*>same-side</);     // reading 1 (ss → same-side)
    // quantum is a registered operator, so it auto-links like atomic.
    expect(res.text).toMatch(/>quantum<\/a>\s*<span[^>]*>opposite</);          // reading 2 (op → opposite)
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

  it('Layer 3: renders "Built on <base>" for a non-core trick with resolvable base_trick and no chain (nf3-layer3-fixture)', async () => {
    // Synthetic test fixture used in place of parkwalk, whose
    // curator-confirm-pending chain entry would defeat the no-chain
    // condition. The fixture matches the same conditions:
    // non-core slug, resolvable base_trick=butterfly, no chain, no
    // operational_notation.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/nf3-layer3-fixture');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="semantic-base-lineage');
    expect(res.text).toMatch(/Built on <a href="\/freestyle\/tricks\/butterfly">butterfly<\/a>/);
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
// O1c — operational notation glossary subsection on
// /freestyle/glossary. Adds §9 "Operational Notation" with per-token
// anchor IDs for deep-linking from trick-detail Token-reference link.
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/glossary — operational notation subsection (O1c)', () => {
  it('renders the Operational Notation subsection with its deep-link target id', async () => {
    // Operational notation lives as an Advanced Reference subsection
    // under §7 (Symbolic Notation), not as a top-level section. The deep-
    // link anchor id="operational-notation" is preserved for inbound links.
    // The subsection is wrapped in a <details>/<summary>
    // collapsible (default-closed) for progressive disclosure. The anchor
    // sits on the <details> element; the title text
    // lives in the <summary>. All #op-* child anchors remain reachable
    // (browsers auto-open <details> when navigating to a child anchor).
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="operational-notation"');
    // Anchor proximity to title text.
    expect(res.text).toMatch(/id="operational-notation"[\s\S]{0,400}Operational notation/);
    // The subsection is collapsed in a <details> element.
    expect(res.text).toMatch(/<details[^>]*class="glossary-operational-details"[^>]*id="operational-notation"/);
    expect(res.text).toContain('class="glossary-operational-details-summary"');
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

  it('renders the §8 ADD Accounting + §12 Community + §14 Sources reference-tail sections', async () => {
    // In the 14-section IA, ADD Accounting is §8, Community Vocabulary
    // is §12, Historical Terms is §13, and Sources is §14. The
    // trick-level ADD definition lives in §8.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('id="section-add-accounting"');
    expect(res.text).toContain('id="section-community"');
    expect(res.text).toContain('id="section-sources"');
  });
});

describe('Glossary and history — anchor preservation + cross-link contracts', () => {
  it('ADD Accounting section carries id="traditional-reference" + #run-quality anchor (history.hbs inbound link)', async () => {
    // The traditional-reference + run-quality anchors are preserved
    // (anchor-preservation forever-rule), living inside §8 ADD
    // Accounting.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="traditional-reference"');
    expect(res.text).toContain('id="run-quality"');
  });

  it('ADD Accounting section cross-links to combo-analysis for run-level vocabulary', async () => {
    // ADD Accounting is §8 with
    // dedicated subsections + worked examples. The cross-link to
    // combo-analysis for run-quality / format vocabulary is preserved
    // at the section footer.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/combo-analysis"');
    // §10 Run Architecture is the explicit anchor section for run-
    // level material; its cross-link to combo-analysis must also exist.
    expect(res.text).toContain('id="section-run-architecture"');
  });

  it('history page links to the ADD analysis and Insights pages as its difficulty evidence', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
    expect(res.text).toContain('href="/freestyle/insights"');
    // The narrative history page no longer routes readers through a run-quality anchor.
    expect(res.text).not.toContain('/freestyle/combo-analysis#run-quality');
    expect(res.text).not.toContain('/freestyle/glossary#run-quality');
  });

  it('history page links to the whirl family page and the operators reference', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/families/whirl"');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=movement-system"');
  });

  it('glossary source-families list keeps the legacy citations as prose, never a live footbag.org hyperlink', async () => {
    // The legacy footbag.org site goes dark at cutover, so the sources list
    // names it as a citation without linking to it; the surviving outbound
    // reference site stays hyperlinked.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('<strong>Footbag.org</strong>');
    expect(res.text).toContain('historical per-trick move list');
    expect(res.text).not.toContain('href="https://www.footbag.org');
    expect(res.text).toContain('href="https://www.footbagmoves.com/"');
  });

  it('glossary surviving outbound links carry rel="noopener noreferrer" + target="_blank"', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Each verified outbound URL should appear with both attributes.
    const checks = [
      'https://www.footbagmoves.com/',
    ];
    for (const url of checks) {
      const idx = res.text.indexOf(`href="${url}"`);
      expect(idx, `Missing outbound link: ${url}`).toBeGreaterThan(0);
      // Read 200 chars around the anchor opening; both attributes must be present.
      const slice = res.text.slice(Math.max(0, idx - 100), idx + 200);
      expect(slice).toMatch(/target="_blank"/);
      expect(slice).toMatch(/rel="noopener noreferrer"/);
    }
  });

  it('§11 spyro is documented as a modifier-only descriptor, not an inspin synonym', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Spyro is a modifier-only folk descriptor (not a standalone dictionary
    // trick); it is explicitly NOT equated to inspin.
    expect(res.text).toMatch(/modifier-only folk descriptor/);
    expect(res.text).toMatch(/not<\/strong> a synonym for inspin/);
  });

  it('category view renders the soft-retirement notice pointing to canonical replacements', async () => {
    // The category view is soft-retired: instead of the grammatical-role
    // explanatory note ("Grouped by grammatical role..."), it renders
    // a retirement notice that directs the user to Family + Movement
    // System as canonical replacements. Route still returns 200 for
    // bookmark continuity.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="category-view-retirement-notice"');
    expect(res.text).toMatch(/This view is being retired/);
    expect(res.text).toContain('href="/freestyle/tricks?view=family"');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
    // Old grammatical-role prose + class are gone.
    expect(res.text).not.toContain('class="category-view-note');
    expect(res.text).not.toMatch(/Grouped by grammatical role/);
  });
});

describe('Glossary improvements + history refresh', () => {
  // High and medium priority glossary improvements plus the condensed
  // history-page sections.
  //
  // Glossary recommendations implemented:
  //   #1 §1 vocabulary-stabilization framing
  //   #2 §6 compositional layering opening + evolved-ADD-value annotation
  //   #3 whirl network-attractor note (§5)
  //   #4 §10 anchor IDs (Sick3 / Shred:30 / BOP and run-quality tiers)
  //   #5 §10 additive-structural-accounting rewrite
  //   #6 §7 operator-notation framing paragraph
  //   #7 §12 "About this glossary" closing
  //
  // The history assertions here now cover the narrative History page (thesis,
  // the composition and structure sections, the institutions, and the onward
  // links); the earlier condensed-history assertions were retired with that page.

  it('glossary §1 carries the vocabulary-stabilization framing paragraph', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/vocabulary stabilized by roughly 2007.{0,15}2008/);
    expect(res.text).toContain('glossary-vocabulary-stabilization-note');
    expect(res.text).toContain('href="/freestyle/history"');
  });

  it('glossary §6 carries the compositional-layering opening paragraph', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-compositional-layering-note');
    expect(res.text).toMatch(/simultaneous additional\s+constraint/);
    expect(res.text).toMatch(/usually harder than the\s+sum of their parts/);
  });

  it('glossary §6 acknowledges evolved-ADD-value conventions with cross-link to add-analysis', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/modifier weights have varied historically/);
    // Cross-link to add-analysis from §6 (one of several inbound surfaces).
    const sec6Idx = res.text.indexOf('id="section-modifiers"');
    const sec7Idx = res.text.indexOf('id="section-notation"');
    const slice = res.text.slice(sec6Idx, sec7Idx);
    expect(slice).toContain('href="/freestyle/add-analysis"');
  });

  it('glossary §5 carries the whirl network-attractor note exactly once', async () => {
    // The note lives solely on the whirl family card's observationalNote;
    // a prior standalone static duplicate (before the family-tree block)
    // was removed. Guard against the duplicate returning.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('Whirl as central attractor');
    expect(res.text).toMatch(/blurry whirl\s*&rarr;\s*whirl|blurry whirl\s*→\s*whirl/);
    const occurrences = (res.text.match(/central attractor of the\s+freestyle trick network/g) ?? []).length;
    expect(occurrences, 'network-attractor note renders exactly once').toBe(1);
  });

  it('glossary keeps internal/developer jargon out of user-facing prose', async () => {
    // Public-facing prose hygiene: registry names, sprint/ruling refs, and
    // internal tooling words must not leak onto the rendered glossary.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).not.toMatch(/MODIFIER_COMPOSITIONS/);
    expect(res.text).not.toMatch(/\bpt8\b/);
    expect(res.text).not.toMatch(/Red pt\d/);
    expect(res.text).not.toMatch(/[Ww]orkbook/);
  });

  it('glossary §7 carries the operator-notation framing paragraph', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-operator-notation-framing');
    expect(res.text).toMatch(/compact symbolic shorthand for trick\s+composition/);
    // Worked paradox example with op-tokens.
    expect(res.text).toMatch(/CLIP/);
    expect(res.text).toMatch(/OP IN/);
  });

  it('glossary §8 carries the additive-structural-accounting framing + mobius worked example', async () => {
    // The "additive structural accounting"
    // definition lives in the §8 philosophy paragraph; the
    // mobius worked example is a structured card in the §8 worked-
    // examples grid (compactNotation "gyro torque" + derivation visible).
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/additive structural accounting/);
    expect(res.text).toContain('id="add-example-mobius"');
    expect(res.text).toMatch(/gyro torque/);
  });

  it('glossary §8 worked-example status chips render the shaped label, never the raw code', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Visible chip text is the pre-shaped statusLabel; the raw status
    // code never appears as element text (the 'pending-doctrine' label
    // form is 'pending doctrine' whenever an example carries it).
    expect(res.text).toMatch(/glossary-add-example-status--canonical[^>]*>canonical</);
    expect(res.text).not.toMatch(/>pending-doctrine</);
  });

  it('combo-analysis page carries anchor IDs on each run-quality tier + format term', async () => {
    // /freestyle/combo-analysis is the canonical home for run-level
    // vocabulary, so these anchors live there rather than on the
    // glossary. The combo-analysis route-test file also covers these;
    // the assertion here pins the canonical-home contract.
    const res = await request(createApp()).get('/freestyle/combo-analysis');
    const ids = [
      'run-quality-tiltless', 'run-quality-guiltless', 'run-quality-tripless',
      'run-quality-fearless', 'run-quality-beastly', 'run-quality-godly',
      'run-quality-genuine', 'run-quality-bop',
      'format-sick3', 'format-shred-30',
    ];
    for (const id of ids) {
      expect(res.text, `Missing anchor id: ${id}`).toContain(`id="${id}"`);
    }
  });

  it('glossary §14 Sources carries the "About this glossary" framing paragraph', async () => {
    // The framing is a single sentence. The .glossary-about-framing
    // hook + the "footbag community built informally" attribution are
    // preserved for inbound deep-links + community-attribution semantics.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-about-framing');
    expect(res.text).toMatch(/footbag community built informally/);
  });

  it('history page opens with the thesis and the language framing', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('class="history-thesis"');
    expect(res.text).toMatch(/expanded the shared vocabulary/);
    expect(res.text).toMatch(/Freestyle footbag is a language/);
    // The prior two-phase framing is fully replaced by the narrative page.
    expect(res.text).not.toContain('The Two-Phase Story');
  });

  it('history page frames difficulty as a moving ceiling measured in ADD', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('id="difficulty"');
    expect(res.text).toMatch(/Difficulty became a moving ceiling/);
    expect(res.text).toMatch(/measured in ADD/);
    expect(res.text).not.toContain('history-add-system-decomposition-note');
  });

  it('history page explains the vocabulary expanding by composition', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('id="vocabulary"');
    expect(res.text).toMatch(/expanded by composition/);
    expect(res.text).toMatch(/the most productive operators/);
    expect(res.text).not.toContain('history-combo-architecture-note');
  });

  it('history page ends on the naming to notation to classification arc', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('id="this-encyclopedia"');
    expect(res.text).toMatch(/This encyclopedia is the latest step/);
    const vocabIdx = res.text.indexOf('id="vocabulary"');
    const endIdx   = res.text.indexOf('id="this-encyclopedia"');
    expect(vocabIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(vocabIdx);
    expect(res.text).not.toContain('Movement Language as the Modern Vocabulary');
  });

  it('history page links onward to the learning path, dictionary, and glossary', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/learn"');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary"');
  });
});

describe('Formula accountability contracts', () => {
  // Five related contracts:
  //   1. Landing Core Tricks carry editorial atom readings (see portal test)
  //   2. Dictionary cleanup — spyro filtered, illusion alias suppressed, ATW atom-labeled
  //   3. ADD Analysis derivation lines
  //   4. Paradox formula visibility — §3 + connective panel + ADD Analysis
  //   5. Worlds 2023 Team Freestyle attribution

  it('dictionary surface does NOT include spyro (Formula Accountability retire)', async () => {
    // resolveTrickKind now classifies spyro as a modifier, so it's filtered
    // out of every browse view regardless of which 1-ADD rows the test
    // fixture happens to seed.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/data-trick-slug="spyro"/);
    expect(res.text).not.toContain('href="/freestyle/tricks/spyro"');
  });

  it('dictionary does NOT surface the "outside-in mirage" misleading reading anywhere', async () => {
    // surfaceOnBrowse:false on the illusion alias-governance entry
    // suppresses the misleading reading from compact browse cards.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/outside-in mirage/);
  });

  it('foundational atom cards on the dictionary surface render silently when no chain/notation present', async () => {
    // 2-tier notation hierarchy contract: tier 1 (tokenized equivalences)
    // or tier 2 (op-notation) render the formula slot; otherwise the slot
    // is silent. The card carries title + ADD chip (and any side affordances
    // like media chip / pending-decomposition pill); no "core atom — X"
    // prose, no .dict-card-equivalence--core-atom class. The pendingDecomposition
    // pill (curator-authored via freestyleUnresolvedCompounds.ts) is the only
    // honest "pending" surface; "core atom" implementation language never
    // leaks to public.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    for (const slug of ['mirage', 'butterfly']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx, `${slug} card not found in dictionary`).toBeGreaterThan(0);
      const cardEnd = res.text.indexOf('</article>', idx);
      const card = res.text.slice(idx, cardEnd);
      // Two-line row still renders; title + line-2 ADD slot present.
      expect(card).toContain('dict-trick-row-title');
      expect(card).toContain('dict-trick-row-add');
      // "core atom" prose + class do NOT render to public surfaces.
      expect(card, `${slug} card must not render "core atom" prose`).not.toMatch(/core atom/);
      expect(card).not.toContain('dict-card-equivalence--core-atom');
    }
  });

  it('ADD Analysis worked examples render a Derivation line on every entry', async () => {
    // Handlebars escapes `=` to `&#x3D;` by default, so regex patterns
    // accept either form across the derivation strings.
    //
    // The 17 worked examples give full coverage of foundational atoms
    // plus the compound flagships. The 1- and 2-ADD atoms use the
    // explicit primitive-decomposition style (stall / dex / xbody /
    // spin), so spot-checks assert the primitive forms, not shorthand
    // like "clipper(1) = 1 ADD" or "mirage(2) = 2 ADD".
    const eq = '(?:=|&#x3D;)';
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.status).toBe(200);
    const derivationMatches = res.text.match(/class="add-analysis-derivation-line"/g) ?? [];
    expect(derivationMatches.length).toBe(17);  // 17 worked examples
    // Spot-check the formulaic content (entity-tolerant).
    expect(res.text).toMatch(new RegExp(`stall\\(1\\)\\s*${eq}\\s*1 ADD`));         // toe-stall
    expect(res.text).toMatch(new RegExp(`xbody\\(1\\)\\s*${eq}\\s*1 ADD`));        // clipper (kick)
    expect(res.text).toMatch(new RegExp(`dex\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*2 ADD`));    // mirage / illusion / pickup / legover
    expect(res.text).toMatch(new RegExp(`xbody\\(1\\)\\s*\\+\\s*dex\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*3 ADD`)); // whirl / swirl
    expect(res.text).toMatch(new RegExp(`spin\\(1\\)\\s*\\+\\s*xbody\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*3 ADD`));// osis
    expect(res.text).toMatch(new RegExp(`quantum\\(\\+1\\)\\s*\\+\\s*osis\\(3\\)\\s*${eq}\\s*4 ADD`));
    expect(res.text).toMatch(new RegExp(`stepping\\(\\+1\\)\\s*\\+\\s*paradox\\(\\+1\\)\\s*\\+\\s*whirl\\(3\\)\\s*${eq}\\s*5 ADD`));
    expect(res.text).toMatch(new RegExp(`gyro\\(\\+1\\)\\s*\\+\\s*torque\\(4\\)\\s*${eq}\\s*5 ADD`));
  });

  it('paradox term entry in glossary §3 surfaces the canonical formula visibly', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const paradoxIdx = res.text.indexOf('id="term-paradox"');
    expect(paradoxIdx).toBeGreaterThan(0);
    // Read forward to the close of the <dd>.
    const ddEnd = res.text.indexOf('</dd>', paradoxIdx);
    const block = res.text.slice(paradoxIdx, ddEnd);
    expect(block).toContain('glossary-paradox-formula');
    expect(block).toMatch(/PDX/);
    expect(block).toMatch(/CLIP/);
    expect(block).toMatch(/OP IN/);
    expect(block).toMatch(/\[DEX\]/);
  });

  it('paradox connective panel notation hint carries the canonical formula', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const panelIdx = res.text.indexOf('id="glossary-panel-paradox"');
    expect(panelIdx).toBeGreaterThan(0);
    const nextPanelIdx = res.text.indexOf('id="glossary-panel-', panelIdx + 50);
    const slice = res.text.slice(panelIdx, nextPanelIdx);
    expect(slice).toMatch(/Canonical formula/);
    expect(slice).toMatch(/PDX/);
  });

  it('ADD Analysis surfaces paradox notation as the entry-topology case', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    // CLIP > OP IN [DEX] is still surfaced, but framed as paradox's entry case
    // (a side-switch that can also occur mid-trick), not paradox in every form.
    expect(res.text).toMatch(/CLIP &gt; OP IN \[DEX\]/);
    expect(res.text).toMatch(/entry.topology/i);
    expect(res.text).not.toContain('Paradox itself reads as PDX');
  });

  it('Worlds 2023 Team Freestyle featured caption carries Scott Davidson + Tuan Vu attribution', async () => {
    const res = await request(createApp()).get('/freestyle');
    const captionMatch = res.text.match(/<p class="featured-caption[^"]*">[^<]*<\/p>/g) ?? [];
    const worldsCaption = captionMatch.find(c => /Scott Davidson|Tuan Vu/.test(c));
    expect(worldsCaption, 'Worlds 2023 caption attribution missing').toBeDefined();
    expect(worldsCaption).toMatch(/Scott Davidson/);
    expect(worldsCaption).toMatch(/Tuan Vu/);
  });

  it('landing core-trick equivalences use NONE of the retired misleading aliases', async () => {
    // ATW (uppercase shorthand) and "outside-in mirage" stay forbidden
    // — both follow the retired misleading-alias
    // pattern. The "reverse around-the-world" string is a
    // legitimate orbit-card reading (curator-confirmed alias mapping)
    // and is not
    // guarded out here; that single use case is asserted positively in
    // the foundational-formula test below.
    const res = await request(createApp()).get('/freestyle');
    const gridStart = res.text.indexOf('class="freestyle-core-trick-grid"');
    const gridEnd   = res.text.indexOf('core-trick-footnote', gridStart);
    const slice = res.text.slice(gridStart, gridEnd);
    expect(slice).not.toMatch(/<p class="core-trick-equivalence">[\s\S]{0,100}ATW/);
    expect(slice).not.toMatch(/<p class="core-trick-equivalence">[\s\S]{0,100}outside-in mirage/);
  });
});

// ---------------------------------------------------------------------------
// Landing + glossary stabilization invariants

describe('Freestyle IA realignment — Batch 1 contract', () => {
  it('landing retires the "Glossary, Dictionary, and Notation — three layers" framing', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('Glossary, Dictionary, and Notation');
    expect(res.text).not.toContain('Three reference layers');
    expect(res.text).not.toContain('The Freestyle Reference');
  });

  it('landing surfaces Trick Dictionary + Glossary + Set Encyclopedia via the Language banner', async () => {
    const res = await request(createApp()).get('/freestyle');
    // The retired top-reference-jump band must be gone.
    expect(res.text).not.toContain('class="freestyle-top-reference-jump"');
    expect(res.text).not.toMatch(/<a class="freestyle-top-reference-link"/);
    // Reachable via the Language banner tiles.
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('href="/freestyle/sets"');
    expect(res.text).not.toContain('Where to go next');
  });

  it('landing surfaces a single dictionary link, not multiple browse CTAs', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('href="/freestyle/tricks"');
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
    expect(res.text).toContain('href="/freestyle/sets/reference"');
  });

  it('operator board renders a Symposium definition consistent with its single-leg-jump mechanics', async () => {
    // /freestyle carries no embedded operator-board. The
    // Symposium-action invariant holds on the operator-board partial
    // wherever it renders; we assert it against /freestyle/learn, the
    // operator-board host surface.
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).toMatch(/Active leg jumps \+ lands solo/i);
    // The retired "illusion + body rotation" misreading must not reappear.
    expect(res.text).not.toContain('An illusion combined with body rotation');
  });

  it('Core Trick Families renders as the registry-style core-trick grid; pixie/fairy stay in the set-modifiers reference', async () => {
    // The families section carries the registry-style core-trick grid. Modifiers
    // (with the pixie/fairy set-modifier grid) now precedes families in the
    // Foundations spine, so the family grid is bounded by the families section on
    // the low side and the Notation topic on the high side.
    const res = await request(createApp()).get('/freestyle/glossary');
    const familiesAt = res.text.indexOf('id="section-families"');
    const notationAt = res.text.indexOf('id="section-notation"');
    expect(familiesAt).toBeGreaterThan(0);
    expect(notationAt).toBeGreaterThan(familiesAt);
    const gridSlice = res.text.slice(familiesAt, notationAt);
    // All 11 foundational atoms render as registry tiles with `#term-{slug}` anchors.
    for (const slug of ['clipper_stall', 'mirage', 'legover', 'pickup', 'illusion', 'whirl', 'butterfly', 'swirl', 'osis', 'around_the_world', 'orbit']) {
      expect(gridSlice).toContain(`id="term-${slug}"`);
    }
    // Grid uses the symbolic-object pattern.
    expect(gridSlice).toContain('class="freestyle-core-trick-grid"');
    expect(gridSlice).toContain('class="core-trick-object"');
    expect(gridSlice).toContain('#clipper');
    // The previous flat-list rendering must not survive.
    expect(gridSlice).not.toContain('<ul class="grid-list">');
    // Pixie + Fairy still belong below in the set-modifiers subsection.
    expect(gridSlice).not.toContain('id="term-pixie"');
    expect(gridSlice).not.toContain('id="term-fairy"');
  });

  it('set-modifiers grid renders only the pixie/fairy set primitives; each operator owns a single anchor', async () => {
    // The grid is the glossary anchor home only for the set primitives no other
    // Modifiers & Operators surface owns. Pixie and Fairy qualify; the
    // decomposable set/compound operators and Stepping are rendered by the
    // intermediate-operators list and the body-modifier reference, so rendering
    // them here too would put each operator's term-{slug} anchor on two elements.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="set-modifiers-tier-1"');
    const gridStart = res.text.indexOf('class="glossary-set-modifiers-grid"');
    expect(gridStart).toBeGreaterThan(0);
    const grid = res.text.slice(gridStart, res.text.indexOf('</section>', gridStart));
    expect(grid).toContain('id="term-pixie"');
    expect(grid).toContain('id="term-fairy"');
    // Tier-1 set primitives carry a glyph chip (pixie → PIX).
    expect(grid).toMatch(/id="term-pixie"[\s\S]*?<span class="set-modifier-glyph">PIX<\/span>/);
    // Decomposable operators and Stepping must not reappear as set-modifier cards.
    for (const slug of ['atomic', 'quantum', 'blurry', 'nuclear', 'barraging', 'stepping']) {
      expect(grid).not.toContain(`id="term-${slug}"`);
    }
    // The retired prose `<dl>` rendering must not survive.
    expect(grid).not.toContain('<dl class="glossary-set-modifiers">');
    // Blurry's decomposition is carried once, in the intermediate-operators list.
    const interSection = res.text.slice(res.text.indexOf('id="intermediate-operators"'), gridStart);
    expect(interSection).toMatch(/id="term-blurry"[\s\S]*?stepping paradox/);
  });

  it('structural-compression worked example renders as a four-depth equivalence ladder inside Vocabulary Relationships', async () => {
    // The worked compression example renders inside the Structural
    // compression subsection as a four-depth ladder, not the retired
    // one-liner (mobius = gyro torque = spinning same-side torque). The
    // #symbolic-compression-flow anchor is preserved on the h4.
    // Retired prose / classes: glossary-compression-one-liner,
    // glossary-compression-expanded text-muted (content lives in a <li>
    // inside glossary-equivalence-worked-example).
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    expect(flowIdx).toBeGreaterThan(0);
    const nextH4 = res.text.indexOf('glossary-equivalence-worked-heading', flowIdx + 1);
    const slice = res.text.slice(flowIdx, nextH4 > 0 ? nextH4 : flowIdx + 4000);
    // Four-depth ladder; all four readings rendered via &equiv;
    expect(slice).toMatch(/mobius/i);
    expect(slice).toMatch(/gyro torque/i);
    expect(slice).toMatch(/spinning same-side torque/i);
    expect(slice).toMatch(/spinning quantum same-side osis/i);
    // Link to ADD Accounting & Analysis is preserved.
    expect(slice).toContain('href="/freestyle/add-analysis"');
    // The retired three-card cascade must not survive.
    expect(slice).not.toContain('id="compression-step-osis"');
    expect(slice).not.toContain('id="compression-step-torque"');
    expect(slice).not.toContain('id="compression-step-mobius"');
    expect(slice).not.toContain('class="glossary-compression-flow"');
  });
});

// ---------------------------------------------------------------------------
// Landing-page "Language of Freestyle Footbag" structure invariants

describe('Freestyle landing — portal IA', () => {
  it('exposes the freestyle-portal-lede intro content-section', async () => {
    // Structural invariant: the landing renders the lede surface with the
    // documented class hooks. Copy is not pinned by this test.
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toMatch(/class="content-section freestyle-portal-lede"/);
    expect(res.text).toMatch(/class="freestyle-portal-lede-paragraph"/);
  });

  it('retires the legacy single-featured-video block in favor of the Demonstrations strip', async () => {
    // The standalone `freestyle-featured-video` block was retired; San Marino
    // is one of two hardcoded curated entries inside the demonstrations grid.
    // The legacy class must stay gone.
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('class="freestyle-featured-video"');
  });
});

// Basic Components + Core Tricks landing-grid contracts
// retired. The rich grids do not render on /freestyle; the two-band
// landing carries Start Here / Go Deeper portal
// cards. The component + core-trick content lives canonically on the
// glossary and the trick dictionary.

describe('Landing — legacy landing grids retired', () => {
  it('Basic Components grid does NOT render on /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('class="freestyle-basic-components-grid"');
    expect(res.text).not.toContain('class="freestyle-component-card"');
    expect(res.text).not.toContain('id="component-dex"');
  });

  it('Core Tricks grid does NOT render on /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).not.toContain('class="freestyle-core-trick-grid"');
    expect(res.text).not.toContain('class="core-trick-object"');
    expect(res.text).not.toContain('id="core-trick-whirl"');
    expect(res.text).not.toContain('id="core-trick-mirage"');
  });
});

describe('Freestyle landing — Featured strip', () => {
  // Competition Formats +
  // Demonstrations render as one compact `Featured` strip. Format names
  // (Routine / Circle / Sick 3 / Shred 30) are the card titles; curated
  // demonstrations follow as exemplars. Empty array hides section content.
  it('renders the Featured heading + grid', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toMatch(/class="[^"]*\bfreestyle-featured\b/);
    expect(res.text).toMatch(/<h2>Featured Videos<\/h2>/);
  });

  it('renders all four competition-format names as card titles', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toMatch(/>Routine</);
    expect(res.text).toMatch(/>Circle</);
    expect(res.text).toMatch(/>Sick 3</);
    expect(res.text).toMatch(/>Shred 30</);
  });

  it('renders both curated demonstration entries (Conlon 1998 + San Marino 2026)', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('id="featured-conlon-1998"');
    expect(res.text).toContain('id="featured-san-marino-2026"');
  });

  it('drops the retired five-slot demonstration scaffolding and pending copy', async () => {
    const res = await request(createApp()).get('/freestyle');
    for (const key of ['sam-conlon', 'classic-circle', 'artistic-routine', 'modern-technical-shred', 'educationally-readable-run']) {
      expect(res.text).not.toContain(`id="demonstration-${key}"`);
    }
    expect(res.text).not.toContain('Curated demonstration pending');
    // The retired separate sections must not survive.
    expect(res.text).not.toContain('class="freestyle-demonstrations-grid"');
    expect(res.text).not.toContain('>Competition Formats<');
  });
});

// ---------------------------------------------------------------------------
// Glossary pedagogy + compositional teaching flow invariants

describe('Freestyle glossary — [PDX] component-flag definition', () => {
  it('renders the [PDX] flag definition as mechanical (not circular)', async () => {
    // The definition marks the paradox relationship on a dexterity, states its
    // independence from [XBD] and from IN/OUT direction, and frames
    // CLIP > OP IN [DEX] as an entry example rather than the definition.
    const res = await request(createApp()).get('/freestyle/glossary');
    const pdxIdx = res.text.indexOf('id="op-flag-pdx"');
    expect(pdxIdx).toBeGreaterThan(0);
    const slice = res.text.slice(pdxIdx, pdxIdx + 800);
    expect(slice).toMatch(/marks the paradox relationship on a dexterity/);
    expect(slice).toMatch(/independent of/);
    expect(slice).toMatch(/is not an IN\/OUT direction/);
    expect(slice).toContain('CLIP &gt; OP IN [DEX]');
    expect(slice).toMatch(/common entry example, not the definition/);
    // The old circular phrasing is gone.
    expect(slice).not.toMatch(/performed in the paradox direction/);
  });
});

describe('Freestyle glossary — Batch 3: intro philosophy (C-3-B)', () => {
  it('renders the welcoming Movement Basics intro + compositional framing', async () => {
    // Phase E re-tier: §1 reframed as a welcoming "Movement Basics" intro.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/the language of freestyle footbag/);
    expect(res.text).toMatch(/vocabulary is compositional/);
    expect(res.text).toMatch(/shortest clear name/);
  });
});

describe('Freestyle glossary — Symbolic Notation / Compression layer', () => {
  it('§7 Jobs / Operational Notation carries the thesis sentence', async () => {
    // §7 is titled "Jobs / Operational Notation" and carries the
    // thesis sentence.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="section-notation"');
    expect(res.text).toMatch(
      /The language evolves by compressing recurring compositional structures\s+into shorter readable symbolic forms\./,
    );
  });

  it('§7 cross-links to the §9 symbolic-compression flow', async () => {
    // The worked compression-flow lives in §9 (Symbolic Composition).
    // Anchor #symbolic-compression-flow preserved.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="#symbolic-compression-flow"');
  });
});

describe('Freestyle glossary — Structural compression subsection', () => {
  it('renders the symbolic-compression-flow anchor inside §composition (above §connective-panels)', async () => {
    // The worked compression renders as an h4 inside the
    // Vocabulary Relationships subsection of §composition (Symbolic
    // Composition). Anchor #symbolic-compression-flow is preserved on
    // that h4 for inbound deep-links.
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const topologyIdx = res.text.indexOf('id="connective-panels"');
    expect(flowIdx).toBeGreaterThan(0);
    expect(topologyIdx).toBeGreaterThan(flowIdx);
  });

  it('renders the four-depth mobius compression ladder', async () => {
    // The curator-approved compression ladder carries 4 readings:
    // mobius → gyro torque → spinning
    // same-side torque → spinning quantum same-side osis. The deepest
    // reading is where the "compositional transformations" wow-moment
    // lands pedagogically.
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const topologyIdx = res.text.indexOf('id="connective-panels"');
    const slice = res.text.slice(flowIdx, topologyIdx);
    // Trick names in the §9 §2 list are hyperlinked; <strong>
    // wraps an <a>.
    expect(slice).toMatch(/<strong>\s*<a href="\/freestyle\/tricks\/mobius">mobius<\/a>\s*<\/strong>/i);
    expect(slice).toMatch(/gyro torque/i);
    expect(slice).toMatch(/spinning same-side torque/i);
    expect(slice).toMatch(/spinning quantum same-side osis/i);
    expect(slice).toMatch(/compression ladder/i);
    // The retired three-card cascade must not survive.
    expect(slice).not.toContain('id="compression-step-osis"');
    expect(slice).not.toContain('id="compression-step-torque"');
    expect(slice).not.toContain('id="compression-step-mobius"');
    expect(slice).not.toContain('class="glossary-compression-flow"');
  });

  it('links to the ADD Accounting & Analysis page for deeper explanation', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const topologyIdx = res.text.indexOf('id="connective-panels"');
    const slice = res.text.slice(flowIdx, topologyIdx);
    expect(slice).toContain('href="/freestyle/add-analysis"');
  });

  it('frames the wow-moment as "oh, these are compositional transformations"', async () => {
    // Replaces the prior "Three names. One trick." framing. The new
    // prose explicitly names the pedagogical pivot.
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const topologyIdx = res.text.indexOf('id="connective-panels"');
    const slice = res.text.slice(flowIdx, topologyIdx);
    expect(slice).toMatch(/wow-moment/i);
    expect(slice).toMatch(/compositional\s+transformations/i);
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

describe('Freestyle glossary — Execution mechanics subsection', () => {
  it('renders the Execution mechanics subsection heading and anchor (no source attribution)', async () => {
    // V5 editorial sweep: repetitive PassBack attribution removed; the
    // execution-mechanics anchor + heading are preserved.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="execution-mechanics"');
    expect(res.text).toMatch(/id="execution-mechanics"[^>]*>\s*Execution mechanics/);
    // The per-entry "PassBack glossary" attribution spans must be gone.
    expect(res.text).not.toContain('class="glossary-source-attrib"');
  });

  it('renders the execution-mechanics micro-entries inside §6 and the dex / phases entries elsewhere', async () => {
    // V5: alpine / symposium-mech / symple / muted live in §6 under
    // "Execution mechanics"; dex-window / hippy-leggy live in §3
    // (Dexterities); phases-sides lives in §4 (Timing Layers).
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="term-alpine"');
    expect(res.text).toContain('id="term-symposium-mech"');
    expect(res.text).toContain('id="term-symple"');
    expect(res.text).toContain('id="term-muted"');
    expect(res.text).toContain('id="term-dex-window"');
    expect(res.text).toContain('id="term-hippy-leggy"');
    expect(res.text).toContain('id="term-phases-sides"');
  });

  it('§3 "the" entry carries the PassBack pronunciation disambiguation + missed-component definition', async () => {
    // "the" ("thuh", not "thee") is a real footbag term per the PassBack
    // glossary, not a typo: a component attempted but completely missed.
    const res = await request(createApp()).get('/freestyle/glossary');
    const idx = res.text.indexOf('id="term-the"');
    expect(idx).toBeGreaterThan(0);
    const slice = res.text.slice(idx, idx + 400);
    expect(slice).toMatch(/thuh/);
    expect(slice).toMatch(/attempted but completely missed/);
  });

  it('§3 Motion style includes the full-vs-half dex fullness entry', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="term-full-half-dex"');
    const idx = res.text.indexOf('id="term-full-half-dex"');
    const slice = res.text.slice(idx, idx + 400);
    expect(slice).toMatch(/full/i);
    expect(slice).toMatch(/half/i);
  });

  it('§3 pulled/slurry/froggy follow the PassBack drag-through definitions', async () => {
    // Reconciled to the PassBack glossary: pulled and slurry are synonyms
    // (bag dragged through an uptime dex/spin before the intended component);
    // froggy is specifically a pulled spin.
    const res = await request(createApp()).get('/freestyle/glossary');
    const pulled = res.text.slice(res.text.indexOf('id="term-pulled"'), res.text.indexOf('id="term-pulled"') + 400);
    expect(pulled).toMatch(/dragged through an uptime dex/);
    const froggy = res.text.slice(res.text.indexOf('id="term-froggy"'), res.text.indexOf('id="term-froggy"') + 400);
    expect(froggy).toMatch(/pulled spin/);
  });

  it('§3 carries the new PassBack dex/duck-quality terms', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    for (const id of [
      'term-dexless', 'term-ducking', 'term-weaving',
      'term-diving', 'term-zulu', 'term-crowny',
    ]) {
      expect(res.text, `glossary carries ${id}`).toContain(`id="${id}"`);
    }
  });

  it('§4 Timing carries the PassBack "attack" term', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="term-attack"');
    const idx = res.text.indexOf('id="term-attack"');
    expect(res.text.slice(idx, idx + 400)).toMatch(/how quickly/i);
  });

  it('Symposium-mechanic micro-entry carries the single-leg-jump definition', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const idx = res.text.indexOf('id="term-symposium-mech"');
    expect(idx).toBeGreaterThan(0);
    const slice = res.text.slice(idx, idx + 600);
    expect(slice).toMatch(/active leg performs an action in a single-leg jump/);
  });

  it('Execution mechanics subsection sits inside §6, above §7', async () => {
    // execution-mechanics is a §6 subsection (modifiers/operators).
    const res = await request(createApp()).get('/freestyle/glossary');
    const sec6Idx     = res.text.indexOf('id="section-modifiers"');
    const execIdx     = res.text.indexOf('id="execution-mechanics"');
    const sec7Idx     = res.text.indexOf('id="section-notation"');
    expect(sec6Idx).toBeGreaterThan(0);
    expect(execIdx).toBeGreaterThan(sec6Idx);
    expect(sec7Idx).toBeGreaterThan(execIdx);
  });
});

describe('Freestyle glossary — §11 Family & Topology Concepts (connective panels)', () => {
  it('renders the §11 Family & Topology Concepts section with the observational badge', async () => {
    // The six connective panels
    // live in §11 (Family & Topology Concepts). The
    // id="connective-panels" anchor is preserved for inbound links
    // (anchor-preservation forever-rule).
    const res = await request(createApp()).get('/freestyle/glossary');
    const panelIdx = res.text.indexOf('id="connective-panels"');
    expect(panelIdx).toBeGreaterThan(0);
    const slice = res.text.slice(panelIdx, panelIdx + 2000);
    expect(slice).toMatch(/Family &amp; Topology Concepts/);
    expect(slice).toContain('symbolic-layer-badge');
    expect(slice).toMatch(/observational/);
    expect(slice).toMatch(/intentionally incomplete|representative selection/i);
  });
});

// ---------------------------------------------------------------------------
// Typography/layout polish for compact symbolic objects. CSS-only refinements
// plus dictionary unification (CSS-level). Most assertions are structural:
// class presence, anchor presence, ordering.

// The landing-side "symbolic-object class contract preserved" tests are
// retired. The .core-trick-object / .core-
// trick-slug / .core-trick-equivalence / core-trick-add-pending classes
// pinned the landing Core Tricks grid which no longer renders. The
// `core-tricks-grid` Handlebars partial is still in use on the
// glossary page (§5 "Other foundational atoms"), where the class
// contract is preserved and tested.

describe('Freestyle glossary — compression-flow visual continuity (compact form)', () => {
  it('symbolic-compression-flow renders zero per-step cards (collapsed to one-liner)', async () => {
    // The compression flow renders as a one-row equivalence, not the
    // retired three .core-trick-object cards. This test
    // asserts the cascade is gone; the current contract is covered above.
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    expect(flowIdx).toBeGreaterThan(0);
    const sec9Idx = res.text.indexOf('9. Movement Neighborhoods');
    const slice = res.text.slice(flowIdx, sec9Idx);
    const matches = slice.match(/class="core-trick-object glossary-compression-card"/g) ?? [];
    expect(matches.length).toBe(0);
  });

  it('thesis sentence in §8 still renders with the .glossary-thesis class', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('class="glossary-thesis"');
  });
});

describe('Freestyle dictionary — Dex view two-line row styling', () => {
  it('dict-trick-row-title elements render on the dex-count view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/class="dict-trick-row-title"/);
  });

  it('dict-trick-row-add (line-2 ADD slot) elements render on the dex-count view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/class="dict-trick-row-add"/);
  });

  it('the dex-count view renders the dict-trick-row wrapper (migrated off the shared card)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/class="dict-trick-row[^"]*"/);
    expect(res.text).not.toContain('dict-card-stack');
  });
});

// ---------------------------------------------------------------------------
// CANONICAL-SURFACE-REALIGNMENT-1 — S1 + S3 + S2

describe('Freestyle dictionary — S1+S3: ≡ equivalence rendering on dict cards', () => {
  it('legacy "aliases:" row is retired across the dictionary surface', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/class="dict-card-aliases"/);
    expect(res.text).not.toMatch(/<span class="dict-card-aliases-label">/);
  });

  it('renders ≡ readings sourced from the curator chain registry', async () => {
    // On the two-line dex-count rows, the tokenized ≡ reading renders in the
    // line-1 interpretation slot, carrying the ≡ sigil span.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/class="dict-trick-row-interpretation"/);
    expect(res.text).toMatch(/class="core-trick-equiv-sigil">&equiv;<\/span>/);
  });
});

describe('Freestyle dictionary — S2: canon-locked chain readings (torque/blender/drifter)', () => {
  it('renders torque as ≡ quantum osis', async () => {
    // Tokenized rendering wraps each operator in a sem-token span; match
    // each word independently allowing intervening markup.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/data-trick-slug="torque"[\s\S]*?quantum[\s\S]*?osis/);
  });

  it('renders blender as ≡ whirling osis (pt11)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/data-trick-slug="blender"[\s\S]*?whirling[\s\S]*?osis/);
  });

  it('holds drifter\'s decomposition: no miraging reading rendered', async () => {
    // "miraging clipper" is legacy mirage-family shorthand held for curator
    // review; drifter renders no ≡ reading rather than teach the nickname.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const idx = res.text.indexOf('data-trick-slug="drifter"');
    expect(idx).toBeGreaterThan(-1);
    const next = res.text.indexOf('data-trick-slug=', idx + 1);
    const win = res.text.substring(idx, next > -1 ? next : idx + 4000);
    expect(win).not.toMatch(/miraging/);
  });
});

describe('Freestyle dictionary — S3: alias-governance allow-list filtering', () => {
  it('filters out orthographic-only alias rows (legover ≡ leg-over hidden)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('leg over');
  });

  it('filters out Wave-2-pending alias rows (osis ≡ frigidosis hidden)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('frigidosis');
  });

  it('filters out different-trick alias rows (swirl ≡ reverse swirl hidden)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // 'reverse swirl' as an alias of swirl should NOT appear as an ≡ reading.
    // (If reverse-swirl exists as its own canonical row, that's a different
    // surface; this assertion only checks the alias-row pathway.)
    expect(res.text).not.toMatch(/class="core-trick-equivalence[^"]*"[^>]*>[\s\S]{0,40}reverse swirl/);
  });

  it('atom dictionary rows surface curator-authored op-notation via the two-line JOB slot', async () => {
    // Atoms (first-class) carry their curator JOB chain on line 2 of the
    // two-line row (dict-trick-row-job-value), sourced from firstClassChainValue,
    // including the (midtime) marker. No shared-card op-notation chip.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    const atwIdx = res.text.indexOf('data-trick-slug="around_the_world"');
    expect(atwIdx).toBeGreaterThan(0);
    const atwCardEnd = res.text.indexOf('</article>', atwIdx);
    const atwCard = res.text.slice(atwIdx, atwCardEnd);
    // No shared-card op-notation chip.
    expect(atwCard).not.toMatch(/<code class="dict-card-notation/);
    // Line-2 JOB slot carries the resolved symbolic chain.
    expect(atwCard).toMatch(/class="dict-trick-row-label">JOB</);
    expect(atwCard).toMatch(/class="dict-trick-row-job-value">[\s\S]*?TOE[\s\S]*?\[DEX\]/);
  });
});
