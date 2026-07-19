/**
 * Integration tests for the Vocabulary Relationships subsection inside
 * /freestyle/glossary §composition (Symbolic Composition).
 *
 * The equivalence-topology worked examples render under that subsection.
 *
 * THIS FILE preserves the equivalence-topology-specific contracts:
 *   - flurry + witchdoctor worked examples still render with the
 *     same content as before (just under the Equivalent derivations
 *     subsection instead of the prior Worked-example h4s).
 *   - Cross-links to /freestyle/tricks/flurry and /freestyle/tricks/
 *     witchdoctor still render.
 *   - Curator-internal language never reaches the rendered HTML
 *     (curatorConfirmPending, curatorNote, "1-component gap").
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
  // Static curator-authored prose; no DB rows required.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/glossary — equivalence-topology coverage in §composition', () => {
  it('preserves the legacy #compression-vs-alternate-derivation anchor for inbound deep-links', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="compression-vs-alternate-derivation"');
  });

  it('renders the Equivalent derivations subsection (third of four relationship types)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Equivalent derivations/i);
    expect(res.text).toMatch(/multiple valid paths/i);
  });

  it('renders the sharpened 4-row distinctions table (alias / structural compression / equivalent derivation / ontology relationship)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('glossary-equivalence-distinctions');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = res.text.indexOf('</table>', startIdx);
    const table = res.text.slice(startIdx, endIdx);
    // All four relationship types present in documented order
    const order = ['Pure alias', 'Structural compression', 'Equivalent derivation', 'Ontology relationship'];
    let cursor = 0;
    for (const label of order) {
      const idx = table.indexOf(label, cursor);
      expect(idx, `${label} should appear in order`).toBeGreaterThan(cursor - 1);
      cursor = idx + label.length;
    }
  });
});

describe('GET /freestyle/glossary — flurry worked example (preserved from prior subsection)', () => {
  it('renders both flurry derivations with ADD breakdowns', async () => {
    // Trick names in §9 worked-example lists are hyperlinked
    // to their detail pages, so the <strong> wraps an <a>.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/<strong>\s*<a href="\/freestyle\/tricks\/flurry">flurry<\/a>\s*<\/strong>/i);
    expect(res.text).toContain('barraging legover');
    expect(res.text).toContain('paradox + paradox legover');
  });

  it('cross-links to the flurry trick-detail page', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/tricks/flurry"');
  });

  it('shows both flurry readings reach 4 ADD via different operator compositions', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // The per-path ADD breakdowns (parenthesized) confirm 4-ADD convergence.
    expect(res.text).toMatch(/furious\(\+2\)[\s\S]*legover\(2\)[\s\S]*4 ADD/i);
    expect(res.text).toMatch(/paradox\(\+1\)[\s\S]*paradox-legover\(3\)[\s\S]*4 ADD/i);
  });
});

describe('GET /freestyle/glossary — witchdoctor worked example (preserved from prior subsection)', () => {
  it('renders the composite-base canonical reading + historical reading', async () => {
    // Trick names in §9 worked-example lists are hyperlinked.
    // The atom-smasher reference in the witchdoctor derivation is also
    // wrapped in <a>; "+ symposium" follows the closing </a> tag.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/<strong>\s*<a href="\/freestyle\/tricks\/witchdoctor">witchdoctor<\/a>\s*<\/strong>/i);
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\/atom_smasher">atom-smasher<\/a>\s*\+ symposium/i);
    expect(res.text).toContain('atomic symposium mirage');
  });

  it('frames the historical reading as preserved context (note paragraph after worked examples)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/historical reading/i);
    expect(res.text).toMatch(/preserved\s+(as\s+context|even\s+after)/i);
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
