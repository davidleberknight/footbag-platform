/**
 * Double-over-down-swirl canonical trick: routes and rendering.
 * Extension of the double-over-down chassis with a third out dex (the
 * swirl-cell dexterity) and a SAME CLIP terminator swap. The canonical
 * notation uses the ordinary IN/OUT vocabulary:
 *   TOE > OP OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]
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
import { RESOLVED_ADD_FORMULAS } from '../../src/content/freestyleResolvedFormulas';

const { dbPath } = setTestEnv('3179');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'double_over_down_swirl',
    canonical_name: 'double-over down swirl',
    adds: '5', base_trick: 'double-over-down', trick_family: 'double-over-down',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_ADD_FORMULAS — double-over-down-swirl entry', () => {
  it('overlay carries FB.org-confirmed JOB + 5 ADD + double-over-down base extension', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'double_over_down_swirl');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.baseAdd).toBe(4);
    expect(entry?.base).toBe('double-over-down');
    expect(entry?.operationalNotation).toBe('TOE > OP OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/double-over-down/i);
  });

  it('preserves the double-over-down chassis prefix (the out-dex pair) and ends with SAME CLIP terminator', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'double_over_down_swirl');
    expect(entry?.operationalNotation ?? '').toMatch(/TOE > OP OUT \[DEX\] > OP OUT \[DEX\]/);
    expect(entry?.operationalNotation ?? '').toMatch(/SAME CLIP \[XBD\] \[DEL\]$/);
    // The third dex is an ordinary out dex; the retired swirl token never reappears.
    expect(entry?.operationalNotation ?? '').not.toContain('BACK SWIRL');
  });
});

describe('double-over-down-swirl detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/double-over-down-swirl renders 5 ADD + 3 dex tokens, no retired swirl token', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double_over_down_swirl');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    expect(res.text).not.toContain('BACK SWIRL');
    for (const token of ['TOE', 'SAME', 'OUT', '[DEX]', 'OP', 'CLIP', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('browse card renders JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="double_over_down_swirl"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-job-value">/);
    expect(card).not.toContain('canonical decomposition pending');
  });
});
