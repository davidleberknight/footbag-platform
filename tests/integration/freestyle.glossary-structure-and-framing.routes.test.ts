/**
 * Integration tests for three Freestyle Concepts prose additions on
 * GET /freestyle/concepts:
 *
 *   (a) "Reading the layer labels" subsection in the Movement Basics chapter
 *       (publication-state vocabulary)
 *   (b) "Family-anchor trick" terminology paragraph in the Families intro
 *       (family vs trick clarity)
 *   (c) "Generative insight" subsection in the notation chapter
 *       (Jobs notation compositional-completeness framing)
 *
 * Contract under test:
 *   - Each subsection's anchor + heading renders.
 *   - The publication-state vocabulary surfaces in Movement Basics (six states
 *     enumerated by name: canonical / observational / doctrine-
 *     sensitive / historical / alternate derivation / pending).
 *   - The family-anchor terminology is defined and exemplified.
 *   - The generative-insight subsection presents the canonical
 *     structural formula with the `(same | op)(in | out)dexterity`
 *     iterable middle.
 *   - Curator-internal language never leaks into the prose.
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

describe('GET /freestyle/concepts — Reading the layer labels section', () => {
  it('renders the subsection anchor and heading', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.status).toBe(200);
    // Anchor preserved; the heading is "Reading the layer labels", distinct
    // from the top intro card's title.
    expect(res.text).toMatch(/id="how-to-read"/);
    expect(res.text).toMatch(/Reading the layer labels/);
  });

  it('enumerates the six publication-state vocabulary terms', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
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
    const res = await request(createApp()).get('/freestyle/concepts');
    const startIdx = res.text.indexOf('id="how-to-read"');
    const endIdx = res.text.indexOf('id="derivation-atlas"', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).not.toMatch(/curatorConfirmPending/i);
    expect(region).not.toMatch(/curatorNote/i);
    expect(region).not.toMatch(/freestyleEquivalenceTopology\.ts/);
  });
});

describe('GET /freestyle/concepts — Family-anchor terminology (Families chapter)', () => {
  it('defines family-anchor trick in the Families intro', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toMatch(/family-anchor trick/i);
    expect(res.text).toMatch(/canonical trick that[\s\S]{0,80}productive root/i);
  });

  it('exemplifies family-anchor tricks and counter-examples', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    // Root-family examples from the two-axis Family entry.
    expect(res.text).toMatch(/Mirage, Whirl, Swirl/);
    // Counter-examples (tricks that are NOT family-anchors)
    expect(res.text).toMatch(/flurry,\s+witchdoctor,\s+and\s+paradox-mirage/);
  });

  it('cross-links to the dictionary browse views', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toContain('href="/freestyle/tricks"');
  });
});

describe('GET /freestyle/concepts — Generative insight (notation chapter)', () => {
  it('renders the subsection anchor and heading', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toMatch(/id="generative-insight"/);
    expect(res.text).toMatch(/Generative insight/);
  });

  it('frames the compositional system as generative', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toMatch(/<strong>enumerable<\/strong>/);
    expect(res.text).toMatch(/curated subset/i);
    expect(res.text).toMatch(/generative core/i);
  });

  it('claims a generative core, not a complete generator of every trick', async () => {
    // The correction is about completeness, not generativity. The page's own
    // neighbours already said the notation extends this grammar and that the
    // dictionary is not its closure, so a claim to generate the entire trick
    // space contradicted the text around it.
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).not.toMatch(/generates the entire freestyle trick space/i);
    expect(res.text).toMatch(/extended by further movement primitives, terminals and\s+modifiers/i);
  });

  it('does not imply every trick terminates on a surface', async () => {
    // A kick is a terminal that scores nothing, so it is not a terminating
    // surface; a trick can end in one, which a skeleton requiring a surface
    // cannot produce.
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toMatch(/kicks can also\s+stand as tricks in their own right/i);
    expect(res.text).not.toMatch(/canonical structural form of a footbag trick/i);
  });

  it('leaves the historical attribution and its enumeration alone', async () => {
    // The correction belongs to the platform's restatement of the idea, never to
    // what the source historically proposed.
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toMatch(/curated subset/i);
    expect(res.text).toMatch(/not its full closure/i);
  });

  it('renders the canonical structural formula', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    // The canonical formula tokens:
    //   (toe | clip) > [(same | op)(in | out)dexterity]* > (same | op)(toe | clip)
    expect(res.text).toMatch(/\(toe \| clip\)/);
    expect(res.text).toMatch(/\(same \| op\)/);
    expect(res.text).toMatch(/\(in \| out\)/);
    expect(res.text).toMatch(/dexterity/);
  });

  it('does NOT name individuals beyond the codified notation tradition', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    const startIdx = res.text.indexOf('id="generative-insight"');
    const endIdx = startIdx + 3000;
    const region = res.text.slice(startIdx, endIdx);
    // The subsection deliberately AVOIDS biographical attribution; the
    // existing notation-chapter framing carries the Jobs-notation tradition reference.
    expect(region).not.toMatch(/Ben Job/);
    expect(region).not.toMatch(/Husted/);
    expect(region).not.toMatch(/Steve\b/);
  });
});

describe('GET /freestyle/concepts — no curator-internal language across new subsections', () => {
  it('the full page does not expose pt## tags, Wave-N tracking, or sprint labels', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    // Public prose must not carry pt##/Red/James/adjudication/dated
    // curator-review language. The subsections this suite covers must
    // not introduce such language.
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
