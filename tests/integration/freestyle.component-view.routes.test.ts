/**
 * Integration tests for the component view (?view=component).
 *
 * Scope verified:
 *   - /freestyle/tricks?view=component returns 200
 *   - /freestyle/tricks?view=sets is a server-side alias and renders the same view
 *   - Three axes render in the documented order (Body modifiers, Dex relationships, Set modifiers)
 *   - Topology and movement-archetype axes are NOT rendered (deferred)
 *   - Axis-jump nav anchors at top of page
 *   - Body-modifier groups appear in priority order (symposium, spinning,
 *     ducking, diving, weaving, gyro)
 *   - Dex relationships groups (paradox) render in their own axis
 *   - Set-modifier groups appear in priority order (pixie, atomic, quantum,
 *     nuclear, fairy, furious, stepping)
 *   - Empty groups are hidden
 *   - Cards within a group sort ADD ascending then name
 *   - Intentional duplication: a trick with multiple modifier links appears in multiple groups
 *   - Each group has hash-anchor id="component-{slug}"
 *   - Group heading carries a one-line body-mechanics definition when authored
 *   - View toggle in the page header marks "By component" active
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

const { dbPath } = setTestEnv('3096');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers (body + set axes). Each is a row in freestyle_trick_modifiers.
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'stepping',  modifier_name: 'stepping',  modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'atomic',    modifier_name: 'atomic',    modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });

  // Tricks used in this fixture. ADDs chosen so the within-group sort is verifiable.
  insertFreestyleTrick(db, { slug: 'paradox-mirage',  canonical_name: 'paradox mirage',  adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > hippy in dex > op toe' });
  insertFreestyleTrick(db, { slug: 'paradox-whirl',   canonical_name: 'paradox whirl',   adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > paradox > front whirl > ss clipper' });
  insertFreestyleTrick(db, { slug: 'paradox-blender', canonical_name: 'paradox blender', adds: '5', base_trick: 'blender',   trick_family: 'blender',   category: 'compound', operational_notation: '[set] > paradox > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl',  canonical_name: 'spinning whirl',  adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > spinning > front whirl > ss clipper' });
  insertFreestyleTrick(db, { slug: 'ducking-whirl',   canonical_name: 'ducking whirl',   adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > duck > front whirl > ss clipper' });
  insertFreestyleTrick(db, { slug: 'ripwalk',         canonical_name: 'ripwalk',         adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > op in dex > butterfly wing > ss clipper' });
  insertFreestyleTrick(db, { slug: 'phoenix',         canonical_name: 'phoenix',         adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > pixie > duck > butterfly wing > ss clipper' });
  insertFreestyleTrick(db, { slug: 'dimwalk',         canonical_name: 'dimwalk',         adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > pixie > butterfly wing > ss clipper' });
  insertFreestyleTrick(db, { slug: 'atom-smasher',    canonical_name: 'atom smasher',    adds: '4', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > atomic > hippy in dex > op toe' });
  insertFreestyleTrick(db, { slug: 'montage',         canonical_name: 'montage',         adds: '7', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > spinning > duck > paradox symposium whirl > ss clipper' });

  // Modifier links — body axis.
  insertFreestyleTrickModifierLink(db, 'paradox-mirage',  'paradox', 1);
  insertFreestyleTrickModifierLink(db, 'paradox-whirl',   'paradox', 1);
  insertFreestyleTrickModifierLink(db, 'paradox-blender', 'paradox', 1);
  insertFreestyleTrickModifierLink(db, 'spinning-whirl',  'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'ducking-whirl',   'ducking', 1);
  insertFreestyleTrickModifierLink(db, 'ripwalk',         'stepping', 1);
  insertFreestyleTrickModifierLink(db, 'phoenix',         'ducking', 2);
  // Montage carries four body-modifier links — verifies intentional duplication
  insertFreestyleTrickModifierLink(db, 'montage',         'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'montage',         'ducking',   2);
  insertFreestyleTrickModifierLink(db, 'montage',         'paradox',   3);
  insertFreestyleTrickModifierLink(db, 'montage',         'symposium', 4);

  // Modifier links — set axis.
  insertFreestyleTrickModifierLink(db, 'phoenix',      'pixie', 1);
  insertFreestyleTrickModifierLink(db, 'dimwalk',      'pixie', 1);
  insertFreestyleTrickModifierLink(db, 'atom-smasher', 'atomic', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. Route + alias
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=component — route + alias (soft-retired)', () => {
  // 2026-05-18 soft retirement: the "By component" toggle entry was
  // removed from the view-toggle row (Movement System is the canonical
  // modifier-grouped browse surface). The URL still resolves so
  // bookmarks and external links keep working; a retirement notice
  // renders above the view body to redirect new traffic.

  it('returns 200 (bookmarks keep resolving post-soft-retirement)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.status).toBe(200);
  });

  it('view-toggle row no longer surfaces a "By component" entry (soft retirement)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).not.toMatch(/class="trick-view-toggle-active">By component</);
    // The toggle row also no longer carries a link to the view from
    // OTHER active views.
    const tricksDefault = await request(createApp()).get('/freestyle/tricks?view=add');
    // The component-view URL must not appear as a toggle-row anchor;
    // it may still appear in `?view=component#component-*` deep-link
    // contexts elsewhere on the page (trick-detail membership panels).
    const toggleRow = (tricksDefault.text.match(/<nav[^>]*aria-label="View toggle"[\s\S]*?<\/nav>/) ?? [])[0]
                   ?? (tricksDefault.text.match(/trick-view-toggle[\s\S]*?<\/nav>/) ?? [])[0]
                   ?? '';
    expect(toggleRow).not.toMatch(/href="\/freestyle\/tricks\?view=component"/);
  });

  it('renders the retirement notice on the view body', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).toContain('class="component-view-retirement-notice"');
    expect(res.text).toMatch(/This view is being retired/);
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system"');
  });

  it('?view=sets is NO LONGER a component-view alias', async () => {
    // The 2026-05-24 governance/polish slice ended the ?view=sets →
    // ?view=component alias. ?view=sets now activates the dedicated By
    // Set browse view. The component view is unaffected (still soft-
    // retired; canonical /freestyle/tricks?view=component URL still
    // renders with the retirement notice).
    const res = await request(createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
    // The component view's markers must NOT appear on the sets URL anymore.
    expect(res.text).not.toContain('class="component-view-note"');
    expect(res.text).not.toContain('class="component-view-retirement-notice"');
    // The dedicated By Set view's active toggle marker confirms the new
    // routing took effect.
    expect(res.text).toMatch(/class="trick-view-toggle-active">By modifier</);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Axes + axis-jump nav
// ─────────────────────────────────────────────────────────────────────────

describe('component view — axes + axis-jump nav', () => {
  it('renders the axis-jump nav with Body modifiers, Dex relationships, and Set modifiers', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).toContain('class="component-axis-jump"');
    expect(res.text).toMatch(/<a href="#axis-body">Body modifiers<\/a>/);
    expect(res.text).toMatch(/<a href="#axis-entry-topology">Dex relationships<\/a>/);
    expect(res.text).toMatch(/<a href="#axis-set">Set modifiers<\/a>/);
  });

  it('renders the three axis sections with stable anchor IDs', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).toContain('id="axis-body"');
    expect(res.text).toContain('id="axis-entry-topology"');
    expect(res.text).toContain('id="axis-set"');
  });

  it('Body modifiers axis renders before Set modifiers axis', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    const bodyIdx = res.text.indexOf('id="axis-body"');
    const setIdx  = res.text.indexOf('id="axis-set"');
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(bodyIdx);
  });

  it('does NOT render topology or movement-archetype axes (deferred to a later slice)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).not.toContain('id="axis-topology"');
    expect(res.text).not.toContain('id="axis-archetype"');
  });

  it('renders an explanatory note about intentional duplication', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).toContain('class="component-view-note"');
    expect(res.text).toMatch(/Compounds appear in every component group they belong to/);
    expect(res.text).toMatch(/duplication is intentional/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Group ordering — priority then alphabetical
// ─────────────────────────────────────────────────────────────────────────

describe('component view — group ordering', () => {
  it('Body modifier groups appear in priority order: symposium, spinning, ducking', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    const symposiumIdx = res.text.indexOf('id="component-symposium"');
    const spinningIdx  = res.text.indexOf('id="component-spinning"');
    const duckingIdx   = res.text.indexOf('id="component-ducking"');
    // Priority order. Paradox moved to the dex relationships axis, and
    // stepping to the set axis (it is a set / uptime modifier, not a body move).
    // Diving / weaving / gyro are not in the fixture; their absence is expected.
    expect(symposiumIdx).toBeGreaterThan(-1);
    expect(spinningIdx).toBeGreaterThan(symposiumIdx);
    expect(duckingIdx).toBeGreaterThan(spinningIdx);
  });

  it('paradox renders in its own Dex relationships axis, after the body axis, not within it', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).toContain('Dex relationships');
    const entryAxisIdx = res.text.indexOf('id="axis-entry-topology"');
    const paradoxIdx   = res.text.indexOf('id="component-paradox"');
    const symposiumIdx = res.text.indexOf('id="component-symposium"');
    expect(entryAxisIdx).toBeGreaterThan(-1);
    // The paradox group sits inside the entry axis (after its heading) and after
    // the body-axis groups, since the entry axis renders after the body axis.
    expect(paradoxIdx).toBeGreaterThan(entryAxisIdx);
    expect(paradoxIdx).toBeGreaterThan(symposiumIdx);
  });

  it('Set modifier groups appear in priority order: pixie, atomic, stepping', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    const pixieIdx    = res.text.indexOf('id="component-pixie"');
    const atomicIdx   = res.text.indexOf('id="component-atomic"');
    const steppingIdx = res.text.indexOf('id="component-stepping"');
    // Stepping is a set modifier (set / uptime foot relocation), so it renders
    // in the set axis after the higher-priority sets.
    expect(pixieIdx).toBeGreaterThan(-1);
    expect(atomicIdx).toBeGreaterThan(pixieIdx);
    expect(steppingIdx).toBeGreaterThan(atomicIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Empty group hiding
// ─────────────────────────────────────────────────────────────────────────

describe('component view — empty groups hidden', () => {
  it('hides body-modifier groups with zero member tricks (diving, weaving, gyro)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).not.toContain('id="component-diving"');
    expect(res.text).not.toContain('id="component-weaving"');
    expect(res.text).not.toContain('id="component-gyro"');
  });

  it('hides set-modifier groups with zero member tricks (nuclear, fairy, furious, quantum)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).not.toContain('id="component-quantum"');
    expect(res.text).not.toContain('id="component-nuclear"');
    expect(res.text).not.toContain('id="component-fairy"');
    expect(res.text).not.toContain('id="component-furious"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Group rendering — headings, definitions, cards
// ─────────────────────────────────────────────────────────────────────────

describe('component view — group rendering', () => {
  it('group heading carries a one-line body-mechanics definition when authored', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    // Paradox has a curator-authored definition; verify it renders inside the paradox group.
    const paradoxStart = res.text.indexOf('id="component-paradox"');
    expect(paradoxStart).toBeGreaterThan(-1);
    const nextGroupStart = res.text.indexOf('id="component-', paradoxStart + 1);
    const paradoxBlock = res.text.slice(paradoxStart, nextGroupStart > paradoxStart ? nextGroupStart : paradoxStart + 2500);
    expect(paradoxBlock).toContain('class="component-group-definition"');
    expect(paradoxBlock).toMatch(/hip pivot on a single dex/);
  });

  it('group heading wraps the component name in a self-anchored link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    expect(res.text).toMatch(/<h3><a href="\/freestyle\/tricks\?view=component#component-paradox">paradox<\/a><\/h3>/);
  });

  it('group renders the shared dictionary-trick-card partial', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    const paradoxStart = res.text.indexOf('id="component-paradox"');
    const nextGroupStart = res.text.indexOf('id="component-', paradoxStart + 1);
    const paradoxBlock = res.text.slice(paradoxStart, nextGroupStart > paradoxStart ? nextGroupStart : paradoxStart + 2500);
    // Post PRESENTATION_UNIFICATION (2026-05-16): component view uses registry
    // density (same as ADD View). Stack wrapper carries both base + density classes.
    expect(paradoxBlock).toContain('class="dict-card-stack dict-card-stack--registry"');
    expect(paradoxBlock).toContain('data-trick-slug="paradox-mirage"');
    expect(paradoxBlock).toContain('data-trick-slug="paradox-whirl"');
    expect(paradoxBlock).toContain('data-trick-slug="paradox-blender"');
  });

  it('cards within a group sort ADD ascending then trick name (paradox-mirage 3 before paradox-whirl 4 before paradox-blender 5)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    const paradoxStart = res.text.indexOf('id="component-paradox"');
    const nextGroupStart = res.text.indexOf('id="component-', paradoxStart + 1);
    const paradoxBlock = res.text.slice(paradoxStart, nextGroupStart > paradoxStart ? nextGroupStart : paradoxStart + 2500);
    const mirageIdx  = paradoxBlock.indexOf('data-trick-slug="paradox-mirage"');
    const whirlIdx   = paradoxBlock.indexOf('data-trick-slug="paradox-whirl"');
    const blenderIdx = paradoxBlock.indexOf('data-trick-slug="paradox-blender"');
    expect(mirageIdx).toBeGreaterThan(-1);
    expect(whirlIdx).toBeGreaterThan(mirageIdx);
    expect(blenderIdx).toBeGreaterThan(whirlIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Intentional duplication
// ─────────────────────────────────────────────────────────────────────────

describe('component view — intentional duplication', () => {
  it('montage (4 body-modifier links: spinning + ducking + paradox + symposium) appears in all four groups', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    const expectMontageIn = (componentSlug: string) => {
      const groupStart = res.text.indexOf(`id="component-${componentSlug}"`);
      expect(groupStart, `montage's ${componentSlug} group must exist`).toBeGreaterThan(-1);
      const nextGroup = res.text.indexOf('id="component-', groupStart + 1);
      const groupBlock = res.text.slice(groupStart, nextGroup > groupStart ? nextGroup : groupStart + 2500);
      expect(groupBlock, `montage must render inside ${componentSlug} group`).toContain('data-trick-slug="montage"');
    };
    expectMontageIn('paradox');
    expectMontageIn('symposium');
    expectMontageIn('spinning');
    expectMontageIn('ducking');
  });

  it('phoenix (ducking + pixie) appears in both ducking AND pixie groups', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=component');
    const expectIn = (componentSlug: string) => {
      const groupStart = res.text.indexOf(`id="component-${componentSlug}"`);
      expect(groupStart).toBeGreaterThan(-1);
      const nextGroup = res.text.indexOf('id="component-', groupStart + 1);
      const groupBlock = res.text.slice(groupStart, nextGroup > groupStart ? nextGroup : groupStart + 2500);
      expect(groupBlock).toContain('data-trick-slug="phoenix"');
    };
    expectIn('ducking');
    expectIn('pixie');
  });
});
