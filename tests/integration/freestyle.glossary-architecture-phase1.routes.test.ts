/**
 * Integration tests for the Phase 1 prose additions of the 2026-05-21
 * glossary architecture overhaul. Three additions ship in this slice:
 *
 *   (a) "How to read this glossary" subsection in §1 (Part 7 of the
 *       overhaul proposal — publication-state vocabulary)
 *   (b) "Family-anchor trick" terminology paragraph in §5 intro
 *       (Part 3 of the overhaul proposal — family vs trick clarity)
 *   (c) "Generative insight" subsection in §7 (Part 5 of the overhaul
 *       proposal — Jobs notation compositional-completeness framing)
 *
 * Contract under test:
 *   - Each subsection's anchor + heading renders.
 *   - The publication-state vocabulary surfaces in §1 (six states
 *     enumerated by name: canonical / observational / doctrine-
 *     sensitive / historical / alternate derivation / pending).
 *   - The family-anchor terminology is defined and exemplified.
 *   - The generative-insight subsection presents the canonical
 *     structural formula with the `(same | op)(in | out)dexterity`
 *     iterable middle.
 *   - Curator-internal language never leaks into the prose.
 *
 * Design doc:
 *   exploration/glossary-architecture-overhaul-2026-05-21/DESIGN.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3160');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // The three new subsections are static curator-authored prose; no
  // DB rows are required.
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/glossary — How to read this glossary (§1)', () => {
  it('renders the subsection anchor and heading', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/id="how-to-read"/);
    expect(res.text).toMatch(/How to read this glossary/);
  });

  it('enumerates the six publication-state vocabulary terms', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('glossary-publication-states');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = res.text.indexOf('</dl>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toContain('Canonical');
    expect(region).toContain('Observational');
    expect(region).toContain('Doctrine-sensitive');
    expect(region).toContain('Historical');
    expect(region).toContain('Alternate derivation');
    expect(region).toContain('Pending');
  });

  it('does NOT leak curator-internal vocabulary', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('id="how-to-read"');
    const endIdx = res.text.indexOf('id="derivation-atlas"', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).not.toMatch(/curatorConfirmPending/i);
    expect(region).not.toMatch(/curatorNote/i);
    expect(region).not.toMatch(/freestyleEquivalenceTopology\.ts/);
  });
});

describe('GET /freestyle/glossary — Family-anchor terminology (§5)', () => {
  it('defines family-anchor trick in the §5 intro', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/family-anchor trick/i);
    expect(res.text).toMatch(/canonical trick that[\s\S]{0,80}productive root/i);
  });

  it('exemplifies family-anchor tricks and counter-examples', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Positive examples from the prose (the eight parent families)
    expect(res.text).toMatch(/mirage, illusion, butterfly, legover, pickup/);
    // Counter-examples (tricks that are NOT family-anchors)
    expect(res.text).toMatch(/flurry,\s+witchdoctor,\s+and\s+paradox-mirage/);
  });

  it('cross-links to the dictionary browse views', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/tricks"');
  });
});

describe('GET /freestyle/glossary — Generative insight (§7)', () => {
  it('renders the subsection anchor and heading', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/id="generative-insight"/);
    expect(res.text).toMatch(/Generative insight/);
  });

  it('frames the compositional system as combinatorially generative', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/<strong>enumerable<\/strong>/);
    expect(res.text).toMatch(/curated subset/i);
  });

  it('renders the canonical structural formula', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // The canonical formula tokens:
    //   (toe | clip) > [(same | op)(in | out)dexterity]* > (same | op)(toe | clip)
    expect(res.text).toMatch(/\(toe \| clip\)/);
    expect(res.text).toMatch(/\(same \| op\)/);
    expect(res.text).toMatch(/\(in \| out\)/);
    expect(res.text).toMatch(/dexterity/);
  });

  it('does NOT name individuals beyond the codified notation tradition', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const startIdx = res.text.indexOf('id="generative-insight"');
    const endIdx = startIdx + 3000;
    const region = res.text.slice(startIdx, endIdx);
    // The subsection deliberately AVOIDS biographical attribution; the
    // existing §7 framing carries the Jobs-notation tradition reference.
    expect(region).not.toMatch(/Ben Job/);
    expect(region).not.toMatch(/Husted/);
    expect(region).not.toMatch(/Steve\b/);
  });
});

describe('GET /freestyle/glossary — no curator-internal language across new subsections', () => {
  it('the full page does not expose pt## tags, Wave-N tracking, or sprint labels', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Per feedback_public_facing_prose: strip pt##/Red/James/
    // adjudication/dated curator-reviewed language from public prose.
    // Our Phase 1 additions specifically must not introduce such language.
    const newAdditionsRegion = (() => {
      const a = res.text.indexOf('id="how-to-read"');
      const b = res.text.indexOf('id="derivation-atlas"', a);
      const c = res.text.indexOf('family-anchor trick');
      const d = res.text.indexOf('id="generative-insight"');
      const e = res.text.indexOf('Generative insight', d) + 3000;
      // Concatenate the three new regions for a focused scan.
      return res.text.slice(a, b) + res.text.slice(c, c + 2000) + res.text.slice(d, e);
    })();
    expect(newAdditionsRegion).not.toMatch(/\bpt\d+\b/i);
    expect(newAdditionsRegion).not.toMatch(/Wave[- ]?\d/i);
    expect(newAdditionsRegion).not.toMatch(/Slice [A-Z]\b/);
    expect(newAdditionsRegion).not.toMatch(/Sprint/i);
  });
});
