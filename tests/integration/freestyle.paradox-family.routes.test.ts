/**
 * Paradox-family canonical trick promotion: routes and rendering.
 *
 * Two compounds, both FB.org-confirmed JOBs from fborg-5add.txt:
 *   - paradox-da-da-curve (5 ADD) — paradox(+1) + dada-curve(4)
 *   - paradox-whirling-swirl (5 ADD) — paradox(+1) + whirling-swirl(4)
 *
 * Standard paradox-prefix pattern: the base's leading dex is replaced
 * by SAME IN [PDX] [DEX] (adding the [PDX] component flag for +1 ADD).
 * Most paradox-* compounds were already in DB before this slice; these
 * two were the remaining audit candidates.
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

const { dbPath } = setTestEnv('3170');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertTrickAsRebuilt(db, {
    slug: 'paradox_da_da_curve',
    operational_notation: 'CLIP > SAME IN [PDX] [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    canonical_name: 'paradox da-da curve',
    adds: '5', base_trick: 'dada_curve', trick_family: 'dada_curve',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertTrickAsRebuilt(db, {
    slug: 'paradox_whirling_swirl',
    operational_notation: 'CLIP > SAME IN [PDX] [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]',
    canonical_name: 'paradox whirling swirl',
    adds: '5', base_trick: 'whirling_swirl', trick_family: 'whirling_swirl',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));


describe('Paradox-family detail pages — first-class JOB + ADD', () => {
  it('/freestyle/tricks/paradox_da_da_curve renders 5 ADD + [PDX] token + (no plant while) pre-state', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox_da_da_curve');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    for (const token of ['CLIP', 'SAME', 'IN', '[PDX]', '[DEX]', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
    // (no plant while) pre-state flag
    expect(res.text).toMatch(/class="op-token[^"]*"[^>]*>\(no plant while\)</);
  });

  it('/freestyle/tricks/paradox_whirling_swirl renders 5 ADD with the ordinary IN/OUT vocabulary, no retired swirl token', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox_whirling_swirl');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    expect(res.text).not.toContain('BACK SWIRL');
    // Standard PDX + tokens
    for (const token of ['[PDX]', '[DEX]', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });
});

describe('Paradox-family browse rendering — FIRST_CLASS_TIER_2', () => {
  it('both paradox-family browse cards render JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    for (const slug of ['paradox_da_da_curve', 'paradox_whirling_swirl']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx).toBeGreaterThan(-1);
      const articleOpen = res.text.lastIndexOf('<article', idx);
      const articleClose = res.text.indexOf('</article>', idx);
      const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
      expect(card).toMatch(/class="dict-trick-row-notation-value">/);
      expect(card).not.toContain('canonical decomposition pending');
    }
  });
});
