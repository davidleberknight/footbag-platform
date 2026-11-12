/**
 * Ricochet canonical trick promotion: routes and rendering.
 *
 * 5 ADD compound. Two out-to-in dexterities from a toe set ending on a
 * cross-body sole (flapper) delay. FB.org-confirmed JOB (fborg-5add.txt).
 *
 * Base is cross-body-sole-stall (DB canonical, 3 ADD; folk-name =
 * flapper / flapper-stall; aliases already wired in DB). The
 * cross-body-sole-stall row uses descriptive op_notation
 * ([set] > sole [xbd]) while ricochet's JOB expands the terminator to
 * canonical-bracket form (OP SOLE [XBD] [UNS] [DEL]).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertTrickAsRebuilt } from '../fixtures/stagedFormula';

const { dbPath } = setTestEnv('3172');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertTrickAsRebuilt(db, {
    slug: 'ricochet',
    canonical_name: 'ricochet',
    adds: '5', base_trick: 'cross-body-sole-stall', trick_family: 'cross-body-sole-stall',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'TOE > OP OUT [DEX] > SAME OUT [DEX] > OP SOLE [XBD] [UNS] [DEL]',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));


describe('ricochet detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/ricochet renders 5 ADD + [UNS] unusual-surface token + flapper-terminator tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ricochet');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    for (const token of ['TOE', 'OP', 'OUT', 'SAME', '[DEX]', 'SOLE', '[XBD]', '[UNS]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('ricochet browse card renders JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="ricochet"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-notation-value">/);
    expect(card).not.toContain('canonical decomposition pending');
  });
});
