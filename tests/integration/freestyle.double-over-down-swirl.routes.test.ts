/**
 * Pre-Adrian deferred-candidate promotion slice (2026-05-26) —
 * double-over-down-swirl. Single-row promotion. Extension of the
 * double-over-down chassis (shipped earlier this session) with an
 * OP BACK SWIRL third dex and SAME CLIP terminator swap.
 *
 * JOB FB.org-confirmed verbatim from fborg-5add.txt:
 *   TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]
 *
 * ADD breakdown: [DEX] + [DEX] + [DEX] + [XBD] + [DEL] = 5 ADD.
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

const { dbPath } = setTestEnv('3179');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'double-over-down-swirl',
    canonical_name: 'double-over down swirl',
    adds: '5', base_trick: 'double-over-down', trick_family: 'double-over-down',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — double-over-down-swirl entry', () => {
  it('overlay carries FB.org-confirmed JOB + 5 ADD + double-over-down base extension', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'double-over-down-swirl');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.baseAdd).toBe(4);
    expect(entry?.base).toBe('double-over-down');
    expect(entry?.operationalNotation).toBe('TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/double-over-down/i);
  });

  it('preserves the double-over-down chassis prefix (SAME OUT / SAME OUT dex pair) and ends with SAME CLIP terminator', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'double-over-down-swirl');
    expect(entry?.operationalNotation ?? '').toMatch(/TOE > SAME OUT \[DEX\] > SAME OUT \[DEX\]/);
    expect(entry?.operationalNotation ?? '').toMatch(/SAME CLIP \[XBD\] \[DEL\]$/);
    // OP BACK SWIRL fuses into rotation-variant token
    expect(entry?.operationalNotation ?? '').toContain('OP BACK SWIRL [DEX]');
  });
});

describe('double-over-down-swirl detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/double-over-down-swirl renders 5 ADD + 3 dex tokens + BACK SWIRL rotation-variant', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double-over-down-swirl');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    // BACK SWIRL fuses into rotation_variant per operationalNotationRendering
    expect(res.text).toMatch(/class="op-token[^"]*rotation-variant[^"]*"[^>]*>BACK SWIRL</);
    for (const token of ['TOE', 'SAME', 'OUT', '[DEX]', 'OP', 'CLIP', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('browse card renders JOB + ADD inline (not "notation pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="double-over-down-swirl"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toContain('dict-card-first-class-row');
    expect(card).not.toContain('notation pending');
  });
});
