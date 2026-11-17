/**
 * What a reader sees of the Reverse Swirl family.
 *
 * The swirl and reverse-swirl movements are distinct terminal identities, ruled
 * so in the data: six active tricks carry the reverse-swirl family and none of
 * them is in the swirl family. The browse shows that group under the family's
 * name, never the abbreviation the row is keyed by.
 *
 * A Minor Lineage, exactly as Reverse Whirl is: a chip in the family view's chip
 * row and a family-view page of its own carrying its live count. It is not
 * first-class, so it is not searchable as a family; that follows from a separate
 * roster.
 *
 * The fixture carries the six real members plus enough of the swirl family to
 * prove the two do not bleed into each other.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3121');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

/** The reverse-swirl lineage as the corrected data carries it. */
const REV_SWIRL_FAMILY = [
  { slug: 'rev_swirl', name: 'rev swirl', adds: '3', base: 'swirl' },
  { slug: 'atomic_reverse_swirl', name: 'atomic reverse swirl', adds: '4', base: 'rev_swirl' },
  { slug: 'butterfly_reverse_swirl', name: 'butterfly reverse swirl', adds: '4', base: 'rev_swirl' },
  { slug: 'barfly_reverse_swirl', name: 'barfly reverse swirl', adds: '5', base: 'rev_swirl' },
  { slug: 'paradon_reverse_swirl', name: 'paradon reverse swirl', adds: '5', base: 'rev_swirl' },
  { slug: 'stepping_butterfly_reverse_swirl', name: 'stepping butterfly reverse swirl',
    adds: '5', base: 'rev_swirl' },
];

/** Enough of the swirl family to show the two stay separate.
 *
 *  Deliberately not butterfly-swirl, barfly-swirl or paradon-swirl: each of those
 *  is a browse family in its own right and would render under its own heading
 *  rather than under Swirl, which would prove nothing here.
 */
const SWIRL_FAMILY = [
  { slug: 'swirl', name: 'swirl', adds: '3', base: 'swirl' },
  { slug: 'nemesis_swirl', name: 'nemesis swirl', adds: '7', base: 'swirl' },
  { slug: 'hop_over_swirl', name: 'hop over swirl', adds: '4', base: 'swirl' },
  { slug: 'montage_swirl', name: 'montage swirl', adds: '5', base: 'swirl' },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  REV_SWIRL_FAMILY.forEach((t, i) => insertFreestyleTrick(db, {
    slug: t.slug, canonical_name: t.name, adds: t.adds, base_trick: t.base,
    trick_family: 'rev_swirl', category: 'compound', sort_order: 10 + i,
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
  }));
  SWIRL_FAMILY.forEach((t, i) => insertFreestyleTrick(db, {
    slug: t.slug, canonical_name: t.name, adds: t.adds, base_trick: t.base,
    trick_family: 'swirl', category: 'compound', sort_order: 40 + i,
    operational_notation: 'CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',
  }));
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function familyView(family?: string): Promise<string> {
  const res = await page(family ? `/freestyle/tricks?view=family&family=${family}` : '/freestyle/tricks?view=family');
  expect(res.status).toBe(200);
  return res.text;
}

describe('the By Family browse', () => {
  it('shows Reverse Swirl as its own group', async () => {
    expect(await familyView()).toContain('Reverse Swirl');
    expect(await familyView('rev_swirl')).toContain('id="family-rev_swirl"');
  });

  it('names it as a family rather than as the slug it is keyed by', async () => {
    for (const html of [await familyView(), await familyView('rev_swirl')]) {
      expect(html).not.toContain('Rev swirl');
      expect(html).not.toContain('Rev Swirl');
    }
    expect(await familyView('rev_swirl')).toContain('Reverse Swirl family</a>');
  });

  // Defect caught: the lineage's page counts other than its live membership.
  it('counts its six members', async () => {
    const html = await familyView('rev_swirl');
    // Six is what the corrected data holds.
    const start = html.indexOf('id="family-rev_swirl"');
    expect(start).toBeGreaterThan(-1);
    const count = html.slice(start).match(/<span class="section-count">(\d+)<\/span>/)?.[1];
    expect(count).toBe('6');
  });

  it('still shows Swirl, and none of the reverse-swirl six inside it', async () => {
    const html = await familyView('swirl');
    expect(html).toContain('id="family-swirl"');
    // Bounded by the next family section rather than by a guessed length, so the
    // claim is about this section and not about however much happens to follow.
    const start = html.indexOf('id="family-swirl"');
    const next = html.indexOf('id="family-', start + 1);
    const section = html.slice(start, next === -1 ? undefined : next);
    for (const t of REV_SWIRL_FAMILY.filter(m => m.slug !== 'rev_swirl')) {
      expect(section).not.toContain(t.name);
    }
  });
});

describe('the raw family filter', () => {
  it('heads the reverse-swirl filter with the family name', async () => {
    const res = await page('/freestyle/tricks?family=rev_swirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The Reverse Swirl family');
    expect(res.text).not.toContain('The Rev swirl family');
  });

  it('lists exactly the six members', async () => {
    const res = await page('/freestyle/tricks?family=rev_swirl');
    for (const t of REV_SWIRL_FAMILY) {
      expect(res.text).toContain(t.name);
    }
    for (const t of SWIRL_FAMILY.filter(s => s.slug !== 'swirl')) {
      expect(res.text).not.toContain(t.name);
    }
  });
});

describe('what the browse entry does not change', () => {
  it('leaves every trick in the family the data gives it', async () => {
    const res = await page('/freestyle/tricks?family=swirl');
    expect(res.status).toBe(200);
    for (const t of SWIRL_FAMILY) {
      expect(res.text).toContain(t.name);
    }
    // The reverse-swirl six were never in this family; the registry entry does
    // not move a single row either way.
    expect(res.text).not.toContain('barfly reverse swirl');
  });
});
