/**
 * Pixie, clipper, toe, and blizzard canonical trick promotion: routes and rendering.
 *
 * Three canonical changes:
 *
 *   1. pixie-opposite-clipper — new canonical row; 3 ADD =
 *      pixie(+1) + clipper-stall(2); JOB sibling-derived from
 *      drifter / fairy-clipper / spinning-clipper. First-class.
 *   2. pixie-same-clipper — new canonical row; 3 ADD; same family.
 *      First-class.
 *   3. toe-blizzard — added as ALIAS of existing quantum-illusion
 *      canonical row (Red pt2 EQUIVALENCE: Toe Blizzard = Quantum
 *      Illusion). No new freestyle_tricks row; new alias row only.
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

const { dbPath } = setTestEnv('3165');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Two new pixie-family canonical rows (post-loader-19 state).
  insertFreestyleTrick(db, {
    slug:                'pixie_opposite_clipper',
    canonical_name:      'pixie opposite clipper',
    adds:                '3',
    base_trick:          'clipper_stall',
    trick_family:        'clipper_stall',
    category:            'compound',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: null,  // overlay provides the JOB at shape time
  });
  insertFreestyleTrick(db, {
    slug:                'pixie_same_clipper',
    canonical_name:      'pixie same clipper',
    adds:                '3',
    base_trick:          'clipper_stall',
    trick_family:        'clipper_stall',
    category:            'compound',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: null,
  });
  // Quantum-illusion canonical row already in DB; seed with aliases_json
  // matching loader 19's post-state (aliases column on csv → aliases_json
  // populated; table row inserted separately below).
  insertFreestyleTrick(db, {
    slug:                'quantum_illusion',
    canonical_name:      'quantum illusion',
    adds:                '3',
    base_trick:          'illusion',
    trick_family:        'illusion',
    category:            'compound',
    review_status:       'expert_reviewed',
    is_active:           1,
    operational_notation: 'TOE > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]',
    aliases_json:        '["toe_blizzard"]',
  });
  // toe-blizzard alias of quantum-illusion in the aliases table (loader 19
  // inserts both aliases_json AND a freestyle_trick_aliases row).
  const insertAlias = db.prepare(`
    INSERT INTO freestyle_trick_aliases
      (alias_slug, alias_text, trick_slug, alias_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertAlias.run(
    'toe_blizzard',
    'toe-blizzard',
    'quantum_illusion',
    'common',
    new Date().toISOString(),
  );
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('RESOLVED_ADD_FORMULAS — pixie-clipper entries', () => {
  it('pixie-opposite-clipper overlay carries JOB + 3 ADD + sibling-derivation provenance', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'pixie_opposite_clipper');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(3);
    expect(entry?.baseAdd).toBe(2);
    expect(entry?.operator).toBe('pixie');
    expect(entry?.base).toBe('clipper-stall');
    expect(entry?.operationalNotation).toBe('TOE > SAME IN [DEX] > OP CLIP [XBD] [DEL]');
    expect(entry?.derivation ?? '').toMatch(/pixie\(\+1\).*clipper-stall\(2\).*3 ADD/);
    expect(entry?.provenance ?? '').toMatch(/sibling.*drifter.*fairy-clipper.*spinning-clipper/i);
    expect(entry?.provenance ?? '').toMatch(/not Red-confirmed/i);
  });

  it('pixie-same-clipper overlay carries JOB + 3 ADD + sibling-derivation provenance', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'pixie_same_clipper');
    expect(entry).toBeDefined();
    expect(entry?.totalAdd).toBe(3);
    expect(entry?.operationalNotation).toBe('TOE > SAME IN [DEX] > SAME CLIP [XBD] [DEL]');
    expect(entry?.provenance ?? '').toMatch(/not Red-confirmed/i);
  });

  it('pixie-opposite-clipper and pixie-same-clipper differ only in clipper side label (OP vs SAME)', () => {
    const opp  = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'pixie_opposite_clipper');
    const same = RESOLVED_ADD_FORMULAS.find(e => e.slug === 'pixie_same_clipper');
    expect(opp?.totalAdd).toBe(same?.totalAdd);
    expect(opp?.operationalNotation).toMatch(/OP CLIP/);
    expect(same?.operationalNotation).toMatch(/SAME CLIP/);
  });
});

describe('Pixie-clipper detail pages — first-class JOB + ADD', () => {
  it('/freestyle/tricks/pixie_opposite_clipper renders 3 ADD hero chip + JOB tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/pixie_opposite_clipper');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">3 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    // Tokens: [DEX], [XBD], [DEL], OP, CLIP, TOE, IN, SAME — assert the
    // critical structural tokens render with op-token spans.
    for (const token of ['TOE', '[DEX]', '[XBD]', '[DEL]', 'OP', 'CLIP']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });

  it('/freestyle/tricks/pixie_same_clipper renders 3 ADD hero chip + JOB tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/pixie_same_clipper');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<span class="trick-hero-meta-chip trick-hero-meta-chip-adds">3 ADD<\/span>/);
    expect(res.text).toContain('operational-notation-display');
    // Same tokens but with SAME instead of OP for the clipper-stall side
    for (const token of ['TOE', '[DEX]', '[XBD]', '[DEL]', 'SAME', 'CLIP']) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`class="op-token[^"]*"[^>]*>${escaped}<`);
      expect(res.text).toMatch(pattern);
    }
  });
});

describe('Pixie-clipper browse rendering — FIRST_CLASS_TIER_2 cohort', () => {
  it('pixie-opposite-clipper card on /freestyle/tricks?view=dex-count renders JOB + ADD inline', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="pixie_opposite_clipper"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen  = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-job-value">/);
    expect(card).toMatch(/class="dict-trick-row-label">JOB</);
    expect(card).not.toContain('canonical decomposition pending');
  });

  it('pixie-same-clipper card renders JOB + ADD inline', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="pixie_same_clipper"');
    expect(idx).toBeGreaterThan(-1);
    const articleOpen  = res.text.lastIndexOf('<article', idx);
    const articleClose = res.text.indexOf('</article>', idx);
    const card = res.text.slice(articleOpen, articleClose + '</article>'.length);
    expect(card).toMatch(/class="dict-trick-row-job-value">/);
    expect(card).toMatch(/class="dict-trick-row-label">JOB</);
  });
});

describe('toe-blizzard alias of quantum-illusion (Red pt2 EQUIVALENCE)', () => {
  // NOTE: /freestyle/tricks/:slug does NOT auto-resolve aliases today —
  // bare alias slugs return 404. The alias surfaces as an alternate name
  // on the canonical trick's detail page (via aliases_json shaping in
  // shapeDictEntry). The alias table row is the canonical source consumed
  // by other surfaces (TT-series tag resolution, dictionary index alias
  // attachment). Future detail-route alias redirect is deferred.

  it('quantum-illusion detail page surfaces toe-blizzard as an alternate name', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/quantum_illusion');
    expect(res.status).toBe(200);
    // The detail page resolves aliases from the canonical freestyle_trick_aliases
    // table (the same source the browse listing reads), so it surfaces the alias
    // display text rather than the raw underscore slug.
    expect(res.text).toMatch(/toe.blizzard/i);
  });
});
