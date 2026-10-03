/**
 * The modifier counts on GET /freestyle/by-the-numbers.
 *
 * The Body movements and Entry elements cards count explicit modifier links over
 * the public trick universe. This suite locks that they count only public
 * canonical tricks (no aliases, no inactive rows, no modifier stubs), that a
 * movement operator lands on Body movements while a set-system slug (paradox
 * included) lands on Entry elements, and that each card orders its bars by
 * descending count. Counts are seeded, so the expected values are exact.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

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
  insertFreestyleTrickAlias,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Registered modifiers (the link query inner-joins these). spinning/ducking/gyro
  // are movement operators; pixie/paradox are set-system-classified slugs.
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'Spinning', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking',  modifier_name: 'Ducking',  modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'gyro',     modifier_name: 'Gyro',     modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',    modifier_name: 'Pixie',    modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'paradox',  modifier_name: 'Paradox',  modifier_type: 'body' });

  // Four public canonical tricks (arbitrary non-operator slugs, so resolveTrickKind
  // returns 'trick' for each).
  for (const slug of ['ophist_a', 'ophist_b', 'ophist_c', 'ophist_d']) {
    insertFreestyleTrick(db, { slug, canonical_name: slug, adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 1 });
  }
  // An inactive trick and a modifier-category stub: their links must NOT count.
  insertFreestyleTrick(db, { slug: 'ophist_inactive', canonical_name: 'ophist inactive', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'ophist_modstub',  canonical_name: 'ophist modstub',  adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'modifier', is_active: 1 });
  // An alias of a real trick: aliases are not tricks and never add to a count.
  insertFreestyleTrickAlias(db, 'ophist_alias_1', 'ophist_a', 'ophist alias one');

  // Explicit links. spinning: a,b,c (3). ducking: a,b (2). gyro: a (1).
  // pixie: a,b (2). paradox: a (1).
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_b', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_c', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'ducking');
  insertFreestyleTrickModifierLink(db, 'ophist_b', 'ducking');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'gyro');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'pixie');
  insertFreestyleTrickModifierLink(db, 'ophist_b', 'pixie');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'paradox');
  // Inactive trick and modifier stub link spinning: must be excluded.
  insertFreestyleTrickModifierLink(db, 'ophist_inactive', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_modstub', 'spinning');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** One card's bars, in render order, as [label, count] pairs. */
async function cardBars(title: string): Promise<[string, number][]> {
  const res = await page('/freestyle/by-the-numbers');
  expect(res.status).toBe(200);
  const start = res.text.indexOf(`by-numbers-title">${title}<`);
  expect(start, `the ${title} card renders`).toBeGreaterThan(-1);
  const next = res.text.indexOf('by-numbers-title"', start + 1);
  const card = res.text.slice(start, next === -1 ? res.text.indexOf('</section>', start) : next);
  return [...card.matchAll(/by-numbers-bar-label">([^<]+)<[\s\S]*?by-numbers-bar-count">(\d+)</g)]
    .map(m => [m[1]!, Number(m[2])]);
}

describe('By the Numbers — modifier counts on the Body movements and Entry elements cards', () => {
  it('counts only public canonical tricks with explicit modifier links (no aliases, inactive, or modifier stubs)', async () => {
    const body = new Map(await cardBars('Body movements'));
    const entry = new Map(await cardBars('Entry elements'));
    // spinning links a,b,c = 3; the inactive trick and the modifier stub also
    // link spinning but are excluded, so the count is 3, not 5.
    expect(body.get('spinning')).toBe(3);
    expect(body.get('ducking')).toBe(2);
    expect(body.get('gyro')).toBe(1);
    expect(entry.get('pixie')).toBe(2);
    expect(entry.get('paradox')).toBe(1);
  });

  it('places movement operators on Body movements and set-system slugs on Entry elements', async () => {
    const body = new Map(await cardBars('Body movements'));
    const entry = new Map(await cardBars('Entry elements'));
    for (const label of ['spinning', 'ducking', 'gyro']) {
      expect(body.has(label), `${label} on Body movements`).toBe(true);
      expect(entry.has(label), `${label} kept off Entry elements`).toBe(false);
    }
    for (const label of ['pixie', 'paradox']) {
      expect(entry.has(label), `${label} on Entry elements`).toBe(true);
      expect(body.has(label), `${label} kept off Body movements`).toBe(false);
    }
  });

  it('orders each card by descending count', async () => {
    for (const title of ['Body movements', 'Entry elements']) {
      const counts = (await cardBars(title)).map(([, c]) => c);
      expect(counts, title).toEqual([...counts].sort((a, b) => b - a));
    }
  });
});
