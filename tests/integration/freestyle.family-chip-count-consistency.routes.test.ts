/**
 * A family's By-family jump-menu chip count on the trick-index landing equals the
 * member count its rendered family section shows on the By-family browse. Both are
 * derived from one membership map, which folds sub-labels (a trick whose raw
 * trick_family is a sub-label such as paradox_mirage renders under mirage). A
 * separate raw-label chip tally previously omitted that fold and undercounted a
 * family's chip by exactly its folded rows, so the chip and its section disagreed
 * by one.
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

// The mirage chip count on the landing: the number inside the chip-count span of
// the chip anchor linking to the mirage family.
function chipCount(html: string): number | null {
  const m = html.match(/href="\/freestyle\/families\/mirage"[^>]*>[^<]*<span class="dict-landing-card-chip-count">(\d+)<\/span>/);
  return m ? Number(m[1]) : null;
}

describe('GET /freestyle/tricks — family chip count matches its section count', () => {
  it('folds the sub-label row into the mirage section (three members)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(sectionCount(res.text)).toBe(3);
  });

  it('shows the same folded count on the landing chip (three, not two)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(chipCount(res.text)).toBe(3);
  });

  it('the landing chip count equals the browse section count', async () => {
    const landing = await request(await createApp()).get('/freestyle/tricks');
    const browse = await request(await createApp()).get('/freestyle/tricks?view=family');
    const chip = chipCount(landing.text);
    const section = sectionCount(browse.text);
    expect(chip).not.toBeNull();
    expect(section).not.toBeNull();
    expect(chip).toBe(section);
  });
});
