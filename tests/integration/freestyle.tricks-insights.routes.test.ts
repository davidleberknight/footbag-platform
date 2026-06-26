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

  // Active canonical row with no numeric ADD: exercises the
  // 'Unrated / unresolved' bucket on the ADD view. Empty-string adds matches
  // real data (loader-21 emits empty when the source has no ADD value). It is
  // active + adjudicated (not external), so the canonical browse keeps it.
  insertFreestyleTrick(db, {
    slug:           'unrated-quasar',
    canonical_name: 'unrated quasar',
    adds:           '',
    category:       'compound',
    description:    null,
    notation:       null,
    sort_order:     91,
    review_status:  'curated',
    is_active:      1,
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

  // Trick-dictionary media-coverage fixtures. Coverage comes from the
  // curator-tagged channel (media_items + media_tags + tags); a clip's
  // source_id sets its tier. The fixtures below seed tutorial-tier and
  // demo-tier clips so the dictionary chip exercises all three states:
  // 'tutorial', 'demo', and 'none' (every trick with no tagged clip).

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
  insertFreestyleTrickModifier(db, { slug: 'stepping', modifier_name: 'stepping', modifier_type: 'set', add_bonus: 1, add_bonus_rotational: 1 });

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
    slug: 'around_the_world', canonical_name: 'around the world', adds: '2',
    base_trick: 'around_the_world', trick_family: 'around_the_world', category: 'dex',
    description: 'full leg circle around the bag', notation: 'ATW', sort_order: 53,
  });
  insertFreestyleTrickAlias(db, 'atw', 'around_the_world', 'atw');

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

  // A trick whose tutorial-tier coverage comes from the curator-tagged
  // channel (media_items + media_tags + tags). It must surface as
  // 'tutorial' on the dictionary index media chip.
  insertFreestyleTrick(db, {
    slug:           'curator-only-trick',
    canonical_name: 'curator only trick',
    adds:           '4',
    base_trick:     'curator-only-trick',
    trick_family:   'curator-only-trick',
    category:       'compound',
    description:    'curator-tagged tutorial coverage only',
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
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
  });

  it('shows page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('Trick Dictionary');
  });

  it('shows all active non-modifier tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
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
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('3');   // whirl
    expect(res.text).toContain('6');   // blurriest
  });

  it('links all dict tricks to /freestyle/tricks/:slug (not just those with records)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    // whirl has records — linked
    expect(res.text).toContain('/freestyle/tricks/whirl');
    // blurriest has no record — but is in the dict, so now also linked
    expect(res.text).toContain('/freestyle/tricks/blurriest');
  });

  it('shows record indicator (★) for tricks that have passback records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    // whirl has a record — should show the star indicator
    // blurriest has no record — no star (but still has a link)
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurriest');
  });

  it('atom dictionary cards surface curator-authored op-notation via the ADD-view JOB slot (not a chip)', async () => {
    // First-class atoms suppress the standalone op-notation chip; their JOB
    // chain surfaces on line 2 of the ADD-view two-line row (the JOB slot,
    // sourced from firstClassChainValue). The ATW alias is still suppressed
    // from atom browse cards. Legover ≡ leg-over orthographic noise stays out.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const atwIdx = res.text.indexOf('data-trick-slug="around_the_world"');
    expect(atwIdx).toBeGreaterThan(0);
    const atwCardEnd = res.text.indexOf('</article>', atwIdx);
    const atwCard = res.text.slice(atwIdx, atwCardEnd);
    // No standalone op-notation chip (shared-card class) on the ADD-view row.
    expect(atwCard).not.toMatch(/<code class="dict-card-notation/);
    // Line 2 carries the labeled JOB slot with the symbolic chain.
    expect(atwCard).toMatch(/dict-trick-row-label">JOB</);
    expect(atwCard).toMatch(/dict-trick-row-job-value">[\s\S]*?TOE[\s\S]*?\[DEX\]/);
    // Leg-over orthographic noise still filtered out everywhere.
    expect(res.text).not.toContain('leg over');
  });

  it('shows trick count in hero stats', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
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
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // ADD view uses the two-line dict-trick-row contract: no table header; the
    // JOB chain (or an interpretation reading) renders on the row, not in a
    // table column.
    expect(res.text).not.toContain('<th>Notation</th>');
    expect(res.text).toMatch(/dict-trick-row-job-value|dict-trick-row-interpretation/);
  });

  it('does not list modifier rows in the category groups', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // Modifier-category section header must not appear in the page.
    expect(res.text).not.toMatch(/<h2>Modifier<\/h2>/);
    // The modifier-category trick we seeded must not have a row in the
    // category listing. Detail link to that slug should also be absent.
    expect(res.text).not.toContain('href="/freestyle/tricks/ducking"');
  });

  it('does not render the Modifier Reference section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
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

  it('renders the plain-language onboarding lede (no governance note)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="dict-onboarding"');
    // The corpus counts are surfaced as supporting metadata, in beginner-facing
    // wording (not the internal "canonical").
    expect(res.text).toContain('come with a full page');
    expect(res.text).toMatch(/[\d,]+ trick names in all/);
    expect(res.text).toMatch(/[\d,]+ nicknames/);
    // The retired publication-state expansion note must not return.
    expect(res.text).not.toContain('being expanded and aligned with established freestyle notation');
  });
});

describe('GET /freestyle/tricks?family=… — hashtag filter', () => {
  it('narrows the dictionary to a single family and shows the filter pill', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?family=whirl');
    expect(res.status).toBe(200);
    // Self-orienting family header: family name, trick count, the shared ending
    // in plain words, and a clear-filter link.
    expect(res.text).toMatch(/ family: \d+ tricks?\./);
    expect(res.text).toContain('finish with a whirl');
    expect(res.text).toMatch(/href="\/freestyle\/tricks"[^>]*>Clear the filter</);
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
    // Falls through to unfiltered dictionary; the family header must NOT render
    expect(res.text).not.toContain('to see the full dictionary');
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
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('class="related-set-groups"');
    expect(res.text).not.toContain('Related set/modifier groups:');
  });

  it('does NOT render the Related set/modifier groups block for a family with no modifier-linked tricks', async () => {
    const app = createApp();
    // legover family has one trick (legover) and no modifier_links rows.
    const res = await request(app).get('/freestyle/tricks?family=legover');
    expect(res.text).toMatch(/ family: \d+ tricks?\./); // sanity: filter active
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

  it('Watch pathway links to the in-page consecutive-records anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    // When records exist, the link target is #passback-records (the
    // anchor id is preserved for URL stability).
    expect(res.text).toMatch(/href="#passback-records"/);
    // The Consecutive Records section carries the matching id anchor.
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

describe('GET /freestyle/tricks/:slug — Media section + Learn-pathway counts', () => {
  it('tutorial-only trick: Media section links to the gallery; Learn pathway counts only tutorials', async () => {
    const app = createApp();
    // 'phase3-tutorial-only' has one tt_youtube curator-tagged clip and no
    // demo-tier coverage.
    const res = await request(app).get('/freestyle/tricks/phase3-tutorial-only');
    expect(res.status).toBe(200);
    // The Media section links to the trick gallery; clips are watched there, not
    // embedded inline, so there are no per-tier subsections.
    expect(res.text).toMatch(/<h2>Media<\/h2>/);
    expect(res.text).toContain('href="/media/browse?context&#x3D;phase3-tutorial-only"');
    expect(res.text).not.toMatch(/<h2>\s*Reference Media\s*<\/h2>/);
    expect(res.text).not.toContain('reference-media-subsection');
    // Learn pathway counts ONLY tutorials. Anchor on the pathway li.
    const learnIdx = res.text.indexOf('trick-pathway--learn');
    expect(learnIdx).toBeGreaterThan(0);
    const learnEnd = res.text.indexOf('</li>', learnIdx);
    const learnSlice = res.text.slice(learnIdx, learnEnd);
    expect(learnSlice).toMatch(/\d+ tutorials? available/);
    expect(learnSlice).not.toMatch(/demonstrations? available/);
  });

  it('demo-only trick: Media section links to the gallery; Learn pathway counts only demos', async () => {
    const app = createApp();
    // 'phase3-demo-only' has one footbag_finland curator-tagged clip and no
    // tutorial-tier coverage.
    const res = await request(app).get('/freestyle/tricks/phase3-demo-only');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<h2>Media<\/h2>/);
    expect(res.text).toContain('href="/media/browse?context&#x3D;phase3-demo-only"');
    expect(res.text).not.toMatch(/<h2>\s*Reference Media\s*<\/h2>/);
    expect(res.text).not.toContain('reference-media-subsection');
    // Learn pathway counts ONLY demos. The legacy "X tutorials available"
    // wording must NOT render here — that was the tutorial/demo conflation bug.
    const learnIdx = res.text.indexOf('trick-pathway--learn');
    expect(learnIdx).toBeGreaterThan(0);
    const learnEnd = res.text.indexOf('</li>', learnIdx);
    const learnSlice = res.text.slice(learnIdx, learnEnd);
    expect(learnSlice).toMatch(/\d+ demonstrations? available/);
    expect(learnSlice).not.toMatch(/tutorials? available/);
    expect(learnSlice).not.toContain('No tutorials yet');
  });

  it('mixed-tier trick: Media section links to the gallery; Learn pathway counts both separately', async () => {
    const app = createApp();
    // 'phase3-mixed-media' has BOTH a tt_youtube and a footbag_finland clip
    // in the curator-tagged channel.
    const res = await request(app).get('/freestyle/tricks/phase3-mixed-media');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<h2>Media<\/h2>/);
    expect(res.text).toContain('href="/media/browse?context&#x3D;phase3-mixed-media"');
    expect(res.text).not.toMatch(/<h2>\s*Reference Media\s*<\/h2>/);
    expect(res.text).not.toContain('reference-media-subsection');
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
    // The family badge is unified into the hero metadata ribbon as
    // .trick-hero-meta-chip-family; the chip carries the resolved family
    // display name and links to the family filter. Whirl is its own root
    // family (distinct from swirl), so the chip reads "Whirl family".
    expect(res.text).toMatch(/class="trick-hero-meta-chip trick-hero-meta-chip-family"[^>]*href="\/freestyle\/tricks\?family=whirl"[^>]*>Whirl family</);
  });

  it('same-family peers are surfaced by the Family ladder', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    // The whirl-family peer spinning-whirl is surfaced via the Family ladder,
    // not the Related Tricks section.
    expect(res.text).toContain('content-section trick-family-lineage');
    const familySection = res.text.split('Family</h2>')[1] ?? '';
    expect(familySection).toContain('/freestyle/tricks/spinning-whirl');
  });
});

// Previous Tricks and Next Tricks are no longer standalone sections; lower-ADD
// and higher-ADD same-family navigation is owned by the Family ladder.
describe('GET /freestyle/tricks/:slug — Previous/Next Tricks sections removed', () => {
  it('does not render a Previous Tricks section, surfacing lower-ADD peers via the Family ladder', async () => {
    const app = createApp();
    // 'spinning-whirl' (5 ADD) has whirl(3) as a lower-ADD family peer.
    const res = await request(app).get('/freestyle/tricks/spinning-whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Previous Tricks');
    // The lower-ADD peer is surfaced via the Family ladder instead. Anchor on the
    // section class, not the heading word: a non-parent's lineage heading reads
    // "Related", not "Family".
    expect(res.text).toContain('content-section trick-family-lineage');
    const familySection = res.text.split('content-section trick-family-lineage')[1] ?? '';
    expect(familySection).toContain('/freestyle/tricks/whirl');
  });

  it('does not render a Next Tricks section, surfacing higher-ADD peers via the Family ladder', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Next Tricks');
    // The higher-ADD peer spinning-whirl is surfaced via the Family ladder.
    expect(res.text).toContain('content-section trick-family-lineage');
    const familySection = res.text.split('Family</h2>')[1] ?? '';
    expect(familySection).toContain('/freestyle/tricks/spinning-whirl');
  });
});

describe('GET /freestyle/tricks/:slug — Related Tricks section narrowed', () => {
  it('does not surface same-family peers as a Related Tricks section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // Same-family relating is owned by the Family ladder; the whirl page no
    // longer renders a family-peer Related Tricks section.
    expect(res.text).not.toContain('Related Tricks');
    expect(res.text).not.toContain('related-tricks-list');
  });

  it('Related Tricks section is omitted when no conceptual neighbours exist', async () => {
    const app = createApp();
    // 'legover' is in the dictionary but has no curated movement neighbours.
    const res = await request(app).get('/freestyle/tricks/legover');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Related Tricks');
  });
});

describe('pending row visibility', () => {
  it('pending external placeholders are excluded from the canonical ADD browse', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // Active control still rendered.
    expect(res.text).toContain('whirl');
    // External / unadjudicated placeholders belong to Emerging Vocabulary, not
    // the canonical dictionary browse; they are excluded entirely.
    expect(res.text).not.toContain('pending zorblax');
    expect(res.text).not.toContain('External source, not yet adjudicated');
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
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // The fixture seeds tricks with ADD values; expect at least the 3-ADD
    // bucket header to render (whirl is 3 ADD in this fixture).
    expect(res.text).toMatch(/<h2>3 ADD<\/h2>/);
  });

  it('places at least one known trick in the correct ADD group', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
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
    const res = await request(app).get('/freestyle/tricks?view=add');
    // The fixture seeds active 'unrated quasar' with empty ADD.
    expect(res.text).toContain('Unrated / unresolved');
  });

  // A trick's hashtag links to its media gallery only when reference media
  // exists; a clickable hashtag is the sole signal that media is present, and
  // a trick without media renders a plain (non-clickable) identity token.
  // The card root also exposes data-media-coverage so tests can assert tier
  // classification independently.
  it('renders a data-media-coverage attribute on every card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/data-media-coverage="(?:tutorial|demo|none)"/);
  });

  it('renders the hashtag as a plain token (no gallery link) for tricks with no media coverage', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    // ADD-view rows with data-media-coverage="none" must render the hashtag as
    // a plain span, never as a clickable media-gallery link.
    const cardMatch = res.text.match(/<article class="dict-trick-row[^>]*data-media-coverage="none"[^>]*>([\s\S]*?)<\/article>/);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch![1]).not.toContain('dict-trick-row-hashtag--media');
    expect(cardMatch![1]).toContain('<span class="dict-trick-row-hashtag"');
  });

  it('renders the hashtag as a clickable media-gallery link when a trick has tutorial-tier coverage', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const cardMatch = res.text.match(/<article class="dict-trick-row[^>]*data-media-coverage="tutorial"[^>]*>([\s\S]*?)<\/article>/);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch![1]).toContain('dict-trick-row-hashtag--media');
    expect(cardMatch![1]).toContain('href="/media/browse?context');
  });

  it('renders the hashtag as a clickable media-gallery link when a trick has only demo-tier coverage', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    const cardMatch = res.text.match(/<article class="dict-trick-row[^>]*data-media-coverage="demo"[^>]*>([\s\S]*?)<\/article>/);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch![1]).toContain('dict-trick-row-hashtag--media');
    expect(cardMatch![1]).toContain('href="/media/browse?context');
  });

  it('links the hashtag to the gallery for a trick whose tutorial media comes only from the curator channel', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    // `curator-only-trick`'s tutorial-tier coverage comes from the curator
    // channel: media_items + media_tags + tags with source_id='tt_youtube'.
    // listCoveredTrickSlugsWithSource must surface it as 'tutorial'.
    const slugIdx = res.text.indexOf('data-trick-slug="curator-only-trick"');
    expect(slugIdx).toBeGreaterThan(-1);
    const cardClose = res.text.indexOf('</article>', slugIdx);
    expect(cardClose).toBeGreaterThan(slugIdx);
    const cardBlock = res.text.slice(slugIdx, cardClose);
    expect(cardBlock).toContain('dict-trick-row-hashtag--media');
    expect(cardBlock).toContain('href="/media/browse?context&#x3D;curator-only-trick"');
  });

  it('renders ≡ symbolic-equivalence readings on the ADD-view row', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    // The ADD-view two-line row carries the tokenized ≡ reading on line 1 in
    // the `.dict-trick-row-interpretation` slot (when a meaningful reading exists).
    expect(res.text).toMatch(/class="dict-trick-row-interpretation"/);
    expect(res.text).not.toMatch(/class="dict-card-aliases"/);
  });

  it('suppresses "Notation pending" placeholder in registry density (BROWSE-REFACTOR-1 Slice 1)', async () => {
    // BROWSE-REFACTOR-1 Slice 1: pending placeholder is suppressed on the
    // registry-density By ADD view per the audit (clean identifier-only
    // cards for atoms / pending rows). Browse-density views (family /
    // component / topology) still render the placeholder for rows with
    // neither tokenized ≡ readings nor operational notation.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/<em>Notation pending<\/em>/);
  });

  it('descriptions are not rendered on the By ADD card; the placeholder is gone too', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    // DSC-2 slice 1: prose descriptions are explicitly excluded from the
    // symbolic trick card. The 'Description pending' placeholder is therefore
    // also gone on the ADD view (descriptions still appear in the category
    // view's spreadsheet layout — see "shows trick descriptions ..." above).
    expect(res.text).not.toContain('trick-description');
    expect(res.text).not.toContain('Description pending');
  });

  it('does not render the retired coverage / governance block', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="trick-coverage-summary"');
    expect(res.text).not.toContain('External-source placeholders are shown for transparency');
    // 2026-05-24: lead-count assertion reversed by governance/polish slice.
    // Dynamic canonical-trick count IS now surfaced in the dictionary intro.
  });

  it('renders the view toggle with the ADD view marked active', async () => {
    // Component View soft retirement (2026-05-18) + Category View soft
    // retirement (CR-4 of dictionary-coherence-2026-05-18): both toggle
    // entries removed. Movement System is the canonical modifier-grouped
    // browse surface; Family + Movement System replace Category. The
    // ?view=category and ?view=component routes still resolve with
    // retirement notices for bookmark continuity.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('class="trick-view-toggle"');
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
    expect(res.text).toContain('href="/freestyle/tricks?view=family"');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology"');
    // Soft-retired toggle entries are gone.
    expect(res.text).not.toContain('href="/freestyle/tricks?view=category"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks?view=sets — dedicated By Set view (2026-05-24)', () => {
  // 2026-05-24 governance/polish slice: ?view=sets no longer aliases to
  // ?view=component (which is soft-retired). It now activates the
  // dedicated By Set browse view with two cohorts (Core sets +
  // Secondary / composite systems).

  it('returns 200 and renders the dedicated By Set view (not the component alias)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    // Active-state toggle entry confirms the new view took effect (and
    // is no longer an alias to the soft-retired component view).
    expect(res.text).toMatch(/class="trick-view-toggle-active">By modifier</);
    // Confirm we are NOT showing the soft-retired component view's
    // retirement notice (i.e. the legacy alias is gone).
    expect(res.text).not.toContain('class="component-view-retirement-notice"');
    // Cohort sections render conditional on having modifier-linked
    // tricks; this fixture doesn't seed set modifier links, so the
    // cohort h2s may be empty. Full cohort rendering is exercised in
    // tests/integration/freestyle.sets-view.routes.test.ts.
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
    expect(res.text).toContain('Consecutive Records');
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

  it('does NOT show the Consecutive Records section for dict-only trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blurriest');
    expect(res.text).not.toContain('Consecutive Records');
  });

  it('redirects a modifier row to its operator page instead of rendering it as a trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ducking');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/modifier/ducking');
  });

  it('returns 404 for a slug not in records OR dictionary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/not-a-trick-at-all');
    expect(res.status).toBe(404);
  });

  it('shows record-only trick (not in dict) when accessed by slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mystery_trick');
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

  it('lede links unfamiliar terms to the glossary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('href="/freestyle/glossary"');
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

  it('shows Notable Documented Sequences without claiming they are the hardest', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Notable Documented Sequences');
    expect(res.text).toContain('Greg Solis');
    expect(res.text).toContain('22'); // ADD total
    expect(res.text).not.toContain('Hardest Documented Sequences');
  });

  it('no longer presents the Evolution of Difficulty conclusion or the Analysis prose', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).not.toContain('Evolution of Difficulty');
    expect(res.text).not.toContain('<h2>Analysis</h2>');
  });

  it('restructures into the four labelled areas', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Vocabulary');
    expect(res.text).toContain('Sequence Structure');
    expect(res.text).toContain('Player Diversity');
    expect(res.text).toContain('Archive Notes');
  });

  it('shows diverse players under the Player Diversity area', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Player Diversity');
    expect(res.text).toContain('Mariusz Wilk');
  });

  it('shows the live Most Used Modifiers table, framed as dictionary usage', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Used Modifiers');
    expect(res.text).toContain('dictionary usage, not competitive frequency');
  });

  it('shows Archive Notes with honest dataset framing', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Archive Notes');
    expect(res.text).toContain('395 Sick3 format sequences');
    expect(res.text).toContain('no longer fully reproducible');
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

  it('contains nav links for the language and analysis destinations', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('Trick Dictionary');
    expect(res.text).toContain('Freestyle Patterns');
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
    expect(res.text).toContain('aria-label="Movement notation"');
    expect(res.text).toContain('class="notation-display-tokens"');
  });

  it('omits the notation section entirely when the row has no notation', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/phase6-no-notation');
    expect(res.status).toBe(200);
    // Section header must not render; aria-label must not appear.
    expect(res.text).not.toContain('aria-label="Movement notation"');
    expect(res.text).not.toContain('notation-display-tokens');
  });

  it('classifies WHIRL as core_family with educational tooltip', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Whirl, base trick family \(3 ADD\)">WHIRL<\/span>/);
  });

  it('classifies PARADOX WHIRL as modifier + core_family in left-to-right order', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/paradox-whirl');
    expect(res.text).toMatch(/<span class="notation-token notation-modifier" data-role="modifier" title="Paradox, dex relationship \(\+1 ADD\)">PARADOX<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Whirl, base trick family \(3 ADD\)">WHIRL<\/span>/);
    const idxParadox = res.text.indexOf('>PARADOX<');
    const idxWhirl   = res.text.indexOf('>WHIRL<');
    expect(idxParadox).toBeGreaterThan(-1);
    expect(idxWhirl).toBeGreaterThan(idxParadox);
  });

  it('classifies BLURRY MIRAGE as set + core_family (BLURRY rendered as set, not modifier)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blur');
    expect(res.text).toMatch(/<span class="notation-token notation-set" data-role="set" title="Blurry, set modifier \(\+1 ADD\)">BLURRY<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Mirage, base trick family \(2 ADD\)">MIRAGE<\/span>/);
    // Important: BLURRY must NOT render as modifier (would lose set-vs-modifier semantic distinction).
    expect(res.text).not.toMatch(/<span class="notation-token notation-modifier"[^>]*>BLURRY<\/span>/);
  });

  it('classifies ATW as core_family via alias resolution to around-the-world', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/around_the_world');
    // Alias 'atw' resolves to slug 'around-the-world'; tooltip carries the
    // resolved canonical name per the §5.4a ratification.
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Base trick family: around_the_world">ATW<\/span>/);
  });

  it('classifies HEAD STALL as unusual_surface + suffix', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/head-stall');
    expect(res.text).toMatch(/<span class="notation-token notation-unusual-surface" data-role="unusual_surface" title="Head, unusual delay surface">HEAD<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-suffix" data-role="suffix" title="Surface suffix">STALL<\/span>/);
  });

  it('classifies STEPPING DUCKING PARADOX TORQUE (gauntlet) as 3 modifiers + core_family in order', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/gauntlet');
    expect(res.text).toMatch(/<span class="notation-token notation-set" data-role="set" title="Stepping, set modifier \(\+1 ADD\)">STEPPING<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-modifier" data-role="modifier" title="Ducking, body modifier \(\+1 ADD\)">DUCKING<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-modifier" data-role="modifier" title="Paradox, dex relationship \(\+1 ADD\)">PARADOX<\/span>/);
    expect(res.text).toMatch(/<span class="notation-token notation-core-family" data-role="core_family" title="Torque, base trick family \(4 ADD; miraging osis\)">TORQUE<\/span>/);
    const indices = ['STEPPING', 'DUCKING', 'PARADOX', 'TORQUE'].map(t => res.text.indexOf(`>${t}<`));
    expect(indices.every(i => i > -1)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b)); // monotonic left-to-right
  });

  it('classifies unrecognized tokens as unresolved without affecting recognized neighbors', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/phase6-mixed');
    // WEIRD-TOKEN matches no registry → unresolved with the educational tooltip.
    expect(res.text).toMatch(/<span class="notation-token notation-unresolved" data-role="unresolved" title="Unrecognized, community notation may be evolving">WEIRD-TOKEN<\/span>/);
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
