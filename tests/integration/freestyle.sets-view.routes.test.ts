/**
 * `?view=sets` browse mode + Operators & Modifiers retirement from toggle.
 *
 * 2026-05-24 governance/polish slice. Pins:
 *   - Two-cohort structure (Core sets / Secondary / composite systems)
 *   - Per-set intro + dynamic trick count
 *   - "By set" appears in toggle as active state
 *   - "Operators & Modifiers" NOT in toggle nav anymore
 *   - /freestyle/operators still reachable (separate reference page)
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

const { dbPath } = setTestEnv('3219');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed a few canonical tricks
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'pixie-mirage', canonical_name: 'pixie mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'TOE > SAME IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'nuclear-mirage', canonical_name: 'nuclear mirage', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // Seed the relevant modifiers
  insertFreestyleTrickModifier(db, {
    slug: 'pixie', modifier_name: 'pixie', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set', notes: '',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'nuclear', modifier_name: 'nuclear', add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'set', notes: '',
  });

  // Link tricks to modifiers (positional factory signature)
  insertFreestyleTrickModifierLink(db, 'pixie-mirage', 'pixie');
  insertFreestyleTrickModifierLink(db, 'nuclear-mirage', 'nuclear');

  // Seed one alternate-surface trick so the third cohort renders.
  // head-stall lives in the head-neck-shoulder group of ALTERNATIVE_SURFACES.
  insertFreestyleTrick(db, {
    slug: 'head-stall', canonical_name: 'head stall', adds: '1',
    base_trick: 'head-stall', trick_family: 'head-stall', category: 'stall',
    operational_notation: 'SET > HEAD [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks?view=sets', () => {
  it('returns 200', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.status).toBe(200);
  });

  it('renders "By set" as active in the toggle bar', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('<span class="trick-view-toggle-active">By set</span>');
  });

  it('renders ALL THREE cohort sections (Core sets + Secondary/composite + Alternate-surface)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    expect(res.text).toContain('<h2>Core sets</h2>');
    expect(res.text).toContain('<h2>Secondary / composite systems</h2>');
    expect(res.text).toContain('<h2>Alternate-surface systems</h2>');
    expect(res.text).toContain('id="sets-core"');
    expect(res.text).toContain('id="sets-secondary"');
    expect(res.text).toContain('id="sets-surface"');
  });

  it('alternate-surface cohort explicitly frames itself as a distinct ontology layer', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    const surfaceStart = res.text.indexOf('id="sets-surface"');
    expect(surfaceStart).toBeGreaterThan(-1);
    const surfaceSlice = res.text.substring(surfaceStart);
    expect(surfaceSlice).toContain('Distinct ontology layer');
    expect(surfaceSlice).toContain('Surface mechanics are NOT sets');
  });

  it('alternate-surface cohort renders the seeded head-stall trick under its group', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    const surfaceStart = res.text.indexOf('id="sets-surface"');
    const surfaceSlice = res.text.substring(surfaceStart);
    expect(surfaceSlice).toContain('id="set-surface-head-neck-shoulder"');
    expect(surfaceSlice).toMatch(/<a href="\/freestyle\/tricks\/head-stall">head stall<\/a>/);
  });

  it('renders the pixie set in Core sets with its modifier-linked tricks', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // Core sets cohort comes first; pixie group within it
    const coreStart = res.text.indexOf('id="sets-core"');
    const coreEnd = res.text.indexOf('id="sets-secondary"');
    expect(coreStart).toBeGreaterThan(-1);
    expect(coreEnd).toBeGreaterThan(coreStart);
    const coreSlice = res.text.substring(coreStart, coreEnd);
    expect(coreSlice).toContain('id="set-pixie"');
    expect(coreSlice).toMatch(/<a href="\/freestyle\/tricks\/pixie-mirage">pixie mirage<\/a>/);
  });

  it('renders the nuclear set in Secondary/composite systems', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    const secStart = res.text.indexOf('id="sets-secondary"');
    expect(secStart).toBeGreaterThan(-1);
    const secSlice = res.text.substring(secStart);
    expect(secSlice).toContain('id="set-nuclear"');
    expect(secSlice).toMatch(/<a href="\/freestyle\/tricks\/nuclear-mirage">nuclear mirage<\/a>/);
  });

  it('uses compact-list rendering (NOT registry-density cards)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // The sets view should use the compact-list class for trick listings,
    // not the dictionary-trick-card registry density.
    expect(res.text).toContain('sets-trick-list');
    // The dict-card-stack--registry class must not appear inside any
    // sets-cohort section. We assert this by checking the substring
    // between the first sets-cohort start and the last sets-cohort's
    // closing </section> tag.
    const firstCohort = res.text.indexOf('class="content-section sets-cohort"');
    expect(firstCohort).toBeGreaterThan(-1);
    // Find the closing tag of the secondary cohort (last sets-cohort).
    const secondaryIdx = res.text.indexOf('id="sets-secondary"');
    expect(secondaryIdx).toBeGreaterThan(-1);
    // Walk forward to find the matching </section> after secondaryIdx.
    const closeIdx = res.text.indexOf('</section>\n  {{/if}}', secondaryIdx);
    const endOfSets = closeIdx > -1 ? closeIdx : res.text.indexOf('<footer', secondaryIdx);
    const setsSlice = res.text.substring(firstCohort, endOfSets > 0 ? endOfSets : firstCohort + 8000);
    expect(setsSlice).not.toContain('dict-card-stack--registry');
  });

  it('shows dynamic trick counts per set group', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // pixie has 1 seeded trick; nuclear has 1
    expect(res.text).toMatch(/id="set-pixie"[\s\S]+?<span class="section-count">1<\/span>/);
    expect(res.text).toMatch(/id="set-nuclear"[\s\S]+?<span class="section-count">1<\/span>/);
  });

  it('shows total-tricks count in the intro strip (sets + surface combined)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=sets');
    // 2 set-linked tricks (pixie-mirage, nuclear-mirage) + 1 surface trick (head-stall) = 3
    expect(res.text).toMatch(/<strong>3<\/strong> tricks grouped across/);
  });
});

describe('GET /freestyle/tricks (other views) — toggle wiring', () => {
  it('"By set" link appears in the toggle on other views as a hyperlink', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('href="/freestyle/tricks?view=sets"');
    expect(res.text).toContain('>By set</a>');
  });

  it('Operators & Modifiers NOT in the toggle row', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    const navStart = res.text.indexOf('class="trick-view-toggle"');
    const navEnd = res.text.indexOf('</nav>', navStart);
    const nav = res.text.substring(navStart, navEnd);
    expect(nav).not.toContain('href="/freestyle/operators"');
  });

  it('Operators & Modifiers stays reachable via the toggle aside', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('trick-view-toggle-aside');
    expect(res.text).toContain('href="/freestyle/operators"');
  });

  it('Movement System view shows exploratory label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=movement-system');
    expect(res.text).toContain('browse-view-status-label');
    expect(res.text).toContain('Exploratory / pedagogical');
  });

  it('Movement Neighborhoods view shows exploratory label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=topology');
    expect(res.text).toContain('browse-view-status-label');
    expect(res.text).toContain('Exploratory / pedagogical');
  });
});
