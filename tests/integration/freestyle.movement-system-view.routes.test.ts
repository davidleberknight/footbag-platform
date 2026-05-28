/**
 * Integration tests for Slice L2 — the Movement System view branch.
 *
 * Scope verified:
 *   - /freestyle/tricks?view=movement-system returns 200
 *   - The view-toggle marks "By movement system" active
 *   - Axis-jump nav renders one entry per populated axis
 *   - Four axis section headers render in canonical order when populated
 *   - Each axis carries the curator-authored definition prose
 *   - Modifier groups render under their axis with anchor 'movement-{slug}'
 *   - Group bodyDefinition prose renders when COMPONENT_DEFINITIONS supplies one
 *   - Rows render via the generalized two-line dictionary-trick-row partial
 *   - Cards within a group sort ADD ascending then by name
 *   - Empty axes are absent from the rendered DOM
 *   - Other view branches don't bleed in (no Component / Topology section headings)
 *   - Anti-enumeration smoke: unknown view values resolve to the ADD view (not movement-system)
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

  // One modifier per pilot axis member. Body + set types so the existing
  // component-axis filter routes both into the accumulator.
  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'atomic',    modifier_name: 'atomic',    modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });

  // Tricks. ADDs chosen so within-group ordering is verifiable.
  insertFreestyleTrick(db, { slug: 'pixie-illusion',   canonical_name: 'pixie illusion',  adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > pixie > hippy in dex > op toe' });
  insertFreestyleTrick(db, { slug: 'dimwalk',          canonical_name: 'dimwalk',         adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > pixie > butterfly wing > ss clipper' });
  insertFreestyleTrick(db, { slug: 'atom-smasher',     canonical_name: 'atom smasher',    adds: '4', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > atomic > hippy in dex > op toe' });
  insertFreestyleTrick(db, { slug: 'paradox-whirl',    canonical_name: 'paradox whirl',   adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > paradox > front whirl > ss clipper' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl',   canonical_name: 'spinning whirl',  adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > spinning > front whirl > ss clipper' });
  insertFreestyleTrick(db, { slug: 'ducking-whirl',    canonical_name: 'ducking whirl',   adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > duck > front whirl > ss clipper' });
  insertFreestyleTrick(db, { slug: 'symposium-mirage', canonical_name: 'symposium mirage', adds: '5', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', operational_notation: '[set] > symposium > hippy in dex > op toe' });

  insertFreestyleTrickModifierLink(db, 'pixie-illusion',   'pixie',     1);
  insertFreestyleTrickModifierLink(db, 'dimwalk',          'pixie',     1);
  insertFreestyleTrickModifierLink(db, 'atom-smasher',     'atomic',    1);
  insertFreestyleTrickModifierLink(db, 'paradox-whirl',    'paradox',   1);
  insertFreestyleTrickModifierLink(db, 'spinning-whirl',   'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'ducking-whirl',    'ducking',   1);
  insertFreestyleTrickModifierLink(db, 'symposium-mirage', 'symposium', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// Route + toggle bar
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=movement-system — route + toggle', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.status).toBe(200);
  });

  it('marks "By movement system" active in the view-toggle bar', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toMatch(/class="trick-view-toggle-active">By movement system</);
  });

  it('legacy toggle entries remain present except soft-retired views (Component + Category)', async () => {
    // Component View soft retirement (2026-05-18) and Category View soft
    // retirement (CR-4 of dictionary-coherence-2026-05-18): toggle entries
    // removed from the view-toggle row. URLs still resolve (?view=component
    // and ?view=category → 200, each with a retirement notice), but no
    // toggle-row link reaches either.
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=category"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=component"');
    expect(res.text).toContain('href="/freestyle/tricks?view=topology"');
  });

  it('unknown view query param falls back to ADD view (not movement-system)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=nonsense-axis');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-view-toggle-active">By movement system</);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Axis-jump nav + section structure
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=movement-system — axes + groups', () => {
  it('renders the observational note + axis-jump nav', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('movement-system-view-note');
    expect(res.text).toContain('movement-axis-jump');
    expect(res.text).toMatch(/aria-label="Movement System axes"/);
  });

  it('renders all four axis sections in canonical declaration order', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    const i1 = res.text.indexOf('id="movement-axis-set-uptime"');
    const i2 = res.text.indexOf('id="movement-axis-entry-topology"');
    const i3 = res.text.indexOf('id="movement-axis-midtime-body"');
    const i4 = res.text.indexOf('id="movement-axis-no-plant-suspension"');

    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(i4).toBeGreaterThan(i3);
  });

  it('renders axis names + curator-authored axis definitions', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('Set / Uptime Systems');
    expect(res.text).toContain('Entry Topologies');
    expect(res.text).toContain('Midtime Body Modifiers');
    expect(res.text).toContain('No-Plant &amp; Suspension');
    expect(res.text).toContain('movement-axis-definition');
  });

  it('the intro copy mentions Alternative surfaces as part of the movement-language model', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    // Target the movement-system intro specifically (the generic dictionaryIntro
    // at the top of every view also uses .browse-view-intro).
    const introMatch = res.text.match(/<p class="browse-view-intro"><strong>By movement system[\s\S]*?<\/p>/);
    expect(introMatch, 'movement-system intro paragraph').not.toBeNull();
    expect(introMatch![0]).toMatch(/Alternative surfaces/);
  });

  it('renders modifier groups with anchor "movement-{slug}"', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('id="movement-pixie"');
    expect(res.text).toContain('id="movement-atomic"');
    expect(res.text).toContain('id="movement-paradox"');
    expect(res.text).toContain('id="movement-spinning"');
    expect(res.text).toContain('id="movement-ducking"');
    expect(res.text).toContain('id="movement-symposium"');
  });

  it('group heading links back to the same view with a hash anchor', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system#movement-pixie"');
    expect(res.text).toContain('href="/freestyle/tricks?view=movement-system#movement-paradox"');
  });

  it('renders the COMPONENT_DEFINITIONS body prose under each modifier group', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('movement-group-definition');
    // spinning's COMPONENT_DEFINITIONS one-liner mentions rotation
    expect(res.text).toMatch(/rotation/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Card rendering + sort order
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=movement-system — cards', () => {
  it('renders the two-line dict-trick-row stack (2026-05-27 migration)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('dict-trick-row-stack');
    expect(res.text).not.toContain('dict-card-stack');
  });

  it('rows carry JOB + ADD labels with no green ADD chip (two-line contract)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).not.toMatch(/class="dict-card-add[ "]/);
    const m = res.text.match(/<article class="dict-trick-row[\s\S]*?data-trick-slug="pixie-illusion"[\s\S]*?<\/article>/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/class="dict-trick-row-label">JOB</);
    expect(m![0]).toMatch(/class="dict-trick-row-label">ADD</);
    // JOB resolves from the row's operational notation.
    expect(m![0]).toMatch(/class="dict-trick-row-job-value">/);
  });

  it('the modifier-composition gloss row coexists with the two-line rows in a group', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    const groupStart = res.text.indexOf('id="movement-pixie"');
    expect(groupStart).toBeGreaterThan(-1);
    const groupEnd = res.text.indexOf('<section', groupStart + 1);
    const slice = groupEnd > -1 ? res.text.substring(groupStart, groupEnd) : res.text.substring(groupStart);
    expect(slice).toContain('movement-group-composition-gloss');
    expect(slice).toContain('dict-trick-row-stack');
  });

  it('renders pixie-illusion (ADD 3) before dimwalk (ADD 4) inside the pixie group', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    const groupStart  = res.text.indexOf('id="movement-pixie"');
    expect(groupStart).toBeGreaterThan(-1);
    // Locate the start of the *next* section to bound this group's slice.
    const groupEnd = res.text.indexOf('<section', groupStart + 1);
    const groupSlice = groupEnd > -1 ? res.text.substring(groupStart, groupEnd) : res.text.substring(groupStart);
    // Search on the card-stack data attribute, not the bare slug — after
    // Slice N, the pixie modifier gloss mentions "PIX + BUTTERFLY (dimwalk)"
    // which appears BEFORE the card stack and would otherwise dominate
    // the indexOf result.
    const pixieIllusionIdx = groupSlice.indexOf('data-trick-slug="pixie-illusion"');
    const dimwalkIdx       = groupSlice.indexOf('data-trick-slug="dimwalk"');
    expect(pixieIllusionIdx).toBeGreaterThan(-1);
    expect(dimwalkIdx).toBeGreaterThan(pixieIllusionIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cross-view isolation: other view branches don't render in movement-system
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=movement-system — view isolation', () => {
  it('does not render the Component view note + axis-jump', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).not.toContain('component-view-note');
    expect(res.text).not.toContain('aria-label="Component axes"');
  });

  it('does not render the Topology view section headings', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).not.toContain('topology-view-note');
  });
});
