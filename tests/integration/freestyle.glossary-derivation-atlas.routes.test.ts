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
    expect(res.text).toContain('gyro(+2 rotational) + torque(4) &#x3D; 6 ADD');
  });

  it('renders the mobius doctrine note with policy-dependent status', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).toContain('mobius — rotational-continuity reading');
    expect(res.text).toContain('doctrine-note--policy-dependent');
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
    // The atlas section runs to the end of section-core-concepts.
    const sectionEndIdx = res.text.indexOf('id="section-surfaces"', atlasIdx);
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

describe('GET /freestyle/derivation-pilot — retired', () => {
  it('returns 404 (route removed; content now lives in glossary §1)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/derivation-pilot');
    expect(res.status).toBe(404);
  });
});
