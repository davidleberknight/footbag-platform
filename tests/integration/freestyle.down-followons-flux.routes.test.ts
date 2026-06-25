/**
 * Down follow-ons and flux canonical trick promotion: routes and rendering.
 * down-family follow-ons + flux. Three new canonical rows:
 *
 *   - pixie-double-over-down (5 ADD = pixie(+1) + double-over-down(4))
 *     Pixie modifier on the just-shipped double-over-down chassis.
 *     FB.org JOB carries an unusual (plant) pre-state flag between
 *     the pixie dex and the doubled-out dex pair.
 *
 *   - scorpions-tail (5 ADD = spinning(+1) + down-double-down(4))
 *     Spinning modifier on the just-shipped down-double-down chassis.
 *     FB.org alias "Spinning Down Double-Down" wired. JOB uses
 *     lowercase [bod] per fb.org source (most siblings use [BOD]).
 *
 *   - flux (4 ADD = atomic(+1) + osis(3))
 *     Simple atomic-osis compound. FB.org alias "Atomic Osis" wired.
 *     Atomic prefix manifests as (FRONT) SPIN [BOD] mid-trick rather
 *     than at the front.
 *
 * All JOBs FB.org-confirmed verbatim.
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

const { dbPath } = setTestEnv('3177');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'pixie_double_over_down',
    canonical_name: 'pixie double-over down',
    adds: '5', base_trick: 'double-over-down', trick_family: 'double-over-down',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
  });
  insertFreestyleTrick(db, {
    slug: 'scorpions_tail',
    canonical_name: "Scorpion's Tail",
    adds: '5', base_trick: 'down-double-down', trick_family: 'down-double-down',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
    aliases_json: '["spinning down double-down"]',
  });
  insertFreestyleTrick(db, {
    slug: 'flux',
    canonical_name: 'flux',
    adds: '4', base_trick: 'osis', trick_family: 'osis',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: null,
    aliases_json: '["atomic osis"]',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_FORMULAS_SPRINT_1 — down-family follow-ons + flux entries', () => {
  it('pixie-double-over-down carries FB.org-confirmed JOB with (plant) pre-state', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'pixie_double_over_down');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.baseAdd).toBe(4);
    expect(entry?.operator).toBe('pixie');
    expect(entry?.base).toBe('double-over-down');
    expect(entry?.operationalNotation).toBe('TOE > SAME IN [DEX] (plant) > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/\(plant\) pre-state/i);
  });

  it("scorpions-tail carries FB.org-confirmed JOB with lowercase [bod] preserved verbatim", () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'scorpions_tail');
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.operator).toBe('spinning');
    expect(entry?.base).toBe('down-double-down');
    expect(entry?.operationalNotation).toBe('CLIP > (back) SPIN [bod] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/lowercase \[bod\]/i);
    expect(entry?.provenance ?? '').toMatch(/Spinning Down Double-Down/i);
  });

  it('flux carries FB.org-confirmed JOB with mid-trick (FRONT) SPIN [BOD]', () => {
    const entry = RESOLVED_FORMULAS_SPRINT_1.find(e => e.slug === 'flux');
    expect(entry?.totalAdd).toBe(4);
    expect(entry?.operator).toBe('atomic');
    expect(entry?.base).toBe('osis');
    expect(entry?.operationalNotation).toBe('TOE > OP OUT [DEX] > (FRONT) SPIN [BOD] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/Atomic Osis/i);
  });
});

describe('Down-family follow-ons + flux detail pages — first-class JOB + ADD', () => {
  it('/freestyle/tricks/pixie-double-over-down renders 5 ADD + (plant) pre-state', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/pixie_double_over_down');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    // (plant) pre-state flag renders with pre-state cssRole
    expect(res.text).toMatch(/class="op-token[^"]*pre-state[^"]*"[^>]*>\(plant\)</);
    for (const token of ['TOE', 'SAME', 'IN', '[DEX]', 'OUT', 'OP', 'CLIP', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('/freestyle/tricks/scorpions-tail renders 5 ADD + SPIN body action + lowercase [bod]', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/scorpions_tail');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">5 ADD<\/span>/);
    // (back) pre-state + SPIN body action + [bod] component (lowercase)
    expect(res.text).toMatch(/class="op-token[^"]*"[^>]*>\(back\)</);
    expect(res.text).toMatch(/class="op-token[^"]*body-action[^"]*"[^>]*>SPIN</);
    expect(res.text).toMatch(/class="op-token[^"]*"[^>]*>\[bod\]</);
  });

  it("scorpions-tail surfaces 'spinning down double-down' alias", async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/scorpions_tail');
    expect(res.text).toMatch(/spinning down double-down/i);
  });

  it('/freestyle/tricks/flux renders 4 ADD + (FRONT) pre-state + atomic-osis chain', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/flux');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">4 ADD<\/span>/);
    expect(res.text).toMatch(/class="op-token[^"]*pre-state[^"]*"[^>]*>\(FRONT\)</);
    for (const token of ['TOE', 'OP', 'OUT', '[DEX]', 'SPIN', '[BOD]', 'CLIP', '[XBD]', '[DEL]']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('flux surfaces "atomic osis" alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/flux');
    expect(res.text).toMatch(/atomic osis/i);
  });
});

describe('Down-family follow-ons + flux browse rendering — FIRST_CLASS_TIER_2', () => {
  it('all three browse cards render JOB + ADD inline (not "canonical decomposition pending")', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    for (const slug of ['pixie_double_over_down', 'scorpions_tail', 'flux']) {
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
