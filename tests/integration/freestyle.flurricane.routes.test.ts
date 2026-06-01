/**
 * Pre-Adrian deferred-candidate promotion slice (2026-05-25) — flurricane.
 *
 * 5 ADD = gyro(+1) + flurry(4). JOB FB.org-confirmed from fborg-5add.txt
 * (CLIP-set primary form) and gyroMoves.txt. FB.org also publishes a
 * TOE-set variant; CLIP-set used per fb.org listing order.
 *
 * Gyro modifier pattern: "(back) SPIN [BOD]" prefix prepended;
 * first dex shifts OP IN → SAME IN (matches gyro-* sibling pattern
 * in DB).
 *
 * FB.org alias "Gyro Flurry" preserved.
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

const { dbPath } = setTestEnv('3173');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'flurricane',
    canonical_name: 'flurricane',
    adds: '5', base_trick: 'flurry', trick_family: 'flurry',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
    aliases_json: '["gyro flurry"]',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — flurricane entry', () => {
  it('overlay carries FB.org-confirmed CLIP-set JOB + 5 ADD + gyro/flurry derivation', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'flurricane');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.baseAdd).toBe(4);
    expect(entry?.operator).toBe('gyro');
    expect(entry?.base).toBe('flurry');
    expect(entry?.operationalNotation).toBe('CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/Gyro Flurry/i);
    expect(entry?.provenance ?? '').toMatch(/TOE-set variant/i);
  });
});

describe('flurricane detail page — first-class JOB + ADD', () => {
  it('/freestyle/tricks/flurricane renders 5 ADD + (back) pre-state + SPIN [BOD] + 3 dex tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/flurricane');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    // (back) pre-state flag
    expect(res.text).toMatch(/class="op-token[^"]*pre-state[^"]*"[^>]*>\(back\)</);
    // SPIN body-action + [BOD] component + tokens
    for (const token of ['CLIP', 'SPIN', '[BOD]', 'SAME', 'IN', '[DEX]', 'OP', 'OUT', 'TOE', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('flurricane detail page surfaces "gyro flurry" as alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/flurricane');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/gyro flurry/i);
  });

  it('flurricane browse card renders JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="flurricane"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-job-value">/);
    expect(card).not.toContain('canonical decomposition pending');
  });
});
