/**
 * Integration tests for the topology view (?view=topology). DSC-2 topology
 * slice — six pedagogically-grounded educational groups computed from
 * existing data (base_trick + modifier links + curator-tagged dex-class
 * bases). Observational layer.
 *
 * Verifies:
 *   - /freestyle/tricks?view=topology returns 200
 *   - The six curated groups appear with stable anchor IDs:
 *       hippy-downtime-dex, leggy-dex, whirl-swirl-structures,
 *       pixie-uptime-dex, symposium-clipper-structures, ducking-clipper-structures
 *   - Group membership is computed correctly from base_trick + modifier links
 *   - The 6 CSV-defined topology groups (butterfly-wing-topology etc.) are
 *     NOT surfaced in this view (deferred advanced taxonomy)
 *   - Observational badge + footer rendered
 *   - Cards sort ADD ascending then trick name
 *   - Empty groups hidden
 *   - Each group's heading carries a one-line body-mechanics definition
 *   - Shared dict-card-stack partial used
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
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3098');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers used by membership rules
  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });

  // Hippy-downtime-dex members (base_trick ∈ {mirage, butterfly})
  insertFreestyleTrick(db, { slug: 'mirage',          canonical_name: 'mirage',          adds: '2', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > op in dex > op toe' });
  insertFreestyleTrick(db, { slug: 'butterfly',       canonical_name: 'butterfly',       adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > out dex > ss clipper' });
  insertFreestyleTrick(db, { slug: 'ripwalk',         canonical_name: 'ripwalk',         adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > op in dex > butterfly wing > ss clipper' });
  insertFreestyleTrick(db, { slug: 'paradox-mirage',  canonical_name: 'paradox mirage',  adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > hippy in dex > op toe' });

  // Leggy-dex members (base_trick ∈ {legover, pickup, whirl, swirl, illusion})
  insertFreestyleTrick(db, { slug: 'whirl',           canonical_name: 'whirl',           adds: '3', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > in dex > ss clipper' });
  insertFreestyleTrick(db, { slug: 'legover',         canonical_name: 'legover',         adds: '2', base_trick: 'legover',   trick_family: 'legover',   category: 'compound', operational_notation: '[set] > out dex > ss toe' });
  insertFreestyleTrick(db, { slug: 'swirl',           canonical_name: 'swirl',           adds: '3', base_trick: 'swirl',     trick_family: 'swirl',     category: 'compound', operational_notation: '[set] > (xbd) out dex > ss clipper' });

  // Pixie-uptime-dex member
  insertFreestyleTrick(db, { slug: 'dimwalk',         canonical_name: 'dimwalk',         adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > pixie > out dex > ss clipper' });
  insertFreestyleTrickModifierLink(db, 'dimwalk', 'pixie', 1);

  // Symposium-clipper member (symposium + clipper-landing base)
  insertFreestyleTrick(db, { slug: 'symposium-whirl', canonical_name: 'symposium whirl', adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > symposium > in dex > ss clipper' });
  insertFreestyleTrickModifierLink(db, 'symposium-whirl', 'symposium', 1);

  // Ducking-clipper member (ducking + clipper-landing base)
  insertFreestyleTrick(db, { slug: 'ducking-whirl',   canonical_name: 'ducking whirl',   adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > duck > in dex > ss clipper' });
  insertFreestyleTrickModifierLink(db, 'ducking-whirl', 'ducking', 1);

  // Flagship deep compound that's in multiple groups (whirl base + ducking + symposium = appears in leggy + whirl/swirl + symposium-clipper + ducking-clipper)
  insertFreestyleTrick(db, { slug: 'montage',         canonical_name: 'montage',         adds: '7', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > spinning > duck > paradox symposium whirl > ss clipper' });
  insertFreestyleTrickModifierLink(db, 'montage', 'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'montage', 'ducking',   2);
  insertFreestyleTrickModifierLink(db, 'montage', 'paradox',   3);
  insertFreestyleTrickModifierLink(db, 'montage', 'symposium', 4);

  // An OUT-of-topology trick (base = clipper-stall is not in any of the 6 groups).
  // Used to verify a trick is NOT placed in any topology group when none match.
  insertFreestyleTrick(db, { slug: 'lone-trick',      canonical_name: 'lone trick',      adds: '2', base_trick: 'clipper-stall', trick_family: 'clipper-stall', category: 'compound', operational_notation: '[clip] > toe' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. Route + view toggle
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=topology — route + toggle', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.status).toBe(200);
  });

  it('marks "Movement Neighborhoods" active in the view toggle', async () => {
    // Slice L0/Q3 Option B rename (2026-05-16): "By topology" label
    // retired in favor of "Movement Neighborhoods" to reframe the
    // observational topology surface as relationship browsing rather
    // than primary taxonomy. The underlying ?view=topology URL is
    // preserved for stable backlinks.
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toMatch(/class="trick-view-toggle-active">Movement Neighborhoods</);
  });

  it('the topology toggle link is reachable from every other view', async () => {
    // Bare `/freestyle/tricks` now renders the dictionary landing surface
    // (CR-1 of dictionary-coherence-2026-05-18), which has its own
    // discoverability path for Movement Neighborhoods (card 4). The
    // browse-view toggle is checked against every actual browse-view URL.
    for (const view of ['add', 'family', 'category', 'component']) {
      const url = `/freestyle/tricks?view=${view}`;
      const res = await request(createApp()).get(url);
      expect(res.text).toContain('href="/freestyle/tricks?view=topology"');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Observational-layer attribution
// ─────────────────────────────────────────────────────────────────────────

describe('topology view — observational-layer attribution', () => {
  it('renders the observational badge at the top of the page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('class="topology-view-note"');
    expect(res.text).toContain('class="symbolic-layer-badge"');
    expect(res.text.toLowerCase()).toContain('observational');
  });

  it('renders an observational footer with cross-reference to the canonical family view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('class="symbolic-layer-footer"');
    expect(res.text).toMatch(/do not override canonical/i);
    expect(res.text).toContain('href="/freestyle/tricks?view=family"');
  });

  it('the framing prose declares the symbolic-grammar layer explicitly', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toMatch(/symbolic-grammar layer/i);
    expect(res.text).toMatch(/observed, not canonical/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The six curated educational groups
// ─────────────────────────────────────────────────────────────────────────

describe('topology view — six pedagogical groups', () => {
  it('renders the hippy-downtime-dex group with mirage + butterfly compounds', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('id="topology-hippy-downtime-dex"');
    const start = res.text.indexOf('id="topology-hippy-downtime-dex"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    expect(region).toContain('data-trick-slug="mirage"');
    expect(region).toContain('data-trick-slug="butterfly"');
    expect(region).toContain('data-trick-slug="ripwalk"');
    expect(region).toContain('data-trick-slug="paradox-mirage"');
  });

  it('renders the leggy-dex group with whirl + legover + swirl + montage', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('id="topology-leggy-dex"');
    const start = res.text.indexOf('id="topology-leggy-dex"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    expect(region).toContain('data-trick-slug="whirl"');
    expect(region).toContain('data-trick-slug="legover"');
    expect(region).toContain('data-trick-slug="swirl"');
    expect(region).toContain('data-trick-slug="montage"');
  });

  it('renders the whirl-swirl-structures group with only whirl-base + swirl-base tricks', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('id="topology-whirl-swirl-structures"');
    const start = res.text.indexOf('id="topology-whirl-swirl-structures"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    expect(region).toContain('data-trick-slug="whirl"');
    expect(region).toContain('data-trick-slug="swirl"');
    expect(region).toContain('data-trick-slug="montage"');
    // Mirage / butterfly are not in this group
    expect(region).not.toContain('data-trick-slug="mirage"');
    expect(region).not.toContain('data-trick-slug="butterfly"');
  });

  it('renders the pixie-uptime-dex group when at least one trick has a pixie link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('id="topology-pixie-uptime-dex"');
    const start = res.text.indexOf('id="topology-pixie-uptime-dex"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    expect(region).toContain('data-trick-slug="dimwalk"');
  });

  it('renders the symposium-clipper-structures group with symposium-whirl + montage', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('id="topology-symposium-clipper-structures"');
    const start = res.text.indexOf('id="topology-symposium-clipper-structures"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    expect(region).toContain('data-trick-slug="symposium-whirl"');
    expect(region).toContain('data-trick-slug="montage"');
  });

  it('renders the ducking-clipper-structures group with ducking-whirl + montage', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('id="topology-ducking-clipper-structures"');
    const start = res.text.indexOf('id="topology-ducking-clipper-structures"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    expect(region).toContain('data-trick-slug="ducking-whirl"');
    expect(region).toContain('data-trick-slug="montage"');
  });

  it('does NOT surface the 6 advanced CSV-based topology groups (deferred taxonomy)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).not.toContain('id="topology-butterfly-wing-topology"');
    expect(res.text).not.toContain('id="topology-whirl-rotational-topology"');
    expect(res.text).not.toContain('id="topology-mirage-topology"');
    expect(res.text).not.toContain('id="topology-drifter-miraging-clipper-topology"');
    expect(res.text).not.toContain('id="topology-blender-rotational-topology"');
    expect(res.text).not.toContain('id="topology-osis-rotational-topology"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Out-of-topology tricks
// ─────────────────────────────────────────────────────────────────────────

describe('topology view — out-of-topology behaviour', () => {
  it('a trick whose base is not in any of the six groups appears in none of them', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    // 'lone-trick' has base_trick='clipper-stall' and no modifier links;
    // it should not appear in any of the six topology groups.
    expect(res.text).not.toContain('data-trick-slug="lone-trick"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Group rendering — heading + definition + cards
// ─────────────────────────────────────────────────────────────────────────

describe('topology view — group rendering', () => {
  it('each group heading carries a one-line body-mechanics definition', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    // The hippy-downtime-dex group's definition mentions hip-driven thigh swing.
    const start = res.text.indexOf('id="topology-hippy-downtime-dex"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    expect(region).toContain('class="topology-group-definition"');
    expect(region).toMatch(/downtime dex comes from the hip/);
  });

  it('group heading wraps the topology name in a self-anchored link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toMatch(/<h2><a href="\/freestyle\/tricks\?view=topology#topology-hippy-downtime-dex">Hippy downtime dex<\/a><\/h2>/);
  });

  it('group sections use the shared dict-card-stack container', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('dict-card-stack');
  });

  it('cards within a group sort ADD ascending then name (leggy: legover 2 ADD before whirl 3 before swirl 3 before montage 7)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    const start = res.text.indexOf('id="topology-leggy-dex"');
    const end   = res.text.indexOf('</section>', start);
    const region = res.text.slice(start, end);
    const legoverIdx = region.indexOf('data-trick-slug="legover"');
    const swirlIdx   = region.indexOf('data-trick-slug="swirl"');
    const whirlIdx   = region.indexOf('data-trick-slug="whirl"');
    const montageIdx = region.indexOf('data-trick-slug="montage"');
    // 2-ADD legover first
    expect(legoverIdx).toBeGreaterThan(-1);
    // 3-ADD swirl and whirl follow alphabetical: swirl before whirl
    expect(swirlIdx).toBeGreaterThan(legoverIdx);
    expect(whirlIdx).toBeGreaterThan(swirlIdx);
    // 7-ADD montage last
    expect(montageIdx).toBeGreaterThan(whirlIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Intentional cross-group appearances
// ─────────────────────────────────────────────────────────────────────────

describe('topology view — intentional cross-group membership', () => {
  it('montage appears in leggy-dex, whirl-swirl-structures, symposium-clipper, ducking-clipper (4 groups)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    const expectMontageIn = (topologySlug: string) => {
      const start = res.text.indexOf(`id="topology-${topologySlug}"`);
      expect(start, `topology-${topologySlug} group must exist`).toBeGreaterThan(-1);
      const end = res.text.indexOf('</section>', start);
      const region = res.text.slice(start, end);
      expect(region, `montage must render inside topology-${topologySlug}`).toContain('data-trick-slug="montage"');
    };
    expectMontageIn('leggy-dex');
    expectMontageIn('whirl-swirl-structures');
    expectMontageIn('symposium-clipper-structures');
    expectMontageIn('ducking-clipper-structures');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Card-uniformity contract still holds
// ─────────────────────────────────────────────────────────────────────────

describe('topology view — card-uniformity invariant', () => {
  it('uses the shared dictionary-trick-card partial (data-trick-slug + op-token spans)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toMatch(/<article class="dict-card[^"]*"\s+data-trick-slug="/);
    // Operational notation tokens appear (role-tagged).
    expect(res.text).toContain('class="op-token op-token--');
  });
});
