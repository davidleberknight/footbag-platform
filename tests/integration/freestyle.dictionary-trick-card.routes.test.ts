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

  it('renders the dict-card stack container', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('dict-card-stack');
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
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/ripwalk">ripwalk<\/a>/);
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/mobius">mobius<\/a>/);
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/montage">montage<\/a>/);
  });

  it('renders ADD label slot for every seeded trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>1 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>2 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>4 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>5 ADD<\/span>/);
    expect(res.text).toMatch(/<span class="dict-card-add[^"]*"[^>]*>7 ADD<\/span>/);
  });

  it('renders operational notation as role-tagged token spans', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // Each notation token carries op-token class + cssRole modifier + data-role attr.
    // Spot-check the role taxonomy on Ripwalk: [clip] (component_flag) > op (side) in (direction) dex (...) butterfly wing (rotation_variant... actually 'butterfly wing' is fused as rotation_variant; check class).
    expect(res.text).toMatch(/<span class="op-token op-token--component-flag[^"]*"[^>]*>\[clip\]<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--sequence-op-minor"[^>]*data-role="sequence_op"[^>]*>&gt;<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--side"[^>]*data-role="side"[^>]*>op<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--direction"[^>]*data-role="direction"[^>]*>in<\/span>/);
  });

  it('renders ≡ symbolic-equivalence readings from the curator chain registry', async () => {
    // Post PRESENTATION_UNIFICATION (2026-05-16): every browse view renders
    // registry density. The equivalence wrapper picks up the --inline modifier
    // class. The token text content is identical to what ADD View shows.
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
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
    // ONLY on /freestyle/add-analysis and (future) trick-detail
    // disclosure surfaces. The dictionary card partial enforces tiers
    // 1-3 only. This regex sweep guards future slices from leaking
    // Tier-4 prose onto browse cards.
    const accountingPatterns: ReadonlyArray<RegExp> = [
      /\bxbody\(\d/,
      /\bdex\(\d/,
      /\bstall\(\d/,
      /\bspin\(\d/,
      /(?:=|&#x3D;)\s*\d+\s*ADD\b/,
    ];
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
      for (const pattern of accountingPatterns) {
        expect(
          res.text,
          `${url} must not render Tier-4 accounting pattern ${pattern}`,
        ).not.toMatch(pattern);
      }
    }
  });

  it('F4 — suppresses "Notation pending" when ≡ symbolic equivalences carry the structural information', async () => {
    // F4: cards with chain-registry equivalences should not also display
    // the pending-notation cue; the ≡ readings already convey structural
    // composition. Tested in browse density where the placeholder can
    // appear at all.
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
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
  it('Toe Stall (sparse) renders cleanly: title + ADD + minimal operational notation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    // Title row
    expect(res.text).toMatch(/<a class="dict-card-title" href="\/freestyle\/tricks\/toe-stall">toe stall<\/a>/);
    // Operational notation: [toe] > toe
    expect(res.text).toMatch(/data-trick-slug="toe-stall"[\s\S]*?\[toe\][\s\S]*?op-token--sequence-op-minor[\s\S]*?>toe</);
  });

  it('Montage (deep) renders cleanly: title + ADD + tokenized structural reading', async () => {
    // BROWSE-REFACTOR-1 Slice 1: deep compounds in browse density render
    // their tokenized ≡ reading (semantic tokens, not operational tokens).
    // Operational tokens are now suppressed when a ≡ reading is present;
    // op-token markup lives on cards without ≡ readings (atoms / fallback)
    // and on the trick-detail page.
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
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

  it('family section renders the dict-card-stack with shared cards', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.text).toContain('dict-card-stack');
    // The cards inside the family section carry data-trick-slug from our seeded set.
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
  it('/freestyle/tricks?view=family returns 200 and uses the shared card (slice 2 migrated)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=component returns 200 and uses the shared card (slice 3A migrated)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=sets returns 200 and resolves to ?view=component (legacy alias)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    // Alias resolves server-side; same component-view markup renders.
    expect(res.text).toContain('dict-card-stack');
  });

  it('/freestyle/tricks?view=category returns 200 and uses the shared card (slice 3B migrated)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    expect(res.text).toContain('dict-card-stack');
  });

  it('every browse view now renders via the shared dictionary-trick-card partial (card-uniformity contract)', async () => {
    // Bare /freestyle/tricks renders the dictionary landing surface
    // post-CR-1; it has no trick cards by design. Each explicit
    // ?view= URL still renders the shared dict-card-stack.
    for (const view of ['add', 'family', 'category', 'component', 'sets']) {
      const url = `/freestyle/tricks?view=${view}`;
      const res = await request(createApp()).get(url);
      expect(res.status).toBe(200);
      expect(res.text, `${url} must render dict-card-stack`).toContain('dict-card-stack');
    }
  });
});
