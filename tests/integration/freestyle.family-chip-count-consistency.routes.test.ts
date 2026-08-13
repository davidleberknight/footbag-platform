/**
 * A family's member count on the By-family browse counts every trick that renders
 * under it, including rows folded in from its sub-labels: a trick whose raw
 * trick_family is a sub-label such as paradox_mirage renders under mirage and is
 * counted there. The count and the rows it heads come from one membership map, so
 * they can never disagree.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3528');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Two direct mirage-family rows plus one row whose raw family is the mirage
  // sub-label paradox_mirage, which folds into mirage. The mirage family renders
  // three members; its chip must show three, not two.
  insertFreestyleTrick(db, { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'spinning_mirage', canonical_name: 'spinning mirage', adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'paradox_mirage', canonical_name: 'paradox mirage', adds: '3', base_trick: 'mirage', trick_family: 'paradox_mirage', category: 'compound', review_status: 'expert_reviewed', is_active: 1 });
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
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(sectionCount(res.text)).toBe(3);
  });

  it('the count equals the number of rows the section actually renders', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(sectionCount(res.text)).toBe(sectionRows(res.text));
  });
});
