/**
 * Trick-detail ontology doctrine tests.
 *
 * Pins:
 *   - Flagship pages render the surviving ontology section (Movement
 *     Intuition) when content is authored
 *   - The standalone Mechanical Delta, Ontology Role, Progressive Readings,
 *     Productivity, and Family Evolution sections, plus the
 *     interpretive-traditions block, are retired; the "vs parent" idea is a
 *     one-line delta inside Movement Intuition and the build-path is a line
 *     inside the About section
 *   - Productivity + Family Evolution render on no page
 *   - Placeholder-description suppressor: literal "X-modified Y."
 *     description suppressed; structured decomposition pill renders instead
 *   - DB description rows NOT mutated (verified by absence of regex
 *     match in raw description on rendered page when literal differs
 *     from displayed)
 *   - Shell ordering: About sits above the fold; Movement intuition follows it
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
    slug: 'paradox_mirage', canonical_name: 'paradox mirage', adds: '3',
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
    slug: 'plain_tier_c_trick', canonical_name: 'plain tier c trick', adds: '4',
    base_trick: 'plain_tier_c_trick', trick_family: null, category: 'compound',
    description: 'A descriptive trick description that is not a placeholder.',
    operational_notation: 'CLIP > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // ── mirage-descendant batch ───────────────
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
    base_trick: 'clipper_stall', trick_family: 'drifter', category: 'compound',
    description: 'Mirage-modified clipper stall.',
    operational_notation: 'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'atom_smasher', canonical_name: 'atom smasher', adds: '4',
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

  // ── whirl-descendant batch ────────────────
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

  // ── independent-anchor batch ─────────────
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
    slug: 'food_processor', canonical_name: 'food processor', adds: '6',
    base_trick: 'blender', trick_family: 'blender', category: 'compound',
    description: 'Blurry-modified blender.',
    operational_notation: 'CLIP > OP IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // ── folk-name rescue exemplar ────────────
  insertFreestyleTrick(db, {
    slug: 'ripstein', canonical_name: 'ripstein', adds: '4',
    base_trick: null, trick_family: 'ripstein', category: 'compound',
    description: 'Popular freestyle trick.',
    operational_notation: 'CLIP >> SAME BACK SWIRL [DEX] >> SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // Modifier links so the relocated "vs parent" delta (inside Movement
  // Intuition) and build-path (inside About) render for modifier-composed
  // compounds. blur = mirage + blurry; torque = osis + quantum.
  insertFreestyleTrickModifier(db, { slug: 'blurry',  modifier_name: 'blurry',  modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'quantum', modifier_name: 'quantum', modifier_type: 'set' });
  insertFreestyleTrickModifierLink(db, 'blur', 'blurry');
  insertFreestyleTrickModifierLink(db, 'torque', 'quantum');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// The standalone Mechanical Delta (L2), Ontology Role (L3), Progressive
// Readings (L6), Productivity (L4), and Family Evolution (L5) sections, plus
// the interpretive-traditions block, are retired. The Movement Intuition (L1)
// section remains. The "vs parent" idea moves to a one-line delta inside
// Movement Intuition; the build-path moves into the About section.
describe('Tier A flagship pages — productivity + family-evolution deleted', () => {
  it('mirage does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('mirage does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });

});

describe('Placeholder-description suppressor', () => {
  it('paradox-mirage (DB description: "Paradox-modified mirage.") suppresses the literal description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox_mirage');
    // The literal placeholder is NOT rendered as a description paragraph
    expect(res.text).not.toMatch(/<p class="trick-description">Paradox-modified mirage\.<\/p>/);
  });

  it('mirage (non-placeholder description) DOES render the literal description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('Toe-set dex&#x27;d outside the supporting leg');
  });

  it('plain-tier-c-trick (non-placeholder description) DOES render the literal description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/plain_tier_c_trick');
    expect(res.text).toContain('A descriptive trick description that is not a placeholder.');
  });
});

// Universal-grammar rule: pages with no curated L1-L6 content suppress
// those sections via content-driven nulls, not via tier-gating. Tier
// remains an authoring priority signal, NOT a structural gate.
describe('Pages with no curated L1-L6 content suppress those sections', () => {
  it('plain-tier-c-trick (no curated L1-L6 entries) does NOT render mechanical-delta / ontology-role / productivity / family-evolution / progressive-readings sections', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/plain_tier_c_trick');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-mechanical-delta"');
    expect(res.text).not.toContain('class="content-section trick-ontology-role"');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
    expect(res.text).not.toContain('class="content-section trick-progressive-readings"');
  });
});

describe('Shell ordering — About sits above the fold, before Movement intuition', () => {
  it('on mirage, About this trick appears before the Movement intuition section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    const aboutIdx     = res.text.indexOf('>About this trick<');
    const intuitionIdx = res.text.indexOf('class="content-section trick-intuition"');
    expect(aboutIdx).toBeGreaterThan(-1);
    expect(intuitionIdx).toBeGreaterThan(-1);
    expect(aboutIdx).toBeLessThan(intuitionIdx);
  });

  it('on mirage, the structural-facts block sits between About and Movement intuition', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    const aboutIdx     = res.text.indexOf('>About this trick<');
    const structIdx    = res.text.indexOf('class="content-section trick-structural-facts"');
    const intuitionIdx = res.text.indexOf('class="content-section trick-intuition"');
    expect(aboutIdx).toBeGreaterThan(-1);
    expect(structIdx).toBeGreaterThan(aboutIdx);
    expect(intuitionIdx).toBeGreaterThan(structIdx);
  });
});


// Relocated content: the "vs parent" delta moves into Movement Intuition as a
// single data-intuition-delta line, and the build-path moves into the About
// section as a data-build-path line. Both render only for modifier-composed
// compounds (a trick with a base trick and at least one modifier link); atoms
// and link-less tricks carry neither.
describe('Relocated delta + build-path', () => {
  it('blur (mirage + blurry) renders the parent-delta line inside Movement Intuition naming parent + modifier', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-intuition-delta');
    expect(res.text).toMatch(/Compared with mirage, blur adds blurry\./);
  });

  it('blur renders the build-path line inside the About section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).toContain('data-build-path');
    // Title-cased base chain, no "Built from" prefix (the dt provides the label);
    // the equals sign renders HTML-escaped.
    expect(res.text).toMatch(/Mirage .* \+ blurry &#x3D; Blur/);
  });

  it('mirage (atom, no modifier links) renders neither the delta nor the build-path line', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).not.toContain('data-intuition-delta');
    expect(res.text).not.toContain('data-build-path');
  });
});

// The standalone Mechanical Delta, Ontology Role, and Progressive Readings
// sections, plus the interpretive-traditions block, are retired everywhere.
describe('Retired ontology sections are absent on every trick page', () => {
  for (const slug of ['mirage', 'paradox_mirage', 'whirl', 'blur', 'fury', 'sumo', 'torque', 'ripstein']) {
    it(`${slug} renders no mechanical-delta / ontology-role / progressive-readings / interpretive-traditions section`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('class="content-section trick-mechanical-delta"');
      expect(res.text).not.toContain('class="content-section trick-ontology-role"');
      expect(res.text).not.toContain('class="content-section trick-progressive-readings"');
      expect(res.text).not.toContain('class="trick-interpretive-traditions"');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// mirage-descendant batch (blur / fury / sumo)
// ─────────────────────────────────────────────────────────────────────────
//
// fury + sumo are leaf-class compounds; Productivity and Family Evolution are
// intentionally suppressed (suppression beats filler).

describe('blur renders intuition (productivity + family-evolution deleted)', () => {
  it('blur renders L1 intuition with the 4-ADD coach prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Blur stretches a paradox-mirage/);
  });

  it('blur does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('blur does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blur');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('fury renders intuition only (productivity + family-evolution suppress)', () => {
  it('fury renders L1 intuition with the 5-ADD furious multi-dex prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/fury');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Fury extends the paradox-mirage chassis/);
  });

  it('fury SUPPRESSES L4 productivity and L5 family-evolution (leaf-class compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/fury');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('sumo renders intuition only (productivity + family-evolution suppress)', () => {
  it('sumo renders L1 intuition with the nuclear-stance prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/sumo');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/wider-armed nuclear stance/);
  });

  it('sumo SUPPRESSES L4 productivity and L5 family-evolution (doctrinal-landmark compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/sumo');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('drifter renders intuition (productivity + family-evolution deleted)', () => {
  it('drifter renders L1 intuition with the mirage-dex-into-clipper prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Drifter holds the same in-to-out dex pattern/);
  });

  it('drifter does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('drifter does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/drifter');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('atom-smasher renders intuition only (productivity + family-evolution suppress)', () => {
  it('atom-smasher renders L1 intuition with the X-Dex reversal prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom_smasher');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/dex direction reversed/);
  });

  it('atom-smasher SUPPRESSES L4 productivity and L5 family-evolution (leaf-class compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atom_smasher');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('barrage renders intuition (productivity + family-evolution deleted)', () => {
  it('barrage renders L1 intuition with the doubled-dex prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/two complete same-side inside dexes/);
  });

  it('barrage does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('barrage does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barrage');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('blurriest renders intuition only (productivity + family-evolution suppress)', () => {
  it('blurriest renders L1 intuition with the deepest-blurry-character prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blurriest');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/deepest blurry-character extension/);
  });

  it('blurriest SUPPRESSES L4 productivity and L5 family-evolution (leaf-class compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blurriest');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('blender renders intuition (productivity + family-evolution deleted)', () => {
  it('blender renders L1 intuition with the whirl-into-osis compound prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Blender stitches a whirl/);
  });

  it('blender does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('blender does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/blender');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('surreal renders intuition only (productivity + family-evolution suppress)', () => {
  it('surreal renders L1 intuition with the surging-paradox-whirl prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/surreal');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Surreal stacks a surging rotational system/);
  });

  it('surreal SUPPRESSES L4 productivity and L5 family-evolution (top-of-ladder leaf)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/surreal');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('phoenix renders intuition only (productivity + family-evolution suppress)', () => {
  it('phoenix renders L1 intuition with the pixie-ducking-butterfly prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/phoenix');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Phoenix layers two distinct modifiers/);
  });

  it('phoenix SUPPRESSES L4 productivity and L5 family-evolution (multi-modifier leaf)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/phoenix');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('osis — productivity + family-evolution deleted', () => {
  it('osis does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('osis does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('butterfly — productivity + family-evolution deleted', () => {
  it('butterfly does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('butterfly does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('torque renders intuition (productivity + family-evolution deleted)', () => {
  it('torque renders L1 intuition with the quantum-osis compound prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/dex pattern stitched into an osis/);
  });

  it('torque does NOT render the productivity section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
  });

  it('torque does NOT render the family-evolution section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/torque');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('mobius renders intuition only (productivity + family-evolution suppress)', () => {
  it('mobius SUPPRESSES L4 productivity and L5 family-evolution (leaf compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('ripwalk renders intuition only (productivity + family-evolution suppress)', () => {
  it('ripwalk renders L1 intuition with the stepping-multi-dex prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Ripwalk extends a butterfly/);
  });

  it('ripwalk SUPPRESSES L4 productivity and L5 family-evolution (naming-tradition leaf)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('food-processor renders intuition only (productivity + family-evolution suppress)', () => {
  it('food-processor renders L1 intuition with the blurry-blender prose', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/food_processor');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-intuition"');
    expect(res.text).toMatch(/Food-processor stitches a blurry-stepping pattern/);
  });

  it('food-processor SUPPRESSES L4 productivity and L5 family-evolution (leaf compound)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/food_processor');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Folk-name rescue (ripstein)
// ─────────────────────────────────────────────────────────────────────────
//
// Ripstein is the worst-offending placeholder demonstration. The DB
// description "Popular freestyle trick." is suppressed and the Movement
// Intuition prose carries the structural reading derived from the
// operational notation.

describe('ripstein folk-name rescue (intuition + placeholder suppression)', () => {
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

  it('ripstein SUPPRESSES L4 productivity and L5 family-evolution (leaf compound; rescue case)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ripstein');
    expect(res.text).not.toContain('class="content-section trick-productivity"');
    expect(res.text).not.toContain('class="content-section trick-family-evolution"');
  });
});

describe('Family-lineage heading is "Family" only for official Family Parents', () => {
  it('an official Family Parent (mirage) labels its lineage section "Family"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-family-lineage"');
    expect(res.text).toMatch(/<h2>[^<]*\bFamily<\/h2>/);
  });

  it('a non-parent trick (paradox-mirage) labels its lineage section "Related", never "Family"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox_mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-family-lineage"');
    expect(res.text).toMatch(/<h2>[^<]*\bRelated<\/h2>/);
    expect(res.text).not.toMatch(/<h2>[^<]*\bFamily<\/h2>/);
  });
});
