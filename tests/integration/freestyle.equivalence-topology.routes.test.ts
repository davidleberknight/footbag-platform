/**
 * Integration tests for the equivalence-topology surface on trick-detail
 * pages (Phase 2 of the equivalence-topology rollout).
 *
 * Contract under test:
 *   - When a trick has a ratified equivalence-topology entry (flurry,
 *     witchdoctor at Phase 2), the trick-detail page renders the
 *     <details>-collapsed "Alternate derivations" section.
 *   - The section includes both derivation paths as <li> rows with
 *     source-label chips and ADD breakdowns.
 *   - Non-canonical paths render a role badge; canonical-primary does NOT.
 *   - Tricks without a topology entry render NO topology section.
 *   - curatorConfirmPending entries are filtered at the service layer
 *     and never reach the rendered HTML (verified by the unit suite;
 *     the integration test pins the published-only contract).
 *   - Curator-internal language (curatorNote, pending labels) never
 *     reaches the rendered HTML.
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

const { dbPath } = setTestEnv('3158');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifier table — minimal set referenced by flurry / witchdoctor + a
  // non-topology control (paradox-mirage).
  insertFreestyleTrickModifier(db, {
    slug: 'paradox', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'barraging', add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'set',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'symposium', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body',
  });

  // Base atoms.
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage',
    trick_family: 'mirage', category: 'dex', adds: '2', is_active: 1,
    notation: 'MIRAGE',
  });
  insertFreestyleTrick(db, {
    slug: 'legover', canonical_name: 'legover',
    trick_family: 'legover', category: 'dex', adds: '2', is_active: 1,
    notation: 'LEGOVER',
  });

  // Topology-bearing tricks.
  insertFreestyleTrick(db, {
    slug: 'flurry', canonical_name: 'flurry', base_trick: 'legover',
    trick_family: 'legover', category: 'compound', adds: '4', is_active: 1,
    notation: 'BARRAGING LEGOVER',
  });

  insertFreestyleTrick(db, {
    slug: 'witchdoctor', canonical_name: 'witchdoctor', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '5', is_active: 1,
    notation: 'WITCHDOCTOR',
  });

  // Non-topology control: paradox-mirage (no entry in
  // freestyleEquivalenceTopology.ts).
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage', canonical_name: 'paradox mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '3', is_active: 1,
    notation: 'PARADOX MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'paradox-mirage', 'paradox', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('equivalence-topology — section renders for ratified entries', () => {
  it('flurry trick-detail renders the "Alternate derivations" section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/flurry');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/trick-equivalence-topology[^a-z-]/);
    expect(res.text).toMatch(/trick-equivalence-topology-summary-title[^>]*>\s*Alternate derivations\s*</);
  });

  it('flurry topology section lists barraging-legover as canonical-primary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/flurry');
    const startIdx = res.text.indexOf('trick-equivalence-topology"');
    const endIdx = res.text.indexOf('</section>', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toContain('barraging legover');
    expect(region).toContain('paradox + paradox legover');
    expect(region).toMatch(/trick-equivalence-topology-row--canonical-primary/);
    expect(region).toMatch(/trick-equivalence-topology-row--alternate-equivalent/);
  });

  it('flurry topology section renders the ADD breakdown for both paths', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/flurry');
    // Handlebars HTML-escapes '=' → '&#x3D;' (safe-by-default; browser
    // decodes back to '='). Test pins the escaped form actually present
    // in the HTTP response body.
    expect(res.text).toContain('barraging(+2) + legover(2) &#x3D; 4 ADD');
    expect(res.text).toContain('paradox(+1) + paradox-legover(3) &#x3D; 4 ADD');
  });

  it('witchdoctor trick-detail renders the "Alternate derivations" section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/witchdoctor');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/trick-equivalence-topology"/);
  });

  it('witchdoctor canonical-primary is the composite-base reading', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/witchdoctor');
    expect(res.text).toContain('atom-smasher + symposium');
    expect(res.text).toContain('atomic symposium mirage');
    expect(res.text).toMatch(/trick-equivalence-topology-row--historical/);
  });
});

describe('equivalence-topology — non-topology trick has no section', () => {
  it('paradox-mirage (no topology entry) does NOT render the section', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/trick-equivalence-topology"/);
    expect(res.text).not.toMatch(/Alternate derivations/);
  });
});

describe('equivalence-topology — curator-internal language never leaks', () => {
  it('flurry render does NOT expose curatorConfirmPending labels', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/flurry');
    expect(res.text).not.toMatch(/curatorConfirmPending/i);
    expect(res.text).not.toMatch(/pending-curator/i);
  });

  it('witchdoctor render does NOT expose the curatorNote prose', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/witchdoctor');
    // The curatorNote contains text about the "1-component gap"; that
    // string is curator-internal and must not surface publicly.
    expect(res.text).not.toContain('1-component gap');
    expect(res.text).not.toContain('curatorNote');
  });

  it('canonical-primary rows do NOT carry a redundant role badge', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/flurry');
    // The role badge renders ONLY on non-canonical rows. Pin by region.
    const startIdx = res.text.indexOf('trick-equivalence-topology-row--canonical-primary');
    const endIdx = res.text.indexOf('</li>', startIdx);
    const canonicalRow = res.text.slice(startIdx, endIdx);
    expect(canonicalRow).not.toMatch(/trick-equivalence-topology-role-badge/);
  });
});

describe('equivalence-topology — chips and badges render human labels, never raw codes', () => {
  it('source chips render the human label; the raw source code stays class-only', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/flurry');
    // flurry's alternate path is curator-derived: visible chip text is the
    // human form; the hyphenated code appears only inside class attributes.
    expect(res.text).toMatch(/source-chip--curator-derived[^>]*>curator derived</);
    expect(res.text).not.toMatch(/>curator-derived</);
  });

  it('role badges render the human label; the raw role code stays class-only', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/flurry');
    expect(res.text).toMatch(/role-badge--alternate-equivalent[^>]*>alternate equivalent</);
    expect(res.text).not.toMatch(/>alternate-equivalent</);
    expect(res.text).not.toMatch(/>canonical-primary</);
  });
});
