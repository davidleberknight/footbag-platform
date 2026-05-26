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
  // paradox-mirage is non-core with a resolvable base; surfaces both a
  // chain reading (Slice A3, 2026-05) AND the base_trick lineage.
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage',
    canonical_name: 'paradox mirage',
    adds: '3',
    base_trick: 'mirage',
  });
  // Synthetic test fixture: non-core with a resolvable base and
  // intentionally NO chain entry — tests Layer 3 lineage rendering.
  // Previously seeded as 'parkwalk' but Pre-Red completion sweep
  // (2026-05-16) added a chain entry for parkwalk (FM+PB agree on
  // 'pixie butterfly'); synthetic fixture avoids future chain-registry
  // drift collisions, matching the nf2b-gap convention used for the
  // Layer-5b fixture below.
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
  insertFreestyleTrick(db, { slug: 'around-the-world', canonical_name: 'around the world', adds: '2', notation: 'ATW' });
  insertFreestyleTrickAlias(db, 'atw', 'around-the-world', 'atw');

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

  // ── Phase 1: cross-link moves → dictionary ───────────────────────────────
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
    expect(res.text).not.toContain('/freestyle/tricks/terraging-double-pixie');
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
    expect(res.text).toContain('id="move-terraging-double-pixie"');
    expect(res.text).toContain('id="move-rooting-rooted"');
    expect(res.text).toContain('id="move-fairy-atomic"');
    expect(res.text).toContain('id="move-go-go"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/moves — legacy URL redirects to /freestyle/sets/reference', () => {
  it('301-redirects to /freestyle/sets/reference (Phase B routing migration)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/moves');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/sets/reference');
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

  it('landing page surfaces Operators & Modifiers as a Go Deeper card linking to /freestyle/operators', async () => {
    // Phase C (2026-05-22): the two-band landing carries an "Operators &
    // Modifiers" card in the Go Deeper band with a single outbound CTA to
    // /freestyle/operators. No embedded operator-board on the landing.
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('<div class="card-title">Operators &amp; Modifiers</div>');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).not.toContain('class="operator-board ');
    expect(res.text).not.toContain('class="operator-board-footer-link"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/operators (Phase B promotion of glossary §6)', () => {
  // 2026-05-18 sets_components_surface_recommendation Option C: pure URL
  // promotion of the modifier-reference content from /freestyle/glossary §6.
  // Both pages render the same `freestyle-modifier-reference` partial; the
  // operators page wraps it with its own hero + breadcrumbs.

  it('returns 200 with page title', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Operators &amp; Modifiers');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.text).toMatch(/<a href="\/freestyle">Freestyle<\/a>/);
  });

  it('renders the modifier-reference partial content (same as glossary §6)', async () => {
    // Key anchors from the partial: term-paradox, term-stepping,
    // term-spinning, intermediate-operators dl, set-modifiers grid.
    const res = await request(createApp()).get('/freestyle/operators');
    // Surface A modifier feel cards (any one slug)
    expect(res.text).toContain('class="glossary-modifier-card"');
    // Surface B advanced reference (paradox formula chip)
    expect(res.text).toContain('id="term-paradox"');
    expect(res.text).toContain('glossary-paradox-formula');
    // Intermediate operators dl
    expect(res.text).toContain('id="intermediate-operators"');
    // Execution mechanics dl
    expect(res.text).toContain('id="execution-mechanics"');
    // Set modifiers grid
    expect(res.text).toContain('id="set-modifiers-tier-1"');
  });

  it('renders cross-links to the dictionary movement-system view and ADD analysis', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });
});

describe('GET /freestyle/observational — observational-layer trick entries', () => {
  // 2026-05-18 implementation slice of observational_layer_proposal.md.
  // Layer separation contract: observational entries never cross into
  // canonical surfaces; they surface only on this route. Cards are
  // visually distinct (no hashtag, no trick-detail link, observational
  // badge).

  it('returns 200 with page title', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    // 2026-05-23 public-label rename: "Observed Tricks" → "Emerging Vocabulary".
    expect(res.text).toContain('Emerging Vocabulary');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toMatch(/<a href="\/freestyle">Freestyle<\/a>/);
  });

  it('renders the observational layer note + canonical references', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toContain('class="observational-layer-note"');
    expect(res.text).toMatch(/where the official tricks live/i);
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });

  it('renders the observational-safe expansion cohort (≥ 50 entries across claim buckets)', async () => {
    // 2026-05-23 Slice 7-OBS-A: 9 PassBack folk-name compounds promoted
    // to canonical under FM dex-count convention (bladerunner /
    // bling-blang / cold-fusion / flurricane / golden-shower / goliath /
    // gybas / motion-sickness / pandemonium). Combined with prior Wave 5
    // + Wave 7 promotions the observational cohort floor sits in the
    // 50-55 range; the assertion stays generous.
    const res = await request(createApp()).get('/freestyle/observational');
    // Spot-check from the residual observational-safe cohort. Includes
    // the folk-/semantic-frontier names that remain post-Slice-7-OBS-A.
    for (const name of [
      'Anonymous', 'GDLO', 'Ghost', 'Johnny Vodka', 'Kiwi',
      'Pandora’s Box', 'Trixie', 'Your Mom',
    ]) {
      const probe = name.split(/[’']/)[0];
      expect(res.text, `missing expansion entry: ${name}`).toContain(probe);
    }
    const cards = res.text.match(/class="observed-card"/g) ?? [];
    expect(cards.length).toBeGreaterThanOrEqual(50);
  });

  it('previously-canonicalized entries (assassin / big-apple / mantis) do NOT appear in the observational layer', async () => {
    // Regression test for 2026-05-18 layer-coexistence finding.
    //
    // FM Slice X Path B pilot canonical 2026-05-17 promoted these three
    // slugs to canonical (freestyle_tricks.slug) but did not remove the
    // observational entries — the canonical-promotion process documented
    // in the content module's JSDoc says "move the row to inputs/
    // curated/tricks/<slug>.txt + re-run loader + REMOVE the
    // observational entry", but the third step was skipped.
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
    // Compact-card pattern (A2/A3/A4 redesign): the verbose
    // "observational · {sourceLabel}" prose is replaced by a 2-letter
    // source badge with title/aria-label carrying the full source
    // citation. Badge variants are PB / FM / SG / FF / FB / OTHER
    // (FB added 2026-05-20 for footbag.org /newmoves source).
    const res = await request(createApp()).get('/freestyle/observational');
    const badgeMatches = res.text.match(
      /class="observed-card-source-badge observed-card-source-badge--(PB|FM|SG|FF|FB|OTHER)"[^>]*title="[^"]+"[^>]*>(PB|FM|SG|FF|FB|OTHER)</g,
    ) ?? [];
    // At least one PB badge present (PassBack is the dominant source).
    expect(badgeMatches.length).toBeGreaterThanOrEqual(1);
    expect(res.text).toMatch(/observed-card-source-badge--PB/);
  });

  it('every card carries a status chip with a pre-shaped tone class', async () => {
    // The status chip replaces the old "Status: ..." prose line. Tone
    // variants are neutral / accent / muted; pending-review entries use
    // the neutral tone.
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toMatch(/class="observed-card-status-chip observed-card-status-chip--neutral"/);
  });

  it('renders cards as a flat alphabetical list (NO canonical ADD-bucket grouping)', async () => {
    // Observed tricks are NOT canonical resolved tricks; grouping by
    // external ADD claim would imply canonical classification this
    // layer does not have the authority to assert. The page renders
    // a single flat sorted card grid.
    const res = await request(createApp()).get('/freestyle/observational');
    // No bucket heading classes at all (legacy from prior canonical-
    // implying grouping).
    expect(res.text).not.toMatch(/class="observed-bucket-heading"/);
    expect(res.text).not.toMatch(/class="observed-bucket-count"/);
    // No "N ADD" headers either (canonical-implying).
    expect(res.text).not.toMatch(/<h2[^>]*>\s*\d+ ADD/);
    // Exactly one observed-card-grid element exists (the flat list).
    const grids = res.text.match(/class="observed-card-grid"/g) ?? [];
    expect(grids.length).toBe(1);
  });

  it('orders cards by the source claim numeric (asc), with displayName as the tiebreak', async () => {
    // 2026-05-23 regression slice: observational cards now sort by
    // the source's numeric claim (proposedAddTotal) ascending, with
    // entries lacking a claim sorting last and displayName tiebreaking
    // within an equal-claim bucket. Use two known fixture rows:
    //   - 'Big Orange' has proposedAddTotal=1
    //   - 'Bladerunner' has proposedAddTotal=3
    // Big Orange must precede Bladerunner under claim-asc.
    const res = await request(createApp()).get('/freestyle/observational');
    const orangeIdx = res.text.indexOf('Big Orange');
    const bladeIdx  = res.text.indexOf('Bladerunner');
    expect(orangeIdx).toBeGreaterThan(0);
    expect(bladeIdx).toBeGreaterThan(0);
    expect(orangeIdx).toBeLessThan(bladeIdx);
  });

  it('cards with extra readings or notes render a <details> expansion', async () => {
    // hasDetails fires when any of additionalReadings, formula, note,
    // or blockers is non-empty. Bladerunner's merged entry has two
    // readings, so it must have <details>.
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toMatch(/class="observed-card-details"/);
    expect(res.text).toMatch(/class="observed-card-details-summary"[^>]*>\s*More/);
  });

  it('renders the source-summary chip strip beneath canonical references', async () => {
    // content.sources collects unique source badges represented across
    // the page. Renders only when content.sources.length > 0.
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.text).toMatch(/class="observed-source-strip"/);
    expect(res.text).toMatch(
      /class="observed-source-strip-item observed-source-strip-item--PB"[^>]*>PB</,
    );
  });

  it('observational cards have NO hashtag chip (canonical-only convention)', async () => {
    // Identity-layer contract from curated_vs_observational_boundary.md
    // forever-invariant #2: observational entries never get #-tag chips.
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
    // they're now canonical and were removed from the observational
    // module 2026-05-18.
    for (const folkSlug of [
      'blizzard', 'blaze', 'bedwetter', 'sole-survivor',
      'anonymous', 'bladerunner', 'gdlo', 'gybas',
      'pandora-s-box', 'scorpion-s-tail', 'your-mom',
    ]) {
      expect(cardsRegion, `forbidden detail-page link for observational ${folkSlug}`)
        .not.toContain(`/freestyle/tricks/${folkSlug}`);
    }
  });

  it('observational ADD framing: cards show source-attributed external claims, NOT canonical ADD chips', async () => {
    // Observed tricks are NOT canonical resolved tricks. Per-card
    // external-claim labels are framed by source ('PB claim: 4',
    // 'FM claim: 5') rather than as canonical ADD values. The bare
    // 'N ADD' label is explicitly forbidden in this layer.
    const res = await request(createApp()).get('/freestyle/observational');
    // Source-attributed external-claim label present.
    expect(res.text).toMatch(/class="observed-card-external-claim"[^>]*>(PB|FM|SG|FF|OTHER) claim: \d+</);
    // Bare 'N ADD' label NOT present on cards (was the canonical-implying
    // form that this refactor explicitly removed).
    expect(res.text).not.toMatch(/class="observed-card-add"/);
    // No canonical chip styling on observed cards.
    expect(res.text).not.toMatch(/class="observed-card"[^>]*>[\s\S]{0,400}class="dict-card-add"/);
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
      // canonical (promoted 2026-05-17) and legitimately appear on those pages.
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
      // canonical (promoted 2026-05-17) and legitimately appear on those pages.
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
      // canonical (promoted 2026-05-17) and legitimately appear on those pages.
      'Blizzard', 'Blaze', 'Bedwetter', 'Sole Survivor',
      'Anonymous', 'Bladerunner', 'Flurricane', 'Locomotion', 'Your Mom',
    ]) {
      expect(res.text, `observational ${name} leaked onto landing`)
        .not.toContain(name);
    }
  });

  it('expansion-cohort entries with null proposedAddFormula render without the formula block', async () => {
    // Phase A.1 contract: the 65 Batch B expansion entries set
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

  // The "merged Bladerunner entry" test was retired in Slice 7-OBS-A
  // (2026-05-23): bladerunner was promoted from Emerging Vocabulary to a
  // canonical row under the FM dex-count convention. Its proposed-readings
  // pair lives in resolved-formulas provenance metadata, not on the
  // observational page. The multi-reading merge invariant is still
  // covered by other entries (e.g. goliath was similar before promotion;
  // big-orange / king-koopa / super-mario remain observational with
  // multi-reading arrays).
  it('a multi-reading observational entry still renders all readings', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    // Big Orange has two proposed readings: 'Spinning near Symp. Flux'
    // and 'Rev. Big Apple'.
    expect(res.text).toContain('Spinning near Symp. Flux');
    expect(res.text).toContain('Rev. Big Apple');
  });
});

describe('GET /freestyle/operators — orientation lede', () => {
  it('orientation lede cross-links to the By Movement System dictionary view', async () => {
    const res = await request(createApp()).get('/freestyle/operators');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
  });
});

describe('GET /freestyle/glossary §6 partial reuse (same content as /freestyle/operators)', () => {
  it('glossary §6 carries the same modifier feel cards as /freestyle/operators (shared partial)', async () => {
    // The shared `freestyle-modifier-reference` partial guarantees both
    // surfaces stay in sync. Spot-check that the partial-rendered fragments
    // appear in both.
    const glossary  = await request(createApp()).get('/freestyle/glossary');
    const operators = await request(createApp()).get('/freestyle/operators');
    for (const anchor of [
      'id="term-paradox"',
      'id="intermediate-operators"',
      'id="execution-mechanics"',
      'id="set-modifiers-tier-1"',
      'class="glossary-modifier-card"',
    ]) {
      expect(glossary.text,  `glossary missing ${anchor}`).toContain(anchor);
      expect(operators.text, `operators missing ${anchor}`).toContain(anchor);
    }
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
    // V5: §7 carries the notation thesis (with Jobs notation reference
    // preserved as the historical name of the semantic layer); §composition
    // hosts the worked structural-compression treatment as part of the
    // Vocabulary Relationships subsection (2026-05-25). §5 hosts the
    // core trick structures grid.
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

  it('surfaces a curator-adjudicated lineage line on the nuclear entry', async () => {
    // V5 editorial sweep: individual / sprint references stripped from
    // operator-reference prose. Lineage line now reads as institutional
    // attribution.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('Curator-adjudicated decomposition.');
  });

  it('documents the two-reading Fury ambiguity on the furious entry', async () => {
    // V5 editorial sweep: sprint-numbered adjudication framing removed; the
    // structural-ambiguity content (two readings of Fury) is preserved.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toMatch(/two structural readings/);
    expect(res.text).toMatch(/barraging paradox mirage/);
    expect(res.text).toMatch(/furious paradox mirage/);
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

  it('surfaces +0 directional status on inspinning', async () => {
    // V5 editorial sweep: pt## lineage strings removed. The mechanical
    // facts (directional variant, +0 ADD) are preserved.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    const inspinIdx = res.text.indexOf('id="term-inspinning"');
    expect(inspinIdx).toBeGreaterThan(0);
    const slice = res.text.slice(inspinIdx, inspinIdx + 2000);
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

  it('F7 — reference-media tiles surface their hashtag chip strip', async () => {
    // LANDING-AND-TRICKS-QA-REALIGNMENT-1 F7: visible hashtag layer on every
    // curated media tile. The ref-media-audit fixture seeds tags
    // [#ref-media-audit, #freestyle, #trick] on each item; the browse-surface
    // suppression policy hides #freestyle (freestyle-only surface) and #trick
    // (universal), leaving the trick-slug chip.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ref-media-audit');
    // Scope to the tutorial tile to avoid catching tags from elsewhere on the page.
    const tutSubIdx = res.text.indexOf('reference-media-subsection--tutorials');
    expect(tutSubIdx).toBeGreaterThan(0);
    const subsectionEnd = res.text.indexOf('</div>', tutSubIdx);
    const slice = res.text.slice(tutSubIdx, subsectionEnd + 6);
    // The strip wrapper renders once per tile (one tile here).
    expect((slice.match(/class="media-tag-strip"/g) ?? []).length).toBe(1);
    // The trick-slug chip surfaces.
    expect(slice).toMatch(/<li class="media-tag-chip media-tag-chip--trick">#ref-media-audit<\/li>/);
    // The suppressed tags must NOT surface as chips.
    expect(slice).not.toMatch(/<li class="media-tag-chip[^"]*">#freestyle<\/li>/);
    expect(slice).not.toMatch(/<li class="media-tag-chip[^"]*">#trick<\/li>/);
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
    // Section wrapper present. 2026-05-24: section heading renamed to
    // "Set notation" per the notation-display audit's label-normalization
    // recommendation (public-facing surfaces use accessible terms; the
    // first-class comparative-row keeps the compact JOB/ADD/ALT labels).
    // The section is rendered only for non-first-class tricks (the
    // trick-notation-summary card carries the compact JOB row on
    // first-class pages).
    expect(res.text).toContain('class="content-section operational-notation-display"');
    expect(res.text).toContain('<h2>Set notation</h2>');
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
    // Pre-Adrian polish #1 (2026-05-26): the S5 tokenizer expands
    // `ss → same-side` and `op → opposite` at render time so the
    // chain reading vocabulary matches the JOB notation register. The
    // underlying chain data still stores the short forms; only the
    // rendered text changes.
    expect(res.text).toMatch(/>gyro<\/span>\s*<span[^>]*>torque</);            // reading 0 (no abbreviations)
    expect(res.text).toMatch(/>spinning<\/span>\s*<span[^>]*>same-side</);     // reading 1 (ss → same-side)
    expect(res.text).toMatch(/>miraging<\/span>\s*<span[^>]*>opposite</);      // reading 2 (op → opposite)
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
    // Synthetic test fixture used in place of parkwalk after the
    // Pre-Red 2026-05-16 sweep added a curator-confirm-pending chain
    // entry for parkwalk. The fixture matches the same conditions:
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
// O1c (2026-05-10) — operational notation glossary subsection on
// /freestyle/glossary. Adds §9 "Operational Notation" with per-token
// anchor IDs for deep-linking from trick-detail Token-reference link.
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/glossary — operational notation subsection (O1c)', () => {
  it('renders the Operational Notation subsection with its deep-link target id', async () => {
    // V5: operational notation lives as an Advanced Reference subsection
    // under §7 (Symbolic Notation), not as a top-level section. The deep-
    // link anchor id="operational-notation" is preserved for inbound links.
    // Phase 1 polish: the subsection is now wrapped in a <details>/<summary>
    // collapsible (default-closed) for progressive disclosure. The anchor
    // migrated from the <h3> to the <details> element; the title text now
    // lives in the <summary>. All #op-* child anchors remain reachable
    // (browsers auto-open <details> when navigating to a child anchor).
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="operational-notation"');
    // Anchor proximity to title text — holds for both the old <h3> shape
    // and the new <details>/<summary> shape.
    expect(res.text).toMatch(/id="operational-notation"[\s\S]{0,400}Operational notation/);
    // Phase 1 shape: the subsection is collapsed in a <details> element.
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
    // 14-section IA refactor (2026-05-19): the prior §10 ADD System moved
    // up to §8 ADD Accounting; §11 Community & Historical Vocabulary split
    // into §12 Community Vocabulary + §13 Historical Terms; §12 Sources
    // renumbered to §14. The trick-level ADD definition is preserved.
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('id="section-add-accounting"');
    expect(res.text).toContain('id="section-community"');
    expect(res.text).toContain('id="section-sources"');
  });
});

describe('Coherence Cleanup Slice — Phase 3 safe corrective fixes (2026-05-17)', () => {
  it('ADD Accounting section carries id="traditional-reference" + #run-quality anchor (history.hbs inbound link)', async () => {
    // The traditional-reference + run-quality anchors are preserved
    // post 2026-05-19 refactor (anchor-preservation forever-rule), now
    // living inside §8 ADD Accounting instead of the prior §10.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="traditional-reference"');
    expect(res.text).toContain('id="run-quality"');
  });

  it('ADD Accounting section cross-links to combo-analysis for run-level vocabulary', async () => {
    // 14-section IA refactor (2026-05-19): ADD Accounting is §8 with
    // dedicated subsections + worked examples. The cross-link to
    // combo-analysis for run-quality / format vocabulary is preserved
    // at the section footer.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/combo-analysis"');
    // §10 Run Architecture is the new explicit anchor section for run-
    // level material; its cross-link to combo-analysis must also exist.
    expect(res.text).toContain('id="section-run-architecture"');
  });

  it('history page deep-links to the live #run-quality anchor on combo-analysis', async () => {
    // 2026-05-17: history.hbs #run-quality links rewired from glossary to
    // combo-analysis after the §10 relocation. The old #1-add-system--run-quality
    // anchor was already retired in the Coherence Cleanup Slice.
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/combo-analysis#run-quality"');
    expect(res.text).not.toContain('/freestyle/glossary#run-quality');
    expect(res.text).not.toContain('#1-add-system--run-quality');
  });

  it('history "How Combos Grew" links to movement-system browse view', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
  });

  it('glossary §11 source-families list carries verified outbound hyperlinks', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="https://www.footbag.org/"');
    expect(res.text).toContain('href="https://www.footbag.org/newmoves/list"');
    expect(res.text).toContain('href="https://www.footbagmoves.com/"');
  });

  it('glossary §11 outbound links carry rel="noopener noreferrer" + target="_blank"', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Each verified outbound URL should appear with both attributes.
    const checks = [
      'https://www.footbag.org/',
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

  it('§11 spyro→inspin row carries the active-slug clarification', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // The annotation makes the directionality of the historical mapping explicit.
    expect(res.text).toMatch(/spyro<\/em>\s+is the active dictionary slug/);
    expect(res.text).toMatch(/inspin<\/em>\s+is a folk synonym/);
  });

  it('category view renders the soft-retirement notice pointing to canonical replacements', async () => {
    // CR-4 of dictionary-coherence-2026-05-18: the grammatical-role
    // explanatory note ("Grouped by grammatical role...") is replaced by
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

describe('Glossary improvements + history refresh (2026-05-17)', () => {
  // Implementations of glossary_improvement_recommendations.md HIGH+MEDIUM
  // priority items + HISTORY_PAGE_CONDENSED.md sections.
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
  // History recommendations implemented:
  //   #1 §1 Two-Phase Story opening
  //   #2 §4 ADD System additive-accounting sentence
  //   #3 §5 combo-architecture vocabulary mention
  //   #4 §7 Movement Language Maturation new sub-section
  //
  // Deferred (depend on unimplemented surfaces):
  //   History combo-analysis cross-link (page not built)
  //   History v7 evolution-report cross-link (no public route)
  //   Glossary recs #5 (attribution) + #9 (regional variation) — editorial review

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

  it('glossary §5 carries the whirl network-attractor note', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-network-attractor-note');
    expect(res.text).toMatch(/central attractor/);
    expect(res.text).toMatch(/blurry whirl\s*&rarr;\s*whirl|blurry whirl\s*→\s*whirl/);
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
    // P3 expansion (2026-05-20): the "additive structural accounting"
    // definition is preserved in the §8 philosophy paragraph; the
    // mobius worked example is now a structured card in the §8 worked-
    // examples grid (compactNotation "gyro torque" + derivation visible).
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/additive structural accounting/);
    expect(res.text).toContain('id="add-example-mobius"');
    expect(res.text).toMatch(/gyro torque/);
  });

  it('combo-analysis page carries anchor IDs on each run-quality tier + format term (relocated from glossary §10 on 2026-05-17)', async () => {
    // Relocation history: these anchors lived on /freestyle/glossary §10
    // until 2026-05-17, then moved to /freestyle/combo-analysis when that
    // surface shipped as the canonical home for run-level vocabulary.
    // The combo-analysis route-test file also covers these; the assertion
    // here documents the relocation contract.
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
    // P2 prose compression (2026-05-20): the 200-word framing block
    // compressed into a single sentence. The .glossary-about-framing
    // hook + the "footbag community built informally" attribution are
    // preserved for inbound deep-links + community-attribution semantics.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-about-framing');
    expect(res.text).toMatch(/footbag community built informally/);
  });

  it('history page renders the Two-Phase Story opening before Competitive Eras', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('The Two-Phase Story');
    const twoPhaseIdx = res.text.indexOf('The Two-Phase Story');
    const erasIdx = res.text.indexOf('Competitive Eras');
    expect(twoPhaseIdx).toBeGreaterThan(0);
    expect(erasIdx).toBeGreaterThan(twoPhaseIdx);
    expect(res.text).toMatch(/vocabulary building/);
    expect(res.text).toMatch(/vocabulary maturation/);
  });

  it('history ADD System section carries the additive-accounting note', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('history-add-system-decomposition-note');
    expect(res.text).toMatch(/ADD treats a trick as a decomposable structure/);
    expect(res.text).toMatch(/<em>mobius<\/em>\s+as\s+"gyro torque"/);
  });

  it('history "How Combos Grew" mentions combo-architecture vocabulary', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('history-combo-architecture-note');
    expect(res.text).toMatch(/setup tricks/);
    expect(res.text).toMatch(/resolution tricks/);
    expect(res.text).toMatch(/concentration vs breadth/);
  });

  it('history renders Movement Language as the Modern Vocabulary section after Modern Game', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    expect(res.text).toContain('Movement Language as the Modern Vocabulary');
    const modernGameIdx  = res.text.indexOf('The Modern Game');
    const movementLangIdx = res.text.indexOf('Movement Language as the Modern Vocabulary');
    expect(modernGameIdx).toBeGreaterThan(0);
    expect(movementLangIdx).toBeGreaterThan(modernGameIdx);
    expect(res.text).toMatch(/four formal\s+layers/);
    expect(res.text).toMatch(/<em>mobius = gyro torque<\/em>/);
    expect(res.text).toMatch(/<em>paradox = CLIP &gt; OP IN \[DEX\]<\/em>/);
  });

  it('Movement Language section links to dictionary + glossary', async () => {
    const res = await request(createApp()).get('/freestyle/history');
    const movementLangIdx = res.text.indexOf('Movement Language as the Modern Vocabulary');
    const sourceNoteIdx   = res.text.indexOf('class="source-note"');
    expect(movementLangIdx).toBeGreaterThan(0);
    expect(sourceNoteIdx).toBeGreaterThan(movementLangIdx);
    const slice = res.text.slice(movementLangIdx, sourceNoteIdx);
    expect(slice).toContain('href="/freestyle/tricks"');
    expect(slice).toContain('href="/freestyle/glossary"');
  });
});

describe('Formula Accountability Corrective Slice (2026-05-17)', () => {
  // Implementations covering all five primary tasks:
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
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    for (const slug of ['mirage', 'butterfly']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx, `${slug} card not found in dictionary`).toBeGreaterThan(0);
      const cardEnd = res.text.indexOf('</article>', idx);
      const card = res.text.slice(idx, cardEnd);
      // Card still renders; title + ADD chip present.
      expect(card).toContain('dict-card-title');
      expect(card).toContain('dict-card-add');
      // "core atom" prose + class do NOT render to public surfaces.
      expect(card, `${slug} card must not render "core atom" prose`).not.toMatch(/core atom/);
      expect(card).not.toContain('dict-card-equivalence--core-atom');
    }
  });

  it('ADD Analysis worked examples render a Derivation line on every entry', async () => {
    // Handlebars escapes `=` to `&#x3D;` by default, so regex patterns
    // accept either form across the derivation strings.
    //
    // 2026-05-18 foundational-formula slice: worked examples expanded
    // from 8 → 17 (full coverage of foundational atoms + the existing
    // compound flagships). The 1- and 2-ADD atoms now use the explicit
    // primitive-decomposition style (stall / dex / xbody / spin), so
    // earlier spot-checks like "clipper(1) = 1 ADD" and "mirage(2) =
    // 2 ADD" no longer match; replace with the primitive forms.
    const eq = '(?:=|&#x3D;)';
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.status).toBe(200);
    const derivationMatches = res.text.match(/class="add-analysis-derivation-line"/g) ?? [];
    expect(derivationMatches.length).toBe(17);  // 17 worked examples post-foundational-formula slice
    // Spot-check the formulaic content (entity-tolerant).
    expect(res.text).toMatch(new RegExp(`stall\\(1\\)\\s*${eq}\\s*1 ADD`));         // toe-stall
    expect(res.text).toMatch(new RegExp(`xbody\\(1\\)\\s*${eq}\\s*1 ADD`));        // clipper (kick)
    expect(res.text).toMatch(new RegExp(`dex\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*2 ADD`));    // mirage / illusion / pickup / legover
    expect(res.text).toMatch(new RegExp(`xbody\\(1\\)\\s*\\+\\s*dex\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*3 ADD`)); // whirl / swirl
    expect(res.text).toMatch(new RegExp(`spin\\(1\\)\\s*\\+\\s*xbody\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*3 ADD`));// osis
    expect(res.text).toMatch(new RegExp(`miraging\\(\\+1\\)\\s*\\+\\s*osis\\(3\\)\\s*${eq}\\s*4 ADD`));
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

  it('ADD Analysis paradox component class surfaces the canonical formula', async () => {
    const res = await request(createApp()).get('/freestyle/add-analysis');
    expect(res.text).toMatch(/Paradox itself reads as PDX/);
    expect(res.text).toMatch(/CLIP &gt; OP IN \[DEX\]/);
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
    // — both were the pre-Formula-Accountability misleading-alias
    // pattern. The "reverse around-the-world" string is now a
    // legitimate orbit-card reading (curator-confirmed alias mapping,
    // 2026-05-18 foundational-formula correction) and is no longer
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

  it('landing surfaces Trick Dictionary + Glossary CTAs (now via portal cards, not the retired top-reference-jump nav)', async () => {
    // History: the original "Where to go next" three-link orientation
    // block was retired in Slice K (2026-05-16) in favor of a compact
    // top-of-page reference jump (.freestyle-top-reference-jump).
    // 2026-05-18 landing reorganization removed the top-reference-jump
    // band per Dave audit #16 (DRY violation — portal cards below
    // already carry Dictionary + Glossary CTAs). The contract these
    // assertions enforce is now about reachability of those CTAs from
    // the landing, regardless of which surface carries them.
    const res = await request(createApp()).get('/freestyle');
    // Top-reference-jump nav band must be gone (DRY fix).
    expect(res.text).not.toContain('class="freestyle-top-reference-jump"');
    expect(res.text).not.toMatch(/<a class="freestyle-top-reference-link"/);
    // Trick Dictionary + Glossary CTAs are now reachable via the
    // portal cards.
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('Browse the trick dictionary');
    expect(res.text).toContain('Open the glossary');
    // /freestyle/sets is now reachable from the landing via the Set
    // Encyclopedia portal card (added 2026-05-25 as part of the pre-
    // Adrian set-surface polish; the route was promoted from a 301
    // redirect to a standalone minimalist index in the same slice).
    expect(res.text).toContain('href="/freestyle/sets"');
    expect(res.text).toContain('Set encyclopedia');
    // The retired "Where to go next" heading must not appear.
    expect(res.text).not.toContain('Where to go next');
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
    expect(res.text).toContain('href="/freestyle/sets/reference"');
  });

  it('operator board renders a Symposium definition consistent with its single-leg-jump mechanics', async () => {
    // Second-pass landing cleanup (2026-05-20) removed the embedded
    // operator-board from /freestyle. The Symposium-action invariant still
    // holds on the operator-board partial wherever it renders; we now
    // assert it against /freestyle/learn, the remaining operator-board
    // host surface.
    const res = await request(createApp()).get('/freestyle/learn');
    expect(res.text).toMatch(/Active leg jumps \+ lands solo/i);
    // The pre-2026-05 "illusion + body rotation" misreading must not reappear.
    expect(res.text).not.toContain('An illusion combined with body rotation');
  });

  it('§5 Core Trick Families renders as the registry-style core-trick grid; pixie/fairy stay in §6 set-modifiers', async () => {
    // 14-section IA refactor (2026-05-19): §5 renamed from "Core Trick
    // Structures" to "Core Trick Families". Content + anchors preserved.
    const res = await request(createApp()).get('/freestyle/glossary');
    const sec5Heading = res.text.indexOf('id="section-families"');
    const setModSection = res.text.indexOf('id="set-modifiers-tier-1"');
    expect(sec5Heading).toBeGreaterThan(0);
    expect(setModSection).toBeGreaterThan(sec5Heading);
    const gridSlice = res.text.slice(sec5Heading, setModSection);
    // All 11 foundational atoms render as registry tiles with `#term-{slug}` anchors.
    for (const slug of ['clipper-stall', 'mirage', 'legover', 'pickup', 'illusion', 'whirl', 'butterfly', 'swirl', 'osis', 'around-the-world', 'orbit']) {
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

  it('set-modifiers grid renders pixie/fairy/stepping (Tier-1) plus atomic/quantum/blurry/nuclear/barraging/furious (intermediate)', async () => {
    // Set-modifier registry grid projected from the Tier-1 operator board
    // plus OPERATOR_REFERENCE_ENTRIES set/compound-set entries.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="set-modifiers-tier-1"');
    const setModSection = res.text.indexOf('id="set-modifiers-tier-1"');
    const afterSetMod = res.text.slice(setModSection);
    expect(afterSetMod).toContain('class="glossary-set-modifiers-grid"');
    // All 9 entries surface as set-modifier-card tiles with #term-{slug} anchors.
    for (const slug of ['pixie', 'fairy', 'stepping', 'atomic', 'quantum', 'blurry', 'nuclear', 'barraging', 'furious']) {
      expect(afterSetMod).toContain(`id="term-${slug}"`);
    }
    // Tier-1 entries carry a glyph chip (pixie → PIX); intermediate entries surface their decomposition.
    expect(afterSetMod).toMatch(/id="term-pixie"[\s\S]*?<span class="set-modifier-glyph">PIX<\/span>/);
    expect(afterSetMod).toMatch(/id="term-blurry"[\s\S]*?<p class="set-modifier-decomposition">[\s\S]*?stepping paradox/);
    // The retired prose `<dl>` rendering must not survive.
    expect(afterSetMod).not.toContain('<dl class="glossary-set-modifiers">');
  });

  it('structural-compression worked example renders as a four-depth equivalence ladder inside Vocabulary Relationships', async () => {
    // 2026-05-25 Vocabulary Relationships expansion: the prior one-liner
    // (mobius = gyro torque = spinning same-side torque) was folded into
    // the Structural compression subsection as a four-depth ladder. The
    // #symbolic-compression-flow anchor is preserved on the new h4.
    // Retired prose / classes: glossary-compression-one-liner,
    // glossary-compression-expanded text-muted (paragraph wrappers
    // gone — content now in a <li> inside glossary-equivalence-worked-
    // example).
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    expect(flowIdx).toBeGreaterThan(0);
    const nextH4 = res.text.indexOf('glossary-equivalence-worked-heading', flowIdx + 1);
    const slice = res.text.slice(flowIdx, nextH4 > 0 ? nextH4 : flowIdx + 4000);
    // Four-depth ladder; all four readings rendered via &equiv;
    expect(slice).toMatch(/mobius/i);
    expect(slice).toMatch(/gyro torque/i);
    expect(slice).toMatch(/spinning same-side torque/i);
    expect(slice).toMatch(/spinning miraging same-side osis/i);
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

describe('Freestyle landing — portal IA (post 2026-05-19 refactor)', () => {
  it('exposes a freestyle-portal-lede content-section containing at least one freestyle-portal-lede-paragraph', async () => {
    // Structural invariant: the landing renders the lede surface with
    // the documented class hooks. Paragraph copy is supplied by the
    // service and is not pinned by this test.
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

// Basic Components (C-1) + Core Tricks (C-2) landing-grid contracts
// retired. The rich grids no longer render on /freestyle; the two-band
// landing (Phase C, 2026-05-22) carries Start Here / Go Deeper portal
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

describe('Freestyle landing — Featured strip (C-3 + Phase 1/C merge, 2026-05-14)', () => {
  // SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / C: Competition Formats +
  // Demonstrations merged into one compact `Featured` strip. Format names
  // (Routine / Circle / Sick 3 / Shred 30) preserved as card titles; curated
  // demonstrations follow as exemplars. Empty array hides section content.
  it('renders the Featured heading + grid', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toMatch(/class="[^"]*\bfreestyle-featured\b/);
    expect(res.text).toMatch(/<h2>Featured<\/h2>/);
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
    // V5 editorial sweep: source attribution lines stripped from the
    // op-flag definitions. The mechanical content (cross-body far dex,
    // hip-pivot, operational form) is preserved.
    const res = await request(createApp()).get('/freestyle/glossary');
    const pdxIdx = res.text.indexOf('id="op-flag-pdx"');
    expect(pdxIdx).toBeGreaterThan(0);
    const slice = res.text.slice(pdxIdx, pdxIdx + 800);
    expect(slice).toMatch(/cross-body far dex/);
    expect(slice).toMatch(/hip-pivot/);
    expect(slice).toContain('CLIP &gt; OP IN [DEX]');
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
    // 14-section IA refactor (2026-05-19): §7 renamed from "Symbolic
    // Notation" to "Jobs / Operational Notation". Thesis sentence preserved.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="section-notation"');
    expect(res.text).toMatch(
      /The language evolves by compressing recurring compositional structures\s+into shorter readable symbolic forms\./,
    );
  });

  it('§7 cross-links to the §9 symbolic-compression flow', async () => {
    // 14-section IA refactor (2026-05-19): the worked compression-flow
    // moved from §8 to §9 (Symbolic Composition) when §8 ADD Accounting
    // was promoted. Anchor #symbolic-compression-flow preserved.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="#symbolic-compression-flow"');
  });
});

describe('Freestyle glossary — Structural compression subsection (post 2026-05-25 Vocabulary Relationships expansion)', () => {
  it('renders the symbolic-compression-flow anchor inside §composition (above §connective-panels)', async () => {
    // 2026-05-25 Vocabulary Relationships expansion: the worked
    // compression moved from a standalone h3 to an h4 inside the
    // Vocabulary Relationships subsection of §composition (Symbolic
    // Composition). Anchor #symbolic-compression-flow preserved on the
    // new h4 for inbound deep-links.
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const topologyIdx = res.text.indexOf('id="connective-panels"');
    expect(flowIdx).toBeGreaterThan(0);
    expect(topologyIdx).toBeGreaterThan(flowIdx);
  });

  it('renders the four-depth mobius compression ladder', async () => {
    // The compression-ladder example was expanded from 3 readings to 4
    // (curator-approved 2026-05-25): mobius → gyro torque → spinning
    // same-side torque → spinning miraging same-side osis. The deepest
    // reading is where the "compositional transformations" wow-moment
    // lands pedagogically.
    const res = await request(createApp()).get('/freestyle/glossary');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    const topologyIdx = res.text.indexOf('id="connective-panels"');
    const slice = res.text.slice(flowIdx, topologyIdx);
    // Slice 5: trick names in §9 §2 list are hyperlinked; <strong> now
    // wraps an <a>.
    expect(slice).toMatch(/<strong>\s*<a href="\/freestyle\/tricks\/mobius">mobius<\/a>\s*<\/strong>/i);
    expect(slice).toMatch(/gyro torque/i);
    expect(slice).toMatch(/spinning same-side torque/i);
    expect(slice).toMatch(/spinning miraging same-side osis/i);
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
    // 14-section IA refactor (2026-05-19): the six connective panels
    // moved from §9 to §11 (Family & Topology Concepts). The
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

describe('Freestyle glossary — re-bloat guard', () => {
  it('rendered glossary body stays within a reasonable size budget (raw HTML bytes)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Re-bloat guard. The threshold is a ceiling against unwanted prose
    // drift, NOT against deliberate curator-locked structural expansion.
    // History of bumps:
    //   120K → 145K  P3 IA expansion (§5 family card grids + §8 ADD
    //                Accounting full build + §10 Run Architecture).
    //   145K → 175K  P4 derivation atlas inside §1 (five derivation
    //                panels rendering compositional examples upfront,
    //                with semantic-depth ladders, ADD breakdowns,
    //                equivalence chains, and an inline doctrine note).
    //                Structured reference content; not prose drift.
    //   175K → 182K  Phase E re-tier: "How to read" relocated into a new
    //                "Advanced Reference Concepts" section + tier framing.
    //   182K → 192K  2026-05-22 "Language of Freestyle" §1 pedagogical
    //                onboarding band: twelve core-trick-atom cards with
    //                movement-physical leads + foundational notes.
    //                Curator-locked educational expansion; not prose drift.
    //   192K → 200K  2026-05-23 Jobs notation reference section: a
    //                dedicated #jobs-notation subsection quoting Ben
    //                Job's 1995 article (canonical formula + six
    //                example tricks + extension-token list), with a
    //                cite to the in-repo archive at
    //                exploration/fborg/JobsNotation.txt. The historical
    //                source-of-truth surface for the grammar lineage.
    //   200K → 215K  2026-05-25 Vocabulary Relationships subsection
    //                expansion in §composition: replaced prior
    //                #compression-vs-alternate-derivation with a four-
    //                way relationship-types treatment (pure alias /
    //                structural compression / equivalent derivation /
    //                ontology relationship), with concrete movement-
    //                centered examples for each. Curator-approved
    //                conceptual expansion; not prose drift.
    // The prose-compression locked default still applies — future
    // drift back toward sprawling paragraphs would breach this ceiling
    // again.
    expect(res.text.length).toBeLessThan(215_000);
  });
});

// ---------------------------------------------------------------------------
// Typography/layout polish for compact symbolic objects. CSS-only refinements
// plus dictionary unification (CSS-level). Most assertions are structural:
// class presence, anchor presence, ordering.

// Batch 4 "symbolic-object class contract preserved" — retired by
// Landing Page Phase 1 (2026-05-21). The .core-trick-object / .core-
// trick-slug / .core-trick-equivalence / core-trick-add-pending classes
// pinned the landing Core Tricks grid which no longer renders. The
// `core-tricks-grid` Handlebars partial is still in use on the
// glossary page (§5 "Other foundational atoms"), where the class
// contract is preserved and tested. Landing-side contract retired
// alongside the grid.

describe('Freestyle glossary — Batch 4: compression-flow visual continuity (Slice X compact form)', () => {
  it('symbolic-compression-flow renders zero per-step cards (collapsed to one-liner)', async () => {
    // Slice X corrective (2026-05-17): the prior three .core-trick-object
    // cards were collapsed into a one-row equivalence. This test now
    // asserts the cascade is gone; the new contract is covered above.
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

describe('Freestyle dictionary — Batch 4: unified symbolic-object styling', () => {
  it('dict-card-title elements still render (CSS unification adds # via ::before)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/class="dict-card-title"/);
  });

  it('dict-card-add elements still render the ADD label (CSS unification restyles as chip)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // ADD spans still carry the dict-card-add class; only visual treatment changed.
    expect(res.text).toMatch(/class="dict-card-add[^"]*"/);
  });

  it('dict-card class is preserved (no rename); CSS now uses shared symbolic-object hierarchy', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/class="dict-card[^"]*"/);
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
    // BROWSE-REFACTOR-1 Slice 1: both densities use the
    // `core-trick-equivalence dict-card-equivalence` wrapper class on the
    // tokenized ≡ reading. The ≡ sigil span is present in markup on both
    // densities (CSS hides it visually in registry).
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/class="core-trick-equivalence dict-card-equivalence/);
    expect(res.text).toMatch(/class="core-trick-equiv-sigil">&equiv;<\/span>/);
  });
});

describe('Freestyle dictionary — S2: canon-locked chain readings (torque/blender/drifter)', () => {
  it('renders torque as ≡ miraging osis (pt11)', async () => {
    // Tokenized rendering wraps each operator in a sem-token span; match
    // each word independently allowing intervening markup.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/data-trick-slug="torque"[\s\S]*?miraging[\s\S]*?osis/);
  });

  it('renders blender as ≡ whirling osis (pt11)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/data-trick-slug="blender"[\s\S]*?whirling[\s\S]*?osis/);
  });

  it('renders drifter as ≡ miraging clipper (pt11)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/data-trick-slug="drifter"[\s\S]*?miraging[\s\S]*?clipper/);
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

  it('atom dictionary cards surface curator-authored op-notation via the first-class JOB row', async () => {
    // 2026-05-24 curator rendered-output audit: the standalone op-notation
    // chip on browse cards was suppressed for first-class tricks (it
    // duplicated the JOB row below). Atoms are first-class; op-notation
    // now renders ONLY via the first-class secondary row's labeled
    // "JOB:" line. The around-the-world ≡ ATW alias remains suppressed
    // from atom browse cards (no chip slot to take); it stays
    // accessible on the trick-detail page + glossary.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const atwIdx = res.text.indexOf('data-trick-slug="around-the-world"');
    expect(atwIdx).toBeGreaterThan(0);
    const atwCardEnd = res.text.indexOf('</article>', atwIdx);
    const atwCard = res.text.slice(atwIdx, atwCardEnd);
    // No standalone chip slot.
    expect(atwCard).not.toMatch(/<code class="dict-card-notation/);
    // First-class secondary row carries the tokenized JOB line.
    expect(atwCard).toMatch(/dict-card-first-class-label[^>]*>JOB:/);
    expect(atwCard).toMatch(/\(midtime\)/);
  });
});
