/**
 * Dictionary browse-view row rendering.
 *
 * Every browse view renders the one shared two-line row: the name links to the
 * trick's page, a separate Detail control agrees with it, the hashtag signals
 * media, and the difficulty value and movement notation ride the second column.
 * By modifier keeps its own compact-list density for the group index above its
 * rows and is outside the uniformity assertions here.
 *
 * Sample tricks:
 *   - toe stall   — sparse base trick, low ADD
 *   - mirage      — base trick, simple operational notation
 *   - butterfly   — family anchor (slug === trick_family)
 *   - ripwalk     — compound with aliases
 *   - mobius      — compound with folk-name alias (gyro torque)
 *   - montage     — flagship deep compound
 *   - torque      — null operational notation but present in the equivalence chain registry
 *
 * Invariants verified:
 *   - Every browse view returns 200 and renders the two-line row stack
 *   - A row renders: linked name, #slug chip, separate Detail control, the
 *     difficulty value and the notation; never a prose description, and never
 *     an authoring-status marker
 *   - Sparse and deep tricks render through the one shared row template
 *   - Rows are grouped under their ADD / family / category section anchors
 *   - Tier-4 executable-accounting prose stays off browse rows
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
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3095');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Toe Stall — sparse base trick; minimal notation; no aliases
  insertFreestyleTrick(db, {
    slug:                 'toe_stall',
    canonical_name:       'toe stall',
    adds:                 '1',
    base_trick:           'toe-stall',
    trick_family:         'toe-stall',
    category:             'base',
    operational_notation: '[toe] > toe',
  });

  // Mirage — base trick; classic in-to-out hippy-dex
  insertFreestyleTrick(db, {
    slug:                 'mirage',
    canonical_name:       'mirage',
    adds:                 '2',
    base_trick:           'mirage',
    trick_family:         'mirage',
    category:             'compound',
    operational_notation: '[set] > op in dex > op toe',
  });

  // Butterfly — base trick (family anchor; slug === trick_family)
  insertFreestyleTrick(db, {
    slug:                 'butterfly',
    canonical_name:       'butterfly',
    adds:                 '3',
    base_trick:           'butterfly',
    trick_family:         'butterfly',
    category:             'compound',
    operational_notation: '[clip] > butterfly wing > ss clipper',
  });

  // Ripwalk — compound; aliases populated; full operational
  insertFreestyleTrick(db, {
    slug:                 'ripwalk',
    canonical_name:       'ripwalk',
    adds:                 '4',
    base_trick:           'butterfly',
    trick_family:         'butterfly',
    category:             'compound',
    operational_notation: '[clip] > op in dex > butterfly wing > ss clipper',
  });
  insertFreestyleTrickAlias(db, 'stepping_butterfly', 'ripwalk', 'stepping butterfly');
  insertFreestyleTrickAlias(db, 'blurry_butterfly', 'ripwalk', 'blurry butterfly');

  // Third butterfly member so the family clears the family-view three-member
  // minimum and renders as its own section.
  insertFreestyleTrick(db, {
    slug:                 'parkwalk',
    canonical_name:       'parkwalk',
    adds:                 '5',
    base_trick:           'butterfly',
    trick_family:         'butterfly',
    category:             'compound',
    operational_notation: '[clip] > op out dex > op in dex > butterfly wing > ss clipper',
  });

  // Mobius — folk-name alias is the trick's semantic compressed form
  insertFreestyleTrick(db, {
    slug:                 'mobius',
    canonical_name:       'mobius',
    adds:                 '5',
    base_trick:           'osis',
    trick_family:         'osis',
    category:             'compound',
    operational_notation: '[clip] > spinning > ss miraging op osis',
  });
  insertFreestyleTrickAlias(db, 'gyro_torque', 'mobius', 'gyro torque');

  // Montage — flagship deep compound; no alias
  insertFreestyleTrick(db, {
    slug:                 'montage',
    canonical_name:       'montage',
    adds:                 '7',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > spinning > ducking > paradox symposium whirl > ss clipper',
  });

  // A trick WITHOUT operational notation — pending state branch
  insertFreestyleTrick(db, {
    slug:                 'somenewtrick',
    canonical_name:       'somenewtrick',
    adds:                 '3',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: null,
  });

  // Fixture: a trick with NULL operational notation but PRESENT in the
  // chain registry. Must render
  // the ≡ readings without the "Notation pending" placeholder (the chain
  // already carries the structural information).
  // `torque` is in SYMBOLIC_EQUIVALENCE_CHAINS per src/content/freestyleSymbolicEquivalences.ts.
  insertFreestyleTrick(db, {
    slug:                 'torque',
    canonical_name:       'torque',
    adds:                 '4',
    base_trick:           'osis',
    trick_family:         'osis',
    category:             'compound',
    operational_notation: null,
  });

  // Minimal modifier-link seeding so the component view renders
  // at least one body-modifier group, exercising the row-stack assertion
  // in the per-view rendering guard below.
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifierLink(db, 'mobius',  'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'montage', 'spinning', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. Route stability + partial rendering
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks (By ADD) — route stability', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
  });

  it('renders the two-line row stack container', async () => {
    // The same contract every browse view holds; the ADD view is not special.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).not.toContain('dict-card-stack');
  });

  it('renders ADD-group sections with anchor IDs', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('id="add-1"');
    expect(res.text).toContain('id="add-2"');
    expect(res.text).toContain('id="add-4"');
    expect(res.text).toContain('id="add-5"');
    expect(res.text).toContain('id="add-7"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Card structure
// ─────────────────────────────────────────────────────────────────────────

describe('dictionary trick row — required slots', () => {
  it('links the trick name to its page and offers a separate Detail control', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    // The plain-English name is the route to the trick's page, the way every
    // other entity list on the site links its title.
    expect(res.text).toMatch(/<a class="dict-trick-row-title" href="\/freestyle\/tricks\/ripwalk">ripwalk<\/a>/);
    expect(res.text).toMatch(/<a class="dict-trick-row-title" href="\/freestyle\/tricks\/mobius">mobius<\/a>/);
    expect(res.text).toMatch(/<a class="dict-trick-row-title" href="\/freestyle\/tricks\/montage">montage<\/a>/);
    // A distinct Detail control resolves to the same page, so the two agree.
    expect(res.text).toMatch(/<a class="tag-chip tag-chip--sm" href="\/freestyle\/tricks\/ripwalk">Detail<\/a>/);
    expect(res.text).toMatch(/<a class="tag-chip tag-chip--sm" href="\/freestyle\/tricks\/mobius">Detail<\/a>/);
    expect(res.text).toMatch(/<a class="tag-chip tag-chip--sm" href="\/freestyle\/tricks\/montage">Detail<\/a>/);
  });

  it('renders the #slug tag-identity chip on every row', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('<span class="hashtag" aria-label="Tag identity">#ripwalk</span>');
    expect(res.text).toContain('<span class="hashtag" aria-label="Tag identity">#mobius</span>');
    expect(res.text).toContain('<span class="hashtag" aria-label="Tag identity">#montage</span>');
  });

  it('renders the difficulty value on every row, in parentheses beside the notation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    // The value is the number alone. Spelling out "N ADD" per row would
    // restate the grouping header on the one view that already says it, so
    // the row carries the compact form on every view alike.
    for (const value of ['(1)', '(2)', '(4)', '(5)', '(7)']) {
      expect(res.text, `the row must carry the ${value} difficulty value`)
        .toMatch(new RegExp(`<span class="dict-trick-row-add" aria-label="Difficulty value">\\${value[0]}${value.slice(1, -1)}\\)</span>`));
    }
  });

  it('a first-class trick renders its curator chain in the notation column', async () => {
    // A first-class trick carries no tokenized operational notation of its
    // own; its chain is a plain curator string. Without it the whole
    // first-class cohort would render an empty notation column.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    const toeStallRow = res.text.match(/data-trick-slug="toe_stall"[\s\S]*?<\/article>/);
    expect(toeStallRow).not.toBeNull();
    expect(toeStallRow![0]).toMatch(/<code class="dict-trick-row-notation-value">/);
    expect(toeStallRow![0]).toMatch(/SET[\s\S]*?TOE/);
  });

  it('renders no authoring-status marker on any browse row', async () => {
    // A row states what a trick is, never how far along our own authoring of
    // it has got. Status belongs on the trick detail page.
    for (const view of ['add', 'family', 'category', 'component', 'topology']) {
      const res = await request(createApp()).get(`/freestyle/tricks?view=${view}`);
      expect(res.text, `${view} must render no decomposition-under-review pill`)
        .not.toContain('decomposition under review');
      expect(res.text, `${view} must render no incomplete badge`)
        .not.toContain('dict-badge-incomplete');
    }
  });

  it('"Notation pending" placeholder is silent across all browse views', async () => {
    // A row renders its notation when there is notation and nothing at all
    // otherwise. Absent notation is data coverage, not something a browse row
    // announces, so no placeholder appears on any view.
    for (const url of [
      '/freestyle/tricks?view=add',
      '/freestyle/tricks?view=family',
      '/freestyle/tricks?view=category',
      '/freestyle/tricks?view=component',
      '/freestyle/tricks?view=topology',
    ]) {
      const res = await request(createApp()).get(url);
      expect(res.text).not.toMatch(/<em>Notation pending<\/em>/);
      expect(res.text).not.toContain('Notation pending');
    }
  });

  it('Tier-4 executable-accounting prose is absent across all browse views', async () => {
    // 4-tier rendering hierarchy contract: Tier-4 executable-accounting
    // prose patterns (xbody(N), dex(N), stall(N), spin(N), "= N ADD"
    // results) render ONLY on /freestyle/add-analysis, (future)
    // trick-detail disclosure surfaces, AND the compact first-class
    // secondary row on the governed first-class cohort. The dictionary
    // card partial enforces tiers 1-3 for the general cohort; this regex
    // sweep guards against leakage onto NON-first-class cards.
    //
    // Cohort mirrors FIRST_CLASS_TIER_1 ∪ FIRST_CLASS_TIER_2 in
    // src/services/freestyleService.ts. Update both together when the
    // cohort changes.
    const FIRST_CLASS_COHORT_SLUGS = [
      // Tier 1 — 12 elite (11 atoms + pendulum)
      'osis', 'toe_stall', 'clipper_stall', 'mirage', 'whirl', 'butterfly',
      'swirl', 'legover', 'pickup', 'illusion', 'around_the_world', 'pendulum',
      // Tier 1 — foundational 1-ADD primitives
      'heel_stall', 'inside_stall', 'outside_stall', 'head_stall',
      'forehead_stall', 'neck_stall', 'knee_stall', 'shoulder_stall',
      'sole_kick', 'cloud_kick', 'peak_stall',
      'flying_inside', 'flying_outside', 'double_knee',
      // Tier 1 — foundational 2-ADD primitives + knee-clipper + guay
      'cloud_stall', 'dragonfly_kick', 'flying_clipper', 'knee_clipper', 'guay',
      // Tier 2 — original (9)
      'paradox_mirage', 'symposium_mirage', 'atomic_butterfly', 'ripwalk',
      'ducking_butterfly', 'spinning_butterfly', 'stepping_osis',
      'eggbeater', 'paradox_symposium_whirl',
      // Tier 2 — audit-derived (5)
      'atomic_torque', 'ducking_mirage', 'paradox_drifter',
      'spinning_pickup', 'tapping_whirl',
      // Tier 2 — RESOLVED_FORMULAS promotions (19)
      'atom_smasher', 'dimwalk', 'ducking_clipper', 'ducking_osis',
      'ducking_whirl', 'fog', 'orbit', 'paradox_blender', 'paradox_torque',
      'rake', 'rev_up', 'rev_whirl', 'smear', 'spinning_clipper',
      'spinning_osis', 'spinning_torque', 'stepping_whirl',
      'symposium_whirl', 'whirling_swirl',
      // Tier 2 — audit-validated promotions (28)
      'squeeze', 'barrage', 'barfly', 'high_plains_drifter', 'paradon',
      'barraging_osis',
      'cross_body_sole_stall', 'legeater', 'paste', 'reverse_drifter',
      'scrambled_eggbeater', 'tap', 'blur', 'hatchet', 'paradox_whirl',
      'pigbeater', 'spinning_whirl', 'tripwalk', 'matador', 'phoenix',
      'spinal_tap', 'spinning_symposium_whirl', 'witchdoctor',
      'mind_bender', 'mullet', 'spender', 'gauntlet', 'montage',
      // Tier 2 — mechanical notation back-fill (19)
      'flail', 'magellan', 'merkon', 'smudge',
      'assassin', 'haze', 'mantis', 'nova', 'parkwalk', 'royale',
      'smog', 'smoke', 'tapdown', 'tombstone',
      'blurriest', 'grave_digger', 'tomahawk', 'big_apple',
      'sole_stall',
      // Tier 2 — observational→canonical promotions (14)
      'blizzard', 'blaze', 'bedwetter', 'sole_survivor',
      'spinning_paradox_mirage', 'spinning_paradox_illusion',
      'spinning_paradox_whirl', 'paradox_double_leg_over',
      'paradox_barrage', 'paradox_symposium_mirage',
      'paradox_high_plains_drifter', 'spinning_paradox_blender',
      'stepping_ducking_paradox_blender', 'paradox_blizzard',
      // Tier 2 — doctrine-divergence pilot (3)
      'blurrage', 'predator', 'schmoe',
    ];
    const accountingPatterns: ReadonlyArray<RegExp> = [
      /\bxbody\(\d/,
      /\bdex\(\d/,
      /\bstall\(\d/,
      /\bspin\(\d/,
      /(?:=|&#x3D;)\s*\d+\s*ADD\b/,
    ];
    const stripFirstClassCardRegions = (html: string): string => {
      let stripped = html;
      for (const slug of FIRST_CLASS_COHORT_SLUGS) {
        // Remove each first-class card's full <article>…</article> region
        // so the sweep below only inspects non-first-class card content.
        const re = new RegExp(`<article[^>]*data-trick-slug="${slug}"[\\s\\S]*?</article>`, 'g');
        stripped = stripped.replace(re, '');
      }
      return stripped;
    };
    for (const url of [
      '/freestyle/tricks?view=add',
      '/freestyle/tricks?view=family',
      '/freestyle/tricks?view=category',
      '/freestyle/tricks?view=component',
      '/freestyle/tricks?view=topology',
      '/freestyle/tricks?view=movement-system',
    ]) {
      const res = await request(createApp()).get(url);
      expect(res.status).toBe(200);
      const sweep = stripFirstClassCardRegions(res.text);
      for (const pattern of accountingPatterns) {
        expect(
          sweep,
          `${url} must not render Tier-4 accounting pattern ${pattern} outside first-class cards`,
        ).not.toMatch(pattern);
      }
    }
  });

  it('a trick with no notation renders an empty notation column, not a placeholder', async () => {
    // torque carries no operational notation at all. The row shows its
    // difficulty value and stops; it never announces the absence.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    const torqueStart = res.text.indexOf('data-trick-slug="torque"');
    expect(torqueStart).toBeGreaterThan(-1);
    const torqueEnd = res.text.indexOf('</article>', torqueStart);
    const torqueRegion = res.text.substring(torqueStart, torqueEnd);
    expect(torqueRegion).toContain('dict-trick-row-add');
    expect(torqueRegion).not.toContain('Notation pending');
  });

  it('does NOT render prose description in the browse row', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // The legacy By ADD view emitted .trick-description; the row never does.
    expect(res.text).not.toContain('trick-description');
  });

  it('renders a row article element for every seeded trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // Each row renders as <article class="dict-trick-row" data-trick-slug="...">.
    const slugAttrCount = (res.text.match(/data-trick-slug="/g) ?? []).length;
    expect(slugAttrCount).toBeGreaterThanOrEqual(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Sparse + deep cards through the SAME card
// ─────────────────────────────────────────────────────────────────────────

describe('dictionary trick row — sparse and deep render through the same template', () => {
  it('Toe Stall (sparse) renders cleanly: linked name, Detail control, chain', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toMatch(/<a class="dict-trick-row-title" href="\/freestyle\/tricks\/toe_stall">toe stall<\/a>/);
    expect(res.text).toMatch(/<a class="tag-chip tag-chip--sm" href="\/freestyle\/tricks\/toe_stall">Detail<\/a>/);
    const toeStallRow = res.text.match(/data-trick-slug="toe_stall"[\s\S]*?<\/article>/);
    expect(toeStallRow).not.toBeNull();
    expect(toeStallRow![0]).toMatch(/SET[\s\S]*?TOE/);
  });

  it('Montage (deep) renders cleanly: the same two columns, no extra apparatus', async () => {
    // A seven-operator compound gets no richer treatment than a one-operator
    // trick: the depth lives in the notation, not in extra rows or chrome.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    const montageStart = res.text.indexOf('data-trick-slug="montage"');
    expect(montageStart).toBeGreaterThan(-1);
    const montageEnd = res.text.indexOf('</article>', montageStart);
    expect(montageEnd).toBeGreaterThan(montageStart);
    const montageRegion = res.text.substring(montageStart, montageEnd);

    expect(montageRegion).toContain('montage');
    expect(montageRegion).toContain('(7)');
    // Identity column then notation column, and nothing else.
    expect(montageRegion).toContain('dict-trick-row-identity');
    expect(montageRegion).toContain('dict-trick-row-notation');
    // The operator vocabulary reaches the row through the notation tokens.
    expect(montageRegion).toMatch(/<code class="dict-trick-row-notation-value">/);
    const tokenElements = (montageRegion.match(/<span class="op-token /g) ?? []);
    expect(tokenElements.length).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Card placement within ADD groups
// ─────────────────────────────────────────────────────────────────────────

describe('dictionary-trick-card — grouping', () => {
  it('Ripwalk card lands inside the 4-ADD section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const sectionStart = res.text.indexOf('id="add-4"');
    const nextSectionStart = res.text.indexOf('id="add-5"', sectionStart);
    expect(sectionStart).toBeGreaterThan(-1);
    expect(nextSectionStart).toBeGreaterThan(sectionStart);
    const region = res.text.substring(sectionStart, nextSectionStart);
    expect(region).toContain('data-trick-slug="ripwalk"');
  });

  it('Mobius card lands inside the 5-ADD section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const sectionStart = res.text.indexOf('id="add-5"');
    const nextSectionStart = res.text.indexOf('id="add-7"', sectionStart);
    expect(sectionStart).toBeGreaterThan(-1);
    const region = res.text.substring(sectionStart, nextSectionStart > sectionStart ? nextSectionStart : res.text.length);
    expect(region).toContain('data-trick-slug="mobius"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Regression — other views still respond 200
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// By Family view
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=family — trick rows', () => {
  it('renders family sections with anchor IDs', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="family-butterfly"');
  });

  it('family section heading wraps an <a> family-filter link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    // Family name renders display-cased (first letter capitalised).
    expect(res.text).toMatch(/<h2><a href="\/freestyle\/tricks\?family=butterfly">Butterfly family<\/a><\/h2>/);
  });

  it('family section renders the two-line dict-trick-row stack', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('dict-trick-row-stack');
    // The rows inside the family section carry data-trick-slug from our seeded set.
    expect(res.text).toContain('data-trick-slug="butterfly"');
    expect(res.text).toContain('data-trick-slug="ripwalk"');
  });

  it('butterfly family heading renders the walking-progression cross-link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('trick-family-cross-link');
    expect(res.text).toContain('href="/freestyle/progression/walking-family"');
    expect(res.text).toContain('Walking-family progression');
  });

  it('anchor-first ordering: butterfly base trick renders before its compound members', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    const familySectionStart = res.text.indexOf('id="family-butterfly"');
    expect(familySectionStart).toBeGreaterThan(-1);
    const familySectionEnd = res.text.indexOf('</section>', familySectionStart);
    expect(familySectionEnd).toBeGreaterThan(familySectionStart);
    const section = res.text.slice(familySectionStart, familySectionEnd);
    // The anchor (butterfly, slug === family slug) renders first regardless of ADD.
    const butterflyIdx = section.indexOf('data-trick-slug="butterfly"');
    const ripwalkIdx   = section.indexOf('data-trick-slug="ripwalk"');
    expect(butterflyIdx).toBeGreaterThan(-1);
    expect(ripwalkIdx).toBeGreaterThan(butterflyIdx);
  });
});

describe('other dictionary views — per-view rendering contract', () => {
  it('/freestyle/tricks?view=family returns 200 and uses the two-line row contract', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).not.toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=component returns 200 and uses the two-line row contract', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-trick-row-stack');
  });

  it('/freestyle/tricks?view=modifier returns 200 (the modifier browse)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=modifier');
    expect(res.status).toBe(200);
    // ?view=modifier renders the modifier-grouped browse, not a component
    // alias. Active-toggle marker confirms the routing.
    expect(res.text).toMatch(/class="trick-view-toggle-active">By modifier</);
  });

  it('/freestyle/tricks?view=category returns 200 and uses the two-line row contract', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-trick-row-stack');
  });

  it('no browse view falls back to a second row system', async () => {
    // One row contract, no exceptions. A view reintroducing card-density
    // markup fails here rather than shipping a page where the same trick
    // reads two different ways depending on how the reader arrived. The
    // negative holds for every view; the positive is asserted only where this
    // fixture seeds members, since a view with no matching trick correctly
    // renders its empty state instead of a stack.
    const POPULATED = new Set(['add', 'family', 'category', 'component', 'topology', 'movement-system', 'dex-count']);
    for (const view of ['add', 'family', 'set', 'category', 'component', 'topology', 'movement-system', 'dex-count']) {
      const url = `/freestyle/tricks?view=${view}`;
      const res = await request(createApp()).get(url);
      expect(res.status).toBe(200);
      expect(res.text, `${url} must not render card-density markup`).not.toContain('dict-card-stack');
      if (POPULATED.has(view)) {
        expect(res.text, `${url} must render the shared row stack`).toContain('dict-trick-row-stack');
      }
    }
  });
});
