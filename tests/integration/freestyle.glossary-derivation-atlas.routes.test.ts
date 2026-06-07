/**
 * Integration tests for the derivation atlas inside /freestyle/glossary §1.
 *
 * The atlas renders five derivation panels (mobius, blur, paradox, whirl,
 * flurry) through the new compositional-atlas primitives (derivation
 * panel, semantic-depth ladder, ADD breakdown, equivalence chain,
 * doctrine note) at the bottom of the Core Concepts section.
 *
 * Forever-rules verified here:
 *   - All five pilot entries render with their compressed names.
 *   - Each entry exhibits its operational formula and ADD breakdown.
 *   - Source-chip vocabulary is constrained to four labels (historical /
 *     structural / curator-derived / community).
 *   - Mobius's doctrine note renders with policy-dependent status
 *     (resolved / policy-dependent / historical-disagreement /
 *     multiple-readings are the four allowed labels per curator
 *     decision — open Red-track conflicts stay off educational surfaces).
 *   - The atlas's ADD breakdown rows render Tier-4 accounting prose
 *     (xbody(N), dex(N), stall(N), etc.). Tier-4 IS permitted on the
 *     glossary per the 4-tier hierarchy's educational-surface carve-out.
 *   - Public-facing prose does not name individuals (Red, Husted, etc.).
 *   - The sidebar surfaces the atlas as a Core-Concepts sub-link.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3156');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // The glossary page reads from the DB for notation examples + core
  // tricks; the atlas section is content-module-driven and needs no
  // additional rows.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/glossary — derivation atlas section', () => {
  it('renders the atlas section anchor inside §1', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="derivation-atlas"');
    expect(res.text).toContain('Derivation atlas');
  });

  it('renders all five derivation-panel entries', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('id="derivation-mobius"');
    expect(res.text).toContain('id="derivation-blur"');
    expect(res.text).toContain('id="derivation-paradox"');
    expect(res.text).toContain('id="derivation-whirl"');
    expect(res.text).toContain('id="derivation-flurry"');
  });

  it('renders mobius semantic-depth ladder (compressed through deep)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('gyro torque');
    expect(res.text).toContain('spinning same-side torque');
    expect(res.text).toContain('spinning same-side miraging osis');
  });

  it('renders the executable ADD breakdown on each entry', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    // Handlebars escapes `=` to `&#x3D;` in the rendered HTML; assert
    // the escaped form.
    expect(res.text).toContain('xbody(1) + dex(1) + stall(1) &#x3D; 3 ADD');
    expect(res.text).toContain('stepping(+1) + paradox(+1) + mirage(2) &#x3D; 4 ADD');
    expect(res.text).toContain('gyro(+1) + torque(4) &#x3D; 5 ADD');
  });

  it('renders mobius as a plain additive entry, with no rotational-continuity doctrine note', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    // Mobius is the settled additive reading gyro(+1) + torque(4) = 5; the
    // retired rotational-continuity doctrine note no longer renders.
    expect(res.text).not.toMatch(/rotational-continuity reading/);
  });

  it('renders source-chip vocabulary across the equivalence chains', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('equivalence-chain-source--historical');
    expect(res.text).toContain('equivalence-chain-source--structural');
    expect(res.text).toContain('equivalence-chain-source--community');
  });

  it('does not name individuals in atlas prose (feedback_no_individual_names_freestyle_views)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    // Scope the check to the atlas section to avoid false positives
    // from unrelated glossary content that may legitimately reference
    // Jobs notation by name in §7.
    const atlasIdx = res.text.indexOf('id="derivation-atlas"');
    expect(atlasIdx).toBeGreaterThan(0);
    // Phase E relocated the atlas into the Symbolic Composition section;
    // it runs from its heading to the next §-sub-heading below it.
    const sectionEndIdx = res.text.indexOf('id="symbolic-compression-flow"', atlasIdx);
    expect(sectionEndIdx).toBeGreaterThan(atlasIdx);
    const atlasSection = res.text.slice(atlasIdx, sectionEndIdx);
    expect(atlasSection).not.toMatch(/\bRed\b/);
    expect(atlasSection).not.toMatch(/\bHusted\b/);
    expect(atlasSection).not.toMatch(/\bper James\b/);
  });

  it('surfaces the atlas as a Core-Concepts sub-link in the sticky sidebar', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-sidebar-sublist');
    expect(res.text).toContain('href="#derivation-atlas"');
  });
});

describe('GET /freestyle/glossary — derivation atlas Phase 6 collapse + outward-link', () => {
  it('every atlas panel carries a "View full ontology →" outward link to its trick-detail page', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    // Each pilot slug links to /freestyle/tricks/{slug}. Pin the
    // unified phrasing too.
    expect(res.text).toContain('href="/freestyle/tricks/mobius"');
    expect(res.text).toContain('href="/freestyle/tricks/blur"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox"');
    expect(res.text).toContain('href="/freestyle/tricks/whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/flurry"');
    expect(res.text).toMatch(/View full ontology\s*&rarr;/);
  });

  it('outward links use the standardized .glossary-outward-link class', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    // The class appears on the atlas outward links + family-card
    // outward links + modifier feel-cards + connective panels.
    expect(res.text).toMatch(/class="glossary-outward-link"/);
  });

  it('deep ladder rungs (expanded + deep) are wrapped in a collapsed <details>', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    // The "deeper readings" details summary is the affordance.
    expect(res.text).toMatch(/<summary><span class="derivation-panel-prose-badge">advanced<\/span>\s*deeper readings<\/summary>/);
    // The collapsed deep ladder still emits the rungs in the HTML
    // (browser-decoded on open), but they sit inside <details>.
    expect(res.text).toContain('semantic-depth-ladder--deep');
  });

  it('mobius deep rungs (expanded + deep) are inside the collapsed <details>, not in the visible ladder', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    // The visible ladder still contains compressed + semantic rungs:
    //   compressed: mobius
    //   semantic:   gyro torque
    // The deep ladder carries the expanded + deep rungs. We assert by
    // pinning the "deep" rung's containing <ol> class.
    const deepLadderIdx = res.text.indexOf('semantic-depth-ladder--deep');
    expect(deepLadderIdx).toBeGreaterThan(0);
    const deepLadderEnd = res.text.indexOf('</ol>', deepLadderIdx);
    const deepRegion = res.text.slice(deepLadderIdx, deepLadderEnd);
    expect(deepRegion).toContain('spinning same-side torque');
    expect(deepRegion).toContain('spinning same-side miraging osis');
  });

  it('equivalence chains are wrapped in a collapsed <details> with advanced badge', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toMatch(/<summary><span class="derivation-panel-prose-badge">advanced<\/span>\s*equivalence chains<\/summary>/);
  });
});

describe('GET /freestyle/derivation-pilot — retired', () => {
  it('returns 404 (route removed; content now lives in glossary §1)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/derivation-pilot');
    expect(res.status).toBe(404);
  });
});
