/**
 * Integration tests for freestyle trick dictionary and insights pages.
 *
 * Covers:
 *   GET /freestyle/tricks         — trick dictionary index
 *   GET /freestyle/tricks/:slug   — enhanced trick detail (dict info + records)
 *   GET /freestyle/insights       — editorial insights page (service-layer constants)
 *   GET /freestyle                — landing page highlights (tricks + insights)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertHistoricalPerson,
  insertFreestyleRecord,
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  insertFreestyleTrickAlias,
  insertMember,
  insertTtLesson,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3110');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const PERSON_ID = 'person-tricks-test-001';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertHistoricalPerson(db, {
    person_id:    PERSON_ID,
    person_name:  'Claire Dex',
    source_scope: 'CANONICAL',
  });

  // Trick in the dictionary with a passback record
  insertFreestyleTrick(db, {
    slug:          'whirl',
    canonical_name: 'whirl',
    adds:          '3',
    base_trick:    'whirl',
    trick_family:  'whirl',
    category:      'compound',
    description:   'rotational dex trick; most connected trick in the network',
    aliases_json:  '["spinning whirl (with modifier)"]',
    notation:      'WHIRL',
    sort_order:    0,
  });

  // Trick in the dictionary with no passback record
  insertFreestyleTrick(db, {
    slug:          'blurriest',
    canonical_name: 'blurriest',
    adds:          '6',
    base_trick:    'blurriest',
    trick_family:  'blurriest',
    category:      'compound',
    description:   'maximum documented base ADD',
    aliases_json:  '[]',
    sort_order:    1,
  });

  // Modifier trick — must NOT appear in the public category listing.
  insertFreestyleTrick(db, {
    slug:          'ducking',
    canonical_name: 'ducking',
    adds:          'modifier',
    category:      'modifier',
    description:   'positional modifier; requires ducking under the bag',
    aliases_json:  '[]',
    sort_order:    2,
  });

  // Trick with aliases
  insertFreestyleTrick(db, {
    slug:          'legover',
    canonical_name: 'legover',
    adds:          '2',
    base_trick:    'legover',
    trick_family:  'legover',
    category:      'dex',
    description:   'basic leg-over dexterity',
    aliases_json:  '["leg over"]',
    sort_order:    3,
  });

  // Pending standalone trick: under the new ADD-grouped index, this row
  // surfaces as a labeled external-only placeholder — visible in the ADD
  // bucket matching its `adds` value, with the adjudication note attached.
  // Direct-slug detail still 404s (canonical-only contract preserved).
  insertFreestyleTrick(db, {
    slug:           'pending-zorblax',
    canonical_name: 'pending zorblax',
    adds:           '4',
    category:       'compound',
    description:    'unverified scraped row.',
    sort_order:     90,
    review_status:  'pending',
    is_active:      0,
  });

  // Unrated, descriptionless pending row: exercises the
  // 'Unrated / unresolved' bucket and the 'Description pending' /
  // 'Notation pending' fallback strings on the ADD view. Empty-string
  // adds matches real data (loader-21 emits empty when the source has
  // no ADD value).
  insertFreestyleTrick(db, {
    slug:           'pending-quasar',
    canonical_name: 'pending quasar',
    adds:           '',
    category:       'compound',
    description:    null,
    notation:       null,
    sort_order:     91,
    review_status:  'pending',
    is_active:      0,
  });

  // Active family member of 'whirl': control row that SHOULD appear in the
  // whirl family ladder.
  insertFreestyleTrick(db, {
    slug:           'spinning-whirl',
    canonical_name: 'spinning whirl',
    adds:           '5',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'compound',
    description:    'spinning + whirl.',
    sort_order:     10,
  });

  // Modifier-link fixture for the ?view=sets projection.
  // 'spinning' is a real body-type modifier in the freestyle ontology;
  // 'spinning-whirl' is seeded above with a base of 'whirl'. Linking the
  // two exercises the sets-grouping path so the view renders real groups
  // instead of falling back to the empty state.
  insertFreestyleTrickModifier(db, {
    slug:                 'spinning',
    modifier_name:        'spinning',
    modifier_type:        'body',
    add_bonus:            1,
    add_bonus_rotational: 2,
  });
  insertFreestyleTrickModifierLink(db, 'spinning-whirl', 'spinning', 1);

  // Pending family member of 'whirl': must NOT appear in the whirl family ladder.
  insertFreestyleTrick(db, {
    slug:           'pending-paradox-whirl',
    canonical_name: 'pending paradox whirl',
    adds:           '4',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'compound',
    description:    'unverified scraped row.',
    sort_order:     91,
    review_status:  'pending',
    is_active:      0,
  });

  // Passback record for 'whirl' (links dict entry to record)
  insertFreestyleRecord(db, {
    id:            'fr-whirl-1',
    person_id:     PERSON_ID,
    display_name:  'Claire Dex',
    trick_name:    'whirl',
    value_numeric: 88,
    confidence:    'verified',
  });

  // Passback record for a trick NOT in the dictionary
  insertFreestyleRecord(db, {
    id:            'fr-unknown-1',
    display_name:  'Somebody',
    trick_name:    'mystery-trick',
    value_numeric: 5,
    confidence:    'probable',
  });

  // Curator-reference media (separate from member-uploaded media_items).
  // Seeds two coverage tiers so the trick-dictionary chip exercises all
  // three states: 'tutorial' (whirl), 'demo' (legover), 'none' (everything else).
  db.prepare(`
    INSERT INTO freestyle_media_sources (source_id, source_name, source_type, url, creator)
    VALUES ('tt_youtube', 'WorldFootbag YouTube — Tricks of the Trade', 'youtube', NULL, NULL),
           ('footbag_finland', 'Footbag Finland', 'youtube', NULL, NULL)
  `).run();
  db.prepare(`
    INSERT INTO freestyle_media_assets (id, media_type, url, title, source_id, review_status, is_active)
    VALUES ('fma-tt-whirl',     'video', 'https://example.test/tt-whirl',     'TT — Whirl',    'tt_youtube',     'curated', 1),
           ('fma-finland-lego', 'video', 'https://example.test/finland-lego', 'Legover demo',  'footbag_finland', 'curated', 1)
  `).run();
  db.prepare(`
    INSERT INTO freestyle_media_links (media_id, entity_type, entity_id, is_primary)
    VALUES ('fma-tt-whirl',     'trick', 'whirl',   1),
           ('fma-finland-lego', 'trick', 'legover', 1)
  `).run();

  // ── Phase 3 fixtures: trick-detail Reference Media wording cases ─────────
  // The trick-detail page reads `listMediaByTrickTag` (curator channel:
  // media_items + media_tags + tags). Three dedicated tricks with curator-
  // channel coverage exercise the three Reference Media heading states.
  const phase3Uploader = insertMember(db, { slug: 'phase3-uploader' });
  insertFreestyleTrick(db, {
    slug: 'phase3-tutorial-only', canonical_name: 'phase3-tutorial-only', adds: '3', sort_order: 96,
  });
  insertFreestyleTrick(db, {
    slug: 'phase3-demo-only', canonical_name: 'phase3-demo-only', adds: '3', sort_order: 97,
  });
  insertFreestyleTrick(db, {
    slug: 'phase3-mixed-media', canonical_name: 'phase3-mixed-media', adds: '3', sort_order: 98,
  });
  // Tutorial-only: one tt_youtube clip.
  insertTtLesson(db, {
    uploader_member_id: phase3Uploader, ttNumber: 700,
    trickSlug: 'phase3-tutorial-only', videoId: 'phase3-tut-only',
    lessonTitle: 'Phase3 Tutorial Only',
  });
  // Demo-only: one footbag_finland clip (insertTtLesson is generic; the
  // source_id override drives tier classification).
  insertTtLesson(db, {
    uploader_member_id: phase3Uploader, ttNumber: 701,
    trickSlug: 'phase3-demo-only', videoId: 'phase3-demo-only',
    lessonTitle: 'Phase3 Demo Only', source_id: 'footbag_finland',
  });
  // Mixed: one tutorial-tier + one demo-tier clip.
  insertTtLesson(db, {
    uploader_member_id: phase3Uploader, ttNumber: 702,
    trickSlug: 'phase3-mixed-media', videoId: 'phase3-mixed-tut',
    lessonTitle: 'Phase3 Mixed Tutorial',
  });
  insertTtLesson(db, {
    uploader_member_id: phase3Uploader, ttNumber: 703,
    trickSlug: 'phase3-mixed-media', videoId: 'phase3-mixed-demo',
    lessonTitle: 'Phase3 Mixed Demo', source_id: 'footbag_finland',
  });

  // ── Phase 6: role-aware notation rendering fixtures ──────────────────────
  // Exercises shapeNotationDisplay's classification path. Adds modifier rows
  // (paradox/blurry/ducking/stepping) and trick rows for the 6 test cases
  // James named: WHIRL (already above), PARADOX WHIRL, BLURRY MIRAGE, ATW
  // (alias resolution), HEAD STALL (unusual_surface + suffix), and GAUNTLET
  // (multi-modifier showcase).
  insertFreestyleTrickModifier(db, { slug: 'paradox',  modifier_name: 'paradox',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'blurry',   modifier_name: 'blurry',   modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 2 });
  insertFreestyleTrickModifier(db, { slug: 'ducking',  modifier_name: 'ducking',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'stepping', modifier_name: 'stepping', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });

  // Supporting base-family trick rows the renderer's slug lookup needs to
  // resolve tokens like MIRAGE, BUTTERFLY, TORQUE, AROUND-THE-WORLD as
  // core_family. Notation set to the LOCKED Tier 1 exemplar where defined.
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage',
    category: 'dex', description: 'core mirage', notation: 'MIRAGE', sort_order: 50,
  });
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly', adds: '3', base_trick: 'butterfly', trick_family: 'butterfly',
    category: 'compound', description: 'core butterfly', notation: 'BUTTERFLY', sort_order: 51,
  });
  insertFreestyleTrick(db, {
    slug: 'torque', canonical_name: 'torque', adds: '4', base_trick: 'torque', trick_family: 'torque',
    category: 'compound', description: 'core torque', notation: 'TORQUE', sort_order: 52,
  });
  insertFreestyleTrick(db, {
    slug: 'around-the-world', canonical_name: 'around the world', adds: '2',
    base_trick: 'around-the-world', trick_family: 'around-the-world', category: 'dex',
    description: 'full leg circle around the bag', notation: 'ATW', sort_order: 53,
  });
  insertFreestyleTrickAlias(db, 'atw', 'around-the-world', 'atw');

  // The 6 test fixtures themselves — each carries its LOCKED Tier 1 notation.
  insertFreestyleTrick(db, {
    slug: 'paradox-whirl', canonical_name: 'paradox whirl', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    description: 'Paradox-modified whirl.', notation: 'PARADOX WHIRL', sort_order: 60,
  });
  insertFreestyleTrick(db, {
    slug: 'blur', canonical_name: 'blur', adds: '4', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', description: 'Blurry-modified mirage.', notation: 'BLURRY MIRAGE', sort_order: 61,
  });
  insertFreestyleTrick(db, {
    slug: 'head-stall', canonical_name: 'head stall', adds: '1',
    base_trick: 'head-stall', trick_family: 'head-stall', category: 'surface',
    description: 'Head-based delay surface.', notation: 'HEAD STALL', sort_order: 62,
  });
  insertFreestyleTrick(db, {
    slug: 'gauntlet', canonical_name: 'gauntlet', adds: '7',
    base_trick: 'torque', trick_family: 'torque', category: 'compound',
    description: 'Stepping-ducking-paradox-modified torque.',
    notation: 'STEPPING DUCKING PARADOX TORQUE', sort_order: 63,
  });

  // Edge-case fixture: notation contains an unrecognized token alongside
  // known ones. Exercises mixed-classification rendering.
  insertFreestyleTrick(db, {
    slug: 'phase6-mixed', canonical_name: 'phase6 mixed', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    description: 'mixed known + unknown tokens',
    notation: 'WEIRD-TOKEN PARADOX WHIRL', sort_order: 64,
  });

  // Edge-case fixture: notation NULL — section must be omitted entirely.
  insertFreestyleTrick(db, {
    slug: 'phase6-no-notation', canonical_name: 'phase6 no notation', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    description: 'no notation populated', notation: null, sort_order: 65,
  });

  // Curator-tagged channel — covers a trick that has NO legacy
  // freestyle_media_links row but DOES have curator-tagged tutorial media
  // via media_items + media_tags + tags. Exercises the Option-A UNION fix
  // in `freestyleMediaLinks.listCoveredTrickSlugsWithSource` (db.ts).
  insertFreestyleTrick(db, {
    slug:           'curator-only-trick',
    canonical_name: 'curator only trick',
    adds:           '4',
    base_trick:     'curator-only-trick',
    trick_family:   'curator-only-trick',
    category:       'compound',
    description:    'curator-tagged tutorial coverage only; no legacy freestyle_media_links row',
    aliases_json:   '[]',
    sort_order:     200,
  });
  const memberIdForCuratorMedia = insertMember(db);
  insertTtLesson(db, {
    uploader_member_id: memberIdForCuratorMedia,
    ttNumber:           99,
    trickSlug:          'curator-only-trick',
    videoId:            'CURATOR-ONLY-TEST',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
  });

  it('shows page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('Trick Dictionary');
  });

  it('shows all active non-modifier tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurriest');
    expect(res.text).toContain('legover');
    // Modifier-category rows live in the dedicated Modifier Reference
    // section, not the trick categories — see 'public dictionary
    // presentation' describe block below.
  });

  it('descriptions are no longer rendered in any browse view (DSC-2 slice 3B retired the spreadsheet)', async () => {
    // DSC-2 slice 3B: the By Category view migrated to symbolic trick cards.
    // Prose descriptions are explicitly excluded from every browse card (ADD,
    // family, component, category). Descriptions still live on the trick-
    // detail page; browse cards don't carry them.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=category');
    expect(res.text).not.toContain('most connected trick');
    expect(res.text).not.toContain('maximum documented base ADD');
    expect(res.text).not.toContain('trick-description');
  });

  it('shows ADD values', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('3');   // whirl
    expect(res.text).toContain('6');   // blurriest
  });

  it('links all dict tricks to /freestyle/tricks/:slug (not just those with records)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // whirl has records — linked
    expect(res.text).toContain('/freestyle/tricks/whirl');
    // blurriest has no record — but is in the dict, so now also linked
    expect(res.text).toContain('/freestyle/tricks/blurriest');
  });

  it('shows record indicator (★) for tricks that have passback records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // whirl has a record — should show the star indicator
    // blurriest has no record — no star (but still has a link)
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurriest');
  });

  it('renders allow-listed canonical aliases as ≡ readings (around-the-world ≡ ATW)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // Per CANONICAL-SURFACE-REALIGNMENT-1 S1+S3, atom-level canonical aliases
    // surface only through the freestyleAliasGovernance allow-list; the
    // around-the-world ≡ ATW entry is allow-listed (displayAs='ATW').
    // Non-allow-listed aliases like legover ≡ leg-over are filtered out per
    // user-spec PART 3A (orthographic noise).
    expect(res.text).toMatch(/class="core-trick-equivalence[^"]*"[^>]*>[\s\S]*?ATW/);
    expect(res.text).not.toContain('leg over');
  });

  it('shows trick count in hero stats', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('tricks');
  });
});

// ---------------------------------------------------------------------------

describe('public dictionary presentation', () => {
  it('renders Notation column header and notation text in the category view', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    // DSC-2 slice 3B: category view retires the Notation column header.
    // The shared dict-card-stack renders operational notation via role-tagged
    // token spans on each card, not in a table column.
    expect(res.text).not.toContain('<th>Notation</th>');
    expect(res.text).toContain('dict-card-stack');
  });

  it('renders notation inline in the default ADD view (no table header)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // DSC-2 slice 1 + BROWSE-REFACTOR-1 Slice 1: ADD view is registry density.
    // No table header. The card renders either a tokenized ≡ reading
    // (preferred), an operational-notation fallback, or — in browse density
    // only — a "Notation pending" placeholder.
    expect(res.text).not.toContain('<th>Notation</th>');
    expect(res.text).toMatch(/dict-card-tokenized-reading|dict-card-notation|core-trick-equivalence dict-card-equivalence/);
  });

  it('does not list modifier rows in the category groups', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // Modifier-category section header must not appear in the page.
    expect(res.text).not.toMatch(/<h2>Modifier<\/h2>/);
    // The modifier-category trick we seeded must not have a row in the
    // category listing. Detail link to that slug should also be absent.
    expect(res.text).not.toContain('href="/freestyle/tricks/ducking"');
  });

  it('does not render the Modifier Reference section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Modifier Reference');
    expect(res.text).not.toContain('+ADD (rotational)');
  });

  it('category view cards carry data-trick-slug as the per-card identity attribute (DSC-2 slice 3B)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    // The shared dictionary-trick-card exposes data-trick-slug on the card root;
    // the legacy `trick-hashtag` element is retired with the spreadsheet.
    expect(res.text).toContain('data-trick-slug="whirl"');
    expect(res.text).toContain('data-trick-slug="legover"');
  });

  it('compound slugs (e.g. spinning-whirl) preserve their slug in data-trick-slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('data-trick-slug="spinning-whirl"');
  });

  it('makes family-section headings clickable as family-filter links in the family view', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // DSC-2 slice 2: family view migrated to symbolic trick cards. Each
    // family section renders an <h2> heading wrapping an <a> family-filter link.
    expect(res.text).toMatch(/<h2><a href="\/freestyle\/tricks\?family=whirl">/);
  });

  it('renders the dictionary expansion note', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('being expanded and aligned with established freestyle notation');
  });
});

describe('GET /freestyle/tricks?family=… — hashtag filter', () => {
  it('narrows the dictionary to a single family and shows the filter pill', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?family=whirl');
    expect(res.status).toBe(200);
    // Pill renders with the family name and a clear-filter link
    expect(res.text).toContain('family-filter-pill');
    expect(res.text).toContain('Filtering by family:');
    expect(res.text).toMatch(/<strong>whirl<\/strong>/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks"[^>]*>Clear filter</);
    // Whirl-family rows still render
    expect(res.text).toContain('/freestyle/tricks/whirl');
    expect(res.text).toContain('/freestyle/tricks/spinning-whirl');
    // Out-of-family rows are dropped
    expect(res.text).not.toContain('/freestyle/tricks/legover');
    expect(res.text).not.toContain('/freestyle/tricks/blurriest');
  });

  it('ignores unknown family values (no rows match → no filter applied)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?family=does-not-exist');
    expect(res.status).toBe(200);
    // Falls through to unfiltered dictionary; pill must NOT render
    expect(res.text).not.toContain('family-filter-pill');
    // All families still visible
    expect(res.text).toContain('/freestyle/tricks/whirl');
    expect(res.text).toContain('/freestyle/tricks/legover');
  });

  it('renders Related set/modifier groups when the active family has modifier-linked tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?family=whirl');
    // Whirl-family fixture seeds spinning-whirl with a modifier_link to spinning.
    expect(res.text).toContain('class="related-set-groups"');
    expect(res.text).toContain('Related set/modifier groups:');
    // Deep-link into the sets projection at the matching set anchor.
    expect(res.text).toContain('href="/freestyle/tricks?view=sets#set-spinning"');
    // Link surface shows the modifier name and a count chip.
    expect(res.text).toMatch(/related-set-group-link[^>]*>spinning <span class="related-set-group-count">\(1\)<\/span>/);
  });

  it('does NOT render the Related set/modifier groups block when no family is active', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).not.toContain('class="related-set-groups"');
    expect(res.text).not.toContain('Related set/modifier groups:');
  });

  it('does NOT render the Related set/modifier groups block for a family with no modifier-linked tricks', async () => {
    const app = createApp();
    // legover family has one trick (legover) and no modifier_links rows.
    const res = await request(app).get('/freestyle/tricks?family=legover');
    expect(res.text).toContain('family-filter-pill'); // sanity: filter active
    expect(res.text).not.toContain('class="related-set-groups"');
  });
});

describe('GET /freestyle/tricks/:slug — pathways cross-link block', () => {
  it('renders the Learn / Watch / Family pathways block on the detail page', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-pathways"');
    expect(res.text).toContain('What you can do with this trick');
    // Three pathway items must render (Learn / Watch / Family).
    expect(res.text).toContain('class="trick-pathway trick-pathway--learn');
    expect(res.text).toContain('class="trick-pathway trick-pathway--watch');
    expect(res.text).toContain('class="trick-pathway trick-pathway--family');
    expect(res.text).toContain('Learn this trick');
    expect(res.text).toContain('Watch records');
    expect(res.text).toContain('Related families');
  });

  it('Watch pathway shows record count + top holder when records exist', async () => {
    const app = createApp();
    // 'whirl' has at least one fixture record (Stefan, etc. depending on seed).
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('class="trick-pathway trick-pathway--watch');
    // Pathway text references "record" or "records" — pluralization handled in service.
    expect(res.text).toMatch(/trick-pathway--watch[^"]*"[\s\S]*?\d+ record/);
  });

  it('Watch pathway links to the in-page Passback Records anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    // When records exist, the link target is #passback-records.
    expect(res.text).toMatch(/href="#passback-records"/);
    // The Passback Records section carries the matching id anchor.
    expect(res.text).toMatch(/<section id="passback-records"/);
  });

  it('Family pathway links to the family filter when family has siblings', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    // Whirl family has siblings (spinning-whirl in fixtures); link should resolve.
    expect(res.text).toMatch(/trick-pathway--family[^"]*"[\s\S]*?href="\/freestyle\/tricks\?family=whirl"/);
  });

  it('Pathways block falls back gracefully when a pathway has no data', async () => {
    const app = createApp();
    // legover in the fixture has no family siblings (per existing test seeds).
    const res = await request(app).get('/freestyle/tricks/legover');
    // The pathways block still renders; the empty-pathway gets the
    // trick-pathway--empty modifier and a "no X yet" / placeholder text.
    expect(res.text).toContain('class="content-section trick-pathways"');
    expect(res.text).toMatch(/trick-pathway[^"]*--family[^"]*trick-pathway--empty/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Media visibility: trick-detail wording must distinguish tutorials from
// demonstrations, never conflate them. Three states: tutorial-only,
// demo-only, and mixed.
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks/:slug — Reference Media heading + pathway wording (Phase 3)', () => {
  it('tutorial-only trick: Media section + Tutorials subheading; Learn pathway counts only tutorials', async () => {
    const app = createApp();
    // 'phase3-tutorial-only' has one tt_youtube curator-tagged clip and no
    // demo-tier coverage.
    const res = await request(app).get('/freestyle/tricks/phase3-tutorial-only');
    expect(res.status).toBe(200);
    // UX3c-a unified shell: section h2 is always "Media"; per-tier presence
    // surfaces via the inner h3 subheadings (Tutorials / Demonstrations).
    expect(res.text).toMatch(/<h2>Media<\/h2>/);
    expect(res.text).toMatch(/<h3 class="reference-media-subheading">Tutorials<\/h3>/);
    expect(res.text).not.toMatch(/<h3 class="reference-media-subheading">Demonstrations<\/h3>/);
    expect(res.text).not.toMatch(/<h2>\s*Reference Media\s*<\/h2>/);
    // Demonstrations subsection absent.
    expect(res.text).not.toContain('reference-media-subsection--demos');
    // Learn pathway counts ONLY tutorials. Anchor on the pathway li.
    const learnIdx = res.text.indexOf('trick-pathway--learn');
    expect(learnIdx).toBeGreaterThan(0);
    const learnEnd = res.text.indexOf('</li>', learnIdx);
    const learnSlice = res.text.slice(learnIdx, learnEnd);
    expect(learnSlice).toMatch(/\d+ tutorials? available/);
    expect(learnSlice).not.toMatch(/demonstrations? available/);
  });

  it('demo-only trick: Media section + Demonstrations subheading; Learn pathway counts only demos', async () => {
    const app = createApp();
    // 'phase3-demo-only' has one footbag_finland curator-tagged clip and no
    // tutorial-tier coverage.
    const res = await request(app).get('/freestyle/tricks/phase3-demo-only');
    expect(res.status).toBe(200);
    // UX3c-a unified shell: section h2 is always "Media"; per-tier presence
    // surfaces via the inner h3 subheadings.
    expect(res.text).toMatch(/<h2>Media<\/h2>/);
    expect(res.text).toMatch(/<h3 class="reference-media-subheading">Demonstrations<\/h3>/);
    expect(res.text).not.toMatch(/<h3 class="reference-media-subheading">Tutorials<\/h3>/);
    expect(res.text).not.toMatch(/<h2>\s*Reference Media\s*<\/h2>/);
    // Tutorials subsection absent.
    expect(res.text).not.toContain('reference-media-subsection--tutorials');
    // Learn pathway counts ONLY demos. The legacy "X tutorials available"
    // wording must NOT render here — that was the Phase 3 conflation bug.
    const learnIdx = res.text.indexOf('trick-pathway--learn');
    expect(learnIdx).toBeGreaterThan(0);
    const learnEnd = res.text.indexOf('</li>', learnIdx);
    const learnSlice = res.text.slice(learnIdx, learnEnd);
    expect(learnSlice).toMatch(/\d+ demonstrations? available/);
    expect(learnSlice).not.toMatch(/tutorials? available/);
    expect(learnSlice).not.toContain('No tutorials yet');
  });

  it('mixed-tier trick: Media section + both subheadings; Learn pathway counts both separately', async () => {
    const app = createApp();
    // 'phase3-mixed-media' has BOTH a tt_youtube and a footbag_finland clip
    // in the curator-tagged channel.
    const res = await request(app).get('/freestyle/tricks/phase3-mixed-media');
    expect(res.status).toBe(200);
    // UX3c-a unified shell: section h2 is always "Media"; per-tier subheadings
    // surface internally.
    expect(res.text).toMatch(/<h2>Media<\/h2>/);
    expect(res.text).not.toMatch(/<h2>\s*Reference Media\s*<\/h2>/);
    // Both subsections render.
    expect(res.text).toContain('reference-media-subsection--tutorials');
    expect(res.text).toContain('reference-media-subsection--demos');
    expect(res.text).toMatch(/<h3 class="reference-media-subheading">Tutorials<\/h3>/);
    expect(res.text).toMatch(/<h3 class="reference-media-subheading">Demonstrations<\/h3>/);
    // Learn pathway carries BOTH counts in distinct fragments — no conflation.
    const learnIdx = res.text.indexOf('trick-pathway--learn');
    expect(learnIdx).toBeGreaterThan(0);
    const learnEnd = res.text.indexOf('</li>', learnIdx);
    const learnSlice = res.text.slice(learnIdx, learnEnd);
    expect(learnSlice).toMatch(/\d+ tutorials? and \d+ demonstrations? available/);
  });
});

describe('GET /freestyle/tricks/:slug — family badge in hero', () => {
  it('renders a family chip linking to the family filter', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // UX3f-b unified the family badge into the hero metadata ribbon as
    // .trick-hero-meta-chip-family with the same link semantics.
    expect(res.text).toMatch(/class="trick-hero-meta-chip trick-hero-meta-chip-family"[^>]*href="\/freestyle\/tricks\?family=whirl"[^>]*>whirl family</);
  });

  it('Related Tricks hashtags are identity links (not family links)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    const relatedSection = res.text.split('Related Tricks')[1]?.split('Family')[0] ?? '';
    // The hashtag link in Related Tricks must point to the related trick itself
    expect(relatedSection).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/spinning-whirl"[^>]*>#spinningwhirl</);
    // It must NOT be a family-filter link
    expect(relatedSection).not.toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\?family=/);
  });
});

describe('GET /freestyle/tricks/:slug — Previous Tricks section', () => {
  it('renders the Previous Tricks section when lower-ADD family peers exist', async () => {
    const app = createApp();
    // 'spinning-whirl' (5 ADD) has whirl(3) as a lower-ADD family peer
    const res = await request(app).get('/freestyle/tricks/spinning-whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Previous Tricks');
    expect(res.text).toContain('Lower-ADD variations in the same family');
    // UX3c-a unified shell flow: Family ladder appears in the LEARN block;
    // Previous Tricks lives in the lateral-navigation portion below. Both
    // render; Family precedes Previous in document order.
    const prevIdx = res.text.indexOf('Previous Tricks');
    const familyIdx = res.text.indexOf('Family</h2>');
    expect(prevIdx).toBeGreaterThan(0);
    expect(familyIdx).toBeGreaterThan(0);
    expect(familyIdx).toBeLessThan(prevIdx);
  });

  it('Previous Tricks links the family base trick (whirl) for spinning-whirl', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/spinning-whirl');
    const prevSection = res.text.split('Previous Tricks')[1]?.split('Next Tricks')[0] ?? '';
    // The family-base tiebreaker promotes 'whirl' to the front of its ADD bucket
    expect(prevSection).toContain('/freestyle/tricks/whirl');
    expect(prevSection).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/whirl"[^>]*>#whirl</);
    expect(prevSection).toMatch(/class="next-tricks-adds">3 ADD</);
  });

  it('Previous Tricks does NOT include current, higher-ADD, or out-of-family rows', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/spinning-whirl');
    const prevSection = res.text.split('Previous Tricks')[1]?.split('Next Tricks')[0] ?? '';
    // Current trick must not appear in its own previous list
    expect(prevSection).not.toContain('href="/freestyle/tricks/spinning-whirl"');
    // Out-of-family rows must not appear
    expect(prevSection).not.toContain('/freestyle/tricks/legover');
    expect(prevSection).not.toContain('/freestyle/tricks/blurriest');
  });

  it('Previous Tricks section is omitted when current trick has no lower-ADD family peers', async () => {
    const app = createApp();
    // 'legover' (2 ADD) is the lowest in the legover family in this fixture
    const res = await request(app).get('/freestyle/tricks/legover');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Previous Tricks');
  });
});

describe('GET /freestyle/tricks/:slug — Next Tricks section', () => {
  it('renders the Next Tricks section when higher-ADD family peers exist', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Next Tricks');
    expect(res.text).toContain('next-tricks-list');
    // spinning-whirl has adds=5 > whirl(3); same family. Must appear.
    const nextSection = res.text.split('Next Tricks')[1]?.split('Family')[0] ?? '';
    expect(nextSection).toContain('/freestyle/tricks/spinning-whirl');
    // ADD pill rendered next to the trick
    expect(nextSection).toMatch(/class="next-tricks-adds">5 ADD</);
    // Hashtag identity link in the same row
    expect(nextSection).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/spinning-whirl"[^>]*>#spinningwhirl</);
  });

  it('Next Tricks does NOT include lower or equal ADD rows or out-of-family tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    const nextSection = res.text.split('Next Tricks')[1]?.split('Family')[0] ?? '';
    // The current trick must not appear
    expect(nextSection).not.toContain('href="/freestyle/tricks/whirl"');
    // Out-of-family rows (mirage, legover, blurriest) must not appear
    expect(nextSection).not.toContain('/freestyle/tricks/legover');
    expect(nextSection).not.toContain('/freestyle/tricks/blurriest');
  });

  it('Next Tricks section is omitted when current trick has no higher-ADD family peers', async () => {
    const app = createApp();
    // 'blurriest' (6 ADD) is the only blurriest-family entry in this fixture
    const res = await request(app).get('/freestyle/tricks/blurriest');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Next Tricks');
  });
});

describe('GET /freestyle/tricks/:slug — Related Tricks section', () => {
  it('renders the Related Tricks section when family peers exist', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // Section heading + list class
    expect(res.text).toContain('Related Tricks');
    expect(res.text).toContain('related-tricks-list');
    // The whirl-family peer 'spinning-whirl' appears as a related-trick link
    // (separate from the family-ladder section, which also renders it)
    const relatedSection = res.text.split('Related Tricks')[1] ?? '';
    expect(relatedSection).toContain('/freestyle/tricks/spinning-whirl');
  });

  it('Related Tricks does NOT include the current trick or pending rows', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    const relatedSection = res.text.split('Related Tricks')[1]?.split('Family')[0] ?? '';
    // Current trick must not appear in its own related list
    expect(relatedSection).not.toContain('/freestyle/tricks/whirl"');
    // Pending rows must not surface
    expect(relatedSection).not.toContain('pending-zorblax');
    expect(relatedSection).not.toContain('pending-paradox-whirl');
  });

  it('Related Tricks section is omitted when no peers exist', async () => {
    const app = createApp();
    // 'legover' is in the dictionary but has no family siblings in this fixture
    const res = await request(app).get('/freestyle/tricks/legover');
    expect(res.status).toBe(200);
    // No related-tricks section heading
    expect(res.text).not.toContain('Related Tricks');
  });
});

describe('pending row visibility', () => {
  it('pending tricks render as labeled external placeholders in the default ADD view', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // Active control still rendered.
    expect(res.text).toContain('whirl');
    // Pending rows ARE surfaced as external placeholders, with the badge and
    // adjudication note. They MUST NOT carry a detail-page anchor (inert).
    expect(res.text).toContain('pending zorblax');
    expect(res.text).toContain('External source — not yet adjudicated');
    expect(res.text).toContain('not yet been fully adjudicated');
    // No <a> link wrapping the pending name (template branches on isExternalOnly).
    expect(res.text).not.toMatch(/<a[^>]*href="\/freestyle\/tricks\/pending-zorblax"/);
  });

  it('category view continues to hide pending tricks (canonical layout only)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    expect(res.text).toContain('whirl');
    // Pending rows do not surface in the legacy category table layout.
    expect(res.text).not.toContain('pending zorblax');
    expect(res.text).not.toContain('pending paradox whirl');
  });

  it('direct slug to a pending trick (no records) returns 404', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/pending-zorblax');
    expect(res.status).toBe(404);
  });

  it('pending family member is absent from a base trick’s family ladder', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // Active family member appears.
    expect(res.text).toContain('spinning whirl');
    // Pending family member must NOT appear.
    expect(res.text).not.toContain('pending paradox whirl');
    expect(res.text).not.toContain('pending-paradox-whirl');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks — ADD-grouped view (default beginner view)', () => {
  it('renders an ADD-group section per non-empty ADD bucket', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // The fixture seeds tricks with ADD values; expect at least the 3-ADD
    // bucket header to render (whirl is 3 ADD in this fixture).
    expect(res.text).toMatch(/<h2>3 ADD<\/h2>/);
  });

  it('places at least one known trick in the correct ADD group', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // 'whirl' is 3 ADD: anchor-id "add-3" must contain the whirl row.
    const startIdx = res.text.indexOf('id="add-3"');
    expect(startIdx).toBeGreaterThan(0);
    // Walk forward to next section heading and confirm the slice has 'whirl'.
    const sliceEnd = res.text.indexOf('id="add-', startIdx + 1);
    const slice = sliceEnd > 0 ? res.text.slice(startIdx, sliceEnd) : res.text.slice(startIdx);
    expect(slice).toContain('whirl');
  });

  it('renders an "Unrated / unresolved" group when at least one row has no numeric ADD', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // The fixture seeds 'pending zorblax' with empty ADD.
    expect(res.text).toContain('Unrated / unresolved');
  });

  // DSC-2 slice 1 — symbolic trick card carries a small optional media chip
  // ('Tutorial available' / 'Demo only') only when media is present. Tricks
  // without media render no chip; the absence is the visual signal.
  // The card root also exposes data-media-coverage so tests can assert
  // tier classification without depending on chip text.
  it('renders a data-media-coverage attribute on every card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toMatch(/data-media-coverage="(?:tutorial|demo|none)"/);
  });

  it('renders no media chip for tricks with no media coverage (absence is the signal)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // Cards with data-media-coverage="none" must not render dict-card-media-chip
    // inside their <article>. Locate one such card and assert.
    const cardMatch = res.text.match(/<article class="dict-card[^>]*data-media-coverage="none"[^>]*>([\s\S]*?)<\/article>/);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch![1]).not.toContain('dict-card-media-chip');
  });

  it('renders the "Tutorial available" chip when a trick has tutorial-tier coverage', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('dict-card-media-chip dict-card-media-chip--tutorial');
    expect(res.text).toContain('Tutorial available');
  });

  it('renders the "Demo only" chip when a trick has only demo-tier coverage', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('dict-card-media-chip dict-card-media-chip--demo');
    expect(res.text).toContain('Demo only');
  });

  it('renders the "Tutorial available" chip when a trick has only curator-tagged tutorial media (UNION fix)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // `curator-only-trick` has no row in freestyle_media_links; its only
    // tutorial-tier coverage is via media_items + media_tags + tags
    // (curator-tagged channel with source_id='tt_youtube'). Pre-fix this
    // trick would render no media chip; post-fix the UNION'd
    // listCoveredTrickSlugsWithSource query surfaces it as 'tutorial'.
    const slugIdx = res.text.indexOf('data-trick-slug="curator-only-trick"');
    expect(slugIdx).toBeGreaterThan(-1);
    const cardClose = res.text.indexOf('</article>', slugIdx);
    expect(cardClose).toBeGreaterThan(slugIdx);
    const cardBlock = res.text.slice(slugIdx, cardClose);
    expect(cardBlock).toContain('Tutorial available');
    expect(cardBlock).toContain('dict-card-media-chip--tutorial');
  });

  it('renders ≡ symbolic-equivalence readings on the dictionary-trick-card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // BROWSE-REFACTOR-1 Slice 1: both registry and browse densities use
    // the `core-trick-equivalence dict-card-equivalence` wrapper class on
    // the tokenized ≡ reading. The registry variant adds an `--inline`
    // modifier; the regex allows additional classes after the base ones.
    expect(res.text).toMatch(/class="core-trick-equivalence dict-card-equivalence[^"]*"/);
    expect(res.text).not.toMatch(/class="dict-card-aliases"/);
  });

  it('suppresses "Notation pending" placeholder in registry density (BROWSE-REFACTOR-1 Slice 1)', async () => {
    // BROWSE-REFACTOR-1 Slice 1: pending placeholder is suppressed on the
    // registry-density By ADD view per the audit (clean identifier-only
    // cards for atoms / pending rows). Browse-density views (family /
    // component / topology) still render the placeholder for rows with
    // neither tokenized ≡ readings nor operational notation.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).not.toMatch(/<em>Notation pending<\/em>/);
  });

  it('descriptions are not rendered on the By ADD card; the placeholder is gone too', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // DSC-2 slice 1: prose descriptions are explicitly excluded from the
    // symbolic trick card. The 'Description pending' placeholder is therefore
    // also gone on the ADD view (descriptions still appear in the category
    // view's spreadsheet layout — see "shows trick descriptions ..." above).
    expect(res.text).not.toContain('trick-description');
    expect(res.text).not.toContain('Description pending');
  });

  it('renders the coverage summary with counts and the transparency note', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('canonical tricks');
    expect(res.text).toContain('External-source placeholders are shown for transparency and coverage tracking');
    // sources loaded: footbag.org always declared
    expect(res.text).toContain('footbag.org');
    // sources unavailable: footbagmoves.com note
    expect(res.text).toContain('footbagmoves.com');
  });

  it('renders the view toggle with the ADD view marked active', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('class="trick-view-toggle"');
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
    // DSC-2 slice 3A: ?view=sets was renamed to ?view=component; ?view=sets
    // continues to work as a server-side alias but the toggle label is now
    // "By component" with href=...view=component.
    expect(res.text).toContain('href="/freestyle/tricks?view=family"');
    expect(res.text).toContain('href="/freestyle/tricks?view=category"');
    expect(res.text).toContain('href="/freestyle/tricks?view=component"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks?view=sets — legacy alias for ?view=component', () => {
  // DSC-2 slice 3A: ?view=sets continues to resolve to the new ?view=component
  // render path; the legacy URL is supported for backward compatibility but
  // the rendered page is the new component view (axes + dict-card-stack).

  it('returns 200 and renders the component view (legacy alias)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    // The new component view renders the dict-card-stack via the shared partial.
    expect(res.text).toContain('dict-card-stack');
    // The view-toggle marks "By component" active (alias resolved server-side).
    expect(res.text).toMatch(/class="trick-view-toggle-active">By component</);
  });

  it('cross-references the static set-notation reference page is no longer required on the dictionary projection (the static legend stays at /freestyle/sets; the component view does not link to it inline)', async () => {
    // Legacy assertion retired: the new component view focuses on the
    // symbolic trick cards. The /freestyle/sets page remains the static
    // set-notation reference, reachable from the freestyle landing.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — with dictionary entry', () => {
  it('returns 200 for a slug in dictionary that also has records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
  });

  it('shows dictionary description', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('most connected trick');
  });

  it('shows ADD from dictionary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('3 ADD');
  });

  it('shows passback record holder', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('Claire Dex');
    expect(res.text).toContain('88');
  });

  it('shows record section header', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('Passback Records');
  });

  it('shows About this trick section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('About this trick');
  });

  it('shows breadcrumb with Trick Dictionary link', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('/freestyle/tricks');
    expect(res.text).toContain('Trick Dictionary');
  });

  it('returns 200 for a slug in dictionary with NO records (dict-only trick)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blurriest');
    expect(res.status).toBe(200);
    expect(res.text).toContain('blurriest');
    expect(res.text).toContain('maximum documented base ADD');
  });

  it('does NOT show Passback Records section for dict-only trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blurriest');
    expect(res.text).not.toContain('Passback Records');
  });

  it('shows modifier type for a modifier trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ducking');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Modifier');
    expect(res.text).toContain('no fixed ADD value');
  });

  it('returns 404 for a slug not in records OR dictionary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/not-a-trick-at-all');
    expect(res.status).toBe(404);
  });

  it('shows record-only trick (not in dict) when accessed by slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mystery-trick');
    expect(res.status).toBe(200);
    expect(res.text).toContain('mystery-trick');
    // No dict entry, so no About section
    expect(res.text).not.toContain('About this trick');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/insights', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.status).toBe(200);
  });

  it('shows page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Freestyle Insights');
  });

  it('shows most-used tricks section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Used Tricks');
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurry whirl');
  });

  it('shows connector tricks section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Influential Connectors');
    expect(res.text).toContain('ripwalk');
  });

  it('shows transitions section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Common Trick Transitions');
    expect(res.text).toContain('blurry whirl');
  });

  it('shows hardest sequences section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Hardest Documented Sequences');
    expect(res.text).toContain('Greg Solis');
    expect(res.text).toContain('22'); // ADD total
  });

  it('shows difficulty evolution section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Evolution of Difficulty');
    expect(res.text).toContain('2007');
  });

  it('shows diverse players section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Diverse Players');
    expect(res.text).toContain('Mariusz Wilk');
  });

  it('shows narrative analysis section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Analysis');
    expect(res.text).toContain('blurry whirl');  // appears in narrative
  });

  it('shows source note with dataset attribution', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    // Correct framing: data-driven from competition events, not "based on Evolution Report"
    expect(res.text).toContain('774 documented competitive events');
    expect(res.text).toContain('Sick3');
  });

  it('contains breadcrumb back to /freestyle', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('/freestyle');
    expect(res.text).toContain('Freestyle');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle — landing page highlights', () => {
  it('shows links to Trick Dictionary and Insights', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/tricks');
    expect(res.text).toContain('/freestyle/insights');
  });

  it('shows trick count in landing highlights', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('Trick Dictionary');
    expect(res.text).toContain('/freestyle/insights');  // link to insights exists
  });

  it('contains nav buttons for new pages', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('Trick Dictionary');
    expect(res.text).toContain('Insights');
  });
});

// ---------------------------------------------------------------------------
// Role-aware notation rendering on trick-detail pages.

describe('GET /freestyle/tricks/:slug — Phase 6 notation display', () => {
  it('renders the notation section with the role-aware <code> block when notation is populated', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section notation-display"');
    expect(res.text).toContain('aria-label="Trick notation"');
    expect(res.text).toContain('class="notation-display-tokens"');
  });

  it('omits the notation section entirely when the row has no notation', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/phase6-no-notation');
    expect(res.status).toBe(200);
    // Section header must not render; aria-label must not appear.
    expect(res.text).not.toContain('aria-label="Trick notation"');
    expect(res.text).not.toContain('notation-display-tokens');
  });

  it('classifies WHIRL as core_family with educational tooltip', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Whirl — base trick family \(3 ADD\)">WHIRL<\/span>/);
  });

  it('classifies PARADOX WHIRL as modifier + core_family in left-to-right order', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/paradox-whirl');
    expect(res.text).toMatch(/<span class="notation-token notation-modifier" data-role="modifier" title="Paradox — body modifier \(\+1 ADD\)">PARADOX<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Whirl — base trick family \(3 ADD\)">WHIRL<\/span>/);
    const idxParadox = res.text.indexOf('>PARADOX<');
    const idxWhirl   = res.text.indexOf('>WHIRL<');
    expect(idxParadox).toBeGreaterThan(-1);
    expect(idxWhirl).toBeGreaterThan(idxParadox);
  });

  it('classifies BLURRY MIRAGE as set + core_family (BLURRY rendered as set, not modifier)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blur');
    expect(res.text).toMatch(/<span class="notation-token notation-set" data-role="set" title="Blurry — set modifier \(\+1 ADD\)">BLURRY<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Mirage — base trick family \(2 ADD\)">MIRAGE<\/span>/);
    // Important: BLURRY must NOT render as modifier (would lose set-vs-modifier semantic distinction).
    expect(res.text).not.toMatch(/<span class="notation-token notation-modifier"[^>]*>BLURRY<\/span>/);
  });

  it('classifies ATW as core_family via alias resolution to around-the-world', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/around-the-world');
    // Alias 'atw' resolves to slug 'around-the-world'; tooltip carries the
    // resolved canonical name per the §5.4a ratification.
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Base trick family: around-the-world">ATW<\/span>/);
  });

  it('classifies HEAD STALL as unusual_surface + suffix', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/head-stall');
    expect(res.text).toMatch(/<span class="notation-token notation-unusual-surface" data-role="unusual_surface" title="Head — unusual delay surface">HEAD<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-suffix" data-role="suffix" title="Surface suffix">STALL<\/span>/);
  });

  it('classifies STEPPING DUCKING PARADOX TORQUE (gauntlet) as 3 modifiers + core_family in order', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/gauntlet');
    expect(res.text).toMatch(/<span class="notation-token notation-modifier" data-role="modifier" title="Stepping — body modifier \(\+1 ADD\)">STEPPING<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-modifier" data-role="modifier" title="Ducking — body modifier \(\+1 ADD\)">DUCKING<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-modifier" data-role="modifier" title="Paradox — body modifier \(\+1 ADD\)">PARADOX<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Torque — base trick family \(4 ADD; miraging osis\)">TORQUE<\/span>/);
    const indices = ['STEPPING', 'DUCKING', 'PARADOX', 'TORQUE'].map(t => res.text.indexOf(`>${t}<`));
    expect(indices.every(i => i > -1)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b)); // monotonic left-to-right
  });

  it('classifies unrecognized tokens as unresolved without affecting recognized neighbors', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/phase6-mixed');
    // WEIRD-TOKEN matches no registry → unresolved with the educational tooltip.
    expect(res.text).toMatch(/<span class="notation-token notation-unresolved" data-role="unresolved" title="Unrecognized — community notation may be evolving">WEIRD-TOKEN<\/span>/);
    // Recognized tokens still classify normally.
    expect(res.text).toMatch(/<span class="notation-token notation-modifier"[^>]*>PARADOX<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-core-family"[^>]*>WHIRL<\/span>/);
  });

  it('preserves single-space separators between tokens in rendered HTML', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/paradox-whirl');
    // Tokens are separated by exactly one space (Handlebars {{#unless @last}}).
    expect(res.text).toMatch(/<\/span> <span class="notation-token notation-core-family"/);
  });
});
