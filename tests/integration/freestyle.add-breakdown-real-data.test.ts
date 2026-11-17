/**
 * Over the whole committed dictionary, a trick page's ADD breakdown adds up to
 * the trick's stored ADD.
 *
 * The dictionary is built from the committed inputs by the real loaders, in
 * the rebuild's order, into a temporary database; every active trick with a
 * modifier link is then rendered through the page service and the weights of
 * its hero formula are summed. The oracle is the stored ADD column, which the
 * breakdown never writes.
 *
 * A small set of tricks does not add up for reasons the breakdown cannot fix:
 * a dexterity the doctrine scores outside the links (a leading miraging
 * dexterity, a cross-body X-Dex), a base whose own links are incomplete, or an
 * ADD the source records differently. They are named below so the set can only
 * shrink: a trick that starts adding up fails the test until it is removed, and
 * any other trick that stops adding up fails it at once.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3493');

// The dictionary loaders in the order the freestyle rebuild runs them.
const DICTIONARY_LOADERS: readonly (readonly [string, string[]])[] = [
  ['16_preflight_trick_ownership.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'tricks']],
  ['19_load_red_additions.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'aliases']],
  ['20_link_footbag_org_sources.py', []],
  ['21_load_footbag_org_pending_tricks.py', []],
  ['21a_load_alias_additions.py', []],
  ['21b_apply_alias_overrides.py', []],
  ['21c_retire_stale_tricks.py', []],
];

const KNOWN_UNBALANCED = new Set([
  'armageddon', 'atomic_miraging_butterfly', 'big_apple_sauce', 'blur',
  'blurry_torque', 'blurry_whirl', 'blurry_whirling_swirl',
  'food_processor', 'genuphobia', 'mofly',
  'paratoxic', 'pixie_over_down',
  'pixie_quantum_double_over_down_swirl', 'rage', 'spinning_miraging_symposium_torque',
  'sumo', 'symposium_miraging_mirage', 'witchdoctor',
]);

let unbalanced: string[] = [];
let rendered = 0;

beforeAll(async () => {
  createTestDb(dbPath).close();
  for (const [name, args] of DICTIONARY_LOADERS) {
    const run = spawnSync('python3', [`freestyle/loaders/${name}`, '--db', dbPath, ...args], {
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    if (run.status !== 0) throw new Error(`${name} failed (${run.status}): ${run.stderr ?? ''}`);
  }

  await importApp();
  const { freestyleService } = await import('../../src/services/freestyleService');
  const db = new BetterSqlite3(dbPath, { readonly: true });
  // Every active compound with links and a distinct base that has a row.
  const tricks = db.prepare(
    `SELECT t.slug, t.adds, b.adds AS base_adds FROM freestyle_tricks t
       JOIN freestyle_tricks b ON b.slug = t.base_trick
      WHERE t.is_active = 1 AND t.base_trick <> t.slug
        AND EXISTS (SELECT 1 FROM freestyle_trick_modifier_links l WHERE l.trick_slug = t.slug)
      ORDER BY t.slug`,
  ).all() as { slug: string; adds: string; base_adds: string }[];
  db.close();

  for (const trick of tricks) {
    const page = await freestyleService.getTrickDetailPage(trick.slug);
    const weights = (page?.content?.heroFormula ?? [])
      .map(token => token.weight)
      .filter((weight): weight is string => !!weight);
    // A breakdown with every link left out shows the base alone, so it is
    // checked as the base's ADD rather than skipped.
    const parts = weights.length
      ? weights.map(weight => Number(weight.replace(/[()+]/g, '')))
      : [Number(trick.base_adds)];
    rendered++;
    const sum = parts.reduce((total, part) => total + part, 0);
    if (sum !== Number(trick.adds)) unbalanced.push(trick.slug);
  }
}, 600_000);

afterAll(() => cleanupTestDb(dbPath));

describe('every rendered ADD breakdown adds up', () => {
  it('renders breakdowns for the committed corpus, not a toy fixture', () => {
    expect(rendered).toBeGreaterThan(600);
  });

  // Defect caught: a visitor reads parts that add to more or less than the
  // ADD printed beside them, on a trick not known to be unbalanced.
  it('adds up on every trick outside the known set', () => {
    expect(unbalanced.filter(slug => !KNOWN_UNBALANCED.has(slug))).toEqual([]);
  });

  // Defect caught: a known-unbalanced trick has been fixed but is still
  // listed, so the next regression on it would pass unnoticed.
  it('lists only tricks that are still unbalanced', () => {
    const stillUnbalanced = new Set(unbalanced);
    expect([...KNOWN_UNBALANCED].filter(slug => !stillUnbalanced.has(slug))).toEqual([]);
  });
});
