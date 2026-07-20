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
import { RESOLVED_ADD_FORMULAS } from '../../src/content/freestyleResolvedFormulas';

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
  // Down umbrella fixture: two members per variant label (a family section
  // renders only above one row), covering a variant branch (barfly), the dod
  // sub-label that folds into the double-over-down branch, and paradon.
  insertFreestyleTrick(db, {
    slug: 'barfly', canonical_name: 'barfly',
    adds: '4', base_trick: 'barfly', trick_family: 'barfly',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'blurriest', canonical_name: 'blurriest',
    adds: '5', base_trick: 'barfly', trick_family: 'barfly',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  // Third barfly member so the barfly branch clears the family-view
  // three-member minimum and renders as its own full section.
  insertFreestyleTrick(db, {
    slug: 'barfly_crawl', canonical_name: 'barfly crawl',
    adds: '5', base_trick: 'barfly', trick_family: 'barfly',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'fusion', canonical_name: 'fusion',
    adds: '5', base_trick: 'dod', trick_family: 'dod',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'cold_fusion', canonical_name: 'cold fusion',
    adds: '6', base_trick: 'fusion', trick_family: 'dod',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  // Third dod-labelled member so the Double-Over-Down branch (which the dod
  // sub-label folds into) clears the three-member minimum and renders as its
  // own full section.
  insertFreestyleTrick(db, {
    slug: 'hot_fusion', canonical_name: 'hot fusion',
    adds: '6', base_trick: 'fusion', trick_family: 'dod',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradon', canonical_name: 'paradon',
    adds: '4', base_trick: 'paradon', trick_family: 'paradon',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'dolomite', canonical_name: 'dolomite',
    adds: '5', base_trick: 'paradon', trick_family: 'paradon',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  // Third paradon member so the paradon branch clears the three-member minimum
  // and surfaces in the compact Minor Lineages band (paradon is minor-lineage
  // tier, so it renders as a ?family= link, not a full section).
  insertFreestyleTrick(db, {
    slug: 'travertine', canonical_name: 'travertine',
    adds: '6', base_trick: 'paradon', trick_family: 'paradon',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_ADD_FORMULAS — down family entries', () => {
  it('double-over-down overlay carries FB.org-confirmed JOB (TOE-set chassis)', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'double_over_down');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(4);
    expect(entry?.operationalNotation).toBe('TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
    expect(entry?.provenance ?? '').toMatch(/Red pt7/i);
  });

  it('down-double-down overlay carries FB.org-confirmed JOB (CLIP-set chassis)', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'down_double_down');
    expect(entry?.totalAdd).toBe(4);
    expect(entry?.operationalNotation).toBe('CLIP > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/distinct chassis/i);
  });

  it('down-diver overlay carries FB.org-confirmed JOB (diving on double-over-down chassis)', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'down_diver');
    expect(entry?.totalAdd).toBe(5);
    expect(entry?.baseAdd).toBe(4);
    expect(entry?.operator).toBe('diving');
    expect(entry?.base).toBe('double-over-down');
    expect(entry?.operationalNotation).toBe('TOE > DIVE [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/FB\.org-confirmed/i);
  });

  it('double-over-down and down-double-down have distinct chassis (TOE vs CLIP starting set)', () => {
    const dod = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'double_over_down');
    const ddd = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'down_double_down');
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

describe('Down umbrella family (the one ruled structural decomposition)', () => {
  it('the Down root section renders in the family view, aggregating its variant branches', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // The umbrella root has no raw trick_family rows of its own; its section
    // is the union of the variant branches' members.
    const downIdx = res.text.indexOf('id="family-down"');
    expect(downIdx).toBeGreaterThan(-1);
    const nextSection = res.text.indexOf('id="family-', downIdx + 1);
    const section = res.text.slice(downIdx, nextSection === -1 ? undefined : nextSection);
    for (const member of ['barfly', 'fusion', 'paradon']) {
      expect(section).toContain(`data-trick-slug="${member}"`);
    }
  });

  it('the Down umbrella family-anchor links to the family page, not a missing trick page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    const downIdx = res.text.indexOf('id="family-down"');
    expect(downIdx).toBeGreaterThan(-1);
    const nextSection = res.text.indexOf('id="family-', downIdx + 1);
    const section = res.text.slice(downIdx, nextSection === -1 ? undefined : nextSection);
    // Down has no trick row of its own; its family-anchor must point at the
    // family page, not a dead /freestyle/tricks/down page.
    expect(section).toContain('href="/freestyle/families/down"');
    expect(section).not.toContain('href="/freestyle/tricks/down"');
  });

  it('an official family parent that also has its own trick row still links its anchor to the family page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    const bIdx = res.text.indexOf('id="family-barfly"');
    expect(bIdx).toBeGreaterThan(-1);
    const nextSection = res.text.indexOf('id="family-', bIdx + 1);
    const section = res.text.slice(bIdx, nextSection === -1 ? undefined : nextSection);
    // barfly has both a trick row and a family page; the anchor routes to the
    // family page (the primary explanation), never bypassing it to the trick.
    const anchor = section.match(/class="trick-family-anchor-link"[^>]*href="([^"]*)"/);
    expect(anchor?.[1]).toBe('/freestyle/families/barfly');
  });

  it('variant branches keep their own presentation alongside the umbrella, tier deciding the form', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    // Parent-tier variants render as full sections; minor-tier variants render
    // in the Minor Lineages band with a working ?family= link. Both remain
    // reachable, and all aggregate into the Down section.
    expect(res.text).toContain('id="family-barfly"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?family=paradon"/);
  });

  it('the dod sub-label folds into the Double-Over-Down branch section', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    const dodIdx = res.text.indexOf('id="family-double_over_down"');
    expect(dodIdx).toBeGreaterThan(-1);
    const nextSection = res.text.indexOf('id="family-', dodIdx + 1);
    const section = res.text.slice(dodIdx, nextSection === -1 ? undefined : nextSection);
    expect(section).toContain('data-trick-slug="fusion"');
    expect(section).toContain('data-trick-slug="cold_fusion"');
  });

  it('?family=down filters to the union of the contained raw labels', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?family=down');
    expect(res.status).toBe(200);
    for (const member of ['barfly', 'blurriest', 'fusion', 'cold_fusion', 'paradon', 'dolomite']) {
      expect(res.text).toContain(`data-trick-slug="${member}"`);
    }
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
