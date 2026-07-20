/**
 * Dictionary browse-view card and row rendering.
 *
 * The browse views split across two rendering contracts:
 *   - By ADD (the /freestyle/tricks default) and By Family render the two-line
 *     dict-trick-row contract (dict-trick-row-stack), NOT the shared card.
 *   - By Category and By Component render the shared dictionary-trick-card
 *     partial (dict-card-stack).
 *   - By Set uses its own compact-list density and is outside the
 *     card-uniformity contract.
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
 *   - Every browse view returns 200
 *   - By ADD / By Family render the two-line dict-trick-row stack, not the shared card
 *   - By Category / By Component render the shared dictionary-trick-card partial
 *   - A card renders: plain-text title, separate Trick Detail link, #slug chip,
 *     ADD label, tokenized notation or ≡ equivalence readings; never prose description
 *   - Sparse and deep tricks render through the one shared card template
 *   - Cards are grouped under their ADD / family / category section anchors
 *   - Tier-4 executable-accounting prose stays off non-first-class browse cards
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
  // at least one body-modifier group, exercising the dict-card-stack assertion
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

  it('renders the ADD-view two-line row stack container', async () => {
    // The ADD view uses its own two-line dict-trick-row contract (NOT the shared
    // dict-card-stack; that lives on the other browse views).
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

describe('dictionary-trick-card — required slots', () => {
  it('renders the trick name as plain text and a separate Trick Detail link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    // The plain-English name is display text only, never a link.
    expect(res.text).toContain('<span class="dict-card-title">ripwalk</span>');
    expect(res.text).toContain('<span class="dict-card-title">mobius</span>');
    expect(res.text).toContain('<span class="dict-card-title">montage</span>');
    // A distinct Trick Detail control resolves to the detail page.
    expect(res.text).toMatch(/<a class="dict-card-detail" href="\/freestyle\/tricks\/ripwalk">Trick Detail<\/a>/);
    expect(res.text).toMatch(/<a class="dict-card-detail" href="\/freestyle\/tricks\/mobius">Trick Detail<\/a>/);
    expect(res.text).toMatch(/<a class="dict-card-detail" href="\/freestyle\/tricks\/montage">Trick Detail<\/a>/);
  });

  it('renders the #slug tag-identity chip on every card', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('<span class="dict-card-hashtag" aria-label="Tag identity">#ripwalk</span>');
    expect(res.text).toContain('<span class="dict-card-hashtag" aria-label="Tag identity">#mobius</span>');
    expect(res.text).toContain('<span class="dict-card-hashtag" aria-label="Tag identity">#montage</span>');
  });

  it('renders ADD label slot for every seeded trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>1 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>2 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>4 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>5 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>7 ADD<\/span>/);
  });

  it('op-notation chip suppressed on browse cards for first-class tricks (renders only via first-class JOB row)', async () => {
    // The op-notation chip between hashtag and ADD chip would duplicate
    // the JOB row in the first-class secondary row below, so the chip is
    // suppressed for first-class tricks; non-first-class tricks still get
    // it. The op-token role taxonomy itself is exercised on trick-detail
    // pages and on the first-class secondary row's JOB line, which both
    // tokenize via the same renderer.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    // Atoms (toe-stall, mirage, etc.) are first-class — their op-notation
    // chip is suppressed on browse cards.
    const toeStallCard = res.text.match(/data-trick-slug="toe_stall"[\s\S]*?<\/article>/);
    expect(toeStallCard).not.toBeNull();
    expect(toeStallCard![0]).not.toMatch(/<code class="dict-card-notation/);
    // First-class secondary row still carries the JOB line.
    expect(toeStallCard![0]).toMatch(/dict-card-first-class-label[^>]*>JOB:/);
  });

  it('renders ≡ symbolic-equivalence readings from the curator chain registry', async () => {
    // Every browse view renders registry density. The equivalence wrapper
    // picks up the --inline modifier class. The token text content is
    // identical to what ADD View shows.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    // Ripwalk: chain reading 'stepping butterfly'
    expect(res.text).toMatch(/class="core-trick-equivalence dict-card-equivalence[^"]*"[^>]*>[\s\S]*?stepping[\s\S]*?butterfly/i);
    // Mobius: 'gyro torque' reading
    expect(res.text).toMatch(/class="core-trick-equivalence dict-card-equivalence[^"]*"[^>]*>[\s\S]*?gyro[\s\S]*?torque/i);
    // The legacy aliases row is gone:
    expect(res.text).not.toMatch(/class="dict-card-aliases"/);
  });

  it('"Notation pending" placeholder is silent across all browse views', async () => {
    // Every browse view uses registry density. Registry density renders
    // the formula slot silently
    // when neither a curator chain nor operational notation exists — no
    // "Notation pending" italic anywhere on browse cards. This applies
    // uniformly to ADD / Family / Component / Topology / Category views.
    //
    // Cards still indicate their data state via title + ADD chip + (optional)
    // media chip. The pending state is data-coverage, not a render contract.
    for (const url of [
      '/freestyle/tricks?view=add',
      '/freestyle/tricks?view=family',
      '/freestyle/tricks?view=category',
      '/freestyle/tricks?view=component',
      '/freestyle/tricks?view=topology',
    ]) {
      const res = await request(createApp()).get(url);
      expect(res.text).not.toContain('dict-card-notation--pending');
      expect(res.text).not.toMatch(/<em>Notation pending<\/em>/);
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
      'sole_kick', 'cloud_kick', 'peak_delay',
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

  it('F4 — suppresses "Notation pending" when ≡ symbolic equivalences carry the structural information', async () => {
    // F4: cards with chain-registry equivalences should not also display
    // the pending-notation cue; the ≡ readings already convey structural
    // composition. Tested in browse density where the placeholder can
    // appear at all.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    const torqueStart = res.text.indexOf('data-trick-slug="torque"');
    expect(torqueStart).toBeGreaterThan(-1);
    const torqueEnd = res.text.indexOf('</article>', torqueStart);
    const torqueRegion = res.text.substring(torqueStart, torqueEnd);
    // ≡ chain readings render.
    expect(torqueRegion).toMatch(/core-trick-equivalence dict-card-equivalence/);
    // Notation pending placeholder does NOT render inside this card.
    expect(torqueRegion).not.toContain('Notation pending');
    expect(torqueRegion).not.toContain('dict-card-notation--pending');
  });

  it('does NOT render prose description in the browse card', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // The legacy By ADD view emitted .trick-description; the migrated card never renders it.
    expect(res.text).not.toContain('trick-description');
  });

  it('renders the dict-card article element for every seeded trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // Each card renders as <article class="dict-card" data-trick-slug="...">.
    const slugAttrCount = (res.text.match(/data-trick-slug="/g) ?? []).length;
    expect(slugAttrCount).toBeGreaterThanOrEqual(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Sparse + deep cards through the SAME card
// ─────────────────────────────────────────────────────────────────────────

describe('dictionary-trick-card — sparse and deep render through the same template', () => {
  it('Toe Stall (sparse) renders cleanly: title + ADD + first-class JOB row', async () => {
    // The standalone op-notation chip on browse cards is suppressed for
    // first-class tricks (it would duplicate the JOB row below). toe-stall
    // is a core atom + first-class, so its op-notation surfaces via the
    // first-class secondary row's labeled "JOB:" line instead.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('<span class="dict-card-title">toe stall</span>');
    expect(res.text).toMatch(/<a class="dict-card-detail" href="\/freestyle\/tricks\/toe_stall">Trick Detail<\/a>/);
    const toeStallCard = res.text.match(/data-trick-slug="toe_stall"[\s\S]*?<\/article>/);
    expect(toeStallCard).not.toBeNull();
    // No op-notation chip between hashtag and ADD chip.
    expect(toeStallCard![0]).not.toMatch(/<code class="dict-card-notation/);
    // First-class secondary row carries the JOB:
    expect(toeStallCard![0]).toMatch(/dict-card-first-class-label[^>]*>JOB:/);
    expect(toeStallCard![0]).toMatch(/SET[\s\S]*?TOE/);
  });

  it('Montage (deep) renders cleanly: title + ADD + tokenized structural reading', async () => {
    // Deep compounds in browse density render their tokenized ≡ reading
    // (semantic tokens, not operational tokens). Operational tokens are
    // suppressed when a ≡ reading is present; op-token markup lives on
    // cards without ≡ readings (atoms / fallback) and on the trick-detail
    // page.
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    const montageStart = res.text.indexOf('data-trick-slug="montage"');
    expect(montageStart).toBeGreaterThan(-1);
    const montageEnd = res.text.indexOf('</article>', montageStart);
    expect(montageEnd).toBeGreaterThan(montageStart);
    const montageRegion = res.text.substring(montageStart, montageEnd);

    // Title + ADD
    expect(montageRegion).toContain('montage');
    expect(montageRegion).toContain('7 ADD');
    // Multi-modifier semantic tokens render (each as a sem-token span).
    expect(montageRegion).toMatch(/spinning/);
    expect(montageRegion).toMatch(/ducking/);
    expect(montageRegion).toMatch(/paradox/);
    expect(montageRegion).toMatch(/symposium/);
    // Each operator carries a sem-token class (semantic-browse tokenization).
    // Modifier + base-anchor tokens whose slug has a
    // glossary anchor render as <a class="sem-token ... sem-token--linked">;
    // other tokens stay <span class="sem-token ...">. Both element forms
    // satisfy this contract.
    const tokenElements = (montageRegion.match(/<(?:span|a) class="sem-token /g) ?? []);
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

describe('GET /freestyle/tricks?view=family — symbolic trick cards', () => {
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
    // Family view uses the generalized two-line row contract, not the shared
    // dict-card-stack.
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).not.toContain('dict-card-stack');
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
    // Family view uses the generalized dict-trick-row, not the shared dict-card.
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).not.toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=component returns 200 and uses the shared card', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=sets returns 200 (dedicated By Set view)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    // ?view=sets renders the dedicated By Set browse view, not a component
    // alias (compact-list density, NOT dict-card-stack registry density).
    // Active-toggle marker confirms the routing.
    expect(res.text).toMatch(/class="trick-view-toggle-active">By modifier</);
  });

  it('/freestyle/tricks?view=category returns 200 and uses the shared card', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-card-stack');
  });

  it('the dict-card-stack browse views continue to use the shared dictionary-trick-card partial', async () => {
    // ?view=sets is outside this card-uniformity contract (it uses
    // compact-list density, not the dictionary-trick-card partial).
    // ?view=add and ?view=family are also outside it — both render the
    // two-line dict-trick-row contract, not the shared dict-card-stack.
    // The card-uniformity contract holds for the views that use the
    // shared card (category / component).
    for (const view of ['category', 'component']) {
      const url = `/freestyle/tricks?view=${view}`;
      const res = await request(createApp()).get(url);
      expect(res.status).toBe(200);
      expect(res.text, `${url} must render dict-card-stack`).toContain('dict-card-stack');
    }
  });
});
