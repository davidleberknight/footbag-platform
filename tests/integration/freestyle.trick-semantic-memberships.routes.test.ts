/**
 * Integration tests for reverse semantic linkage on trick-detail pages.
 *
 * Verifies:
 *   - Trick-detail pages surface topology memberships when present
 *   - Memberships link to the correct browse-view group anchors
 *   - Topology predicates fire for the right tricks (hippy-downtime-dex for
 *     butterfly + mirage compounds; ducking-clipper-structures for
 *     clipper-landing ducking compounds)
 *   - The standalone Component-memberships panel is retired; per-modifier
 *     linkage is owned by the Modifiers section
 *   - Empty topology memberships hide the panel
 *   - Observational badge rendered on the topology panel heading
 *   - Card-uniformity / discovery loop: every topology membership link is a
 *     valid browse-view URL
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

const { dbPath } = setTestEnv('3099');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers used in test fixtures
  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });

  // Mirage — hippy-downtime-dex member; no modifier links.
  // Expectation: topology = [hippy-downtime-dex]; component = [].
  insertFreestyleTrick(db, {
    slug:                 'mirage',
    canonical_name:       'mirage',
    adds:                 '2',
    base_trick:           'mirage',
    trick_family:         'mirage',
    category:             'compound',
    operational_notation: '[set] > op in dex > op toe',
  });

  // Whirl — leggy-dex AND whirl-swirl-structures member; no modifier links.
  // Expectation: topology = [leggy-dex, whirl-swirl-structures]; component = [].
  insertFreestyleTrick(db, {
    slug:                 'whirl',
    canonical_name:       'whirl',
    adds:                 '3',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > in dex > ss clipper',
  });

  // Ducking-whirl — leggy-dex + whirl-swirl + ducking-clipper-structures + ducking component.
  // Expectation: topology = 3 entries; component = [ducking].
  insertFreestyleTrick(db, {
    slug:                 'ducking-whirl',
    canonical_name:       'ducking whirl',
    adds:                 '4',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > duck > in dex > ss clipper',
  });
  insertFreestyleTrickModifierLink(db, 'ducking-whirl', 'ducking', 1);

  // Phoenix — hippy-downtime-dex + pixie-uptime-dex; component = [pixie + ducking].
  insertFreestyleTrick(db, {
    slug:                 'phoenix',
    canonical_name:       'phoenix',
    adds:                 '5',
    base_trick:           'butterfly',
    trick_family:         'butterfly',
    category:             'compound',
    operational_notation: '[clip] > pixie > duck > butterfly wing > ss clipper',
  });
  insertFreestyleTrickModifierLink(db, 'phoenix', 'pixie',   1);
  insertFreestyleTrickModifierLink(db, 'phoenix', 'ducking', 2);

  // Montage — flagship deep compound; 4 modifier links + 4 topology groups.
  insertFreestyleTrick(db, {
    slug:                 'montage',
    canonical_name:       'montage',
    adds:                 '7',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > spinning > duck > paradox symposium whirl > ss clipper',
  });
  insertFreestyleTrickModifierLink(db, 'montage', 'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'montage', 'ducking',   2);
  insertFreestyleTrickModifierLink(db, 'montage', 'paradox',   3);
  insertFreestyleTrickModifierLink(db, 'montage', 'symposium', 4);

  // Lone-trick — base is clipper-stall (NOT in any of the 6 topology bases).
  // No modifier links. Expectation: topology = []; component = []. Panels hidden.
  insertFreestyleTrick(db, {
    slug:                 'lone-trick',
    canonical_name:       'lone trick',
    adds:                 '2',
    base_trick:           'clipper-stall',
    trick_family:         'clipper-stall',
    category:             'compound',
    operational_notation: '[clip] > toe',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. Topology memberships
// ─────────────────────────────────────────────────────────────────────────

describe('trick-detail — topology memberships', () => {
  it('mirage surfaces only hippy-downtime-dex (base ∈ HIPPY_BASES)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Topology memberships');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-hippy-downtime-dex"');
    // Should NOT have leggy or whirl-swirl
    expect(res.text).not.toContain('href="/freestyle/tricks?view=topology#topology-leggy-dex"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=topology#topology-whirl-swirl-structures"');
  });

  it('whirl surfaces leggy-dex + whirl-swirl-structures (no clipper modifier links)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-leggy-dex"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-whirl-swirl-structures"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=topology#topology-hippy-downtime-dex"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=topology#topology-ducking-clipper-structures"');
  });

  it('ducking-whirl surfaces leggy + whirl-swirl + ducking-clipper-structures', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ducking-whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-leggy-dex"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-whirl-swirl-structures"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-ducking-clipper-structures"');
  });

  it('phoenix surfaces hippy-downtime-dex + pixie-uptime-dex (butterfly base + pixie link)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/phoenix');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-hippy-downtime-dex"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-pixie-uptime-dex"');
  });

  it('montage surfaces leggy + whirl-swirl + symposium-clipper + ducking-clipper (4 groups)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/montage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-leggy-dex"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-whirl-swirl-structures"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-symposium-clipper-structures"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-ducking-clipper-structures"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Component memberships
// ─────────────────────────────────────────────────────────────────────────

// The standalone Component-memberships panel is retired; per-modifier
// linkage is owned by the Modifiers section. The trick-detail page no longer
// renders a Component-memberships panel or ?view=component deep-links.
describe('trick-detail — component-memberships panel retired', () => {
  it('mirage renders no Component-memberships panel', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).not.toContain('Component memberships');
  });

  it('ducking-whirl renders no Component-memberships panel; modifiers owned by the Modifiers section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ducking-whirl');
    expect(res.text).not.toContain('Component memberships');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component#component-ducking"');
    // The modifier is surfaced via the Modifiers section instead.
    expect(res.text).toContain('Modifiers on this trick');
  });

  it('phoenix renders no Component-memberships panel; modifiers owned by the Modifiers section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/phoenix');
    expect(res.text).not.toContain('Component memberships');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component#component-pixie"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component#component-ducking"');
    expect(res.text).toContain('Modifiers on this trick');
  });

  it('montage surfaces no ?view=component deep-links', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/montage');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component#component-paradox"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component#component-symposium"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component#component-spinning"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component#component-ducking"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Empty memberships hide the panels
// ─────────────────────────────────────────────────────────────────────────

describe('trick-detail — empty memberships', () => {
  it('a trick with no topology + no component memberships renders no panels', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/lone-trick');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('trick-semantic-memberships');
    expect(res.text).not.toContain('Topology memberships');
    expect(res.text).not.toContain('Component memberships');
  });

  it('a trick with topology memberships but no component memberships renders only the topology panel', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('trick-semantic-memberships');
    expect(res.text).toContain('Topology memberships');
    expect(res.text).not.toContain('Component memberships');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Observational badge + visual contract
// ─────────────────────────────────────────────────────────────────────────

describe('trick-detail — observational badge + visual contract', () => {
  it('the topology panel heading carries the observational symbolic-layer badge', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/montage');
    // Count badge occurrences inside the trick-semantic-memberships aside.
    const asideStart = res.text.indexOf('class="trick-semantic-memberships"');
    expect(asideStart).toBeGreaterThan(-1);
    const asideEnd = res.text.indexOf('</aside>', asideStart);
    const region = res.text.slice(asideStart, asideEnd);
    // Only the topology panel renders now — exactly one badge.
    const badgeMatches = region.match(/class="symbolic-layer-badge"/g) ?? [];
    expect(badgeMatches.length).toBe(1);
  });

  it('panels render as a single <aside class="trick-semantic-memberships">', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/phoenix');
    const asideOpens = res.text.match(/<aside class="trick-semantic-memberships"/g) ?? [];
    expect(asideOpens.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Discovery loop: links are valid browse-view URLs
// ─────────────────────────────────────────────────────────────────────────

describe('trick-detail — discovery loop integrity', () => {
  it('topology membership links use the canonical ?view=topology URL pattern', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/montage');
    const links = res.text.match(/href="\/freestyle\/tricks\?view=topology#topology-[a-z-]+"/g) ?? [];
    expect(links.length).toBe(4);
  });

  it('surfaces no ?view=component deep-links (component panel retired)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/montage');
    const links = res.text.match(/href="\/freestyle\/tricks\?view=component#component-[a-z-]+"/g) ?? [];
    expect(links.length).toBe(0);
  });

  it('each topology-membership link target exists on the topology browse page (round-trip)', async () => {
    const detailRes = await request(createApp()).get('/freestyle/tricks/ducking-whirl');
    const linkSlugs = (detailRes.text.match(/#topology-([a-z-]+)/g) ?? [])
      .map(s => s.replace('#topology-', ''));
    expect(linkSlugs.length).toBeGreaterThan(0);

    const topologyRes = await request(createApp()).get('/freestyle/tricks?view=topology');
    for (const slug of linkSlugs) {
      expect(topologyRes.text, `topology page must render id="topology-${slug}"`)
        .toContain(`id="topology-${slug}"`);
    }
  });
});
