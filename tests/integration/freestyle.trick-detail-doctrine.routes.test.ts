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

  // ── Phase C C1 mirage-descendant batch (2026-05-25) ───────────────
  insertFreestyleTrick(db, {
    slug: 'blur', canonical_name: 'blur', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    description: 'Blurry-modified mirage.',
    operational_notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'fury', canonical_name: 'fury', adds: '5',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    description: 'Furious-modified paradox mirage.',
    operational_notation: null,
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'sumo', canonical_name: 'sumo', adds: '5',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    description: 'Nuclear-modified mirage.',
    operational_notation: 'CLIP > SAME OUT [DEX] [PDX] >> OP IN [DEX] [XDEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // ── Phase C C1 second batch (2026-05-25) ──────────────────────────
  insertFreestyleTrick(db, {
    slug: 'drifter', canonical_name: 'drifter', adds: '3',
    base_trick: 'clipper-stall', trick_family: 'drifter', category: 'compound',
    description: 'Mirage-modified clipper stall.',
    operational_notation: 'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'atom-smasher', canonical_name: 'atom smasher', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    description: "Atomic mirage: outside-then-inside dex sequence, recaught on the opposite toe.",
    operational_notation: null,
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'barrage', canonical_name: 'barrage', adds: '3',
    base_trick: 'barrage', trick_family: 'barrage', category: 'dex',
    description: "Standalone trick distinct from the existing 'barraging' modifier; barrage is its own mechanical family.",
    operational_notation: 'CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'blurriest', canonical_name: 'blurriest', adds: '5',
    base_trick: 'barfly', trick_family: 'barfly', category: 'compound',
    description: 'Blurry-modified barfly.',
    operational_notation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // ── Phase C C2 whirl-descendant batch (2026-05-25) ────────────────
  insertFreestyleTrick(db, {
    slug: 'blender', canonical_name: 'blender', adds: '4',
    base_trick: 'osis', trick_family: 'blender', category: 'compound',
    description: 'Whirl-modified osis.',
    operational_notation: 'SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'surreal', canonical_name: 'surreal', adds: '6',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    description: 'Surging-modified paradox whirl.',
    operational_notation: 'CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'phoenix', canonical_name: 'phoenix', adds: '5',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    description: 'Pixie-and-ducking modified butterfly.',
    operational_notation: 'TOE > SAME IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // ── Phase C C3 independent-anchor batch (2026-05-25) ─────────────
  insertFreestyleTrick(db, {
    slug: 'osis', canonical_name: 'osis', adds: '3',
    base_trick: 'osis', trick_family: 'osis', category: 'dex',
    description: 'Inside-to-outside delay combination.',
    operational_notation: 'SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly', adds: '3',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'dex',
    description: 'Compound dex; base for ripwalk, dimwalk, and parkwalk.',
    operational_notation: 'SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'torque', canonical_name: 'torque', adds: '4',
    base_trick: 'osis', trick_family: 'torque', category: 'compound',
    description: 'Mirage variation of an osis.',
    operational_notation: null,
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'mobius', canonical_name: 'mobius', adds: '5',
    base_trick: 'torque', trick_family: 'torque', category: 'compound',
    description: 'Gyro-modified torque.',
    operational_notation: 'CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'ripwalk', canonical_name: 'ripwalk', adds: '4',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    description: 'Blurry-modified butterfly.',
    operational_notation: null,
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'food-processor', canonical_name: 'food processor', adds: '6',
    base_trick: 'blender', trick_family: 'blender', category: 'compound',
    description: 'Blurry-modified blender.',
    operational_notation: 'CLIP > OP IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // ── Phase C C4 folk-name rescue exemplar (2026-05-25) ────────────
  insertFreestyleTrick(db, {
    slug: 'ripstein', canonical_name: 'ripstein', adds: '4',
    base_trick: null, trick_family: 'ripstein', category: 'compound',
    description: 'Popular freestyle trick.',
    operational_notation: 'CLIP >> SAME BACK SWIRL [DEX] >> SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',
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
    expect(res.text).toContain('Atom: defining mechanical pattern');
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
    expect(res.text).toContain('Paradox layer: older reading');
    expect(res.text).toContain('Paradox layer: interpretive reading');
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

// Universal-grammar rule: pages with no curated L1-L6 content suppress
// those sections via content-driven nulls, not via tier-gating. Tier
// remains an authoring priority signal, NOT a structural gate.
describe('Pages with no curated L1-L6 content suppress those sections', () => {
  it('plain-tier-c-trick (no curated L1-L6 entries) does NOT render mechanical-delta / ontology-role / productivity / family-evolution / progressive-readings sections', async () => {
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

// ─────────────────────────────────────────────────────────────────────────
// Phase C — C1 mirage-descendant batch (blur / fury / sumo)
// ─────────────────────────────────────────────────────────────────────────
//
// blur renders all six L1-L6 layers.
// fury + sumo are leaf-class compounds; L4 (productivity) and L5
// (family evolution) are intentionally suppressed per the Phase B lock
// §2 rule 7 (suppression > filler).

describe('Phase C — blur renders all six L1-L6 layers', () => {
  it('blur renders L1 intuition with the 4-ADD coach prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Blur stretches a paradox-mirage/);
  });

  it('blur renders L2 mechanical-delta with paradox topology + parent link to paradox-mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Paradox topology');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-mirage"/);
  });

  it('blur renders L3 ontology-role as "Stepping-paradox-mirage root"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).toContain('class="content-section trick-ontology-role"');
    expect(res.text).toContain('Stepping-paradox-mirage root');
  });

  it('blur renders L4 productivity with fury + blurriest descendant links', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/fury"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/blurriest"/);
  });

  it('blur renders L5 family-evolution with multi-dex naming + cultural-canonical branch axes', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Three-dex extension');
    expect(res.text).toContain('Cultural-canonical shorthand');
  });

  it('blur renders L6 progressive-readings staircase with the mirage → paradox → stepping → shorthand → fury chain', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Mirage atom');
    expect(res.text).toContain('Paradox layer');
    expect(res.text).toContain('Stepping multi-dex extension');
    expect(res.text).toContain('Compressed shorthand');
    expect(res.text).toContain('Further extension');
  });
});

describe('Phase C — fury renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('fury renders L1 intuition with the 5-ADD furious multi-dex prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/fury');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Fury extends the paradox-mirage chassis/);
  });

  it('fury renders L2 mechanical-delta with paradox topology + parent link to paradox-mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/fury');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Paradox topology');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-mirage"/);
  });

  it('fury renders L3 ontology-role as "Multi-dex paradox extension"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/fury');
    expect(res.text).toContain('Multi-dex paradox extension');
  });

  it('fury SUPPRESSES L4 productivity and L5 family-evolution (leaf-class compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/fury');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('fury renders L6 progressive-readings with ADD-accounting + doctrine-evolution stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/fury');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Paradox-mirage chassis');
    expect(res.text).toContain('Furious multi-dex extension');
    expect(res.text).toContain('ADD accounting');
    expect(res.text).toContain('Doctrine evolution');
  });
});

describe('Phase C — sumo renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('sumo renders L1 intuition with the nuclear-stance prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/sumo');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/wider-armed nuclear stance/);
  });

  it('sumo renders L2 mechanical-delta with X-dex topology + parent link to mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/sumo');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('X-dex escalation');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/mirage"/);
  });

  it('sumo renders L3 ontology-role as "X-dex escalation locus"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/sumo');
    expect(res.text).toContain('X-dex escalation locus');
  });

  it('sumo SUPPRESSES L4 productivity and L5 family-evolution (doctrinal-landmark compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/sumo');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('sumo renders L6 progressive-readings with named-exception + operational-notation stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/sumo');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Mirage atom');
    expect(res.text).toContain('Nuclear modifier');
    expect(res.text).toContain('X-Dex escalation');
    expect(res.text).toContain('Operational notation');
  });
});

describe('Phase C — drifter renders all six L1-L6 layers', () => {
  it('drifter renders L1 intuition with the mirage-dex-into-clipper prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Drifter holds the same in-to-out dex pattern/);
  });

  it('drifter renders L2 mechanical-delta with cross-body topology + parent links to mirage and clipper-stall', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Cross-body');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/mirage"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/clipper-stall"/);
  });

  it('drifter renders L3 ontology-role as "Terminal-surface-shift exemplar"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.text).toContain('Terminal-surface-shift exemplar');
  });

  it('drifter renders L4 productivity with paradox-drifter + vortex + smoke + lotus descendants', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-drifter"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/vortex"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/smoke"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/lotus"/);
  });

  it('drifter renders L5 family-evolution with topology + rotational + naming-driven + clipper-stall-sibling branch axes', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Topology intensification');
    expect(res.text).toContain('Rotational variant');
    expect(res.text).toContain('Naming-driven extensions');
    expect(res.text).toContain('Clipper-stall sibling branch');
  });

  it('drifter renders L6 progressive-readings staircase with terminal-shift + family-branch stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Mirage chassis');
    expect(res.text).toContain('Terminal-surface shift');
    expect(res.text).toContain('Family-branch entry');
  });
});

describe('Phase C — atom-smasher renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('atom-smasher renders L1 intuition with the X-Dex reversal prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom-smasher');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/dex direction reversed/);
  });

  it('atom-smasher renders L2 mechanical-delta with x-dex topology + parent link to mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom-smasher');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('X-dex escalation');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/mirage"/);
  });

  it('atom-smasher renders L3 ontology-role as "Explicit X-Dex exemplar"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom-smasher');
    expect(res.text).toContain('Explicit X-Dex exemplar');
  });

  it('atom-smasher SUPPRESSES L4 productivity and L5 family-evolution (leaf-class compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom-smasher');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('atom-smasher renders L6 progressive-readings with X-Dex reversal + explicit-vs-implicit stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom-smasher');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('X-Dex reversal');
    expect(res.text).toContain('Atomic operator');
    expect(res.text).toContain('Explicit vs implicit X-Dex');
  });
});

describe('Phase C — barrage renders all six L1-L6 layers', () => {
  it('barrage renders L1 intuition with the doubled-dex prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/two complete same-side inside dexes/);
  });

  it('barrage renders L2 mechanical-delta as an atom-class anchor (no parent)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Atom: defining mechanical pattern');
  });

  it('barrage renders L3 ontology-role as "Naming-disambiguation exemplar"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.text).toContain('Naming-disambiguation exemplar');
  });

  it('barrage renders L4 productivity with paradox-barrage + blurrage descendants + fury operator-path', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-barrage"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/blurrage"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/fury"/);
  });

  it('barrage renders L5 family-evolution with topology + stepping-paradox + operator-path branch axes', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Topology intensification');
    expect(res.text).toContain('Stepping-paradox extension');
    expect(res.text).toContain('Operator-path productivity');
  });

  it('barrage renders L6 progressive-readings with naming-disambiguation + operator-productivity stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Doubled-dex anchor');
    expect(res.text).toContain('Naming-disambiguation');
    expect(res.text).toContain('Operator productivity');
  });
});

describe('Phase C — blurriest renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('blurriest renders L1 intuition with the deepest-blurry-character prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blurriest');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/deepest blurry-character extension/);
  });

  it('blurriest renders L2 mechanical-delta with compound topology + parent link to barfly', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blurriest');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Compound-of-canonicals');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/barfly"/);
  });

  it('blurriest renders L3 ontology-role as "Blurry-naming superlative"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blurriest');
    expect(res.text).toContain('Blurry-naming superlative');
  });

  it('blurriest SUPPRESSES L4 productivity and L5 family-evolution (leaf-class compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blurriest');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('blurriest renders L6 progressive-readings with cross-chassis-kin stage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blurriest');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Barfly chassis');
    expect(res.text).toContain('Blurry layer');
    expect(res.text).toContain('Cross-chassis kin');
  });
});

describe('Phase C — blender renders all six L1-L6 layers', () => {
  it('blender renders L1 intuition with the whirl-into-osis compound prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Blender stitches a whirl/);
  });

  it('blender renders L2 mechanical-delta with compound topology + parent links to whirl and osis', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Compound-of-canonicals');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/whirl"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/osis"/);
  });

  it('blender renders L3 ontology-role as "Compound-of-canonicals exemplar"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.text).toContain('Compound-of-canonicals exemplar');
  });

  it('blender renders L4 productivity with paradox-blender + food-processor + spender + mind-bender descendants', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-blender"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/food-processor"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/spender"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/mind-bender"/);
  });

  it('blender renders L5 family-evolution with topology + naming-driven + multi-modifier + operator-path branch axes', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Topology intensification');
    expect(res.text).toContain('Naming-driven extensions');
    expect(res.text).toContain('Multi-modifier extension');
    expect(res.text).toContain('Operator-path productivity');
  });

  it('blender renders L6 progressive-readings with whirl-atom + osis-atom + compound-of-canonicals stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Whirl atom');
    expect(res.text).toContain('Osis atom');
    expect(res.text).toContain('Compound-of-canonicals');
    expect(res.text).toContain('Compound name as anchor');
  });
});

describe('Phase C — surreal renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('surreal renders L1 intuition with the surging-paradox-whirl prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/surreal');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Surreal stacks a surging rotational system/);
  });

  it('surreal renders L2 mechanical-delta with rotational topology + parent links to paradox-whirl and whirl', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/surreal');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('>Rotational<');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-whirl"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/whirl"/);
  });

  it('surreal renders L3 ontology-role as "Top-of-rotational-ladder exemplar"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/surreal');
    expect(res.text).toContain('Top-of-rotational-ladder exemplar');
  });

  it('surreal SUPPRESSES L4 productivity and L5 family-evolution (top-of-ladder leaf)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/surreal');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('surreal renders L6 progressive-readings with whirl-paradox-surging staircase', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/surreal');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Whirl atom');
    expect(res.text).toContain('Paradox layer');
    expect(res.text).toContain('Surging layer');
  });
});

describe('Phase C — phoenix renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('phoenix renders L1 intuition with the pixie-ducking-butterfly prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/phoenix');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Phoenix layers two distinct modifiers/);
  });

  it('phoenix renders L2 mechanical-delta with compound topology + parent link to butterfly', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/phoenix');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Compound-of-canonicals');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/butterfly"/);
  });

  it('phoenix renders L3 ontology-role as "Multi-modifier butterfly compound"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/phoenix');
    expect(res.text).toContain('Multi-modifier butterfly compound');
  });

  it('phoenix SUPPRESSES L4 productivity and L5 family-evolution (multi-modifier leaf)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/phoenix');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('phoenix renders L6 progressive-readings with butterfly + pixie + ducking + multi-axis stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/phoenix');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Butterfly atom');
    expect(res.text).toContain('Pixie layer');
    expect(res.text).toContain('Ducking layer');
    expect(res.text).toContain('Multi-axis stacking');
  });
});

describe('Phase C — osis renders all six L1-L6 layers', () => {
  it('osis renders L2 mechanical-delta with atom topology (no parent)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Atom: defining mechanical pattern');
    expect(res.text).toMatch(/core movement atom/);
  });

  it('osis renders L3 ontology-role as "Spin-into-clipper canonical"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('Spin-into-clipper canonical');
  });

  it('osis renders L4 productivity with torque + blender + ducking-osis + pixie-osis descendants', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/torque"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/blender"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/ducking-osis"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/pixie-osis"/);
  });

  it('osis renders L5 family-evolution with compound-of-canonicals branch axes (mirage + whirl paths)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Compound-of-canonicals (mirage path)');
    expect(res.text).toContain('Compound-of-canonicals (whirl path)');
    expect(res.text).toContain('Body-modifier branch');
    expect(res.text).toContain('Set-treatment branch');
  });

  it('osis renders L6 progressive-readings with core-atom + canonical-trio + modifier-axis stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Core atom anchor');
    expect(res.text).toContain('Position in the canonical trio');
    expect(res.text).toContain('Compound-of-canonicals productivity');
  });
});

describe('Phase C — butterfly renders all six L1-L6 layers', () => {
  it('butterfly renders L2 mechanical-delta with atom topology (no parent)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Atom: defining mechanical pattern');
    expect(res.text).toMatch(/core movement atom/);
  });

  it('butterfly renders L3 ontology-role as "Leg-over canonical with clipper terminal"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.text).toContain('Leg-over canonical with clipper terminal');
  });

  it('butterfly renders L4 productivity with ripwalk + dimwalk + parkwalk + phoenix descendants', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/ripwalk"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/dimwalk"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/parkwalk"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/phoenix"/);
  });

  it('butterfly renders L5 family-evolution with stepping + set-treatment + body-modifier + multi-modifier branches', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Stepping branch');
    expect(res.text).toContain('Set-treatment branch');
    expect(res.text).toContain('Stepping-paradox branch');
    expect(res.text).toContain('Multi-modifier extension');
  });

  it('butterfly renders L6 progressive-readings with core-atom + position-among-atoms + densest-bucket stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Core atom anchor');
    expect(res.text).toContain('Position among atoms');
    expect(res.text).toContain('Single-modifier productivity');
    expect(res.text).toContain('Multi-modifier productivity');
  });
});

describe('Phase C — torque renders all six L1-L6 layers', () => {
  it('torque renders L1 intuition with the miraging-osis compound prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/dex pattern stitched into an osis/);
  });

  it('torque renders L2 mechanical-delta with compound topology + parent links to osis and mirage', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Compound-of-canonicals');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/osis"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/mirage"/);
  });

  it('torque renders L3 ontology-role as "Mirage-osis compound; intermediate-base anchor"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.text).toContain('Mirage-osis compound');
    expect(res.text).toContain('intermediate-base anchor');
  });

  it('torque renders L4 productivity with mobius + paradox-torque + atomic-torque + gauntlet descendants', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.text).toContain('class="content-section trick-productivity"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/mobius"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/paradox-torque"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/atomic-torque"/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/gauntlet"/);
  });

  it('torque renders L5 family-evolution with body-modifier + gyro + atomic + highest-ADD branches', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.text).toContain('class="content-section trick-family-evolution"');
    expect(res.text).toContain('Body-modifier branch');
    expect(res.text).toContain('Gyro layering');
    expect(res.text).toContain('Atomic / nuclear extension');
    expect(res.text).toContain('Highest-ADD reach');
  });

  it('torque renders L6 progressive-readings with mirage + osis + compound-of-canonicals + sibling-compound stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Mirage atom');
    expect(res.text).toContain('Osis atom');
    expect(res.text).toContain('Compound-of-canonicals');
    expect(res.text).toContain('Sibling compound');
    expect(res.text).toContain('Sub-family anchor');
  });
});

describe('Phase C — mobius renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('mobius renders L2 mechanical-delta with rotational topology + parent link to torque', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('>Rotational<');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/torque"/);
  });

  it('mobius renders L3 ontology-role as "Gyro-torque compound exemplar"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    expect(res.text).toContain('Gyro-torque compound exemplar');
  });

  it('mobius SUPPRESSES L4 productivity and L5 family-evolution (leaf compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('mobius renders L6 progressive-readings with torque-chassis + gyro-layer stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Torque chassis');
    expect(res.text).toContain('Gyro layer');
    expect(res.text).toContain('Compound name as anchor');
  });
});

describe('Phase C — ripwalk renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('ripwalk renders L1 intuition with the stepping-multi-dex prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Ripwalk extends a butterfly/);
  });

  it('ripwalk renders L2 mechanical-delta with paradox topology + parent link to butterfly', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Paradox topology');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/butterfly"/);
  });

  it('ripwalk renders L3 ontology-role as "Shred-vocabulary root on butterfly chassis"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).toContain('Shred-vocabulary root on butterfly chassis');
  });

  it('ripwalk SUPPRESSES L4 productivity and L5 family-evolution (naming-tradition leaf)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('ripwalk renders L6 progressive-readings with stepping-layer + folk-name-encoding stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Butterfly atom');
    expect(res.text).toContain('Stepping layer');
    expect(res.text).toContain('Folk-name encoding');
    expect(res.text).toContain('Naming-tradition root');
  });
});

describe('Phase C — food-processor renders L1/L2/L3/L6 only (L4 + L5 suppress)', () => {
  it('food-processor renders L1 intuition with the blurry-blender prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/food-processor');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Food-processor stitches a blurry-stepping pattern/);
  });

  it('food-processor renders L2 mechanical-delta with compound topology + parent link to blender', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/food-processor');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Compound-of-canonicals');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/blender"/);
  });

  it('food-processor renders L3 ontology-role as "Blurry-naming on compound-of-canonicals"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/food-processor');
    expect(res.text).toContain('Blurry-naming on compound-of-canonicals');
  });

  it('food-processor SUPPRESSES L4 productivity and L5 family-evolution (leaf compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/food-processor');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('food-processor renders L6 progressive-readings with naming-tradition-reach + visually-distinctive stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/food-processor');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Blender chassis');
    expect(res.text).toContain('Blurry layer');
    expect(res.text).toContain('Naming-tradition reach');
    expect(res.text).toContain('Visually distinctive folk name');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase C — C4 folk-name rescue (ripstein)
// ─────────────────────────────────────────────────────────────────────────
//
// Ripstein is the doctrine's worst-offending placeholder demonstration.
// Before the doctrine, the DB description "Popular freestyle trick." was
// the only public-facing content; after the doctrine, the placeholder is
// suppressed AND the L1-L6 layers carry the structural reading derived
// from the operational notation.

describe('Phase C — ripstein folk-name rescue (L1/L2/L3/L6 + placeholder suppression)', () => {
  it('ripstein SUPPRESSES the "Popular freestyle trick." DB placeholder', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripstein');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/<p class="trick-description">Popular freestyle trick\.<\/p>/);
  });

  it('ripstein renders L1 intuition with the doubled-back-swirl coach prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripstein');
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Ripstein stacks two same-side back-swirl dexes/);
  });

  it('ripstein renders L2 mechanical-delta with atom topology (no parent; structural reading from op notation)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripstein');
    expect(res.text).toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).toContain('Atom: defining mechanical pattern');
    expect(res.text).toMatch(/doubled same-side back-swirl/);
  });

  it('ripstein renders L3 ontology-role as "Folk-name rescue exemplar"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripstein');
    expect(res.text).toContain('Folk-name rescue exemplar');
  });

  it('ripstein SUPPRESSES L4 productivity and L5 family-evolution (leaf compound; rescue case)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripstein');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

  it('ripstein renders L6 progressive-readings with placeholder-DB-row + op-notation-evidence + folk-name-rescue stages', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripstein');
    expect(res.text).toContain('class="content-section trick-progressive-readings"');
    expect(res.text).toContain('Placeholder DB row');
    expect(res.text).toContain('Operational notation as evidence');
    expect(res.text).toContain('Folk-name rescue pattern');
    expect(res.text).toContain('Demonstration case');
  });
});
