/**
 * Pre-Adrian deferred-candidate promotion slice (2026-05-25) — pixie-swirl.
 *
 * 4 ADD = pixie(+1) + swirl(3). JOB FB.org-confirmed from fborg-4add.txt
 * + pixieMoves.txt. Pixie prefix adds SAME IN [DEX] before swirl base;
 * fb.org preserves SAME/OP variant on the BACK SWIRL second dex.
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
import { RESOLVED_FORMULAS_SPRINT_1 } from '../../src/content/freestyleResolvedFormulas';

const { dbPath } = setTestEnv('3174');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'pixie-swirl',
    canonical_name: 'pixie swirl',
    adds: '4', base_trick: 'swirl', trick_family: 'swirl',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — pixie-swirl entry', () => {
  it('overlay carries FB.org-confirmed JOB + 4 ADD + pixie/swirl derivation', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'pixie-swirl');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(4);
    expect(entry?.baseAdd).toBe(3);
    expect(entry?.operator).toBe('pixie');
    expect(entry?.base).toBe('swirl');
    expect(entry?.operationalNotation).toBe('TOE > SAME IN [DEX] > SAME/OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/SAME\/OP variant/i);
  });
});

describe('pixie-swirl detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/pixie-swirl renders 4 ADD + SAME IN [DEX] prefix + BACK SWIRL rotation-variant', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/pixie-swirl');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    // BACK SWIRL fuses into rotation_variant per operationalNotationRendering
    expect(res.text).toMatch(/class="op-token[^"]*rotation-variant[^"]*"[^>]*>BACK SWIRL</);
    for (const token of ['TOE', 'SAME', 'IN', '[DEX]', 'CLIP', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('pixie-swirl browse card renders JOB + ADD inline (not "notation pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="pixie-swirl"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-job-value">/);
    expect(card).not.toContain('notation pending');
  });
});
