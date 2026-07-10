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
import { insertFreestyleTrick } from '../fixtures/factories';
import { RESOLVED_ADD_FORMULAS } from '../../src/content/freestyleResolvedFormulas';

const { dbPath } = setTestEnv('3170');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'paradox_da_da_curve',
    canonical_name: 'paradox da-da curve',
    adds: '5', base_trick: 'dada_curve', trick_family: 'dada_curve',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox_whirling_swirl',
    canonical_name: 'paradox whirling swirl',
    adds: '5', base_trick: 'whirling_swirl', trick_family: 'whirling_swirl',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_ADD_FORMULAS — paradox family entries', () => {
  it('paradox-da-da-curve overlay carries FB.org-confirmed JOB', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'paradox_da_da_curve');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.baseAdd).toBe(4);
    expect(entry?.operator).toBe('paradox');
    expect(entry?.base).toBe('dada-curve');
    expect(entry?.operationalNotation).toBe('CLIP > SAME IN [PDX] [DEX] > (NO PLANT WHILE) OP OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
  });

  it('paradox-whirling-swirl overlay carries FB.org-confirmed JOB (preserves OP BACK SWIRL + SAME CLIP)', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'paradox_whirling_swirl');
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.operationalNotation).toBe('CLIP > SAME IN [PDX] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]');
  });

  it('both paradox compounds use the standard paradox-prefix pattern SAME IN [PDX] [DEX]', () => {
    for (const slug of ['paradox_da_da_curve', 'paradox_whirling_swirl']) {
      const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === slug);
      expect(entry?.operationalNotation ?? '').toMatch(/SAME IN \[PDX\] \[DEX\]/);
    }
  });
});

describe('Paradox-family detail pages — first-class JOB + ADD', () => {
  it('/freestyle/tricks/paradox_da_da_curve renders 5 ADD + [PDX] token + (NO PLANT WHILE) pre-state', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox_da_da_curve');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    for (const token of ['CLIP', 'SAME', 'IN', '[PDX]', '[DEX]', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
    // (NO PLANT WHILE) pre-state flag
    expect(res.text).toMatch(/class="op-token[^"]*"[^>]*>\(NO PLANT WHILE\)</);
  });

  it('/freestyle/tricks/paradox_whirling_swirl renders 5 ADD + OP BACK SWIRL rotation-variant token', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/paradox_whirling_swirl');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    // BACK SWIRL fuses into rotation_variant token per operationalNotationRendering
    expect(res.text).toMatch(/class="op-token[^"]*rotation-variant[^"]*"[^>]*>BACK SWIRL</);
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
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    for (const slug of ['paradox_da_da_curve', 'paradox_whirling_swirl']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx).toBeGreaterThan(-1);
      const articleOpen = res.text.lastIndexOf('<article', idx);
      const articleClose = res.text.indexOf('</article>', idx);
      const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
      expect(card).toMatch(/class="dict-trick-row-job-value">/);
      expect(card).not.toContain('canonical decomposition pending');
    }
  });
});
