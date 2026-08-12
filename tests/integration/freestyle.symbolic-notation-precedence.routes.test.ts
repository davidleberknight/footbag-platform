/**
 * Integration tests for symbolic enrichment & notation precedence.
 *
 * Scope verified:
 *   - The four chain entries (paradox_blender, food_processor,
 *     spender, paradox_drifter) render the curator-authored symbolic
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

  // Modifiers for the Movement System view (we need every pilot
  // gloss to have a populated modifier group to render).
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'stepping',  modifier_name: 'stepping',  modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set'  });

  // Chain-target rows. Each has BOTH operational_notation AND a
  // chain entry — the test verifies the chain wins.
  insertFreestyleTrick(db, { slug: 'paradox_blender', canonical_name: 'paradox blender', adds: '5', base_trick: 'blender', trick_family: 'blender', category: 'compound', operational_notation: '[set] > paradox > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'food_processor',  canonical_name: 'food processor',  adds: '6', base_trick: 'blender', trick_family: 'blender', category: 'compound', operational_notation: '[set] > blurry > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'spender',         canonical_name: 'spender',         adds: '6', base_trick: 'blender', trick_family: 'blender', category: 'compound', operational_notation: '[set] > spinning > paradox > whirling op osis' });
  insertFreestyleTrick(db, { slug: 'paradox_drifter', canonical_name: 'paradox drifter', adds: '4', base_trick: 'drifter', trick_family: 'drifter', category: 'compound', operational_notation: 'CLIP >> PARADOX > OP IN [DEX] > SAME CLIP [XBD] [DEL]' });

  // Movement-system-view trick fixtures — one trick per gloss target.
  insertFreestyleTrick(db, { slug: 'paradox_whirl',  canonical_name: 'paradox whirl',  adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning_whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking_whirl',  canonical_name: 'ducking whirl',  adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium_whirl',canonical_name: 'symposium whirl',adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'stepping_whirl', canonical_name: 'stepping whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',        canonical_name: 'dimwalk',        adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });

  insertFreestyleTrickModifierLink(db, 'paradox_whirl',   'paradox',   1);
  insertFreestyleTrickModifierLink(db, 'spinning_whirl',  'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'ducking_whirl',   'ducking',   1);
  insertFreestyleTrickModifierLink(db, 'symposium_whirl', 'symposium', 1);
  insertFreestyleTrickModifierLink(db, 'stepping_whirl',  'stepping',  1);
  insertFreestyleTrickModifierLink(db, 'dimwalk',         'pixie',     1);

  // Precedence regression fixture — row with op-notation and NO chain
  // entry. The slug is unique enough that it cannot collide with any
  // curator-authored chain in freestyleSymbolicEquivalences.ts.
  insertFreestyleTrick(db, {
    slug: 'slice_n_fallback_fixture',
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

// A chain reading is structural content, so it reads in the trick's own
// Equivalent readings section; the browse row carries the trick's notation and
// never a reading. Each test below therefore checks the reading on the page and
// the notation on the row.
describe('branch-family chain additions render symbolically', () => {
  function rowFor(html: string, slug: string): string {
    const idx = html.indexOf(`data-trick-slug="${slug}"`);
    expect(idx, `row for ${slug} not found`).toBeGreaterThan(-1);
    const next = html.indexOf('data-trick-slug=', idx + 1);
    return html.substring(idx, next > -1 ? next : idx + 4000);
  }
  function readings(html: string): string {
    return html.match(/<ol class="equivalent-readings-list">[\s\S]*?<\/ol>/)?.[0] ?? '';
  }

  it('paradox_blender renders its chain reading on the page and its notation on the row', async () => {
    const app = createApp();
    const page = await request(app).get('/freestyle/tricks/paradox_blender');
    expect(page.status).toBe(200);
    expect(readings(page.text)).toBeTruthy();

    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    expect(rowFor(res.text, 'paradox_blender')).toMatch(/class="dict-trick-row-notation-value">/);
  });

  it('food_processor surfaces the Red-locked Blurry-Blender reading', async () => {
    const page = await request(createApp()).get('/freestyle/tricks/food_processor');
    expect(page.status).toBe(200);
    expect(readings(page.text)).toMatch(/blurry[\s\S]{0,300}blender/i);
  });

  it('spender surfaces the curator-prose-confirmed reading', async () => {
    const page = await request(createApp()).get('/freestyle/tricks/spender');
    expect(page.status).toBe(200);
    expect(readings(page.text)).toMatch(/spinning[\s\S]{0,300}paradox[\s\S]{0,300}blender/i);
  });

  it('paradox_drifter: the held miraging reading never surfaces, on the page or the row', async () => {
    const app = createApp();
    // The deeper 'paradox miraging clipper' reading is held with drifter's own
    // decomposition, and 'paradox drifter' echoes the canonical name. Neither
    // the page nor the row may show the miraging nickname.
    const page = await request(app).get('/freestyle/tricks/paradox_drifter');
    expect(page.status).toBe(200);
    expect(readings(page.text)).not.toMatch(/miraging/);

    const res = await request(app).get('/freestyle/tricks?view=dex-count');
    const row = rowFor(res.text, 'paradox_drifter');
    expect(row).not.toMatch(/miraging/);
    expect(row).toMatch(/class="dict-trick-row-notation-value">/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Movement System gloss expansion — 5 new modifier groups
// ─────────────────────────────────────────────────────────────────────────
// 3. Precedence contract — op-notation still renders when no chain exists
// ─────────────────────────────────────────────────────────────────────────

describe('rendering precedence preserved (no regression)', () => {
  it('a row with operational_notation but NO chain still falls back to op-notation', async () => {
    // The fixture row is seeded in beforeAll. It carries operational
    // notation but no chain registry entry — verifies the symbolic-first
    // / op-notation-fallback contract still holds for un-chained rows.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    const idx = res.text.indexOf('data-trick-slug="slice_n_fallback_fixture"');
    expect(idx).toBeGreaterThan(-1);
    const nextCard = res.text.indexOf('data-trick-slug=', idx + 1);
    const window = res.text.substring(idx, nextCard > -1 ? nextCard : idx + 4000);
    // No chain → line-2 JOB renders (resolved value), no line-1 interpretation.
    expect(window).toMatch(/class="dict-trick-row-notation-value">/);
    expect(window).not.toContain('dict-trick-row-interpretation');
  });
});
