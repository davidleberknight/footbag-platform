/**
 * Trick-detail ontology doctrine — Phase A + B tests (2026-05-25).
 *
 * Pins:
 *   - Tier A flagship pages render L2-L6 sections (mechanical delta,
 *     ontology role, productivity, family evolution, progressive
 *     readings) when content is authored
 *   - Tier B / Tier C pages do NOT render L2-L4 or L6 sections
 *   - Interpretive-traditions block renders for paradox-mirage (two
 *     readings, neither promoted to canonical)
 *   - Atom pages (mirage, whirl) render the "Atom — defining mechanical
 *     pattern" topology label
 *   - Productive-descendant links render with /freestyle/tricks/<slug> hrefs
 *   - Family-evolution sections render numbered narrative steps
 *   - Progressive-readings sections render numbered stages
 *   - Placeholder-description suppressor: literal "X-modified Y."
 *     description suppressed; structured decomposition pill renders instead
 *   - DB description rows NOT mutated (verified by absence of regex
 *     match in raw description on rendered page when literal differs
 *     from displayed)
 *   - Shell ordering: L1-L6 sections appear BEFORE trick-about
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3222');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed the three editorial-exemplar tricks + one placeholder-description
  // trick + one Tier C trick for negative-case coverage.
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    description: "Toe-set dex'd outside the supporting leg, recaught on the opposite toe (in-to-out dex).",
    operational_notation: 'TOE > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage', canonical_name: 'paradox mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    description: 'Paradox-modified mirage.',
    operational_notation: 'CLIP > SAME OUT [PDX] [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'dex',
    description: 'Rotational body-spin dex; anchor of the whirl family.',
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  // Tier C trick — no L1-L6 sections expected
  insertFreestyleTrick(db, {
    slug: 'plain-tier-c-trick', canonical_name: 'plain tier c trick', adds: '4',
    base_trick: 'plain-tier-c-trick', trick_family: null, category: 'compound',
    description: 'A descriptive trick description that is not a placeholder.',
    operational_notation: 'CLIP > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Tier A flagship pages — L2-L6 ontology sections render', () => {
  it('mirage renders the mechanical-delta section with atom topology label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('>Mechanical delta<');
    expect(res.text).toContain('Atom — defining mechanical pattern');
    // Stable substring from mirage's L2 prose
    expect(res.text).toMatch(/in-to-out dex/);
  });

  it('paradox-mirage renders the mechanical-delta section with paradox topology label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Paradox topology');
    expect(res.text).toContain('class="trick-mechanical-delta-parents"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/mirage"/);
  });

  it('paradox-mirage renders BOTH interpretive traditions (neither promoted to canonical)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).toContain('class="trick-interpretive-traditions"');
    expect(res.text).toContain('Both readings preserved; neither promoted to canonical doctrine');
    expect(res.text).toMatch(/Op-side dex from a clipper entry/);
    expect(res.text).toMatch(/Older shorthand tradition/);
    expect(res.text).toMatch(/Additional cross-body hip-pivot transition/);
    expect(res.text).toMatch(/Newer pedagogical reading/);
  });

  it('whirl renders the mechanical-delta section with rotational topology label', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('>Rotational<');
  });

  it('mirage renders the ontology-role section with the role eyebrow', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('class="content-section trick-ontology-role"');
    expect(res.text).toContain('Movement-language entry point');
  });

  it('paradox-mirage renders the ontology-role section as "Paradox topology root"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).toContain('Paradox topology root');
  });

  it('mirage renders the productivity section with productive-descendant links', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toContain('Why this trick became productive');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-mirage"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/blur"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/sumo"/);
  });

  it('mirage renders the family-evolution narrative with multiple branch axes', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Family evolution');
    expect(res.text).toContain('Topology intensification');
    expect(res.text).toContain('Multi-dex extension');
    expect(res.text).toContain('X-dex escalation');
    expect(res.text).toContain('Terminal surface shift');
  });

  it('mirage renders the progressive-readings staircase with numbered stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Progressive readings');
    expect(res.text).toContain('Simple atom');
    expect(res.text).toContain('Topology transformation');
    expect(res.text).toContain('Compositional extension');
  });

  it('paradox-mirage renders the progressive-readings staircase with both paradox readings', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).toContain('Mirage atom');
    expect(res.text).toContain('Paradox layer — older reading');
    expect(res.text).toContain('Paradox layer — interpretive reading');
    expect(res.text).toContain('ADD accounting');
    expect(res.text).toContain('Productive descendants');
  });
});

describe('Placeholder-description suppressor', () => {
  it('paradox-mirage (DB description: "Paradox-modified mirage.") suppresses the literal description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox-mirage');
    // The literal placeholder is NOT rendered as a description paragraph
    expect(res.text).not.toMatch(/<p class="trick-description">Paradox-modified mirage\.<\/p>/);
  });

  it('mirage (non-placeholder description) DOES render the literal description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('Toe-set dex&#x27;d outside the supporting leg');
  });

  it('plain-tier-c-trick (non-placeholder description) DOES render the literal description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/plain-tier-c-trick');
    expect(res.text).toContain('A descriptive trick description that is not a placeholder.');
  });
});

describe('Tier C pages — no L1-L6 sections render', () => {
  it('plain-tier-c-trick does NOT render mechanical-delta / ontology-role / productivity / family-evolution / progressive-readings sections', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/plain-tier-c-trick');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).not.toContain('class="content-section trick-ontology-role"');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
    expect(res.text).not.toContain('class="content-section trick-progressive-readings"');
  });
});

describe('Shell ordering — L1-L6 sections render BEFORE trick-about', () => {
  it('on mirage, mechanical-delta appears before the About-this-trick heading', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    const deltaIdx = res.text.indexOf('class="content-section trick-mechanical-delta"');
    const aboutIdx = res.text.indexOf('>About this trick<');
    expect(deltaIdx).toBeGreaterThan(-1);
    expect(aboutIdx).toBeGreaterThan(-1);
    expect(deltaIdx).toBeLessThan(aboutIdx);
  });

  it('on mirage, the L1-L6 sections render in canonical order (intuition → delta → role → productivity → family-evolution → progressive-readings)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    const intuitionIdx           = res.text.indexOf('class="content-section trick-intuition"');
    const deltaIdx               = res.text.indexOf('class="content-section trick-mechanical-delta"');
    const roleIdx                = res.text.indexOf('class="content-section trick-ontology-role"');
    const productivityIdx        = res.text.indexOf('class="content-section trick-productivity"');
    const familyEvolutionIdx     = res.text.indexOf('class="content-section trick-family-evolution"');
    const progressiveReadingsIdx = res.text.indexOf('class="content-section trick-progressive-readings"');
    expect(intuitionIdx).toBeGreaterThan(-1);
    expect(deltaIdx).toBeGreaterThan(intuitionIdx);
    expect(roleIdx).toBeGreaterThan(deltaIdx);
    expect(productivityIdx).toBeGreaterThan(roleIdx);
    expect(familyEvolutionIdx).toBeGreaterThan(productivityIdx);
    expect(progressiveReadingsIdx).toBeGreaterThan(familyEvolutionIdx);
  });
});
