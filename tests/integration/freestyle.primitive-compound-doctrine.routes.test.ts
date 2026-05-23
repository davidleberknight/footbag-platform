/**
 * Integration tests for the Primitive vs Compound doctrine surfaces
 * (post-Wave-7 ontology-clarification slice, 2026-05-23).
 *
 * Contracts under test:
 *   - Core-atom trick-detail pages render the "Core movement atom"
 *     callout (primitiveNote) with the curator-locked label and
 *     explainer prose. Non-atom (compound) pages do NOT render it.
 *   - Core-atom trick-detail pages do NOT render the equivalence-
 *     topology section (gated by the F2 service-layer rule;
 *     re-verified here as a doctrine surface).
 *   - Compound trick-detail pages with a ratified equivalence-topology
 *     entry render the doctrine footer note inside the panel.
 *   - The glossary's "Primitives and compounds" doctrine section is
 *     present at the canonical anchor #primitives-and-compounds
 *     with the locked terminology (atom / primitive / compound /
 *     compositional structure).
 *
 * The primitive-note wording is locked at the service layer; this
 * test asserts the prose appears verbatim so future drift surfaces
 * here before it ships.
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

const { dbPath } = setTestEnv('3201');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Two core atoms — mirage (2 ADD) + whirl (3 ADD) — and one compound
  // (paradox-mirage, 3 ADD). The compound serves as the negative control
  // for the primitive-note rendering check.
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage',
    adds: '2', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', notation: 'MIRAGE', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl',
    adds: '3', base_trick: 'whirl', trick_family: 'whirl',
    category: 'compound', notation: 'WHIRL', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage', canonical_name: 'paradox mirage',
    adds: '3', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', notation: 'PARADOX MIRAGE', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Primitive vs Compound — atom-page callout', () => {
  it('mirage page renders the "Core movement atom" primitive-note callout', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    // Section wrapper present with stable test class.
    expect(res.text).toContain('class="content-section trick-primitive-note"');
    // Locked label + explainer prose render verbatim.
    expect(res.text).toContain('Core movement atom');
    expect(res.text).toContain('Foundational primitive');
    expect(res.text).toContain('functions as a compositional base rather than a recursively decomposed structure');
    // Cross-link to the glossary doctrine section.
    expect(res.text).toContain('href="/freestyle/glossary#primitives-and-compounds"');
  });

  it('whirl page renders the same callout (locked wording across all atoms)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="content-section trick-primitive-note"');
    expect(res.text).toContain('Core movement atom');
    expect(res.text).toContain('Foundational primitive');
  });

  it('compound trick-detail does NOT render the primitive-note callout', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-primitive-note"');
    expect(res.text).not.toContain('Core movement atom');
  });
});

describe('Primitive vs Compound — equivalence-topology suppression on atoms', () => {
  it('mirage page does NOT render the equivalence-topology section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-equivalence-topology"');
    expect(res.text).not.toContain('Alternate derivations');
  });

  it('whirl page does NOT render the equivalence-topology section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-equivalence-topology"');
  });
});

describe('Primitive vs Compound — glossary doctrine section', () => {
  it('glossary renders the "Primitives and compounds" section at the canonical anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // Canonical anchor for deep-link stability.
    expect(res.text).toContain('id="primitives-and-compounds"');
    // Section heading text.
    expect(res.text).toMatch(/Primitives and compounds/);
  });

  it('doctrine prose names all four locked terms (atom / primitive / compound / compositional structure)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // Terminology surfaces (case-insensitive, since prose mixes inline emphasis).
    expect(res.text).toMatch(/foundational primitive/i);
    expect(res.text).toMatch(/core atom/i);
    expect(res.text).toMatch(/compound/i);
    expect(res.text).toMatch(/compositional structure/i);
  });

  it('doctrine prose names each of the 12 core atoms', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // Each atom enumerated by name in the doctrine paragraph.
    for (const atom of [
      'toe-stall', 'clipper-stall', 'around-the-world', 'orbit',
      'legover', 'mirage', 'pickup', 'illusion',
      'butterfly', 'osis', 'whirl', 'swirl',
    ]) {
      expect(res.text, `atom name "${atom}" expected in doctrine prose`).toContain(atom);
    }
  });

  it('doctrine prose preserves the constraint framing (not difficulty / not ADD)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    // The "decomposition is a structural claim, not a difficulty claim"
    // paragraph is the doctrine's key guardrail — assert verbatim.
    expect(res.text).toMatch(/structural claim, not a difficulty claim/);
    expect(res.text).toMatch(/ontology, not difficulty or scoring/);
  });

  it('sidebar exposes the primitives-and-compounds anchor', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="#primitives-and-compounds"');
  });
});
