/**
 * Integration tests for the Primitive vs Compound doctrine surfaces.
 *
 * Contracts under test:
 *   - Trick pages never call a move an "atom": the twelve foundational
 *     moves' pages render without the retired "Core movement atom"
 *     callout or any other visitor-facing "atom" wording (trick names
 *     such as Atom Smasher aside).
 *   - Core-atom trick-detail pages do NOT render the equivalence-
 *     topology section (gated by the F2 service-layer rule;
 *     re-verified here as a doctrine surface).
 *   - Compound trick-detail pages with a ratified equivalence-topology
 *     entry render the doctrine footer note inside the panel.
 *   - The Freestyle Concepts "Foundational moves and compounds" section is
 *     present at its deep-link anchor #primitives-and-compounds, in plain
 *     words, and keeps its structure-not-difficulty guardrail.
 *   - Concepts, the Glossary, ADD analysis and Sets render no
 *     visitor-facing "atom" wording.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3201');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

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

/** The words a visitor reads on a page: tags, scripts and comments removed. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

// "atom" as a classification, not as part of a trick name.
const ATOM_WORD = /\batoms?\b(?![\s-]*(smasher|bomb))/i;

describe('Trick pages never call a move an atom', () => {
  for (const slug of ['mirage', 'whirl', 'paradox-mirage']) {
    it(`/freestyle/tricks/${slug} renders with no visitor-facing "atom" wording`, async () => {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      const text = visibleText(res.text);
      // The page rendered its trick, so the absence below is not an empty page.
      expect(text.toLowerCase()).toContain(slug.replace('-', ' '));
      expect(text).not.toMatch(/Core movement atom/);
      expect(text, `${slug} page text`).not.toMatch(ATOM_WORD);
    });
  }
});

describe('Primitive vs Compound — equivalence-topology suppression on atoms', () => {
  it('mirage page does NOT render the equivalence-topology section', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-equivalence-topology"');
    expect(res.text).not.toContain('Alternate derivations');
  });

  it('whirl page does NOT render the equivalence-topology section', async () => {
    const res = await page('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="content-section trick-equivalence-topology"');
  });
});

/** The Concepts section on foundational moves and compounds, up to the next h3. */
function foundationalSection(html: string): string {
  const start = html.indexOf('id="primitives-and-compounds"');
  expect(start, 'section anchor').toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('id="tracking-vs-canonization"', start));
}

describe('Foundational moves and compounds — the Freestyle Concepts section', () => {
  it('keeps the section at its deep-link anchor, in plain words', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    const section = foundationalSection(res.text);
    expect(section).toMatch(/Foundational moves and compounds/);
    expect(section).toMatch(/<strong>foundational move<\/strong>/);
    expect(section).toMatch(/<strong>compound<\/strong>/);
    expect(section).toMatch(/compositional structure/);
    // Points to the twelve moves themselves rather than re-listing them.
    expect(section).toContain('href="#core-trick-atoms"');
  });

  it('keeps the guardrail that the distinction is structure, not difficulty or ADD', async () => {
    const section = foundationalSection((await page('/freestyle/concepts')).text);
    expect(section).toMatch(/structural claim, not a difficulty claim/);
    expect(section).toMatch(/ontology, not difficulty or\s+scoring/);
  });
});

describe('Public freestyle reference pages never call a move an atom', () => {
  for (const path of ['/freestyle/concepts', '/freestyle/glossary', '/freestyle/add-analysis', '/freestyle/sets']) {
    it(`${path} renders with no visitor-facing "atom" wording`, async () => {
      const res = await page(path);
      expect(res.status).toBe(200);
      const html = res.text;
      const attrs = [...html.matchAll(/(?:title|aria-label|alt)="([^"]*)"/g)].map(m => m[1]).join(' ');
      const text = `${visibleText(html)} ${attrs}`;
      // The page rendered real content, so the absence below is not an empty page.
      expect(text.length, `${path} content`).toBeGreaterThan(2000);
      const hit = text.match(new RegExp(`.{0,40}${ATOM_WORD.source}.{0,40}`, 'i'));
      expect(hit?.[0] ?? null, `${path} still says atom`).toBeNull();
    });
  }
});
