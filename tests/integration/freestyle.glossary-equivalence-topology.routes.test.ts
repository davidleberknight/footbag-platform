/**
 * Integration tests for the equivalence-topology subsection inside
 * /freestyle/glossary §9 Symbolic Composition.
 *
 * Phase 3 of the equivalence-topology rollout. The subsection sits
 * between the compression-ladder worked example and the walking-family
 * progression. It introduces the alias / compression ladder / alternate
 * derivation / historical reading / doctrine-locked reading vocabulary
 * via a compact table and exhibits two worked examples (flurry,
 * witchdoctor) that match the Phase 2 trick-detail topology panel.
 *
 * Contract under test:
 *   - The subsection's anchor and heading render.
 *   - The five distinctions render as table rows in the documented
 *     order (alias / compression ladder / alternate derivation /
 *     historical reading / doctrine-locked reading).
 *   - The flurry worked example renders both structural readings and
 *     cross-links to /freestyle/tricks/flurry.
 *   - The witchdoctor worked example renders both readings (current
 *     canonical + historical) and cross-links to
 *     /freestyle/tricks/witchdoctor.
 *   - Curator-internal language never reaches the rendered HTML
 *     (curatorConfirmPending, curatorNote, "1-component gap").
 *
 * Design doc:
 *   exploration/equivalence-topology-phase-1-2026-05-21/DESIGN.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3159');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // The glossary's §9 equivalence-topology subsection is static
  // curator-authored prose; no DB rows are required.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/glossary — equivalence-topology subsection in §9', () => {
  it('renders the subsection anchor and heading', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/id="compression-vs-alternate-derivation"/);
    expect(res.text).toMatch(/Compression ladders vs alternate derivations/);
  });

  it('contrasts compression ladder vs alternate derivation in prose', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Compression-ladder framing
    expect(res.text).toMatch(/<strong>compression ladder<\/strong>[\s\S]{0,80}same/i);
    // Alternate-derivation framing
    expect(res.text).toMatch(/<strong>alternate derivation<\/strong>[\s\S]{0,120}different/i);
  });

  it('renders the five-distinction comparison table in documented order', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('glossary-equivalence-distinctions');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = res.text.indexOf('</table>', startIdx);
    const table = res.text.slice(startIdx, endIdx);
    // All five concepts present
    expect(table).toContain('Alias');
    expect(table).toContain('Compression ladder');
    expect(table).toContain('Alternate derivation');
    expect(table).toContain('Historical reading');
    expect(table).toContain('Doctrine-locked reading');
    // Verify documented order: alias → ladder → alternate → historical → doctrine-locked
    const order = [
      'Alias',
      'Compression ladder',
      'Alternate derivation',
      'Historical reading',
      'Doctrine-locked reading',
    ];
    let cursor = 0;
    for (const label of order) {
      const idx = table.indexOf(label, cursor);
      expect(idx, `${label} should appear in order`).toBeGreaterThan(cursor - 1);
      cursor = idx + label.length;
    }
  });
});

describe('GET /freestyle/glossary — flurry worked example', () => {
  it('renders both flurry derivations side by side', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Worked example[\s\S]{0,40}flurry/i);
    expect(res.text).toContain('barraging legover');
    expect(res.text).toContain('paradox + paradox legover');
  });

  it('cross-links to the flurry trick-detail page', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/tricks/flurry"');
  });

  it('notes that both flurry readings reach the same ADD', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // The intro asserts "each reach 4 ADD" and the structural
    // contributors are visible in the per-row em tags.
    expect(res.text).toMatch(/each\s+reach\s+4\s+ADD/i);
    expect(res.text).toMatch(/barraging \+2/);
    expect(res.text).toMatch(/paradox \+1/);
  });
});

describe('GET /freestyle/glossary — witchdoctor worked example', () => {
  it('renders the composite-base canonical reading + historical reading', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Worked example[\s\S]{0,80}witchdoctor/i);
    expect(res.text).toContain('atom-smasher + symposium');
    expect(res.text).toContain('atomic symposium mirage');
  });

  it('frames the historical reading as preserved context, not as a competing ADD claim', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/historical reading/i);
    expect(res.text).toMatch(/preserved as context/i);
  });

  it('cross-links to the witchdoctor trick-detail page', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/tricks/witchdoctor"');
  });
});

describe('GET /freestyle/glossary — curator-internal language never leaks', () => {
  it('does NOT expose curatorConfirmPending labels', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).not.toMatch(/curatorConfirmPending/i);
    expect(res.text).not.toMatch(/pending-curator/i);
  });

  it('does NOT expose internal-only filenames or curatorNote prose', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).not.toContain('freestyleEquivalenceTopology.ts');
    expect(res.text).not.toContain('COMPOSITE_DERIVATIONS');
    expect(res.text).not.toContain('curatorNote');
    expect(res.text).not.toContain('1-component gap');
  });
});
