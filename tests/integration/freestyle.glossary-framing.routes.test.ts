/**
 * Integration tests for the additive glossary framing sections (2026-05-28).
 *
 * GET /freestyle/glossary gains five additive, static orientation pieces that
 * synchronize the glossary with the modern platform ontology WITHOUT rewriting
 * the §Families taxonomy (that is a separate, post-ruling slice):
 *   1. the two-line trick-row contract explainer
 *   2. the six-view browse-semantics table
 *   3. the five-way ontology distinction table
 *   4. the family-hierarchy direction note (labels transitional)
 *   5. modifier-ecosystem framing
 *
 * These are static explainer content; they render independent of fixture data.
 * A minimal trick is seeded only so the page renders realistically.
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

const { dbPath } = setTestEnv('3528');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Glossary framing — Reading the dictionary section', () => {
  it('renders the "Reading the dictionary" orientation section', async () => {
    const html = await glossary();
    expect(html).toContain('id="section-reading-the-dictionary"');
    expect(html).toMatch(/<h2 class="section-heading">Reading the dictionary<\/h2>/);
  });

  it('explains the two-line trick-row contract (line 1 + line 2 slots)', async () => {
    const html = await glossary();
    const m = html.match(/<div class="glossary-row-contract">[\s\S]*?<\/div>/);
    expect(m, 'row-contract block').not.toBeNull();
    const block = m![0];
    // Line 1 slots
    expect(block).toContain('Line 1');
    expect(block).toMatch(/canonical trick name/);
    expect(block).toMatch(/#hashtag/);
    expect(block).toMatch(/interpretation \/ decomposition/);
    expect(block).toMatch(/media badge/);
    // Line 2 slots
    expect(block).toContain('Line 2');
    expect(block).toMatch(/JOB/);
    expect(block).toMatch(/ADD/);
    // The "no green chip" boundary is stated in the section.
    expect(html).toMatch(/no separate per-row ADD chip/);
  });

  it('renders a browse-semantics table covering all six views with links', async () => {
    const html = await glossary();
    for (const [label, view] of [
      ['By ADD', 'view=add'],
      ['By family', 'view=family'],
      ['By modifier', 'view=sets'],
      ['By movement system', 'view=movement-system'],
      ['Movement Neighborhoods', 'view=topology'],
      ['By dex count', 'view=dex-count'],
    ]) {
      expect(html, `browse label ${label}`).toContain(label);
      expect(html, `browse link ${view}`).toContain(`/freestyle/tricks?${view}`);
    }
    expect(html).toMatch(/Same rows, six lenses/);
  });

  it('renders the five-way ontology distinction table', async () => {
    const html = await glossary();
    for (const kind of [
      'Canonical family',
      'Modifier ecosystem',
      'Alternative surface',
      'Movement neighborhood',
      'Alias / decomposition label',
    ]) {
      expect(html, `ontology kind ${kind}`).toContain(kind);
    }
    // Explains WHY older vocabularies conflated them.
    expect(html).toMatch(/flattened families, modifiers, surfaces/);
    // Sharpens the interpretation-vs-modifier boundary.
    expect(html).toMatch(/does not make the read-as name a productive modifier/);
  });
});

describe('Glossary framing — family-hierarchy direction note (additive, no rewrite)', () => {
  it('renders the transitional-labels note inside the families section', async () => {
    const html = await glossary();
    expect(html).toMatch(/Family labels are transitional/);
    expect(html).toMatch(/<em>parent<\/em> families with child sub-families/);
    expect(html).toMatch(/family count will shrink/);
    // It sits within the existing families section (which is NOT rewritten).
    expect(html).toContain('id="section-families"');
    expect(html).toContain('Root terminal families');
  });
});

describe('Glossary framing — modifier-ecosystem framing', () => {
  it('frames modifiers as ecosystems, not families', async () => {
    const html = await glossary();
    expect(html).toMatch(/Modifiers form <strong>ecosystems<\/strong>/);
    expect(html).toMatch(/An ecosystem is\s+<strong>not a family<\/strong>/);
    expect(html).toMatch(/pixie appears across\s+pixie-illusion/);
  });
});

describe('Glossary framing — sidebar + non-regression', () => {
  it('adds a sidebar entry for the new section without dropping existing ones', async () => {
    const html = await glossary();
    expect(html).toContain('href="#section-reading-the-dictionary"');
    // Existing sidebar entries remain.
    expect(html).toContain('href="#section-core-concepts"');
    expect(html).toContain('href="#section-families"');
    expect(html).toContain('href="#section-notation"');
  });

  it('does not rewrite the families taxonomy (root/branch family structure intact)', async () => {
    const html = await glossary();
    expect(html).toContain('Root terminal families');
    expect(html).toContain('Branch families');
  });
});
