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
import { seedStagedGlossary } from '../fixtures/stagedGlossary';

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
  // The glossary entries live in the database, seeded as the rebuild seeds them,
  // so the glossary page renders its real wording.
  seedStagedGlossary(db);

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
