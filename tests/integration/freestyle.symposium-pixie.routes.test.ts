/**
 * Symposium-pixie canonical trick promotion: routes and rendering.
 *
 * 3 ADD = symposium(+1) + pixie(2). No FB.org-published JOB for this
 * specific compound; sibling-derived using the symposium-prefix pattern
 * (no-plant-while [BOD] fused with first dex) applied to pixie's base
 * JOB. Verified against pixie-symposium-mirage in DB.
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

const { dbPath } = setTestEnv('3171');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'symposium_pixie',
    canonical_name: 'symposium pixie',
    adds: '3', base_trick: 'pixie', trick_family: 'pixie',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — symposium_pixie entry', () => {
  it('overlay carries sibling-derived JOB + 3 ADD + symposium-prefix derivation provenance', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'symposium_pixie');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(3);
    expect(entry?.baseAdd).toBe(2);
    expect(entry?.operator).toBe('symposium');
    expect(entry?.base).toBe('pixie');
    expect(entry?.operationalNotation).toBe('TOE > (no plant while) SAME IN [BOD] [DEX] > OP TOE [DEL]');
    expect(entry?.provenance ?? '').toMatch(/sibling-derived/i);
    expect(entry?.provenance ?? '').toMatch(/pixie-symposium-mirage/i);
    expect(entry?.provenance ?? '').toMatch(/not Red-confirmed/i);
  });
});

describe('symposium_pixie detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/symposium_pixie renders 3 ADD + (no plant while) pre-state + [BOD] fusion', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/symposium_pixie');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">3 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    // Pre-state flag renders with pre-state cssRole
    expect(res.text).toMatch(/class="op-token[^"]*pre-state[^"]*"[^>]*>\(no plant while\)</);
    for (const token of ['TOE', 'SAME', 'IN', '[BOD]', '[DEX]', 'OP', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('symposium_pixie browse card renders JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="symposium_pixie"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-job-value">/);
    expect(card).not.toContain('canonical decomposition pending');
  });
});
