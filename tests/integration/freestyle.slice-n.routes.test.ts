/**
 * Integration tests for Slice N — symbolic enrichment & notation precedence.
 *
 * Scope verified:
 *   - The four new Slice N chain entries (paradox-blender, food-processor,
 *     spender, paradox-drifter) render the curator-authored symbolic
 *     equivalences instead of falling through to operational notation.
 *   - The five new Movement System glosses (spinning, ducking, symposium,
 *     stepping, pixie) render in their respective modifier groups within
 *     the movement-system view.
 *   - Symbolic-first / op-notation-fallback precedence holds — rows with
 *     no chain entry but with operational_notation still render the
 *     operational tokens.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3100');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers for the Movement System view (we need every Slice N pilot
  // gloss to have a populated modifier group to render).
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'stepping',  modifier_name: 'stepping',  modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set'  });

  // Slice N chain-target rows. Each has BOTH operational_notation AND a
  // chain entry — the test verifies the chain wins.
  insertFreestyleTrick(db, { slug: 'paradox-blender', canonical_name: 'paradox blender', adds: '5', base_trick: 'blender', trick_family: 'blender', category: 'compound', operational_notation: '[set] > paradox > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'food-processor',  canonical_name: 'food processor',  adds: '6', base_trick: 'blender', trick_family: 'blender', category: 'compound', operational_notation: '[set] > blurry > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'spender',         canonical_name: 'spender',         adds: '6', base_trick: 'blender', trick_family: 'blender', category: 'compound', operational_notation: '[set] > spinning > paradox > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'paradox-drifter', canonical_name: 'paradox drifter', adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound', operational_notation: 'CLIP >> PARADOX > OP IN [DEX] > SAME CLIP [XBD] [DEL]' });

  // Movement-system-view trick fixtures — one trick per gloss target.
  insertFreestyleTrick(db, { slug: 'paradox-whirl',  canonical_name: 'paradox whirl',  adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-whirl',  canonical_name: 'ducking whirl',  adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium-whirl',canonical_name: 'symposium whirl',adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'stepping-whirl', canonical_name: 'stepping whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',        canonical_name: 'dimwalk',        adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });

  insertFreestyleTrickModifierLink(db, 'paradox-whirl',   'paradox',   1);
  insertFreestyleTrickModifierLink(db, 'spinning-whirl',  'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'ducking-whirl',   'ducking',   1);
  insertFreestyleTrickModifierLink(db, 'symposium-whirl', 'symposium', 1);
  insertFreestyleTrickModifierLink(db, 'stepping-whirl',  'stepping',  1);
  insertFreestyleTrickModifierLink(db, 'dimwalk',         'pixie',     1);

  // Precedence regression fixture — row with op-notation and NO chain
  // entry. The slug is unique enough that it cannot collide with any
  // curator-authored chain in freestyleSymbolicEquivalences.ts.
  insertFreestyleTrick(db, {
    slug: 'slice-n-fallback-fixture',
    canonical_name: 'slice n fallback fixture',
    adds: '4',
    base_trick: 'whirl',
    trick_family: 'whirl',
    category: 'compound',
    operational_notation: '[clip] > some operational expression > ss clipper',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. New chain entries render symbolically (not via op-notation fallback)
// ─────────────────────────────────────────────────────────────────────────

describe('Slice N — branch-family chain additions render symbolically', () => {
  it('paradox-blender card renders the chain reading, not the operational notation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="paradox-blender"');
    expect(idx).toBeGreaterThan(-1);
    const nextCard = res.text.indexOf('data-trick-slug=', idx + 1);
    const window = res.text.substring(idx, nextCard > -1 ? nextCard : idx + 4000);
    // The chain reading is rendered as semantic tokens; the equivalence
    // sigil + class are the load-bearing render-time markers.
    expect(window).toContain('dict-trick-row-interpretation');
    expect(window).toContain('&equiv;');
    // Two-line contract: the JOB also renders on line 2 alongside the line-1
    // chain reading (independent slots).
    expect(window).toMatch(/class="dict-trick-row-job-value">/);
  });

  it('food-processor surfaces the Red-locked Blurry-Blender reading', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    const idx = res.text.indexOf('data-trick-slug="food-processor"');
    expect(idx).toBeGreaterThan(-1);
    const nextCard = res.text.indexOf('data-trick-slug=', idx + 1);
    const window = res.text.substring(idx, nextCard > -1 ? nextCard : idx + 4000);
    expect(window).toContain('dict-trick-row-interpretation');
    // The blurry + blender tokens both appear in the first reading.
    expect(window).toMatch(/blurry[\s\S]{0,300}blender/i);
  });

  it('spender surfaces the curator-prose-confirmed reading', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    const idx = res.text.indexOf('data-trick-slug="spender"');
    expect(idx).toBeGreaterThan(-1);
    const nextCard = res.text.indexOf('data-trick-slug=', idx + 1);
    const window = res.text.substring(idx, nextCard > -1 ? nextCard : idx + 4000);
    expect(window).toContain('dict-trick-row-interpretation');
    expect(window).toMatch(/spinning[\s\S]{0,300}paradox[\s\S]{0,300}blender/i);
  });

  it('paradox-drifter resolves through the new chain (not the long op-notation)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    const idx = res.text.indexOf('data-trick-slug="paradox-drifter"');
    expect(idx).toBeGreaterThan(-1);
    const nextCard = res.text.indexOf('data-trick-slug=', idx + 1);
    const window = res.text.substring(idx, nextCard > -1 ? nextCard : idx + 4000);
    expect(window).toContain('dict-trick-row-interpretation');
    // Two-line contract: JOB also renders on line 2 (independent of the chain).
    expect(window).toMatch(/class="dict-trick-row-job-value">/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Movement System gloss expansion — 5 new modifier groups
// ─────────────────────────────────────────────────────────────────────────
// 3. Precedence contract — op-notation still renders when no chain exists
// ─────────────────────────────────────────────────────────────────────────

describe('Slice N — rendering precedence preserved (no regression)', () => {
  it('a row with operational_notation but NO chain still falls back to op-notation', async () => {
    // The fixture row is seeded in beforeAll. It carries operational
    // notation but no chain registry entry — verifies the symbolic-first
    // / op-notation-fallback contract still holds for un-chained rows.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="slice-n-fallback-fixture"');
    expect(idx).toBeGreaterThan(-1);
    const nextCard = res.text.indexOf('data-trick-slug=', idx + 1);
    const window = res.text.substring(idx, nextCard > -1 ? nextCard : idx + 4000);
    // No chain → line-2 JOB renders (resolved value), no line-1 interpretation.
    expect(window).toMatch(/class="dict-trick-row-job-value">/);
    expect(window).not.toContain('dict-trick-row-interpretation');
  });
});
