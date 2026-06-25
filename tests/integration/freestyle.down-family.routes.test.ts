/**
 * Down-family canonical trick promotion: routes and rendering.
 *
 * Three siblings, all FB.org-confirmed JOBs:
 *   - double-over-down (4 ADD) — toe-set chassis; SAME/SAME OUT dexes
 *   - down-double-down (4 ADD) — clipper-set chassis; OP/SAME OUT dexes
 *   - down-diver (5 ADD) — diving(+1) + double-over-down(4) chassis
 *
 * Red pt7 settled: "Down pattern (double-over down / down double-down /
 * down diver) → Different tricks." Distinct chassis preserved.
 *
 * Documentation note: down-diver's RECONCILIATION formula reads
 * "diving(+1) + down-double-down(4)" but the FB.org JOB chassis is
 * double-over-down (TOE start, SAME/SAME dexes), not down-double-down
 * (CLIP start, OP/SAME). JOB taken as authoritative.
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

const { dbPath } = setTestEnv('3169');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'double_over_down',
    canonical_name: 'double-over down',
    adds: '4', base_trick: 'double-over-down', trick_family: 'double-over-down',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  insertFreestyleTrick(db, {
    slug: 'down_double_down',
    canonical_name: 'down double-down',
    adds: '4', base_trick: 'down-double-down', trick_family: 'down-double-down',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  insertFreestyleTrick(db, {
    slug: 'down_diver',
    canonical_name: 'down diver',
    adds: '5', base_trick: 'double-over-down', trick_family: 'double-over-down',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
    aliases_json: '["diving down double-down"]',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — down family entries', () => {
  it('double-over-down overlay carries FB.org-confirmed JOB (TOE-set chassis)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'double_over_down');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(4);
    expect(entry?.operationalNotation).toBe('TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/Red pt7/i);
  });

  it('down-double-down overlay carries FB.org-confirmed JOB (CLIP-set chassis)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'down_double_down');
    expect(entry?.totalAdd).toBe(4);
    expect(entry?.operationalNotation).toBe('CLIP > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/distinct chassis/i);
  });

  it('down-diver overlay carries FB.org-confirmed JOB (diving on double-over-down chassis)', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'down_diver');
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.baseAdd).toBe(4);
    expect(entry?.operator).toBe('diving');
    expect(entry?.base).toBe('double-over-down');
    expect(entry?.operationalNotation).toBe('TOE > DIVE [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
  });

  it('double-over-down and down-double-down have distinct chassis (TOE vs CLIP starting set)', () => {
    const dod = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'double_over_down');
    const ddd = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'down_double_down');
    expect(dod?.operationalNotation ?? '').toMatch(/^TOE >/);
    expect(ddd?.operationalNotation ?? '').toMatch(/^CLIP >/);
    // Both have 4 tokens (same ADD math via different chassis)
    expect(dod?.totalAdd).toBe(ddd?.totalAdd);
  });
});

describe('Down-family detail pages — first-class JOB + ADD', () => {
  it('/freestyle/tricks/double-over-down renders 4 ADD + TOE-set tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double_over_down');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    for (const token of ['TOE', 'SAME', 'OUT', '[DEX]', 'OP', 'CLIP', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('/freestyle/tricks/down-double-down renders 4 ADD + CLIP-set start (not TOE)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/down_double_down');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    // CLIP is the first surface token. Confirm CLIP renders as op-token.
    const clipPattern = new RegExp(`class="op-token[^"]*"[^>]*>CLIP<`);
    expect(res.text).toMatch(clipPattern);
  });

  it('/freestyle/tricks/down-diver renders 5 ADD + DIVE body action token', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/down_diver');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    // DIVE is a body-action token in operationalNotationRendering vocabulary
    const divePattern = new RegExp(`class="op-token[^"]*body-action[^"]*"[^>]*>DIVE<`);
    expect(res.text).toMatch(divePattern);
  });

  it('down-diver detail page surfaces the "Diving Down Double-Down" alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/down_diver');
    expect(res.status).toBe(200);
    // alias should render in the "Also known as" row via aliases_json
    expect(res.text).toMatch(/diving down double-down/i);
  });
});

describe('Down-family browse rendering — FIRST_CLASS_TIER_2', () => {
  it('all three down-family browse cards render JOB + ADD (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    for (const slug of ['double_over_down', 'down_double_down', 'down_diver']) {
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
