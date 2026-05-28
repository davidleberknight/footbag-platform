/**
 * Integration tests for DSC-2 slice 1: the By ADD view migrated to the
 * shared dictionary-trick-card partial.
 *
 * Sample tricks (per the user spec):
 *   - toe stall   — sparse base trick, low ADD
 *   - mirage      — base trick, simple operational notation
 *   - ripwalk     — compound with aliases
 *   - mobius      — compound with folk-name alias (gyro torque)
 *   - montage     — flagship deep compound
 *
 * Invariants verified:
 *   - /freestyle/tricks (By ADD default) returns 200
 *   - Each seeded trick renders the dictionary-trick-card partial
 *   - Card renders: title link, ADD label, operational notation (or "Notation pending"), aliases when present
 *   - Card does NOT render prose description (browse cards never carry description prose)
 *   - Sparse tricks (Toe Stall) render safely without aliases / extra slots
 *   - Compound tricks render with role-tagged token spans
 *   - Notation tokens carry the op-token CSS class + cssRole modifier
 *   - The card stack is scoped to its ADD group via section id
 *   - Other browse views (By Family / By Category / By Sets) still return 200
 *     (regression guard; not migrated in this slice)
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
    slug:                 'toe-stall',
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
  insertFreestyleTrickAlias(db, 'stepping-butterfly', 'ripwalk', 'stepping butterfly');
  insertFreestyleTrickAlias(db, 'blurry-butterfly', 'ripwalk', 'blurry butterfly');

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
  insertFreestyleTrickAlias(db, 'gyro-torque', 'mobius', 'gyro torque');

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

  // F4 fixture (LANDING-AND-TRICKS-QA-REALIGNMENT-1): a trick with NULL
  // operational notation but PRESENT in the chain registry. Must render
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

  // Minimal modifier-link seeding so the component view (slice 3A) renders
  // at least one body-modifier group, exercising the dict-card-stack assertion
  // in the slice-by-slice regression guard below.
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
// 2. Card structure (per SYMBOLIC_CARD_SPEC.md §1)
// ─────────────────────────────────────────────────────────────────────────

describe('dictionary-trick-card — required slots', () => {
  it('renders title slot as a link to the trick detail page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/ripwalk">ripwalk<\/a>/);
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/mobius">mobius<\/a>/);
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/montage">montage<\/a>/);
  });

  it('renders the #slug tag-identity chip on every card', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toContain('<span class="dict-card-hashtag" aria-label="Tag identity">#ripwalk</span>');
    expect(res.text).toContain('<span class="dict-card-hashtag" aria-label="Tag identity">#mobius</span>');
    expect(res.text).toContain('<span class="dict-card-hashtag" aria-label="Tag identity">#montage</span>');
  });

  it('renders ADD label slot for every seeded trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>1 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>2 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>4 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>5 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>7 ADD<\/span>/);
  });

  it('op-notation chip suppressed on browse cards for first-class tricks (renders only via first-class JOB row)', async () => {
    // 2026-05-24 curator rendered-output audit: the op-notation chip
    // between hashtag and ADD chip duplicated the JOB row in the
    // first-class secondary row below. The chip is now suppressed for
    // first-class tricks; non-first-class tricks still get it. The
    // op-token role taxonomy itself is exercised on trick-detail pages
    // and on the first-class secondary row's JOB line, which both
    // continue to tokenize via the same renderer.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    // Atoms (toe-stall, mirage, etc.) are first-class — their op-notation
    // chip is suppressed on browse cards.
    const toeStallCard = res.text.match(/data-trick-slug="toe-stall"[\s\S]*?<\/article>/);
    expect(toeStallCard).not.toBeNull();
    expect(toeStallCard![0]).not.toMatch(/<code class="dict-card-notation/);
    // First-class secondary row still carries the JOB line.
    expect(toeStallCard![0]).toMatch(/dict-card-first-class-label[^>]*>JOB:/);
  });

  it('renders ≡ symbolic-equivalence readings from the curator chain registry', async () => {
    // Post PRESENTATION_UNIFICATION (2026-05-16): every browse view renders
    // registry density. The equivalence wrapper picks up the --inline modifier
    // class. The token text content is identical to what ADD View shows.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    // Ripwalk: chain reading 'stepping butterfly'
    expect(res.text).toMatch(/class="core-trick-equivalence dict-card-equivalence[^"]*"[^>]*>[\s\S]*?stepping[\s\S]*?butterfly/i);
    // Mobius: 'gyro torque' reading
    expect(res.text).toMatch(/class="core-trick-equivalence dict-card-equivalence[^"]*"[^>]*>[\s\S]*?gyro[\s\S]*?torque/i);
    // The legacy aliases row is gone:
    expect(res.text).not.toMatch(/class="dict-card-aliases"/);
  });

  it('"Notation pending" placeholder is silent across all browse views (post-unification)', async () => {
    // Post PRESENTATION_UNIFICATION (2026-05-16): every browse view uses
    // registry density. Registry density renders the formula slot silently
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

  it('Tier-4 executable-accounting prose is absent across all browse views (NCR-3)', async () => {
    // 4-tier rendering hierarchy contract (Notation Normalization Wave
    // NCR-3, 2026-05-18): Tier-4 executable-accounting prose patterns
    // (xbody(N), dex(N), stall(N), spin(N), "= N ADD" results) render
    // ONLY on /freestyle/add-analysis, (future) trick-detail disclosure
    // surfaces, AND the compact first-class secondary row on the
    // governed first-class cohort. The dictionary card partial enforces
    // tiers 1-3 for the general cohort; this regex sweep guards against
    // leakage onto NON-first-class cards.
    //
    // Cohort mirrors FIRST_CLASS_TIER_1 ∪ FIRST_CLASS_TIER_2 in
    // src/services/freestyleService.ts. Update both together when the
    // cohort changes.
    const FIRST_CLASS_COHORT_SLUGS = [
      // Tier 1 — 12 elite (11 atoms + pendulum)
      'osis', 'toe-stall', 'clipper-stall', 'mirage', 'whirl', 'butterfly',
      'swirl', 'legover', 'pickup', 'illusion', 'around-the-world', 'pendulum',
      // Tier 1 — foundational 1-ADD primitives (2026-05-22 widening)
      'heel-stall', 'inside-stall', 'outside-stall', 'head-stall',
      'forehead-stall', 'neck-stall', 'knee-stall', 'shoulder-stall',
      'sole-kick', 'cloud-kick', 'peak-delay',
      'flying-inside', 'flying-outside', 'double-knee',
      // Tier 1 — foundational 2-ADD primitives (2026-05-22 + knee-clipper + guay)
      'cloud-stall', 'dragonfly-kick', 'flying-clipper', 'knee-clipper', 'guay',
      // Tier 2 — original (9)
      'paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk',
      'ducking-butterfly', 'spinning-butterfly', 'stepping-osis',
      'eggbeater', 'paradox-symposium-whirl',
      // Tier 2 — Wave 1 audit-derived (5; 2026-05-22)
      'atomic-torque', 'ducking-mirage', 'paradox-drifter',
      'spinning-pickup', 'tapping-whirl',
      // Tier 2 — Wave 2 RESOLVED_FORMULAS promotions (19; 2026-05-22)
      'atom-smasher', 'dimwalk', 'ducking-clipper', 'ducking-osis',
      'ducking-whirl', 'fog', 'orbit', 'paradox-blender', 'paradox-torque',
      'rake', 'rev-up', 'rev-whirl', 'smear', 'spinning-clipper',
      'spinning-osis', 'spinning-torque', 'stepping-whirl',
      'symposium-whirl', 'whirling-swirl',
      // Tier 2 — Wave 3 audit-validated promotions (28; 2026-05-22)
      'squeeze', 'barrage', 'barfly', 'high-plains-drifter', 'paradon',
      'barraging-osis',
      'cross-body-sole-stall', 'legeater', 'paste', 'reverse-drifter',
      'scrambled-eggbeater', 'tap', 'blur', 'hatchet', 'paradox-whirl',
      'pigbeater', 'spinning-whirl', 'tripwalk', 'matador', 'phoenix',
      'spinal-tap', 'spinning-symposium-whirl', 'witchdoctor',
      'mind-bender', 'mullet', 'spender', 'gauntlet', 'montage',
      // Tier 2 — Wave 4-B mechanical notation back-fill (19; 2026-05-22)
      'flail', 'magellan', 'merkon', 'smudge',
      'assassin', 'haze', 'mantis', 'nova', 'parkwalk', 'royale',
      'smog', 'smoke', 'tapdown', 'tombstone',
      'blurriest', 'grave-digger', 'tomahawk', 'big-apple',
      'sole-stall',
      // Tier 2 — Wave 5 observational→canonical promotions (14; 2026-05-22)
      'blizzard', 'blaze', 'bedwetter', 'sole-survivor',
      'spinning-paradox-mirage', 'spinning-paradox-illusion',
      'spinning-paradox-whirl', 'paradox-double-leg-over',
      'paradox-barrage', 'paradox-symposium-mirage',
      'paradox-high-plains-drifter', 'spinning-paradox-blender',
      'stepping-ducking-paradox-blender', 'paradox-blizzard',
      // Tier 2 — Wave 7 doctrine-divergence pilot (3; 2026-05-23)
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
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
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
    // 2026-05-24 curator rendered-output audit: the standalone op-notation
    // chip on browse cards was suppressed for first-class tricks (it
    // duplicated the JOB row below). toe-stall is a core atom + first-
    // class, so its op-notation now surfaces via the first-class
    // secondary row's labeled "JOB:" line instead.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/toe-stall">toe stall<\/a>/);
    const toeStallCard = res.text.match(/data-trick-slug="toe-stall"[\s\S]*?<\/article>/);
    expect(toeStallCard).not.toBeNull();
    // No op-notation chip between hashtag and ADD chip.
    expect(toeStallCard![0]).not.toMatch(/<code class="dict-card-notation/);
    // First-class secondary row carries the JOB:
    expect(toeStallCard![0]).toMatch(/dict-card-first-class-label[^>]*>JOB:/);
    expect(toeStallCard![0]).toMatch(/\[set\][\s\S]*?toe/);
  });

  it('Montage (deep) renders cleanly: title + ADD + tokenized structural reading', async () => {
    // BROWSE-REFACTOR-1 Slice 1: deep compounds in browse density render
    // their tokenized ≡ reading (semantic tokens, not operational tokens).
    // Operational tokens are now suppressed when a ≡ reading is present;
    // op-token markup lives on cards without ≡ readings (atoms / fallback)
    // and on the trick-detail page.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
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
    // Slice E (2026-05): modifier + base-anchor tokens whose slug has a
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
// Slice 2: By Family migration
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=family — symbolic trick cards (slice 2)', () => {
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

  it('family section renders the two-line dict-trick-row stack (2026-05-27 migration)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    // Family migrated to the generalized two-line row contract; it no longer
    // uses the shared dict-card-stack.
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

describe('other dictionary views — slice-by-slice migration', () => {
  it('/freestyle/tricks?view=family returns 200 and uses the two-line row contract (2026-05-27)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // Family migrated off the shared dict-card to the generalized dict-trick-row.
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).not.toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=component returns 200 and uses the shared card (slice 3A migrated)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=sets returns 200 (dedicated By Set view, 2026-05-24)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    // 2026-05-24 governance/polish slice: ?view=sets is no longer a
    // component alias. It now renders the dedicated By Set browse view
    // (compact-list density, NOT dict-card-stack registry density).
    // Active-toggle marker confirms the routing.
    expect(res.text).toMatch(/class="trick-view-toggle-active">By modifier</);
  });

  it('/freestyle/tricks?view=category returns 200 and uses the shared card (slice 3B migrated)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-card-stack');
  });

  it('the dict-card-stack browse views continue to use the shared dictionary-trick-card partial', async () => {
    // 2026-05-24: ?view=sets removed from this card-uniformity contract (it
    // uses compact-list density, not the dictionary-trick-card partial).
    // 2026-05-27: ?view=add AND ?view=family removed — both now render the
    // two-line dict-trick-row contract, not the shared dict-card-stack. The
    // card-uniformity contract holds only for the not-yet-migrated views
    // (category / component), which still use the shared card.
    for (const view of ['category', 'component']) {
      const url = `/freestyle/tricks?view=${view}`;
      const res = await request(createApp()).get(url);
      expect(res.status).toBe(200);
      expect(res.text, `${url} must render dict-card-stack`).toContain('dict-card-stack');
    }
  });
});
