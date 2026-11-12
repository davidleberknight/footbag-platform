/**
 * Inspinning-family canonical trick promotion: routes and rendering.
 * family. Three compounds, all mirroring spinning-* siblings via the
 * inspinning direction-flip rule established by FB.org-confirmed
 * inspinning-butterfly JOB.
 *
 * Doctrine: Red ruled inspinning as modifier-stacking on the
 * PassBack Inspinning group. JOB form for inspinning-butterfly is
 * FB.org-confirmed; siblings (paradox-illusion / paradox-mirage) apply
 * the same direction-flip rule (spin back→front; dex side OP→SAME;
 * dex direction + terminal stall unchanged).
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

const { dbPath } = setTestEnv('3168');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertTrickAsRebuilt(db, {
    slug: 'inspinning_butterfly',
    operational_notation: 'CLIP > (front) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    canonical_name: 'inspinning butterfly',
    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertTrickAsRebuilt(db, {
    slug: 'inspinning_paradox_illusion',
    operational_notation: 'CLIP > (front) SPIN [BOD] > SAME OUT [PDX] [DEX] > OP TOE [DEL]',
    canonical_name: 'inspinning paradox illusion',
    adds: '4', base_trick: 'illusion', trick_family: 'illusion',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertTrickAsRebuilt(db, {
    slug: 'inspinning_paradox_mirage',
    operational_notation: 'CLIP > (front) SPIN [BOD] > SAME IN [PDX] [DEX] > OP TOE [DEL]',
    canonical_name: 'inspinning paradox mirage',
    adds: '4', base_trick: 'mirage', trick_family: 'mirage',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));


describe('Inspinning detail pages — first-class JOB + ADD', () => {
  it('/freestyle/tricks/inspinning-butterfly renders 4 ADD hero chip + (front) SPIN token', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/inspinning_butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    // Pre-state flag (front) renders as op-token with class pre-state
    expect(res.text).toMatch(/class="op-token[^"]*"[^>]*>\(front\)</);
    // SAME side label, BOD/DEX/XBD/DEL tokens
    for (const token of ['CLIP', 'SPIN', '[BOD]', 'SAME', 'OUT', '[DEX]', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('/freestyle/tricks/inspinning-paradox-illusion renders 4 ADD + [PDX] token + OP TOE terminal', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/inspinning_paradox_illusion');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    for (const token of ['(front)', '[BOD]', 'SAME', 'OUT', '[PDX]', '[DEX]', 'OP', 'TOE', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('/freestyle/tricks/inspinning-paradox-mirage renders 4 ADD + IN direction (not OUT like illusion)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/inspinning_paradox_mirage');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    // The dex direction differs from paradox-illusion: paradox-mirage uses IN
    const pattern = new RegExp(`class="op-token[^"]*"[^>]*>IN<`);
    expect(res.text).toMatch(pattern);
  });
});

describe('Inspinning browse rendering — FIRST_CLASS_TIER_2 cohort', () => {
  it('inspinning-butterfly browse card renders JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="inspinning_butterfly"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-notation-value">/);
    expect(card).toMatch(/class="dict-trick-row-notation-value"/);
    expect(card).not.toContain('canonical decomposition pending');
  });
});
