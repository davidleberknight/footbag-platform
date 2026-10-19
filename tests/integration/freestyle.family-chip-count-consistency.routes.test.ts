/**
 * A family's member count on the By-family browse counts every trick that renders
 * under it, including rows folded in from its sub-labels: a trick whose raw
 * trick_family is a sub-label such as paradox_mirage renders under mirage and is
 * counted there. The count and the rows it heads come from one membership map, so
 * they can never disagree. A trick page's family link likewise quotes the count
 * its own destination lists: the family page where one exists, otherwise the
 * family-filtered dictionary.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3528');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Two direct mirage-family rows plus one row whose raw family is the mirage
  // sub-label paradox_mirage, which folds into mirage. The mirage family renders
  // three members; its chip must show three, not two.
  insertFreestyleTrick(db, { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'spinning_mirage', canonical_name: 'spinning mirage', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'paradox_mirage', canonical_name: 'paradox mirage', adds: '3', base_trick: 'mirage', trick_family: 'paradox_mirage', category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
  // Two rows of a family with no family page of its own (eclipse is a minor
  // lineage), so a trick page's family link falls back to the filtered dictionary.
  insertFreestyleTrick(db, { slug: 'eclipse_alpha', canonical_name: 'eclipse alpha', adds: '3', trick_family: 'eclipse', category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'eclipse_beta', canonical_name: 'eclipse beta', adds: '4', trick_family: 'eclipse', category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// The mirage section count on the By-family browse: the number inside the
// section-count span of the section with id="family-mirage".
function sectionCount(html: string): number | null {
  const m = html.match(/id="family-mirage"[\s\S]*?<span class="section-count">(\d+)<\/span>/);
  return m ? Number(m[1]) : null;
}

// The mirage members actually rendered under the family-mirage section.
function sectionRows(html: string): number {
  const start = html.indexOf('id="family-mirage"');
  if (start < 0) return -1;
  const end = html.indexOf('</section>', start);
  return (html.slice(start, end).match(/data-trick-slug=/g) ?? []).length;
}

describe('GET /freestyle/tricks — family section count counts every rendered member', () => {
  it('folds the sub-label row into the mirage section (three members)', async () => {
    const res = await page('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(sectionCount(res.text)).toBe(3);
  });

  it('the count equals the number of rows the section actually renders', async () => {
    const res = await page('/freestyle/tricks?view=family');
    expect(sectionCount(res.text)).toBe(sectionRows(res.text));
  });
});

// The trick page's "Related families" pathway: its link and the count it quotes.
function familyPathway(html: string): { href: string | null; related: number | null } {
  const start = html.indexOf('trick-pathway--family');
  if (start < 0) return { href: null, related: null };
  const block = html.slice(start, html.indexOf('</li>', start));
  return {
    href: block.match(/class="action-link" href="([^"]+)"/)?.[1] ?? null,
    related: Number(block.match(/(\d+) related tricks?/)?.[1] ?? NaN),
  };
}

describe('GET /freestyle/tricks/:slug — the family link quotes what its destination lists', () => {
  // Defect caught: the link says "N related tricks" from one membership rule but
  // opens a listing built by another, so the visitor lands on a different number.
  it('links to the family page and quotes that page\'s own membership, less this trick', async () => {
    const trick = await page('/freestyle/tricks/spinning_mirage');
    expect(trick.status).toBe(200);
    const { href, related } = familyPathway(trick.text);
    expect(href).toBe('/freestyle/families/mirage');
    const family = await page('/freestyle/families/mirage');
    expect(family.status).toBe(200);
    const listed = Number(family.text.match(/<span class="section-count">(\d+)<\/span>/)?.[1]);
    // The family page lists the sub-label row too, so it holds three tricks.
    expect(listed).toBe(3);
    expect(related).toBe(listed - 1);
  });

  // The other branch: a family with no page of its own keeps the filtered
  // dictionary, and the count is what that filter lists.
  it('falls back to the filtered dictionary, quoting what that filter lists, when no family page exists', async () => {
    const trick = await page('/freestyle/tricks/eclipse_alpha');
    expect(trick.status).toBe(200);
    const { href, related } = familyPathway(trick.text);
    expect(href).toBe('/freestyle/tricks?family=eclipse');
    const filtered = await page('/freestyle/tricks?family=eclipse');
    const listed = new Set([...filtered.text.matchAll(/data-trick-slug="([^"]+)"/g)].map(m => m[1]));
    expect(listed).toEqual(new Set(['eclipse_alpha', 'eclipse_beta']));
    expect(related).toBe(listed.size - 1);
  });
});
